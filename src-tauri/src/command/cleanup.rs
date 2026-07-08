//! 缺失视频自动清理与日志管理
//!
//! 进入库时自动检查视频文件是否存在，缺失自动标记 deleted=1 并记录日志。
//! 支持日志查看、恢复、永久删除。

use tauri::State;
use crate::infra::db::DbPool;

/// 清理日志条目（返回给前端）
#[derive(serde::Serialize, serde::Deserialize)]
pub struct CleanupLogEntry {
    pub id: String,
    pub video_id: String,
    pub library_id: String,
    pub filename: String,
    pub filepath: String,
    pub size: i64,
    pub duration: f64,
    pub format: String,
    pub resolution: String,
    pub video_codec: String,
    pub status: String,       // "cleaned" | "recovered" | "skipped"
    pub reason: String,       // "file_not_found" | "manual"
    pub detected_at: String,
    pub cleaned_at: Option<String>,
    pub recovered_at: Option<String>,
    pub created_at: String,
}

/// 清理操作结果
#[derive(serde::Serialize)]
pub struct CleanupResult {
    pub total: i64,
    pub cleaned: i64,
    pub skipped: i64,
    pub freed_bytes: i64,
}

/// 分页结果
#[derive(serde::Serialize)]
pub struct PaginatedLogs {
    pub items: Vec<CleanupLogEntry>,
    pub total: i64,
    pub page: i32,
    pub page_size: i32,
    pub total_pages: i32,
}

// ─── 辅助 ───

/// 将数据库行转换为 CleanupLogEntry
fn row_to_log(row: &rusqlite::Row) -> rusqlite::Result<CleanupLogEntry> {
    Ok(CleanupLogEntry {
        id: row.get(0)?,
        video_id: row.get(1)?,
        library_id: row.get(2)?,
        filename: row.get(3)?,
        filepath: row.get(4)?,
        size: row.get::<_, i64>(5).unwrap_or(0),
        duration: row.get::<_, f64>(6).unwrap_or(0.0),
        format: row.get::<_, String>(7).unwrap_or_default(),
        resolution: row.get::<_, String>(8).unwrap_or_default(),
        video_codec: row.get::<_, String>(9).unwrap_or_default(),
        status: row.get(10)?,
        reason: row.get::<_, String>(11).unwrap_or_default(),
        detected_at: row.get(12)?,
        cleaned_at: row.get(13)?,
        recovered_at: row.get(14)?,
        created_at: row.get(15)?,
    })
}

// ─── 命令 ───

/// 检查库中缺失的视频并自动清理
#[tauri::command]
pub fn check_and_cleanup(db: State<DbPool>, libraryId: String) -> Result<CleanupResult, String> {
    use std::path::Path;
    let mut conn = db.app.lock().map_err(|e| e.to_string())?;

    // 先查询所有视频路径，立即释放 stmt 的借用
    let videos: Vec<(String, String, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT id, filepath, size FROM videos WHERE library_id = ?1 AND deleted = 0"
        ).map_err(|e| e.to_string())?;
        let result: Vec<(String, String, i64)> = stmt.query_map([&libraryId], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2).unwrap_or(0)))
        }).map_err(|e| e.to_string())?.flatten().collect();
        result
    };

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut cleaned = 0i64;
    let mut freed_bytes = 0i64;
    let mut skipped = 0i64;

    // 使用事务保证原子性：标记删除 + 写入日志 要么同时成功要么同时失败
    for (vid, fpath, fsize) in &videos {
        if Path::new(fpath).exists() {
            skipped += 1;
            continue;
        }

        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 文件不存在，标记删除
        if let Err(e) = tx.execute("UPDATE videos SET deleted = 1, updated_at = ?1 WHERE id = ?2", rusqlite::params![&now, vid]) {
            tracing::error!(target: "cleanup", "标记删除失败: id={}, err={}", vid, e);
            continue;
        }

        // 获取视频信息（事务内查询，读到刚更新的行）
        let (fmt, w, h, codec, dur): (String, i32, i32, String, f64) = tx.query_row(
            "SELECT COALESCE(format,''), COALESCE(width,0), COALESCE(height,0), COALESCE(video_codec,''), COALESCE(duration,0.0) FROM videos WHERE id = ?1",
            [vid],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        ).unwrap_or_default();
        let resolution = if w > 0 && h > 0 { format!("{}x{}", w, h) } else { String::new() };

        let filename = Path::new(fpath).file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // 插入日志（事务内）
        if let Err(e) = tx.execute(
            "INSERT INTO cleanup_log (id, video_id, library_id, filename, filepath, size, duration, format, resolution, video_codec, status, reason, detected_at, cleaned_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                vid, &libraryId, &filename, fpath,
                fsize, dur, &fmt, &resolution, &codec,
                "cleaned", "file_not_found",
                &now, &now, &now,
            ],
        ) {
            tracing::error!(target: "cleanup", "写入日志失败: id={}, err={}", vid, e);
            continue;
        }

        tx.commit().map_err(|e| e.to_string())?;
        cleaned += 1;
        freed_bytes += fsize;
    }

    if cleaned > 0 {
        tracing::info!(target: "cleanup", "库清理完成: library={}, cleaned={}, freed={}MB", libraryId, cleaned, freed_bytes / 1024 / 1024);
    }

    Ok(CleanupResult { total: videos.len() as i64, cleaned, skipped, freed_bytes })
}

/// 分页查询清理日志
#[tauri::command]
pub fn get_cleanup_logs(
    db: State<DbPool>,
    libraryId: String,
    page: i32,
    pageSize: i32,
    statusFilter: String,
    search: String,
    sortBy: String,
    sortDir: String,
) -> Result<PaginatedLogs, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let pg = page.max(1);
    let ps = pageSize.max(1).min(100);
    let offset = ((pg - 1) * ps) as i64;
    let dir = if sortDir.eq_ignore_ascii_case("asc") { "ASC" } else { "DESC" };
    let sort_col = match sortBy.as_str() {
        "filename" => "filename",
        "filepath" => "filepath",
        "size" => "size",
        "status" => "status",
        "detected_at" => "detected_at",
        "cleaned_at" => "cleaned_at",
        _ => "detected_at",
    };

    // 构建查询
    let mut where_clauses = vec!["library_id = ?1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(libraryId.clone())];

    if !statusFilter.is_empty() && statusFilter != "all" {
        where_clauses.push(format!("status = ?{}", params.len() + 1));
        params.push(Box::new(statusFilter));
    }
    if !search.is_empty() {
        where_clauses.push(format!("(filename LIKE ?{} OR filepath LIKE ?{})", params.len() + 1, params.len() + 1));
        params.push(Box::new(format!("%{}%", search)));
    }

    let where_sql = where_clauses.join(" AND ");

    // 总数
    let count_sql = format!("SELECT COUNT(*) FROM cleanup_log WHERE {}", where_sql);
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let total: i64 = conn.query_row(&count_sql, param_refs.as_slice(), |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // 数据
    let data_sql = format!(
        "SELECT id, video_id, library_id, filename, filepath, size, duration, format, resolution, video_codec, status, reason, detected_at, cleaned_at, recovered_at, created_at FROM cleanup_log WHERE {} ORDER BY {} {} LIMIT ?{} OFFSET ?{}",
        where_sql, sort_col, dir, params.len() + 1, params.len() + 2
    );
    params.push(Box::new(ps));
    params.push(Box::new(offset));
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&data_sql).map_err(|e| e.to_string())?;
    let items: Vec<CleanupLogEntry> = stmt.query_map(param_refs.as_slice(), row_to_log)
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();

    let tp = ((total as f64) / (ps as f64)).ceil() as i32;

    Ok(PaginatedLogs { items, total, page: pg, page_size: ps, total_pages: tp.max(1) })
}

/// 恢复已清理的条目（将 video.deleted 设为 0）
#[tauri::command]
pub fn recover_cleanup_entry(db: State<DbPool>, logId: String) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;

    // 获取日志中的 video_id
    let (video_id, status): (String, String) = conn.query_row(
        "SELECT video_id, status FROM cleanup_log WHERE id = ?1",
        [&logId],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| format!("日志条目不存在: {}", e))?;

    if status != "cleaned" {
        return Err("只能恢复已清理的记录".into());
    }

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 恢复视频记录
    conn.execute("UPDATE videos SET deleted = 0, updated_at = ?1 WHERE id = ?2", rusqlite::params![&now, &video_id])
        .map_err(|e| format!("恢复视频失败: {}", e))?;

    // 更新日志状态
    conn.execute(
        "UPDATE cleanup_log SET status = 'recovered', recovered_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &logId],
    ).map_err(|e| format!("更新日志失败: {}", e))?;

    tracing::info!(target: "cleanup", "已恢复: log_id={}, video_id={}", logId, video_id);
    Ok(())
}

/// 永久删除清理日志条目（同时从 videos 表彻底删除）
#[tauri::command]
pub fn purge_cleanup_entry(db: State<DbPool>, logId: String) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;

    let video_id: String = conn.query_row(
        "SELECT video_id FROM cleanup_log WHERE id = ?1",
        [&logId],
        |row| row.get(0),
    ).map_err(|e| format!("日志条目不存在: {}", e))?;

    // 从 videos 表永久删除
    conn.execute("DELETE FROM videos WHERE id = ?1", [&video_id])
        .map_err(|e| format!("删除视频失败: {}", e))?;

    // 删除日志条目
    conn.execute("DELETE FROM cleanup_log WHERE id = ?1", [&logId])
        .map_err(|e| format!("删除日志失败: {}", e))?;

    tracing::info!(target: "cleanup", "已永久删除: log_id={}, video_id={}", logId, video_id);
    Ok(())
}
