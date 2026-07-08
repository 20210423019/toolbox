use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub note: String,
    pub sort_order: i32,
    pub is_default: bool,
    pub is_deletable: bool,
    pub status: String,
    pub storage_path: String,
    pub created_at: String,
    pub updated_at: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub lib_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_duration: Option<f64>,
}

impl Category {
    pub fn validate_name(name: &str) -> Result<(), String> {
        if name.trim().is_empty() {
            return Err("鍒嗙被鍚嶇О涓嶈兘涓虹┖".into());
        }
        if name.len() > 100 {
            return Err("分类名称不能超过100个字符".into());
        }
        Ok(())
    }

    pub fn new(name: String) -> Self {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        Category {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            icon: String::new(),
            note: String::new(),
            sort_order: 0,
            is_default: false,
            is_deletable: true,
            status: "normal".into(),
            storage_path: String::new(),
            created_at: now.clone(),
            updated_at: now,
            lib_count: None,
            video_count: None,
            total_size: None,
            total_duration: None,
        }
    }
}
