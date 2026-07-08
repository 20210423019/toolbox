use crate::domain::card_display::CardDisplayConfig;
use crate::infra::db::DbPool;
use crate::CatalogCache;
use rusqlite::params;
use std::sync::Arc;
use tauri::State;

/// 获取指定库的卡片显示配置
#[tauri::command]
pub fn get_card_display_config(db: State<DbPool>, library_id: String) -> Result<CardDisplayConfig, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let (info_json, tags_json): (String, String) = conn
        .query_row(
            "SELECT COALESCE(card_info_fields,'[]'), COALESCE(card_tag_ids,'[]') FROM libraries WHERE id=?1",
            params![library_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("获取卡片配置失败: {}", e))?;
    Ok(CardDisplayConfig::from_json(Some(&info_json), Some(&tags_json)))
}

/// 保存指定库的卡片显示配置
#[tauri::command]
pub fn set_card_display_config(
    db: State<DbPool>,
    cache: State<'_, Arc<CatalogCache>>,
    library_id: String,
    info_fields: Vec<String>,
    tag_ids: Vec<String>,
) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let info_json = serde_json::to_string(&info_fields).map_err(|e| e.to_string())?;
    let tags_json = serde_json::to_string(&tag_ids).map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE libraries SET card_info_fields=?1, card_tag_ids=?2, updated_at=?3 WHERE id=?4",
        params![info_json, tags_json, now, library_id],
    )
    .map_err(|e| format!("保存卡片配置失败: {}", e))?;
    cache.invalidate_libraries(None);
    Ok(())
}
