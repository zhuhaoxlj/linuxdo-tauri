use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::shared_storage;

const DELIVERY_FILE: &str = "reminder-deliveries.json";
const POLL_INTERVAL: Duration = Duration::from_secs(10);

#[derive(Default)]
pub struct ReminderRuntime {
    pub tray_ready: std::sync::atomic::AtomicBool,
    pub tray_announced: std::sync::atomic::AtomicBool,
    pub last_error: Mutex<Option<String>>,
    pub pending_open: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderStatus {
    pub tray_ready: bool,
    pub last_error: Option<String>,
}

#[tauri::command]
pub fn reminder_status(runtime: tauri::State<'_, Arc<ReminderRuntime>>) -> ReminderStatus {
    ReminderStatus {
        tray_ready: runtime.tray_ready.load(std::sync::atomic::Ordering::SeqCst),
        last_error: runtime
            .last_error
            .lock()
            .ok()
            .and_then(|value| value.clone()),
    }
}

#[tauri::command]
pub fn take_reminder_open(runtime: tauri::State<'_, Arc<ReminderRuntime>>) -> Option<String> {
    runtime.pending_open.lock().ok()?.take()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoardSnapshot {
    #[serde(default)]
    tasks: Vec<ReminderTask>,
    #[serde(default)]
    schedules: Vec<ReminderBlock>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReminderTask {
    id: String,
    sync_id: Option<String>,
    title: String,
    column: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReminderBlock {
    id: String,
    task_id: String,
    planned_start: i64,
    status: String,
}

struct DueReminder {
    key: String,
    block_id: String,
    title: String,
    missed: bool,
}

fn due_reminders(
    snapshot: &BoardSnapshot,
    delivered: &BTreeMap<String, i64>,
    now: i64,
) -> Vec<DueReminder> {
    let tasks: BTreeMap<_, _> = snapshot
        .tasks
        .iter()
        .map(|task| {
            (
                task.sync_id
                    .clone()
                    .unwrap_or_else(|| format!("linuxdo-board:{}", task.id)),
                task,
            )
        })
        .collect();
    snapshot
        .schedules
        .iter()
        .filter_map(|block| {
            if block.status != "pending" || block.planned_start > now {
                return None;
            }
            let task = tasks.get(&block.task_id)?;
            if task.column == "done" {
                return None;
            }
            let key = format!("{}@{}", block.id, block.planned_start);
            if delivered.contains_key(&key) {
                return None;
            }
            Some(DueReminder {
                key,
                block_id: block.id.clone(),
                title: task.title.clone(),
                missed: now - block.planned_start > 5 * 60_000,
            })
        })
        .collect()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn read_deliveries(dir: &Path) -> BTreeMap<String, i64> {
    fs::read(dir.join(DELIVERY_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_deliveries(dir: &Path, deliveries: &BTreeMap<String, i64>) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let tmp = dir.join(format!("{DELIVERY_FILE}.tmp"));
    fs::write(
        &tmp,
        serde_json::to_vec(deliveries).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(tmp, dir.join(DELIVERY_FILE)).map_err(|error| error.to_string())
}

fn notify(
    app: &AppHandle,
    runtime: &ReminderRuntime,
    title: &str,
    body: &str,
    block_id: String,
) -> Result<(), String> {
    let handle = notify_rust::Notification::new()
        .summary(title)
        .body(body)
        .show()
        .map_err(|error| format!("系统通知不可用：{error}"))?;
    let app = app.clone();
    let callback_runtime = app.state::<Arc<ReminderRuntime>>().inner().clone();
    std::thread::spawn(move || {
        handle.wait_for_action(|action| {
            if action == "default" {
                if let Ok(mut pending) = callback_runtime.pending_open.lock() {
                    *pending = Some(block_id.clone());
                }
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
                let _ = app.emit("reminder-open", block_id);
            }
        });
    });
    if let Ok(mut status) = runtime.last_error.lock() {
        *status = None;
    }
    Ok(())
}

pub fn announce_background(app: &AppHandle, runtime: &ReminderRuntime) -> Result<(), String> {
    notify(
        app,
        runtime,
        "LinuxDo 仍在后台运行",
        "任务到点时会继续提醒；从系统托盘打开或退出",
        String::new(),
    )
}

fn poll(
    app: &AppHandle,
    runtime: &ReminderRuntime,
    delivered: &mut BTreeMap<String, i64>,
) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let Some(storage) = shared_storage::read_store(&dir)? else {
        return Ok(());
    };
    let Some(board) = storage.entries.get("board-data-v1") else {
        return Ok(());
    };
    let snapshot: BoardSnapshot =
        serde_json::from_str(board).map_err(|error| format!("无法读取提醒安排：{error}"))?;
    let now = now_ms();
    let due = due_reminders(&snapshot, delivered, now);
    delivered.retain(|key, _| {
        snapshot
            .schedules
            .iter()
            .any(|block| key.starts_with(&format!("{}@", block.id)))
    });
    if due.is_empty() {
        return Ok(());
    }

    let missed: Vec<_> = due.iter().filter(|item| item.missed).collect();
    if !missed.is_empty() {
        notify(
            app,
            runtime,
            "错过的安排",
            &format!("{} 项安排已到时间，请打开 LinuxDo 查看", missed.len()),
            missed[0].block_id.clone(),
        )?;
        for item in &missed {
            delivered.insert(item.key.clone(), now);
        }
        write_deliveries(&dir, delivered)?;
    }
    for item in due.iter().filter(|item| !item.missed) {
        notify(
            app,
            runtime,
            "任务开始时间到了",
            &format!("{} · 打开 LinuxDo 开始", item.title),
            item.block_id.clone(),
        )?;
        delivered.insert(item.key.clone(), now);
        write_deliveries(&dir, delivered)?;
    }
    Ok(())
}

pub fn start(app: AppHandle, runtime: Arc<ReminderRuntime>) {
    std::thread::spawn(move || {
        let mut delivered = app
            .path()
            .app_data_dir()
            .ok()
            .map(|dir| read_deliveries(&dir))
            .unwrap_or_default();
        loop {
            if let Err(error) = poll(&app, &runtime, &mut delivered) {
                if let Ok(mut status) = runtime.last_error.lock() {
                    *status = Some(error);
                }
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn due_filter_ignores_completed_canceled_and_already_delivered_blocks() {
        let snapshot = BoardSnapshot {
            tasks: vec![ReminderTask {
                id: "1".into(),
                sync_id: None,
                title: "任务".into(),
                column: "todo".into(),
            }],
            schedules: vec![
                ReminderBlock {
                    id: "ready".into(),
                    task_id: "linuxdo-board:1".into(),
                    planned_start: 100,
                    status: "pending".into(),
                },
                ReminderBlock {
                    id: "canceled".into(),
                    task_id: "linuxdo-board:1".into(),
                    planned_start: 100,
                    status: "canceled".into(),
                },
                ReminderBlock {
                    id: "future".into(),
                    task_id: "linuxdo-board:1".into(),
                    planned_start: 300,
                    status: "pending".into(),
                },
            ],
        };
        assert_eq!(due_reminders(&snapshot, &BTreeMap::new(), 200).len(), 1);
        assert_eq!(
            due_reminders(
                &snapshot,
                &BTreeMap::from([("ready@100".to_string(), 200)]),
                200
            )
            .len(),
            0
        );
    }

    #[test]
    fn old_pending_blocks_are_summarized_after_a_long_sleep() {
        let snapshot = BoardSnapshot {
            tasks: vec![ReminderTask {
                id: "1".into(),
                sync_id: None,
                title: "任务".into(),
                column: "todo".into(),
            }],
            schedules: vec![ReminderBlock {
                id: "old".into(),
                task_id: "linuxdo-board:1".into(),
                planned_start: 100,
                status: "pending".into(),
            }],
        };
        let now = 3 * 24 * 60 * 60 * 1000;
        let due = due_reminders(&snapshot, &BTreeMap::new(), now);
        assert_eq!(due.len(), 1);
        assert!(due[0].missed);
        assert_eq!(due[0].key, "old@100");
        assert!(
            due_reminders(&snapshot, &BTreeMap::from([("old@100".into(), now)]), now).is_empty()
        );
    }
}
