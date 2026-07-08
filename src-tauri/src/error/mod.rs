use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("数据库错误: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON 序列化错误: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("{entity} 未找到: {id}")]
    NotFound { entity: &'static str, id: String },

    #[error("数据冲突: {0}")]
    Conflict(String),

    #[error("校验失败: {field} - {reason}")]
    Validation { field: String, reason: String },

    #[error("外部程序错误: {cmd} - {detail}")]
    External { cmd: String, detail: String },

    #[error("并发冲突: {0}")]
    Concurrency(String),

    #[error("操作已取消")]
    Cancelled,

    #[error("内部错误: {0}")]
    Internal(String),
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Validation { field: "general".into(), reason: s }
    }
}

impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        // 直接返回错误描述文本，前端可以直接展示
        e.to_string()
    }
}

pub type AppResult<T> = Result<T, AppError>;
