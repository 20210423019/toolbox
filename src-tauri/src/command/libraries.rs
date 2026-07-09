use tauri::State;
use std::sync::Arc;
use crate::CatalogCache;
use crate::domain::library::Library;
use crate::infra::db::DbPool;
use crate::service::catalog;
use crate::service::thumbnail::ThumbnailEngine;
use crate::CoverCache;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanPathInput {
    path: String,
    enabled: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CoverRuleInput {
    rule: String,
    priority: Option<i32>,
    enabled: Option<bool>,
}

fn parse_scan_paths(raw: &str) -> Vec<ScanPathInput> {
    serde_json::from_str::<Vec<ScanPathInput>>(raw).unwrap_or_default()
}

#[tauri::command]
pub fn get_libraries(db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>, categoryId: String) -> Result<Vec<Library>, String> {
    if let Some(json) = cache.get_libraries(&categoryId) {
        if let Ok(libs) = serde_json::from_str(&json) {
            return Ok(libs);
        }
    }
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "libraries", "获取媒体库列表失败: {}", e); e.to_string() })?;
    let libs: Vec<Library> = catalog::get_libraries(&conn, &categoryId).map_err(|e| { tracing::error!(target: "libraries", "获取媒体库列表失败: {:?}", e); format!("{:?}", e) })?;
    if let Ok(json) = serde_json::to_string(&libs) {
        cache.set_libraries(categoryId, json);
    }
    Ok(libs)
}

#[tauri::command]
pub fn create_library(db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>, categoryId: String, name: String, icon: String) -> Result<Library, String> {
    tracing::info!(target: "libraries", "创建媒体库: categoryId={}, name={}, icon={}", categoryId, name, icon);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "libraries", "创建媒体库失败: {}", e); e.to_string() })?;
    let result = catalog::create_library(&conn, categoryId.clone(), name, icon).map_err(|e| { tracing::error!(target: "libraries", "创建媒体库失败: {:?}", e); format!("{:?}", e) });
    cache.invalidate_libraries(Some(&categoryId));
    result
}

#[tauri::command]
pub fn update_library(
    db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>, id: String, name: String, description: Option<String>, status: Option<String>,
    scanPaths: Option<String>, icon: Option<String>, categoryId: Option<String>,
    filterFormats: Option<String>, filterMode: Option<String>, coverScanRules: Option<String>,
    cardInfoFields: Option<String>, cardTagIds: Option<String>,
    classifyRules: Option<String>, confidenceThresholds: Option<String>,
    scanParams: Option<String>, audioPairRules: Option<String>,
) -> Result<(), String> {
    tracing::info!(target: "libraries", "更新媒体库: id={}, name={}", id, name);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "libraries", "更新媒体库失败: {}", e); e.to_string() })?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE libraries SET name=?1,description=COALESCE(?2,description),status=COALESCE(?3,status),icon=COALESCE(?4,icon),
            category_id=COALESCE(NULLIF(?5,''),category_id),
            filter_formats=COALESCE(?6,filter_formats),filter_mode=COALESCE(?7,filter_mode),
            card_info_fields=COALESCE(?8,card_info_fields),card_tag_ids=COALESCE(?9,card_tag_ids),
            classify_rules=COALESCE(?12,classify_rules),
            confidence_thresholds=COALESCE(?13,confidence_thresholds),
            scan_params=COALESCE(?14,scan_params),
            audio_pair_rules=COALESCE(?15,audio_pair_rules),
            updated_at=?10 WHERE id=?11",
        rusqlite::params![
            name, description, status, icon, categoryId.unwrap_or_default(),
            filterFormats, filterMode, cardInfoFields, cardTagIds, now, id,
            classifyRules, confidenceThresholds, scanParams, audioPairRules,
        ],
    ).map_err(|e| { tracing::error!(target: "libraries", "更新媒体库失败: {}", e); e.to_string() })?;

    if let Some(ref scan_paths) = scanPaths {
        conn.execute("DELETE FROM library_scan_paths WHERE library_id=?1", rusqlite::params![id])
            .map_err(|e| { tracing::error!(target: "libraries", "更新扫描路径失败: {}", e); e.to_string() })?;
        for (idx, entry) in parse_scan_paths(scan_paths).into_iter().enumerate() {
            if entry.path.trim().is_empty() { continue; }
            conn.execute(
                "INSERT INTO library_scan_paths (id,library_id,path,enabled,sort_order) VALUES (?1,?2,?3,?4,?5)",
                rusqlite::params![
                    uuid::Uuid::new_v4().to_string(), id, entry.path.trim(),
                    entry.enabled.unwrap_or(true) as i32, idx as i32,
                ],
            ).map_err(|e| { tracing::error!(target: "libraries", "插入扫描路径失败: {}", e); e.to_string() })?;
        }
    }

    if let Some(raw_rules) = coverScanRules {
        let rules: Vec<CoverRuleInput> = serde_json::from_str(&raw_rules).unwrap_or_default();
        conn.execute("DELETE FROM library_cover_rules WHERE library_id=?1", rusqlite::params![id])
            .map_err(|e| { tracing::error!(target: "libraries", "更新封面规则失败: {}", e); e.to_string() })?;
        for (idx, rule) in rules.into_iter().enumerate() {
            if rule.rule.trim().is_empty() { continue; }
            conn.execute(
                "INSERT INTO library_cover_rules (id,library_id,rule,priority,enabled) VALUES (?1,?2,?3,?4,?5)",
                rusqlite::params![
                    uuid::Uuid::new_v4().to_string(), id, rule.rule.trim(),
                    rule.priority.unwrap_or(idx as i32), rule.enabled.unwrap_or(true) as i32,
                ],
            ).map_err(|e| { tracing::error!(target: "libraries", "插入封面规则失败: {}", e); e.to_string() })?;
        }
    }
    cache.invalidate_libraries(None);
    Ok(())
}

#[tauri::command]
pub fn update_library_sort(db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>, id: String, sortOrder: i32) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "libraries", "更新排序失败: {}", e); e.to_string() })?;
    crate::repository::libraries::update_sort(&conn, &id, sortOrder).map_err(|e| format!("{:?}", e))?;
    cache.invalidate_libraries(None);
    Ok(())
}

#[tauri::command]
pub fn delete_library(db: State<DbPool>, cache: State<'_, Arc<CatalogCache>>, thumbnail_engine: State<'_, Arc<ThumbnailEngine>>, cover_cache: State<'_, Arc<CoverCache>>, id: String) -> Result<(), String> {
    tracing::info!(target: "libraries", "删除媒体库: id={}", id);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "libraries", "删除媒体库失败: {}", e); e.to_string() })?;

    // 先查询该库下所有视频的封面路径，用于后续清理缓存
    let cover_paths: Vec<String> = {
        let mut paths = Vec::new();
        let mut stmt = conn.prepare("SELECT thumbnail_path FROM videos WHERE library_id=?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![&id], |r| {
            let path: String = r.get(0)?;
            Ok(path)
        }).map_err(|e| e.to_string())?;
        for row in rows {
            if let Ok(p) = row {
                if !p.is_empty() {
                    if let Ok(arr) = serde_json::from_str::<Vec<String>>(&p) {
                        paths.extend(arr);
                    } else {
                        paths.push(p);
                    }
                }
            }
        }
        paths
    };

    let result = catalog::delete_library(&conn, &id).map_err(|e| { tracing::error!(target: "libraries", "删除媒体库失败: {:?}", e); format!("{:?}", e) });

    // 清理封面缓存
    if result.is_ok() {
        for cover_path in cover_paths {
            thumbnail_engine.invalidate_file(&cover_path);
            cover_cache.invalidate_file(&cover_path);
        }
        thumbnail_engine.clear_mem_cache();
    }

    cache.invalidate_libraries(None);
    result
}

#[tauri::command]
pub fn set_primary_cover(db: State<DbPool>, videoId: String, coverPath: String) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let old: String = conn.query_row("SELECT thumbnail_path FROM videos WHERE id=?1", rusqlite::params![videoId], |r| r.get(0))
        .unwrap_or_default();
    let mut paths: Vec<String> = if old.is_empty() { vec![] } else { serde_json::from_str(&old).unwrap_or(vec![old]) };

    if let Some(pos) = paths.iter().position(|p| *p == coverPath) { paths.remove(pos); }
    paths.insert(0, coverPath);
    let json = serde_json::to_string(&paths).map_err(|e| e.to_string())?;
    conn.execute("UPDATE videos SET thumbnail_path=?1, updated_at=?2 WHERE id=?3", rusqlite::params![json, now, videoId])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reorder_covers(db: State<DbPool>, videoId: String, coverPaths: Vec<String>) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let json = serde_json::to_string(&coverPaths).map_err(|e| e.to_string())?;
    conn.execute("UPDATE videos SET thumbnail_path=?1, updated_at=?2 WHERE id=?3", rusqlite::params![json, now, videoId])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn read_file_as_data_url(path: String, max_width: Option<u32>) -> Result<String, String> {
    use base64::Engine;
    let p = std::path::Path::new(&path);
    if !p.exists() { return Err("文件不存在".into()); }

    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
    let mime = match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        _ => "image/jpeg",
    };

    let data: Vec<u8> = if max_width.unwrap_or(0) > 0 && max_width.unwrap_or(0) < 10000 {
        match image::open(p) {
            Ok(img) => {
                let mw = max_width.unwrap_or(0);
                let (w, h) = (img.width(), img.height());
                if w > mw {
                    let new_h = (h as f64 * mw as f64 / w as f64) as u32;
                    let resized = img.resize_exact(mw, new_h.max(1), image::imageops::FilterType::Lanczos3);
                    let mut buf = std::io::Cursor::new(Vec::new());
                    let _ = match ext.to_lowercase().as_str() {
                        "png" => resized.write_to(&mut buf, image::ImageFormat::Png),
                        "webp" => resized.write_to(&mut buf, image::ImageFormat::WebP),
                        "gif" => resized.write_to(&mut buf, image::ImageFormat::Gif),
                        "bmp" => resized.write_to(&mut buf, image::ImageFormat::Bmp),
                        _ => resized.write_to(&mut buf, image::ImageFormat::Jpeg),
                    };
                    buf.into_inner()
                } else {
                    std::fs::read(p).map_err(|e| format!("读取失败: {}", e))?
                }
            }
            Err(_) => std::fs::read(p).map_err(|e| format!("读取失败: {}", e))?,
        }
    } else {
        std::fs::read(p).map_err(|e| format!("读取失败: {}", e))?
    };

    if data.is_empty() { return Err("文件为空".into()); }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    let data_url = format!("data:{};base64,{}", mime, b64);
    Ok(data_url)
}

#[tauri::command]
pub fn read_cover_base64(path: String, max_width: Option<u32>, cover_cache: tauri::State<'_, std::sync::Arc<crate::CoverCache>>) -> Result<String, String> {
    let mw = max_width.unwrap_or(0);
    let cache_key = format!("{}|{}", path, mw);

    if let Some(cached) = cover_cache.get(&cache_key) {
        return Ok(cached);
    }

    let p = std::path::Path::new(&path);
    if !p.exists() { return Err("文件不存在".into()); }

    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
    let mime = match ext.to_lowercase().as_str() { "png" => "image/png", "webp" => "image/webp", "gif" => "image/gif", "bmp" => "image/bmp", _ => "image/jpeg" };

    let final_data: Vec<u8> = if mw > 0 && mw < 10000 {
        match image::open(p) {
            Ok(img) => {
                let (w, h) = (img.width(), img.height());
                if w > mw {
                    let new_h = (h as f64 * mw as f64 / w as f64) as u32;
                    let resized = img.resize_exact(mw, new_h.max(1), image::imageops::FilterType::Lanczos3);
                    let mut buf = std::io::Cursor::new(Vec::new());
                    let _ = match ext.to_lowercase().as_str() {
                        "png" => resized.write_to(&mut buf, image::ImageFormat::Png),
                        "webp" => resized.write_to(&mut buf, image::ImageFormat::WebP),
                        _ => resized.write_to(&mut buf, image::ImageFormat::Jpeg),
                    };
                    buf.into_inner()
                } else {

                    std::fs::read(p).map_err(|e| format!("读取失败: {}", e))?
                }
            }
            Err(_) => std::fs::read(p).map_err(|e| format!("读取失败: {}", e))?,
        }
    } else {
        std::fs::read(p).map_err(|e| format!("读取失败: {}", e))?
    };

    if final_data.is_empty() { return Err("文件为空".into()); }

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&final_data);
    let data_url = format!("data:{};base64,{}", mime, b64);

    cover_cache.set(cache_key, data_url.clone());

    Ok(data_url)
}
