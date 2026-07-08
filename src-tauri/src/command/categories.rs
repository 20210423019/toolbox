use tauri::State;
use std::sync::Arc;
use crate::CatalogCache;
use crate::CoverCache;
use crate::domain::category::Category;
use crate::infra::db::DbPool;
use crate::service::catalog;
use crate::service::thumbnail::ThumbnailEngine;

#[tauri::command]
pub fn get_categories(db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>) -> Result<Vec<Category>, String> {

    if let Some(json) = cache.get_categories() {
        if let Ok(cats) = serde_json::from_str(&json) {
            return Ok(cats);
        }
    }
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "categories", "获取分类列表失败: {}", e); e.to_string() })?;
    let cats: Vec<Category> = catalog::get_categories(&conn).map_err(|e| { tracing::error!(target: "categories", "获取分类列表失败: {:?}", e); format!("{:?}", e) })?;
    if let Ok(json) = serde_json::to_string(&cats) {
        cache.set_categories(json);
    }
    Ok(cats)
}

#[tauri::command]
pub fn create_category(db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>, name: String) -> Result<Category, String> {
    tracing::info!(target: "categories", "创建分类: {}", name);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "categories", "创建分类失败: {}", e); e.to_string() })?;
    let result = catalog::create_category(&conn, name).map_err(|e| { tracing::error!(target: "categories", "创建分类失败: {:?}", e); format!("{:?}", e) });
    cache.invalidate_categories();
    result
}

/// 查询指定库ID列表中所有视频的封面路径，用于清理缓存
fn collect_cover_paths(conn: &rusqlite::Connection, lib_ids: &[String]) -> Result<Vec<String>, String> {
    let mut cover_paths = Vec::new();
    for lib_id in lib_ids {
        let mut stmt = conn.prepare("SELECT thumbnail_path FROM videos WHERE library_id=?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![lib_id], |r| {
            let path: String = r.get(0)?;
            Ok(path)
        }).map_err(|e| e.to_string())?;
        for row in rows {
            if let Ok(p) = row {
                if !p.is_empty() {
                    if let Ok(arr) = serde_json::from_str::<Vec<String>>(&p) {
                        cover_paths.extend(arr);
                    } else {
                        cover_paths.push(p);
                    }
                }
            }
        }
    }
    Ok(cover_paths)
}

#[tauri::command]
pub fn delete_category(db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>, thumbnail_engine: State<'_, Arc<ThumbnailEngine>>, cover_cache: State<'_, Arc<CoverCache>>, id: String, deleteLibraries: bool) -> Result<(), String> {
    tracing::info!(target: "categories", "删除分类: id={}, 删除关联媒体库={}", id, deleteLibraries);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "categories", "删除分类失败: {}", e); e.to_string() })?;

    // 先收集要删除的库的封面路径
    let lib_ids: Vec<String> = if deleteLibraries {
        crate::repository::categories::get_library_ids(&conn, &id).map_err(|e| format!("{:?}", e))?
    } else {
        vec![]
    };
    let cover_paths = collect_cover_paths(&conn, &lib_ids)?;

    let result = catalog::delete_category(&conn, id, deleteLibraries).map_err(|e| { tracing::error!(target: "categories", "删除分类失败: {:?}", e); format!("{:?}", e) });

    // 清理封面缓存
    if result.is_ok() && deleteLibraries {
        for cover_path in &cover_paths {
            thumbnail_engine.invalidate_file(cover_path);
            cover_cache.invalidate_file(cover_path);
        }
        thumbnail_engine.clear_mem_cache();
    }

    cache.invalidate_categories();
    result
}

#[tauri::command]
pub fn update_category_status(db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>, id: String, status: String) -> Result<Category, String> {
    tracing::info!(target: "categories", "更新分类状态: id={}, status={}", id, status);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "categories", "更新分类状态失败: {}", e); e.to_string() })?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    crate::repository::categories::update_status(&conn, &id, &status, &now).map_err(|e| { tracing::error!(target: "categories", "更新分类状态失败: {:?}", e); format!("{:?}", e) })?;
    let updated = crate::repository::categories::get_by_id(&conn, &id).map_err(|e| { tracing::error!(target: "categories", "查询更新后分类失败: {:?}", e); format!("{:?}", e) })?;
    cache.invalidate_categories();
    Ok(updated)
}

#[tauri::command]
pub fn update_category_sort(db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>, id: String, sortOrder: i32) -> Result<(), String> {
    tracing::info!(target: "categories", "更新分类排序: id={}, sort={}", id, sortOrder);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "categories", "更新分类排序失败: {}", e); e.to_string() })?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let result = crate::repository::categories::update_sort(&conn, &id, sortOrder, &now).map_err(|e| { tracing::error!(target: "categories", "更新分类排序失败: {:?}", e); format!("{:?}", e) });
    cache.invalidate_categories();
    result
}

#[tauri::command]
pub fn update_category(db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>, id: String, name: String, icon: Option<String>, note: Option<String>) -> Result<Category, String> {
    tracing::info!(target: "categories", "更新分类: id={}, name={}", id, name);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "categories", "更新分类失败: {}", e); e.to_string() })?;
    
    Category::validate_name(&name).map_err(|e| format!("分类名称验证失败: {}", e))?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    
    conn.execute(
        "UPDATE categories SET name=?1, icon=COALESCE(?2,icon), note=COALESCE(?3,note), updated_at=?4 WHERE id=?5",
        rusqlite::params![name, icon, note, now, id],
    ).map_err(|e| { tracing::error!(target: "categories", "更新分类失败: {}", e); e.to_string() })?;
    
    // 重新查询更新后的分类
    let updated = crate::repository::categories::get_by_id(&conn, &id)
        .map_err(|e| { tracing::error!(target: "categories", "查询更新后的分类失败: {:?}", e); format!("{:?}", e) })?;
    
    cache.invalidate_categories();
    Ok(updated)
}
