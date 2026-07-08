use std::collections::HashMap;
use tauri::State;
use crate::domain::tag::{TagName, TagClass, TagClassTreeNode};
use crate::infra::db::DbPool;
use crate::repository;

fn now() -> String { chrono::Utc::now().to_rfc3339() }
fn conn<'a>(db: &'a State<'a, DbPool>) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    db.app.lock().map_err(|e| e.to_string())
}


#[tauri::command]
pub fn get_tag_classes_by_library(db: State<DbPool>, library_id: String) -> Result<Vec<TagClass>, String> {
    let c = conn(&db)?; repository::tags::get_classes(&c, &library_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn create_tag_class(db: State<DbPool>, library_id: String, name: String, parent_id: Option<String>, color: Option<String>, icon: Option<String>) -> Result<TagClass, String> {
    let c = conn(&db)?;
    let cls = TagClass {
        id: uuid::Uuid::new_v4().to_string(), library_id, parent_id, name,
        color: color.unwrap_or_else(|| "#059669".to_string()), icon: icon.unwrap_or_default(),
        description: String::new(), sort_order: 0, created_at: now(), updated_at: now(),
        child_count: 0, tag_count: 0,
    };
    repository::tags::insert_class(&c, &cls).map_err(|e| e.to_string())?;
    Ok(cls)
}
#[tauri::command]
pub fn update_tag_class(db: State<DbPool>, cls: TagClass) -> Result<TagClass, String> {
    let c = conn(&db)?;
    let mut updated = cls; updated.updated_at = now();
    repository::tags::update_class(&c, &updated).map_err(|e| e.to_string())?;
    // 重新查询数据库获取完整数据（含子类统计）
    repository::tags::get_class_by_id(&c, &updated.id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn delete_tag_class(db: State<DbPool>, id: String) -> Result<(), String> {
    let c = conn(&db)?; repository::tags::delete_class(&c, &id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn move_tag_class(db: State<DbPool>, id: String, new_parent_id: Option<String>) -> Result<(), String> {
    let c = conn(&db)?; repository::tags::move_class(&c, &id, new_parent_id.as_deref()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn copy_tag_class(db: State<DbPool>, id: String, new_parent_id: Option<String>) -> Result<TagClass, String> {
    let c = conn(&db)?;
    let classes = repository::tags::get_classes(&c, "").map_err(|e| e.to_string())?;
    let source = classes.into_iter().find(|c2| c2.id == id).ok_or_else(|| "标签类未找到".to_string())?;
    let copy = TagClass {
        id: uuid::Uuid::new_v4().to_string(), name: format!("{}（副本）", source.name),
        parent_id: new_parent_id, created_at: now(), updated_at: now(), ..source
    };
    repository::tags::insert_class(&c, &copy).map_err(|e| e.to_string())?;
    Ok(copy)
}


#[tauri::command]
pub fn get_class_tags(db: State<DbPool>, class_id: String) -> Result<Vec<TagName>, String> {
    let c = conn(&db)?; repository::tags::get_tags_by_class(&c, &class_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn create_class_tag(db: State<DbPool>, class_id: String, library_id: String, name: String, color: Option<String>) -> Result<TagName, String> {
    let c = conn(&db)?;
    let tag = TagName {
        id: uuid::Uuid::new_v4().to_string(), class_id, library_id, name,
        color: color.unwrap_or_else(|| "#059669".to_string()),
        sort_order: 0, created_at: now(), updated_at: now(), video_count: 0,
        tag_type: "text".into(),
    };
    repository::tags::insert_tag(&c, &tag).map_err(|e| e.to_string())?;
    Ok(tag)
}
#[tauri::command]
pub fn update_class_tag(db: State<DbPool>, tag: TagName) -> Result<(), String> {
    let c = conn(&db)?; repository::tags::update_tag(&c, &tag).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn delete_class_tag(db: State<DbPool>, id: String) -> Result<(), String> {
    let c = conn(&db)?; repository::tags::delete_tag(&c, &id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn get_all_class_tags(db: State<DbPool>, library_id: String) -> Result<Vec<TagName>, String> {
    let c = conn(&db)?; repository::tags::get_all_tags_by_library(&c, &library_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn search_class_tags(db: State<DbPool>, query: String, library_id: String) -> Result<Vec<TagName>, String> {
    let c = conn(&db)?; repository::tags::search_tags(&c, &query, &library_id).map_err(|e| e.to_string())
}


#[tauri::command]
pub fn batch_tag_videos(db: State<DbPool>, video_ids: Vec<String>, tag_ids: Vec<String>, tag_values: Vec<String>) -> Result<(), String> {
    let c = conn(&db)?;
    let pairs: Vec<(String, String)> = tag_ids.into_iter().zip(tag_values).collect();
    repository::tags::batch_tag_videos(&c, &video_ids, &pairs).map_err(|e| e.to_string())?;
    for vid in &video_ids { let _ = crate::service::sidecar::sync_video_sidecar(&c, vid); }
    Ok(())
}
#[tauri::command]
pub fn batch_remove_tags(db: State<DbPool>, video_ids: Vec<String>, tag_ids: Vec<String>) -> Result<(), String> {
    let c = conn(&db)?;
    repository::tags::batch_remove_tags(&c, &video_ids, &tag_ids).map_err(|e| e.to_string())?;
    for vid in &video_ids { let _ = crate::service::sidecar::sync_video_sidecar(&c, vid); }
    Ok(())
}

#[tauri::command]
pub fn get_video_taggings_batch(db: State<DbPool>, video_ids: Vec<String>) -> Result<HashMap<String, HashMap<String, String>>, String> {
    let c = conn(&db)?;
    let rows = repository::tags::get_video_taggings_batch(&c, &video_ids).map_err(|e| format!("{:?}", e))?;
    let mut result: HashMap<String, HashMap<String, String>> = HashMap::new();
    for (video_id, tag, tag_value) in rows {
        result.entry(video_id).or_default().insert(tag.id, tag_value);
    }
    Ok(result)
}


#[tauri::command]
pub fn get_tag_class_tree(db: State<DbPool>, library_id: String) -> Result<Vec<TagClassTreeNode>, String> {
    let c = conn(&db)?; repository::tags::build_tag_tree(&c, &library_id, None).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn save_tag_template(db: State<DbPool>, library_id: String) -> Result<Vec<TagClassTreeNode>, String> {
    let c = conn(&db)?; repository::tags::save_template(&c, &library_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn load_tag_template(db: State<DbPool>, library_id: String, template: Vec<TagClassTreeNode>) -> Result<(), String> {
    let c = conn(&db)?; repository::tags::load_template(&c, &library_id, &template, None).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn cleanup_unused_tags(db: State<DbPool>, library_id: String) -> Result<i64, String> {
    let c = conn(&db)?; repository::tags::cleanup_unused_tags(&c, &library_id).map_err(|e| e.to_string())
}

/// 批量创建标签并自动赋值到视频
/// 一次性完成：创建标签 → 批量关联到视频 → 设置标签值
#[tauri::command]
pub fn batch_create_and_tag_videos(
    db: State<DbPool>,
    video_ids: Vec<String>,
    class_id: String,
    library_id: String,
    tag_name: String,
    tag_type: String,
    tag_value: String,
) -> Result<String, String> {
    let c = conn(&db)?;
    // 1. 创建标签
    let tag = crate::domain::tag::TagName {
        id: uuid::Uuid::new_v4().to_string(),
        class_id: class_id.clone(),
        library_id: library_id.clone(),
        name: tag_name.clone(),
        color: "#059669".to_string(),
        sort_order: 0,
        created_at: now(),
        updated_at: now(),
        video_count: 0,
        tag_type,
    };
    repository::tags::insert_tag(&c, &tag).map_err(|e| e.to_string())?;
    // 2. 批量关联到视频
    let value = if tag_value.is_empty() { String::new() } else { tag_value };
    let pairs = vec![(tag.id.clone(), value)];
    repository::tags::batch_tag_videos(&c, &video_ids, &pairs).map_err(|e| e.to_string())?;
    Ok(tag.id)
}

/// 批量更新视频标签值
#[tauri::command]
pub fn batch_set_tag_values(
    db: State<DbPool>,
    video_ids: Vec<String>,
    tag_id: String,
    tag_value: String,
) -> Result<(), String> {
    let c = conn(&db)?;
    repository::tags::batch_set_tag_values(&c, &video_ids, &tag_id, &tag_value)
        .map_err(|e| e.to_string())?;
    for vid in &video_ids { let _ = crate::service::sidecar::sync_video_sidecar(&c, vid); }
    Ok(())
}

/// 获取某个标签下所有视频已填写的不同值及其使用次数
/// 返回 [(value, count), ...]，按使用次数降序排列
#[tauri::command]
pub fn get_tag_distinct_values(db: State<DbPool>, tag_id: String) -> Result<Vec<(String, i64)>, String> {
    let c = conn(&db)?;
    repository::tags::get_distinct_tag_values(&c, &tag_id).map_err(|e| e.to_string())
}
