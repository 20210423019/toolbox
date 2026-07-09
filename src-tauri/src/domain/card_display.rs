use serde::{Deserialize, Serialize};

/// 卡片信息字段显示配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardDisplayConfig {
    /// 显示哪些信息字段（如 "size", "date", "resolution", "tags"）
    pub info_fields: Vec<String>,
    /// 卡片上展示哪些标签的值（标签 ID 列表）
    pub tag_ids: Vec<String>,
}

impl Default for CardDisplayConfig {
    fn default() -> Self {
        Self {
            info_fields: vec![],
            tag_ids: vec![],
        }
    }
}

impl CardDisplayConfig {
    pub fn from_json(info_fields: Option<&str>, tag_ids: Option<&str>) -> Self {
        let parse = |json: Option<&str>| -> Vec<String> {
            json.and_then(|s| serde_json::from_str::<Vec<String>>(s).ok()).unwrap_or_default()
        };
        Self { info_fields: parse(info_fields), tag_ids: parse(tag_ids) }
    }

    pub fn info_fields_json(&self) -> String {
        serde_json::to_string(&self.info_fields).unwrap_or_default()
    }

    pub fn tag_ids_json(&self) -> String {
        serde_json::to_string(&self.tag_ids).unwrap_or_default()
    }
}
