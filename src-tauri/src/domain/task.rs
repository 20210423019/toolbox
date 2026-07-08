use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingTask {
    pub id: String,
    pub name: String,
    pub video_id: String,
    pub library_id: String,
    pub preset_id: String,
    pub source_path: String,
    pub output_path: String,
    pub output_filename_template: String,
    pub status: TaskStatus,
    pub priority: i32,
    pub progress: f64,
    pub total_files: i32,
    pub completed_files: i32,
    pub failed_files: i32,
    pub skipped_files: i32,
    pub current_file: String,
    pub current_progress: f64,
    pub encode_speed: f64,
    pub estimated_remaining: String,
    pub total_input_size: i64,
    pub total_output_size: i64,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error_message: String,
    pub retry_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
    Stopped,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Pending => "pending",
            TaskStatus::Running => "running",
            TaskStatus::Paused => "paused",
            TaskStatus::Completed => "completed",
            TaskStatus::Failed => "failed",
            TaskStatus::Cancelled => "cancelled",
            TaskStatus::Stopped => "stopped",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "running" => TaskStatus::Running,
            "paused" => TaskStatus::Paused,
            "completed" => TaskStatus::Completed,
            "failed" => TaskStatus::Failed,
            "cancelled" => TaskStatus::Cancelled,
            "stopped" => TaskStatus::Stopped,
            _ => TaskStatus::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskLog {
    pub id: String,
    pub task_id: String,
    pub level: String,
    pub source: String,
    pub code: String,
    pub message: String,
    pub file_name: String,
    pub progress: Option<f64>,
    pub created_at: String,
}
