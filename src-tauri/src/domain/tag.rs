use serde::{Deserialize, Serialize};




#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagClass {
    pub id: String,
    pub library_id: String,

    pub parent_id: Option<String>,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub description: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,

    pub child_count: i64,

    pub tag_count: i64,
}




#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagName {
    pub id: String,
    pub class_id: String,
    pub library_id: String,

    pub name: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,

    #[serde(default)]
    pub video_count: i64,

    #[serde(default)]
    pub tag_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagClassTreeNode {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub tag_count: i64,
    pub children: Vec<TagClassTreeNode>,

    pub tags: Vec<TagName>,
}


