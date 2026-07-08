use serde::Serialize;
use tauri::Manager;

pub const SCAN_PROGRESS_UPDATE: &str = "scanProgressUpdate";
pub const SCAN_VIDEO_ADDED: &str = "scanVideoAdded";
pub const SCAN_LOG_ENTRY: &str = "scanLogEntry";
pub const TASK_UPDATED: &str = "taskUpdated";
pub const SCAN_DONE: &str = "scanDone";

pub fn emit<T: Serialize + Clone>(app: &tauri::AppHandle, event: &str, payload: T) {
    let _ = app.emit_all(event, payload);
}

/// 发射无 payload 的事件（用于 scanDone 等纯信号事件）
pub fn emit_signal(app: &tauri::AppHandle, event: &str) {
    let _ = app.emit_all(event, ());
}
