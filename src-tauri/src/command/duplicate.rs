use tauri::State;
use crate::domain::scan::DuplicateGroup;
use crate::infra::db::DbPool;

/// 单次 SQL 查询找出所有重复组（使用 GROUP_CONCAT 避免 N+1）
fn find_exact_duplicates(conn: &rusqlite::Connection, library_id: Option<&str>) -> Result<Vec<DuplicateGroup>, String> {
    let sql = if library_id.is_some() {
        "SELECT library_id,filename,size,COUNT(*),GROUP_CONCAT(id) FROM videos WHERE library_id=?1 GROUP BY library_id,filename,size HAVING COUNT(*)>1"
    } else {
        "SELECT library_id,filename,size,COUNT(*),GROUP_CONCAT(id) FROM videos GROUP BY library_id,filename,size HAVING COUNT(*)>1"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let groups: Vec<DuplicateGroup> = if let Some(lib_id) = library_id {
        stmt.query_map(rusqlite::params![lib_id], |row| {
            let lib: String = row.get(0)?;
            let name: String = row.get(1)?;
            let size: i64 = row.get(2)?;
            let _cnt: i64 = row.get(3)?;
            let ids_str: String = row.get(4)?;
            let ids: Vec<String> = ids_str.split(',').map(|s| s.to_string()).collect();
            let saved = size * (ids.len() as i64 - 1);
            Ok(DuplicateGroup {
                group_id: format!("exact:{}:{}:{}", lib, name, size),
                videos: ids,
                match_type: "exact".into(),
                similarity: 100.0,
                total_size_saved: saved,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect()
    } else {
        stmt.query_map([], |row| {
            let lib: String = row.get(0)?;
            let name: String = row.get(1)?;
            let size: i64 = row.get(2)?;
            let _cnt: i64 = row.get(3)?;
            let ids_str: String = row.get(4)?;
            let ids: Vec<String> = ids_str.split(',').map(|s| s.to_string()).collect();
            let saved = size * (ids.len() as i64 - 1);
            Ok(DuplicateGroup {
                group_id: format!("exact:{}:{}:{}", lib, name, size),
                videos: ids,
                match_type: "exact".into(),
                similarity: 100.0,
                total_size_saved: saved,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect()
    };
    Ok(groups)
}

#[tauri::command]
pub fn find_duplicates(db: State<DbPool>, libraryId: String, mode: String) -> Result<Vec<DuplicateGroup>, String> {
    tracing::info!(target: "duplicate", "查找重复: libraryId={}, mode={}", libraryId, mode);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "duplicate", "查找重复失败: {}", e); e.to_string() })?;
    if mode == "exact" || mode == "exact_hash" {
        return find_exact_duplicates(&conn, Some(&libraryId));
    }
    find_exact_duplicates(&conn, Some(&libraryId))
}

#[tauri::command]
pub fn get_duplicate_groups(db: State<DbPool>) -> Result<Vec<DuplicateGroup>, String> {
    tracing::info!(target: "duplicate", "获取所有重复组");
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "duplicate", "获取重复组失败: {}", e); e.to_string() })?;
    find_exact_duplicates(&conn, None)
}

#[tauri::command]
pub fn resolve_duplicate(db: State<DbPool>, groupId: String, keepVideoId: String) -> Result<(), String> {
    tracing::info!(target: "duplicate", "解决重复: groupId={}, keepVideoId={}", groupId, keepVideoId);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "duplicate", "解决重复失败: {}", e); e.to_string() })?;
    let (library_id, filename, size): (String, String, i64) = conn.query_row(
        "SELECT library_id,filename,size FROM videos WHERE id=?1",
        rusqlite::params![keepVideoId],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).map_err(|e| { tracing::error!(target: "duplicate", "解决重复失败: {}", e); e.to_string() })?;
    conn.execute(
        "DELETE FROM videos WHERE library_id=?1 AND filename=?2 AND size=?3 AND id!=?4",
        rusqlite::params![library_id, filename, size, keepVideoId],
    )
        .map_err(|e| { tracing::error!(target: "duplicate", "解决重复失败: {}", e); e.to_string() })?;
    let _ = groupId;
    Ok(())
}
