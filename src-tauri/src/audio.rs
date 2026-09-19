//! 电脑音频 → 手机（P3）。
//!
//! 采集系统输出的 monitor 源（PipeWire / PulseAudio），切成定长 PCM 帧，
//! 每包带 4 字节截断 HMAC，通过 UDP 推给手机播放。
//!
//! ## 为什么是裸 PCM
//! 局域网下行实测 129–142 Mbps，而 48kHz 立体声 16bit 只有 1536 kbps（约 1%）。
//! 换来的是**两端零编解码依赖、零编解码缓冲延迟**。这条链路只在局域网内跑，
//! 带宽不是瓶颈，没必要为了省那 1% 引入 Opus 及其缓冲。
//!
//! ## 为什么用 std 线程 + 阻塞 IO
//! `parec` 会按真实采样率往管道里吐数据，`read_exact` 天然被采样时钟节流——
//! 不需要自己写定时器，也不需要 tokio 的 process/async-fd 支持。

use std::io::Read;
use std::net::UdpSocket;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use serde::Serialize;
use sha2::Sha256;
use tauri::{AppHandle, Emitter, State};

use crate::lan::LanRuntime;

const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u32 = 2;
const BYTES_PER_SECOND: usize = (SAMPLE_RATE as usize) * (CHANNELS as usize) * 2;
const FRAME_MS: usize = 5;
/// 5ms 一包 = 960 字节负载，加 16 字节头共 976，远低于 1500 MTU，不会触发 IP 分片
const PAYLOAD_BYTES: usize = BYTES_PER_SECOND * FRAME_MS / 1000;
const HEADER_BYTES: usize = 16;
const MAGIC: u16 = 0x414C;
const VERSION: u8 = 1;
const AUDIO_PROTO: &str = "alive-audio-v1";

/// `@DEFAULT_MONITOR@` 是 PulseAudio/PipeWire 的特殊名，指向默认输出的监听源，
/// 比写死 `alsa_output.xxx.monitor` 更可移植
const CAPTURE_DEVICE: &str = "@DEFAULT_MONITOR@";
const CAPTURE_LATENCY_MS: u32 = 10;
/// 每这么多包回推一次状态给前端（400 包 ≈ 2 秒）
const STATUS_EVERY_PACKETS: u64 = 400;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStatus {
    pub streaming: bool,
    pub target: Option<String>,
    pub packets: u64,
    /// 是否由我们静音了电脑本地输出（"手机当扬声器"的关键，见 [mute_local_output]）
    pub local_muted: bool,
    pub last_error: Option<String>,
}

#[derive(Default)]
pub struct AudioRuntime {
    status: Mutex<AudioStatus>,
    /// 每次会话换一个新的停止标志：旧线程持有自己那份，不会被新会话的 false 复活
    stop: Mutex<Option<Arc<AtomicBool>>>,
}

impl AudioRuntime {
    fn snapshot(&self) -> AudioStatus {
        self.status.lock().map(|s| s.clone()).unwrap_or_default()
    }

    fn update(&self, f: impl FnOnce(&mut AudioStatus)) -> AudioStatus {
        let mut guard = match self.status.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        f(&mut guard);
        guard.clone()
    }

    fn is_current(&self, flag: &Arc<AtomicBool>) -> bool {
        self.stop
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|f| Arc::ptr_eq(f, flag)))
            .unwrap_or(false)
    }
}

#[tauri::command]
pub fn audio_status(runtime: State<'_, Arc<AudioRuntime>>) -> AudioStatus {
    runtime.snapshot()
}

#[tauri::command]
pub fn audio_start(
    app: AppHandle,
    runtime: State<'_, Arc<AudioRuntime>>,
    lan: State<'_, Arc<LanRuntime>>,
) -> Result<AudioStatus, String> {
    // 幂等：先把上一次停掉
    stop_current(&runtime);

    let peer = lan
        .peer()
        .ok_or("还没有可用的局域网通道，请等侧边栏显示「局域网直连」")?;
    let audio_port = peer
        .audio_port
        .ok_or("手机尚未上报音频端口（请确认手机端 Alive 已更新并运行）")?;
    let key = crate::lan::lan_key()?;
    let target = format!("{}:{}", peer.addr, audio_port);
    let addr = peer.addr.clone();

    let flag = Arc::new(AtomicBool::new(false));
    *runtime
        .stop
        .lock()
        .map_err(|_| "状态锁异常".to_string())? = Some(flag.clone());

    // "手机当扬声器"的关键：电脑本地输出也静音，否则用户会同时听到电脑音箱和
    // 手机（延迟几百毫秒），叠在一起像回声/环境音。
    // 实测 monitor 是**静音前**取点，所以静音不影响采集。
    let muted = mute_local_output();

    let rt = runtime.inner().clone();
    let app_for_thread = app.clone();
    let flag_for_thread = flag.clone();
    std::thread::spawn(move || {
        let result = stream_loop(
            &rt,
            &addr,
            audio_port,
            &key,
            &flag_for_thread,
            |status| {
                let _ = app_for_thread.emit("audio-status", status);
            },
        );
        // 无论正常结束还是出错，都要把本地输出恢复回去
        restore_local_output();
        // 只有仍是当前会话才回收状态，否则会把新会话的 streaming 误置为 false
        if rt.is_current(&flag_for_thread) {
            let status = rt.update(|s| {
                s.streaming = false;
                s.local_muted = false;
                s.last_error = result.err();
            });
            let _ = app_for_thread.emit("audio-status", status);
        }
    });

    let status = runtime.update(|s| {
        s.streaming = true;
        s.target = Some(target);
        s.packets = 0;
        s.local_muted = muted;
        s.last_error = None;
    });
    let _ = app.emit("audio-status", status.clone());
    Ok(status)
}

#[tauri::command]
pub fn audio_stop(
    app: AppHandle,
    runtime: State<'_, Arc<AudioRuntime>>,
) -> AudioStatus {
    stop_current(&runtime);
    restore_local_output();
    let status = runtime.update(|s| {
        s.streaming = false;
        s.target = None;
        s.local_muted = false;
    });
    let _ = app.emit("audio-status", status.clone());
    status
}

fn stop_current(runtime: &AudioRuntime) {
    if let Ok(mut guard) = runtime.stop.lock() {
        if let Some(flag) = guard.take() {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

/// 当前默认输出的静音状态；查不到（比如没有 pactl）返回 None。
///
/// **必须 `LC_ALL=C`**：pactl 的输出会跟随区域设置，中文环境下是 `Mute: 是`，
/// 按英文 `yes` 判断会永远读成"未静音"——那会导致恢复时把用户自己设的静音也取消掉。
/// （这个 bug 是被 `live_mute_roundtrip` 测试抓出来的。）
fn sink_muted() -> Option<bool> {
    let out = Command::new("pactl")
        .env("LC_ALL", "C")
        .args(["get-sink-mute", "@DEFAULT_SINK@"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().ends_with("yes"))
}

fn set_sink_mute(mute: bool) {
    let _ = Command::new("pactl")
        .env("LC_ALL", "C")
        .args([
            "set-sink-mute",
            "@DEFAULT_SINK@",
            if mute { "1" } else { "0" },
        ])
        .output();
}

/// 静音本地输出，返回是否由我们做了这次静音。
///
/// 只记录"我们主动改的"状态：如果用户自己本来就静音了，退出时不替他取消静音。
fn mute_local_output() -> bool {
    match sink_muted() {
        Some(false) => {
            set_sink_mute(true);
            MUTED_BY_US.store(true, Ordering::SeqCst);
            true
        }
        _ => {
            MUTED_BY_US.store(false, Ordering::SeqCst);
            false
        }
    }
}

fn restore_local_output() {
    if MUTED_BY_US.swap(false, Ordering::SeqCst) {
        set_sink_mute(false);
    }
}

/// 进程级的"这次静音是不是我们做的"。
/// 放在静态变量里是因为恢复动作可能发生在命令线程或推流线程，
/// 两条路径都要能看到同一个标志（用 swap 保证只恢复一次）。
static MUTED_BY_US: AtomicBool = AtomicBool::new(false);

/// 进度通过回调上报，而不是直接依赖 `AppHandle`——这样联调测试也能跑真实代码路径。
fn stream_loop<F: Fn(AudioStatus)>(
    runtime: &Arc<AudioRuntime>,
    addr: &str,
    port: u16,
    key: &[u8],
    stop: &AtomicBool,
    on_progress: F,
) -> Result<(), String> {
    let mut child = Command::new("parec")
        .arg(format!("--device={CAPTURE_DEVICE}"))
        .arg("--format=s16le")
        .arg(format!("--rate={SAMPLE_RATE}"))
        .arg(format!("--channels={CHANNELS}"))
        .arg(format!("--latency-msec={CAPTURE_LATENCY_MS}"))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("无法启动 parec（需要 PipeWire 或 PulseAudio）：{e}"))?;

    let mut stdout = child.stdout.take().ok_or("parec 的 stdout 不可用")?;
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| format!("创建 UDP socket 失败：{e}"))?;
    socket
        .connect((addr, port))
        .map_err(|e| format!("连接 {addr}:{port} 失败：{e}"))?;

    let mut seq: u32 = 0;
    let mut packets: u64 = 0;
    let mut frame = vec![0u8; PAYLOAD_BYTES];
    let mut packet = Vec::with_capacity(HEADER_BYTES + PAYLOAD_BYTES);

    while !stop.load(Ordering::SeqCst) {
        if stdout.read_exact(&mut frame).is_err() {
            break; // parec 退出或管道关闭
        }
        build_packet(&mut packet, seq, &frame, key);
        // 单包失败无所谓：UDP 无重传，下一个 5ms 就有新包顶上
        let _ = socket.send(&packet);
        seq = seq.wrapping_add(1);
        packets += 1;
        if packets % STATUS_EVERY_PACKETS == 0 {
            on_progress(runtime.update(|s| s.packets = packets));
        }
    }

    let _ = child.kill();
    let _ = child.wait();

    if packets == 0 {
        return Err("没有采集到音频数据，请确认系统正在输出声音".into());
    }
    runtime.update(|s| s.packets = packets);
    Ok(())
}

fn build_packet(out: &mut Vec<u8>, seq: u32, payload: &[u8], key: &[u8]) {
    out.clear();
    out.extend_from_slice(&MAGIC.to_be_bytes());
    out.push(VERSION);
    out.push(0); // flags
    out.extend_from_slice(&seq.to_be_bytes());
    out.extend_from_slice(&now_ms().to_be_bytes());
    out.extend_from_slice(&audio_tag(key, seq).to_be_bytes());
    out.extend_from_slice(payload);
}

/// 与手机端 `LanCrypto.audioTag` 逐字节一致。
///
/// 注意 `seq as i32`：手机端是 Kotlin `Int`，签名串用的是**有符号十进制**，
/// 这里必须同样按有符号格式化，否则 seq 越过 2^31 后两端签名串会不一致。
/// （ts 不参与签名，原因见手机端注释：32 位毫秒时间戳会踩有符号/无符号的坑。）
fn audio_tag(key: &[u8], seq: u32) -> u32 {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC 接受任意长度密钥");
    mac.update(format!("{AUDIO_PROTO}|{}", seq as i32).as_bytes());
    let out = mac.finalize().into_bytes();
    u32::from_be_bytes([out[0], out[1], out[2], out[3]])
}

fn now_ms() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u32)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 用真实握手密钥对拍：手机端接受过这把密钥，Rust 必须算出同样的 tag，
    /// 否则所有音频包会被手机静默丢弃（这正是开发中踩过的坑）。
    #[test]
    fn audio_tag_matches_android() {
        let key = hex::decode("9d6afce0dcd1b0876045ac58cbac6b6ed307ed04a21135d80efd76e958b9e2d3")
            .unwrap();
        // 该向量由独立 Python 实现算出
        assert_eq!(audio_tag(&key, 0), 0x7b5ec2e8);
    }

    #[test]
    fn packet_layout_is_stable() {
        let key = b"k";
        let payload = vec![0u8; 4];
        let mut out = Vec::new();
        build_packet(&mut out, 1, &payload, key);
        assert_eq!(out.len(), HEADER_BYTES + 4);
        assert_eq!(&out[0..2], &[0x41, 0x4C]); // magic 大端
        assert_eq!(out[2], VERSION);
        assert_eq!(&out[4..8], &[0, 0, 0, 1]); // seq 大端
    }

    /// 静音往返联调：最危险的是"推流结束后没恢复，电脑一直哑着"。
    /// 需要 PipeWire/PulseAudio 与 pactl：
    ///     cargo test --lib audio::tests::live_mute -- --ignored --nocapture
    #[test]
    #[ignore]
    fn live_mute_roundtrip_restores_original_state() {
        let before = sink_muted().expect("需要 pactl 与 PulseAudio/PipeWire");

        let muted = mute_local_output();
        println!("静音前={before} 本次由我们静音={muted}");
        assert_eq!(muted, !before, "只有原本未静音时我们才该动手");
        assert_eq!(sink_muted(), Some(true), "静音后应为 yes");

        // 恢复必须幂等：命令线程和推流线程都可能调用
        restore_local_output();
        restore_local_output();
        assert_eq!(sink_muted(), Some(before), "必须恢复到原始状态");
        println!("已恢复到 before={before}");
    }

    /// 真实链路联调：等手机广播 → 采集真实系统音频 → 推 4 秒 → 断言包数。
    /// 需要手机在线、与电脑同一局域网、且系统正在输出声音：
    ///     cargo test --lib audio::tests::live -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_stream_to_phone() {
        use futures_util::StreamExt;
        use tokio_tungstenite::connect_async;
        use tokio_tungstenite::tungstenite::Message;

        let url = crate::lan::relay_url().expect("读取中继地址失败");
        let key = crate::lan::lan_key().expect("派生密钥失败");
        let (mut ws, _) = connect_async(url.as_str()).await.expect("连接中继失败");
        println!("已订阅中继，等待手机广播（最长 90s）…");

        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(90);
        let (addr, port) = loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            assert!(!remaining.is_zero(), "等不到手机的局域网广播");
            let incoming = tokio::time::timeout(remaining, ws.next())
                .await
                .expect("等广播超时")
                .expect("中继关闭")
                .expect("中继消息错误");
            let Message::Text(text) = incoming else { continue };
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
                continue;
            };
            if value.get("type").and_then(|t| t.as_str()) != Some("lan") {
                continue;
            }
            let Some(audio_port) = value.get("audioPort").and_then(|p| p.as_u64()) else {
                continue; // 手机还没上报音频端口
            };
            let Some(addr) = value
                .get("addrs")
                .and_then(|a| a.as_array())
                .and_then(|a| a.first())
                .and_then(|a| a.as_str())
                .map(str::to_string)
            else {
                continue;
            };
            break (addr, audio_port as u16);
        };

        println!("开始推流到 {addr}:{port}（4 秒，请确认系统正在播放声音）");
        let runtime = Arc::new(AudioRuntime::default());
        let stop = Arc::new(AtomicBool::new(false));
        let runtime_for_thread = runtime.clone();
        let stop_for_thread = stop.clone();
        let handle = std::thread::spawn(move || {
            stream_loop(
                &runtime_for_thread,
                &addr,
                port,
                &key,
                &stop_for_thread,
                |_| {},
            )
        });

        tokio::time::sleep(std::time::Duration::from_secs(4)).await;
        stop.store(true, Ordering::SeqCst);
        let result = handle.join().expect("推流线程 panic");
        let packets = runtime.snapshot().packets;
        println!("推流结束: result={result:?} packets={packets}");
        assert!(result.is_ok(), "推流失败: {result:?}");
        // 4 秒 @ 200 包/秒 ≈ 800 包，放宽到 400 以容忍启动开销
        assert!(packets > 400, "发包数过少: {packets}");
    }
}
