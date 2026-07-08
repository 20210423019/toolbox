use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Library {
    pub id: String,
    pub category_id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub status: String,
    pub sort_order: i32,
    pub scan_paths: Vec<ScanPath>,
    pub exclude_paths: Vec<String>,
    pub filter_formats: Vec<String>,
    pub filter_mode: FilterMode,
    pub scan_interval: i32,
    pub last_scan_at: String,
    pub auto_scan: bool,
    pub cover_rules: Vec<CoverRule>,
    pub created_at: String,
    pub updated_at: String,

    pub card_info_fields: Option<String>,

    pub card_tag_ids: Option<String>,

    #[serde(default)]
    pub classify_rules: Option<String>,
    #[serde(default)]
    pub confidence_thresholds: Option<String>,
    #[serde(default)]
    pub scan_params: Option<String>,
    #[serde(default)]
    pub audio_pair_rules: Option<String>,

    #[serde(default)]
    pub auto_clean_days: i32,
    #[serde(default)]
    pub default_view: String,
    #[serde(default)]
    pub default_sort: String,
    #[serde(default)]
    pub sort_dir: String,
    #[serde(default)]
    pub layout_density: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_duration: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanPath {
    pub id: Option<String>,
    pub path: String,
    pub enabled: bool,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverRule {
    pub id: Option<String>,
    pub rule: String,
    pub priority: i32,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FilterMode {
    Whitelist,
    Blacklist,
}

impl FilterMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            FilterMode::Whitelist => "whitelist",
            FilterMode::Blacklist => "blacklist",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "blacklist" => FilterMode::Blacklist,
            _ => FilterMode::Whitelist,
        }
    }
}

impl Library {
    pub fn validate_name(name: &str) -> Result<(), String> {
        if name.trim().is_empty() {
            return Err("媒体库名称不能为空".into());
        }
        if name.len() > 100 {
            return Err("媒体库名称不能超过100个字符".into());
        }
        Ok(())
    }

    pub fn new(category_id: String, name: String, icon: String) -> Self {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let default_covers = vec![
            CoverRule { id: None, rule: "./*.jpg".into(), priority: 1, enabled: true },
            CoverRule { id: None, rule: "./*.JPG".into(), priority: 2, enabled: true },
            CoverRule { id: None, rule: "./*.png".into(), priority: 3, enabled: true },
        ];
        Library {
            id: uuid::Uuid::new_v4().to_string(),
            category_id,
            name,
            icon,
            description: String::new(),
            status: "normal".into(),
            sort_order: 0,
            scan_paths: vec![],
            exclude_paths: vec![],
            filter_formats: vec![".mp4".into(), ".mov".into(), ".avi".into(), ".mkv".into(), ".webm".into(), ".flv".into()],
            filter_mode: FilterMode::Whitelist,
            scan_interval: 0,
            last_scan_at: String::new(),
            auto_scan: false,
            cover_rules: default_covers,
            created_at: now.clone(),
            updated_at: now,
            card_info_fields: None,
            card_tag_ids: None,
            classify_rules: None,
            confidence_thresholds: None,
            scan_params: None,
            audio_pair_rules: None,
            auto_clean_days: 0,
            default_view: "card".into(),
            default_sort: "filename".into(),
            sort_dir: "asc".into(),
            layout_density: "normal".into(),
            video_count: None,
            total_size: None,
            total_duration: None,
        }
    }
}
