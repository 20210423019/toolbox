//! 前端日志捕获 → tracing 持久化
//!
//! 接收 ConsoleCapture 转发的前端日志，写入 tracing 框架，
//! 最终通过 tracing-appender 持久化到 data/logs/app.log.*

#[derive(serde::Deserialize)]
pub struct FrontendLogEntry {
    pub level: String,
    pub message: String,
    pub source: String,
    pub stack: Option<String>,
    pub timestamp: String,
    pub count: u32,
}

/// 接收前端控制台日志并写入 tracing
#[tauri::command]
pub fn forward_frontend_logs(logs: Vec<FrontendLogEntry>) -> Result<(), String> {
    for log in &logs {
        let msg = if log.count > 1 {
            format!("[{}] {} (x{})", log.source, log.message, log.count)
        } else {
            format!("[{}] {}", log.source, log.message)
        };

        let has_stack = log.stack.as_ref().map_or(false, |s| !s.is_empty());

        // 有堆栈时附加到消息
        let final_msg = if has_stack {
            format!("{}\nStackTrace:\n{}", msg, log.stack.as_ref().unwrap())
        } else {
            msg
        };

        match log.level.as_str() {
            "error" => tracing::error!(target: "frontend", "{}", final_msg),
            "warn" => tracing::warn!(target: "frontend", "{}", final_msg),
            "info" => tracing::info!(target: "frontend", "{}", final_msg),
            _ => tracing::debug!(target: "frontend", "{}", final_msg),
        }
    }
    Ok(())
}
