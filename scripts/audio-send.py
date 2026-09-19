#!/usr/bin/env python3
"""向手机推送裸 PCM 音频（P3 调试工具 / 参考实现）。

用法:
    # 播放 440Hz 测试音 5 秒
    audio-send.py <ip> <audioPort> --token <token> --tone 5

    # 推送电脑正在播放的声音（PipeWire/PulseAudio monitor）
    parec --device=<sink>.monitor --format=s16le --rate=48000 --channels=2 \
      | audio-send.py <ip> <audioPort> --token <token>

包格式与手机端 LanAudioPlayer 一一对应（小端，16 字节头 + PCM）。
"""
import argparse
import hashlib
import hmac
import math
import secrets
import socket
import struct
import sys
import time

PROTO_AUDIO = "alive-audio-v1"
SALT = b"alive-lan-v1"
INFO = b"alive-lan-ping"

MAGIC = 0x414C
VERSION = 1
HEADER = struct.Struct(">HBBIII")  # magic, version, flags, seq, ts_ms, tag（网络字节序）
SAMPLE_RATE = 48_000
CHANNELS = 2
BYTES_PER_SECOND = SAMPLE_RATE * CHANNELS * 2
FRAME_MS = 5
PAYLOAD_BYTES = BYTES_PER_SECOND * FRAME_MS // 1000  # 960


def hkdf_sha256(ikm: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    okm, block, counter = b"", b"", 1
    while len(okm) < length:
        block = hmac.new(prk, block + info + bytes([counter]), hashlib.sha256).digest()
        okm += block
        counter += 1
    return okm[:length]


def audio_tag(key: bytes, seq: int) -> int:
    """HMAC 输出的前 4 字节，按大端取整——与 Kotlin 端一致。

    只签 seq：ts 仅作诊断保留，签它会让 32 位毫秒时间戳踩到有符号/无符号解释不一致。
    """
    mac = hmac.new(key, f"{PROTO_AUDIO}|{seq}".encode(), hashlib.sha256).digest()
    return struct.unpack(">I", mac[:4])[0]


def tone_stream(seconds: float, freq: float = 440.0, amplitude: float = 0.25):
    """生成连续的正弦测试音（立体声交错）"""
    total = int(BYTES_PER_SECOND * seconds)
    fade = int(BYTES_PER_SECOND * 0.05)  # 50ms 淡入淡出，避免爆音
    peak = int(32767 * amplitude)
    phase_step = 2 * math.pi * freq / SAMPLE_RATE
    phase = 0.0
    produced = 0
    while produced < total:
        samples = bytearray()
        for _ in range(PAYLOAD_BYTES // 4):  # 每帧 2 声道 * 2 字节
            env = 1.0
            if produced < fade:
                env = produced / fade
            elif produced > total - fade:
                env = max(0.0, (total - produced) / fade)
            value = int(peak * env * math.sin(phase))
            phase += phase_step
            samples += struct.pack("<hh", value, value)
            produced += 4
        yield bytes(samples)


def stdin_stream():
    """从 stdin 读原始 PCM 并切成定长帧"""
    buf = b""
    while True:
        chunk = sys.stdin.buffer.read(PAYLOAD_BYTES)
        if not chunk:
            if buf:
                yield buf + bytes(PAYLOAD_BYTES - len(buf))
            return
        buf += chunk
        while len(buf) >= PAYLOAD_BYTES:
            yield buf[:PAYLOAD_BYTES]
            buf = buf[PAYLOAD_BYTES:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ip")
    ap.add_argument("port", type=int, help="手机广播里的 audioPort（UDP）")
    ap.add_argument("--token", required=True)
    ap.add_argument("--tone", type=float, default=0.0, help="改为播放 N 秒测试音")
    ap.add_argument("--freq", type=float, default=440.0)
    args = ap.parse_args()

    key = hkdf_sha256(args.token.encode(), SALT, INFO, 32)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.connect((args.ip, args.port))

    source = tone_stream(args.tone, args.freq) if args.tone > 0 else stdin_stream()
    seq = 0
    sent_bytes = 0
    started = time.perf_counter()
    try:
        for payload in source:
            ts_ms = int(time.time() * 1000) & 0xFFFFFFFF
            header = HEADER.pack(MAGIC, VERSION, 0, seq, ts_ms, audio_tag(key, seq))
            sock.send(header + payload)
            seq += 1
            sent_bytes += len(payload)
            # 按真实时间节奏发送：手机靠包的到达节奏建缓冲，灌太快会溢
            target = started + sent_bytes / BYTES_PER_SECOND
            drift = target - time.perf_counter()
            if drift > 0:
                time.sleep(drift)
            if seq % 200 == 0:
                print(f"  已发 {seq} 包 / {sent_bytes / 1024:.0f} KiB", file=sys.stderr)
    except KeyboardInterrupt:
        pass
    finally:
        elapsed = time.perf_counter() - started
        kbps = sent_bytes * 8 / max(elapsed, 1e-6) / 1000
        print(f"发送结束: {seq} 包, {sent_bytes / 1024:.0f} KiB, {kbps:.0f} kbps", file=sys.stderr)


if __name__ == "__main__":
    main()
