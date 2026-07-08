use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub status: ScanStatus,
    pub library_id: String,
    pub total_files: u64,
    pub scanned_files: u64,
    pub new_files: u64,
    pub updated_files: u64,
    pub removed_files: u64,
    pub errors: Vec<String>,
    pub percentage: f64,
    pub elapsed_secs: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanHistory {
    pub id: String,
    pub library_id: String,
    pub scan_type: String,
    pub status: String,
    pub total_files_found: i64,
    pub new_files_added: i64,
    pub files_updated: i64,
    pub files_removed: i64,
    pub failed_files: i64,
    pub errors: String,
    pub duration_ms: i64,
    pub started_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ScanStatus {
    Idle,
    Scanning,
    Completed,
    Error,
    Cancelled,
}

impl ScanStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ScanStatus::Idle => "idle",
            ScanStatus::Scanning => "scanning",
            ScanStatus::Completed => "completed",
            ScanStatus::Error => "error",
            ScanStatus::Cancelled => "cancelled",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "scanning" => ScanStatus::Scanning,
            "completed" => ScanStatus::Completed,
            "error" => ScanStatus::Error,
            "cancelled" => ScanStatus::Cancelled,
            _ => ScanStatus::Idle,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub group_id: String,
    pub videos: Vec<String>,
    pub match_type: String,
    pub similarity: f64,
    pub total_size_saved: i64,
}

/// 扫描日志条目（逐步骤的详细日志，供前端控制台展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanLogEntry {
    pub level: String,
    pub message: String,
    pub timestamp: String,
}
