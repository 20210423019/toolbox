use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    pub font_size: String,
    pub default_storage: String,
    pub temp_dir: String,
    pub log_dir: String,
    pub backup_dir: String,
    pub default_sort_by: String,
    pub default_view_mode: String,
    pub page_size: i32,
    pub ffmpeg_path: String,
    pub ffprobe_path: String,
    pub scan_concurrency: i32,
    pub encode_concurrency: i32,
    pub auto_start: bool,
    pub notify_on_complete: bool,
    pub auto_scan: bool,
    pub scan_interval: i32,
    pub log_level: String,
    pub max_log_days: i32,
    pub backup_interval_days: i32,
    #[serde(default)]
    pub enable_telemetry: bool,
    #[serde(default)]
    pub cover_quality: i32,
    #[serde(default)]
    pub cover_concurrency: i32,
    #[serde(default)]
    pub browser_path: String,
}
