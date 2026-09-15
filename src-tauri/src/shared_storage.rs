//! 开发版（`npm run tauri dev`）与正式版（`npm run tauri build`）的本机数据共享层。
//!
//! WebKitGTK 的 localStorage/IndexedDB 按 origin 分区：正式版跑在 `tauri://localhost`
//! （数据落在 `localstorage/tauri_localhost_0.localstorage`），`tauri dev` 跑在
//! `http://localhost:1420`（`localstorage/http_localhost_1420.localstorage`），
//! 同一个应用数据目录里两份互不可见的数据，所以两个版本看起来"数据不共通"。
//!
//! 这里用应用数据目录下的一个 JSON 文件做共享层（两个版本的 app_data_dir 相同）：
//! 前端启动时把文件里的键值合并进自己的 localStorage，之后每次写入都回写文件，
//! 于是设置、草稿、阅读历史、看板与知识库笔记、登录缓存两个版本保持一致。
//!
//! 首次运行时文件由先启动的一方用自己的本机数据播种；正式版启动时若发现文件是 dev
//! 播种的，会用自己的本机数据重新播种一次（正式版数据为主）。此后按写入顺序覆盖。

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

/// 共享文件放在 app_data_dir（`~/.local/share/com.linuxdo.tauri`）下
pub const FILE_NAME: &str = "shared-web-storage.json";
const BACKUP_DIR: &str = "shared-web-storage-backups";
const MAX_BACKUPS: usize = 10;

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedStorage {
    /// "dev" 或 "build"：首次播种这份文件的版本
    #[serde(default)]
    pub seeded_by: String,
    #[serde(default)]
    pub entries: BTreeMap<String, String>,
}

/// 串行化读写，避免同一进程内的并发读改写互相覆盖
#[derive(Default)]
pub struct SharedStorageLock(Mutex<()>);

impl SharedStorageLock {
    fn enter(&self) -> Result<MutexGuard<'_, ()>, String> {
        self.0.lock().map_err(|_| "共享存储锁已损坏，请重启应用".to_string())
    }
}

fn store_path(dir: &Path) -> PathBuf {
    dir.join(FILE_NAME)
}

pub fn read_store(dir: &Path) -> Result<Option<SharedStorage>, String> {
    match fs::read(store_path(dir)) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|error| format!("共享存储文件解析失败：{error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("共享存储文件读取失败：{error}")),
    }
}

pub fn write_store(dir: &Path, storage: &SharedStorage) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| format!("共享存储目录创建失败：{error}"))?;
    let json =
        serde_json::to_vec_pretty(storage).map_err(|error| format!("共享存储序列化失败：{error}"))?;
    // 先写临时文件再改名，写入中断也不会留下半截 JSON 把原有数据带走
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    fs::write(&tmp, json).map_err(|error| format!("共享存储写入失败：{error}"))?;
    fs::rename(&tmp, store_path(dir)).map_err(|error| format!("共享存储保存失败：{error}"))
}

/// 单个键的读改写：value 为 None 表示删除
pub fn put_entry(dir: &Path, key: &str, value: Option<&str>) -> Result<(), String> {
    let mut storage = read_store(dir)?.unwrap_or_default();
    match value {
        Some(value) => {
            storage.entries.insert(key.to_string(), value.to_string());
        }
        None => {
            storage.entries.remove(key);
        }
    }
    write_store(dir, &storage)
}

/// 备份即将被覆盖的值，只保留最近 MAX_BACKUPS 份
pub fn write_backup(
    dir: &Path,
    entries: &BTreeMap<String, String>,
    label: &str,
) -> Result<Option<PathBuf>, String> {
    if entries.is_empty() {
        return Ok(None);
    }
    let target = dir.join(BACKUP_DIR);
    fs::create_dir_all(&target).map_err(|error| format!("共享存储备份目录创建失败：{error}"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    // 文件名只保留 ASCII 字母数字，避免中文标签被截断出一串连字符
    let safe_label: String = label
        .chars()
        .filter(|item| item.is_ascii_alphanumeric() || matches!(item, '-' | '_'))
        .collect();
    let trimmed = safe_label.trim_matches(|item| matches!(item, '-' | '_'));
    let name = if trimmed.is_empty() {
        "web-storage".to_string()
    } else {
        trimmed.to_string()
    };
    // 同一毫秒内连续备份时用序号保证文件名唯一
    let mut file = target.join(format!("{stamp}-{name}.json"));
    let mut attempt = 1;
    while file.exists() {
        file = target.join(format!("{stamp}-{name}-{attempt}.json"));
        attempt += 1;
    }
    let json =
        serde_json::to_vec_pretty(entries).map_err(|error| format!("共享存储备份序列化失败：{error}"))?;
    fs::write(&file, json).map_err(|error| format!("共享存储备份写入失败：{error}"))?;
    prune_backups(&target);
    Ok(Some(file))
}

fn prune_backups(dir: &Path) {
    let Ok(items) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<PathBuf> = items
        .flatten()
        .map(|item| item.path())
        .filter(|path| path.is_file())
        .collect();
    // 文件名以毫秒时间戳开头，字典序即时间序
    files.sort();
    let excess = files.len().saturating_sub(MAX_BACKUPS);
    for path in files.into_iter().take(excess) {
        let _ = fs::remove_file(path);
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))
}

#[tauri::command]
pub fn shared_storage_load(
    app: AppHandle,
    lock: State<'_, SharedStorageLock>,
) -> Result<Option<SharedStorage>, String> {
    let _guard = lock.enter()?;
    read_store(&data_dir(&app)?)
}

#[tauri::command]
pub fn shared_storage_save(
    app: AppHandle,
    storage: SharedStorage,
    lock: State<'_, SharedStorageLock>,
) -> Result<(), String> {
    let _guard = lock.enter()?;
    write_store(&data_dir(&app)?, &storage)
}

#[tauri::command]
pub fn shared_storage_put(
    app: AppHandle,
    key: String,
    value: Option<String>,
    lock: State<'_, SharedStorageLock>,
) -> Result<(), String> {
    let _guard = lock.enter()?;
    put_entry(&data_dir(&app)?, &key, value.as_deref())
}

#[tauri::command]
pub fn shared_storage_backup(
    app: AppHandle,
    entries: BTreeMap<String, String>,
    label: String,
    lock: State<'_, SharedStorageLock>,
) -> Result<Option<String>, String> {
    let _guard = lock.enter()?;
    Ok(write_backup(&data_dir(&app)?, &entries, &label)?
        .map(|path| path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "linuxdo-shared-storage-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn entries(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn missing_file_reads_none() {
        let dir = temp_dir("missing");
        assert_eq!(read_store(&dir).unwrap(), None);
    }

    #[test]
    fn write_then_read_roundtrip() {
        let dir = temp_dir("roundtrip");
        let storage = SharedStorage {
            seeded_by: "build".into(),
            entries: entries(&[("board-data-v1", "{\"tasks\":[]}"), ("linuxdo-auth", "{}")]),
        };
        write_store(&dir, &storage).unwrap();
        assert_eq!(read_store(&dir).unwrap(), Some(storage));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn put_entry_adds_updates_and_removes_without_touching_seed() {
        let dir = temp_dir("put");
        write_store(
            &dir,
            &SharedStorage {
                seeded_by: "dev".into(),
                entries: entries(&[("fluxdo:settings", "1"), ("linuxdo-auth", "a")]),
            },
        )
        .unwrap();
        put_entry(&dir, "fluxdo:settings", Some("2")).unwrap();
        put_entry(&dir, "board-data-v1", Some("board")).unwrap();
        put_entry(&dir, "linuxdo-auth", None).unwrap();
        let stored = read_store(&dir).unwrap().unwrap();
        assert_eq!(stored.seeded_by, "dev");
        assert_eq!(stored.entries.get("fluxdo:settings").map(String::as_str), Some("2"));
        assert_eq!(stored.entries.get("board-data-v1").map(String::as_str), Some("board"));
        assert!(!stored.entries.contains_key("linuxdo-auth"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn put_entry_on_missing_file_creates_it() {
        let dir = temp_dir("put-create");
        put_entry(&dir, "fluxdo:settings", Some("value")).unwrap();
        let stored = read_store(&dir).unwrap().unwrap();
        assert_eq!(stored.seeded_by, "");
        assert_eq!(stored.entries.get("fluxdo:settings").map(String::as_str), Some("value"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn backup_keeps_recent_files_only() {
        let dir = temp_dir("backup");
        assert_eq!(write_backup(&dir, &BTreeMap::new(), "empty").unwrap(), None);
        for index in 0..(MAX_BACKUPS + 3) {
            let values = entries(&[("fluxdo:settings", &index.to_string())]);
            write_backup(&dir, &values, "test").unwrap();
        }
        let count = fs::read_dir(dir.join(BACKUP_DIR)).unwrap().count();
        assert_eq!(count, MAX_BACKUPS);
        let _ = fs::remove_dir_all(&dir);
    }
}
