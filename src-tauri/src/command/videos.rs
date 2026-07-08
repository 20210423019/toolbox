use tauri::State;
use crate::domain::video::{Video, VideoDetail};
use crate::infra::db::DbPool;
use crate::service::catalog;
use crate::service::text_scanner;

/// 辅助函数：查找视频关联的文本目录
/// 仅检查 video_dir/小说/ 子目录，不再回退到全目录
/// 避免将非小说 txt/md 文件（如字幕、配置等）错误识别为小说
fn find_novel_or_text_dir(video_path: &str) -> Option<std::path::PathBuf> {
    let parent = std::path::Path::new(video_path).parent()?;
    let novel_dir = parent.join("小说");
    if novel_dir.exists() && novel_dir.is_dir() {
        return Some(novel_dir);
    }
    None // 无专门的小说目录 → 不返回小说/音频状态
}

fn row_to_video(row: &rusqlite::Row) -> rusqlite::Result<Video> {
    Ok(Video {
        id: row.get(0)?, library_id: row.get(1)?, filename: row.get(2)?, filepath: row.get(3)?,
        size: row.get(4)?, duration: row.get(5)?, width: row.get(6)?, height: row.get(7)?,
        fps: row.get(8)?, bitrate: row.get(9)?, video_codec: row.get(10)?,
        video_codec_profile: row.get(11)?, audio_codec: row.get(12)?,
        audio_sample_rate: row.get(13)?, audio_channels: row.get(14)?, format: row.get(15)?,
        thumbnail_path: row.get(16)?,
        metadata: crate::domain::video::VideoMetadata {
            pix_fmt: row.get(17)?, time_base: row.get(18)?,
            codec_level: row.get(19)?, encoder: row.get(20)?, audio_profile: row.get(21)?,
        },
        file_created_at: row.get(22)?, file_modified_at: row.get(23)?,
        added_at: row.get(24)?, note: row.get(25)?,
        favorite: row.get::<_, i32>(26)? != 0,
        status: row.get(27)?, series: row.get(28)?, category: row.get(29)?,
        deleted: row.get::<_, i32>(30)? != 0,
        novel_order: row.get::<_, Option<String>>(31)?.unwrap_or_default(),
        intro_content: row.get::<_, Option<String>>(32)?.unwrap_or_default(),
        resolution: format!("{}x{}", row.get::<_, i32>(6)?, row.get::<_, i32>(7)?),
        uuid: row.get::<_, Option<String>>(33)?.unwrap_or_default(),
        content_hash: row.get::<_, Option<String>>(34)?.unwrap_or_default(),
        created_at: row.get(35)?, updated_at: row.get(36)?,
    })
}

const COLUMNS: &str = "id AS v_id,library_id,filename,filepath,size,duration,width,height,fps,bitrate,\
    video_codec,video_codec_profile,audio_codec,audio_sample_rate,audio_channels,\
    format,thumbnail_path,\
    pix_fmt,time_base,codec_level,encoder,audio_profile,\
    file_created_at,file_modified_at,added_at,note,favorite,\
    status,series,category,deleted,novel_order,intro_content,uuid,content_hash,created_at,updated_at";

#[tauri::command]
pub fn get_videos(
    db: State<DbPool>, libraryId: String, page: i32, pageSize: i32,
    sortBy: String, sortDir: String, search: String, searchScope: String,
    sortBy2: String, sortDir2: String, tagId: String, formatFilter: String,
    novelFilter: String,
) -> Result<Vec<Video>, String> {
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "videos", "获取视频列表失败: {}", e); e.to_string() })?;
    let offset = ((page - 1).max(0)) * pageSize;
    let limit = pageSize.max(1).min(100);
    let order = if sortBy2.is_empty() || sortBy2 == sortBy {
        format!("{} {}", sort_col(&sortBy), dir(&sortDir))
    } else {
        format!("{} {}, {} {}", sort_col(&sortBy), dir(&sortDir), sort_col(&sortBy2), dir(&sortDir2))
    };
    let mut sql = format!(
        "SELECT {} FROM videos WHERE library_id = ?1 AND deleted = 0",
        COLUMNS
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(libraryId.clone())];
    let mut param_idx: usize = 2;

    if !search.is_empty() {
        let like = format!("%{}%", search.trim());
        if searchScope == "folder" {
            // 文件夹搜索：提取文件所在目录路径（去掉末尾的文件名和分隔符）
            sql.push_str(&format!(" AND SUBSTR(filepath, 1, LENGTH(filepath) - LENGTH(filename) - 1) LIKE ?{}", param_idx));
            params.push(Box::new(like));
            param_idx += 1;
        } else {
            sql.push_str(&format!(" AND filename LIKE ?{}", param_idx));
            params.push(Box::new(like));
            param_idx += 1;
        }
    }
    if !tagId.is_empty() {
        sql.push_str(&format!(" AND id IN (SELECT video_id FROM video_class_tags WHERE tag_id = ?{})", param_idx));
        params.push(Box::new(tagId));
        param_idx += 1;
    }
    if !formatFilter.is_empty() {
        let fmts: Vec<&str> = formatFilter.split(',').collect();
        let placeholders: Vec<String> = fmts.iter().enumerate()
            .map(|(i, _)| format!("?{}", param_idx + i)).collect();
        sql.push_str(&format!(" AND LOWER(format) IN ({})", placeholders.join(",")));
        for fmt in &fmts { params.push(Box::new(fmt.trim().to_lowercase())); }
        param_idx += fmts.len();
    }

    sql.push_str(&format!(" ORDER BY {} LIMIT ?{} OFFSET ?{}", order, param_idx, param_idx + 1));
    params.push(Box::new(limit));
    params.push(Box::new(offset));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(param_refs.as_slice(), row_to_video)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows { if let Ok(v) = row { result.push(v); } }

    if !novelFilter.is_empty() && novelFilter != "all" {
        result.retain(|v| {
            match find_novel_or_text_dir(&v.filepath) {
                Some(dir) if dir.exists() => {
                    if novelFilter == "any" { return true; }
                    let (status, _, _) = check_dir_for_novel_audio(&dir);
                    match novelFilter.as_str() {
                        "novel" => status == "novel",
                        "audio" => status == "audio",
                        _ => status != "none",
                    }
                }
                _ => false,
            }
        });
    }

    Ok(result)
}

fn sort_col(key: &str) -> &'static str {
    const SORT_WHITELIST: &[(&str, &str)] = &[
        ("filename","filename"),("name","filename"),("added_at","added_at"),
        ("file_modified_at","file_modified_at"),("size","size"),("duration","duration"),
        ("resolution","(width*height)"),("fps","fps"),("video_codec","video_codec"),
        ("bitrate","bitrate"),("file_created_at","file_created_at"),
    ];
    for (k, v) in SORT_WHITELIST { if *k == key { return v; } }
    "added_at"
}
fn dir(d: &str) -> &'static str { if d.eq_ignore_ascii_case("asc") { "ASC" } else { "DESC" } }

#[tauri::command]
pub fn get_video_count(
    db: State<DbPool>, libraryId: String,
    search: String, searchScope: String,
    tagId: String, formatFilter: String,
) -> Result<i32, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from("SELECT COUNT(*) FROM videos WHERE library_id = ?1 AND deleted = 0");
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(libraryId)];
    let mut param_idx: usize = 2;

    if !search.is_empty() {
        let like = format!("%{}%", search.trim());
        if searchScope == "folder" {
            sql.push_str(&format!(" AND SUBSTR(filepath, 1, LENGTH(filepath) - LENGTH(filename) - 1) LIKE ?{}", param_idx));
        } else {
            sql.push_str(&format!(" AND filename LIKE ?{}", param_idx));
        }
        params.push(Box::new(like));
        param_idx += 1;
    }
    if !tagId.is_empty() {
        sql.push_str(&format!(" AND id IN (SELECT video_id FROM video_class_tags WHERE tag_id = ?{})", param_idx));
        params.push(Box::new(tagId));
        param_idx += 1;
    }
    if !formatFilter.is_empty() {
        let fmts: Vec<&str> = formatFilter.split(',').collect();
        let placeholders: Vec<String> = fmts.iter().enumerate()
            .map(|(i, _)| format!("?{}", param_idx + i)).collect();
        sql.push_str(&format!(" AND LOWER(format) IN ({})", placeholders.join(",")));
        for fmt in &fmts { params.push(Box::new(fmt.trim().to_lowercase())); }
    }

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.query_row(&sql, param_refs.as_slice(), |row| row.get(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_videos_count(db: State<DbPool>) -> Result<i32, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    conn.query_row("SELECT COUNT(*) FROM videos WHERE deleted = 0", [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_total_storage(db: State<DbPool>) -> Result<i64, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    conn.query_row("SELECT COALESCE(SUM(size),0) FROM videos WHERE deleted = 0", [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_video_detail(db: State<DbPool>, videoId: String) -> Result<VideoDetail, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let (video, tags, tag_values) = catalog::get_video_detail(&conn, &videoId)
        .map_err(|e| e.to_string())?;
    Ok(VideoDetail { video, tags, tag_values })
}

#[tauri::command]
pub fn update_video(db: State<DbPool>, videoId: String, note: String, favorite: bool, series: String, category: String) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE videos SET note = ?1, favorite = ?2, series = ?3, category = ?4, updated_at = ?5 WHERE id = ?6",
        rusqlite::params![note, favorite, series, category, now, videoId],
    ).map_err(|e| e.to_string())?;
    let _ = crate::service::sidecar::sync_video_sidecar(&conn, &videoId);
    Ok(())
}

#[tauri::command]
pub fn batch_update_videos(db: State<DbPool>, videoIds: Vec<String>, note: String, favorite: bool, status: String, series: String, category: String) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    // 整批更新包裹在单个事务中：要么全部成功，要么全部回滚
    conn.execute_batch("BEGIN TRANSACTION").map_err(|e| e.to_string())?;
    for id in &videoIds {
        if let Err(e) = conn.execute(
            "UPDATE videos SET note = ?1, favorite = ?2, status = ?3, series = ?4, category = ?5, updated_at = ?6 WHERE id = ?7",
            rusqlite::params![note, favorite, status, series, category, now, id],
        ) {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e.to_string());
        }
        let _ = crate::service::sidecar::sync_video_sidecar(&conn, id);
    }
    conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_video(db: State<DbPool>, videoId: String) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute("UPDATE videos SET deleted = 1, updated_at = ?1 WHERE id = ?2", rusqlite::params![now, videoId])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn batch_rename(db: State<DbPool>, renames: Vec<Vec<String>>, libraryId: String) -> Result<Vec<String>, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut errors = Vec::new();
    for rename in &renames {
        if rename.len() < 3 { errors.push(format!("格式错误: 需要 [id, path, name]")); continue; }
        let video_id = &rename[0];
        let new_path = &rename[1]; // 第二个元素是完整路径
        let new_name = &rename[2]; // 第三个元素是文件名

        // 先查询旧 filepath，用于磁盘重命名
        let old_path: Result<String, _> = conn.query_row(
            "SELECT filepath FROM videos WHERE id = ?1 AND library_id = ?2",
            rusqlite::params![video_id, libraryId],
            |row| row.get(0),
        );

        match old_path {
            Ok(old_path_str) => {
                let old_p = std::path::Path::new(&old_path_str);
                let new_p = std::path::Path::new(&new_path);

                // 只有路径确实发生变化时才执行磁盘重命名
                if old_p != new_p {
                    if old_p.exists() {
                        // 每个重命名项独立事务，避免整批回滚导致的数据不一致
                        if let Err(e) = conn.execute_batch("BEGIN TRANSACTION") {
                            errors.push(format!("{}: 开始事务失败 - {}", video_id, e));
                            continue;
                        }
                        if let Err(e) = std::fs::rename(old_p, new_p) {
                            let _ = conn.execute_batch("ROLLBACK");
                            errors.push(format!("{}: 文件重命名失败 - {}", video_id, e));
                            continue;
                        }
                        if let Err(e) = conn.execute(
                            "UPDATE videos SET filename = ?1, filepath = ?2, updated_at = ?3 WHERE id = ?4 AND library_id = ?5",
                            rusqlite::params![new_name, new_path, now, video_id, libraryId],
                        ) {
                            let _ = conn.execute_batch("ROLLBACK");
                            // 磁盘文件已改名但 DB 更新失败，尝试还原磁盘文件
                            let _ = std::fs::rename(new_p, old_p);
                            errors.push(format!("{}: 数据库更新失败 - {}", video_id, e));
                            continue;
                        }
                        if let Err(e) = conn.execute_batch("COMMIT") {
                            let _ = conn.execute_batch("ROLLBACK");
                            let _ = std::fs::rename(new_p, old_p);
                            errors.push(format!("{}: 提交事务失败 - {}", video_id, e));
                            continue;
                        }
                    } else {
                        errors.push(format!("{}: 原文件不存在 - {}", video_id, old_path_str));
                        continue;
                    }
                }
            }
            Err(e) => {
                errors.push(format!("{}: 查询原文件路径失败 - {}", video_id, e));
                continue;
            }
        }
    }
    Ok(errors)
}

/// 清理文件名中的非法 Windows 字符，避免"文件名语法不正确"错误
fn sanitize_filename(name: &str) -> String {
    let invalid_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    let mut safe = String::with_capacity(name.len());
    for ch in name.chars() {
        if invalid_chars.contains(&ch) {
            safe.push('_');
        } else {
            safe.push(ch);
        }
    }
    // 限制最大长度（Windows 文件名最长 255 字符）
    if safe.len() > 200 {
        if let Some(ext_pos) = safe.rfind('.') {
            let ext = &safe[ext_pos..];
            let base = &safe[..200.min(ext_pos).max(200 - ext.len())];
            safe = format!("{}{}", base, ext);
        } else {
            safe.truncate(200);
        }
    }
    safe
}

#[tauri::command]
pub fn save_novel_links(db: State<DbPool>, videoId: String, fileName: String, links: String) -> Result<(), String> {
    let safe_name = sanitize_filename(&fileName);
    tracing::info!(target: "videos", "保存小说链接: videoId={}, fileName={}, links={}", videoId, safe_name, links);
    // 校验 links 为合法 JSON 数组
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&links)
        .map_err(|e| format!("链接数据格式错误: {}", e))?;
    for (i, item) in parsed.iter().enumerate() {
        if !item.get("url").and_then(|v| v.as_str()).map(|s| s.starts_with("http://") || s.starts_with("https://")).unwrap_or(false) {
            return Err(format!("第 {} 个链接格式不正确，必须以 http:// 或 https:// 开头", i + 1));
        }
    }

    let conn = db.app.lock().map_err(|e| e.to_string())?;
    // 确认视频存在
    let _: String = conn.query_row(
        "SELECT id FROM videos WHERE id = ?1",
        [&videoId],
        |row| row.get(0),
    ).map_err(|e| format!("未找到视频: {}", e))?;

    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    // 删除该视频+文件名下的旧链接
    let _ = conn.execute(
        "DELETE FROM video_novel_links WHERE video_id=?1 AND file_name=?2",
        rusqlite::params![&videoId, &safe_name],
    );
    // 插入新链接
    for (idx, item) in parsed.iter().enumerate() {
        let id = uuid::Uuid::new_v4().to_string();
        let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let note = item.get("note").and_then(|v| v.as_str()).unwrap_or("");
        let _ = conn.execute(
            "INSERT INTO video_novel_links (id,video_id,file_name,url,note,sort_order,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![id, &videoId, &safe_name, url, note, idx, &ts, &ts],
        );
    }

    tracing::info!(target: "videos", "小说链接已保存到数据库: videoId={}, fileName={} ({} links)", videoId, safe_name, parsed.len());
    Ok(())
}

#[tauri::command]
pub fn get_video_novels(db: State<DbPool>, videoId: String) -> Result<serde_json::Value, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let (video_path, novel_order_str): (String, String) = match conn.query_row(
        "SELECT filepath, COALESCE(novel_order, '[]') FROM videos WHERE id = ?1",
        [&videoId],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    ) {
        Ok(r) => r,
        Err(e) => return Err(format!("未找到视频: {}", e)),
    };

    let mut novels: Vec<serde_json::Value> = Vec::new();
    let mut seen_names = std::collections::HashSet::new();

    // 从数据库加载所有小说链接，按 file_name 分组
    let mut db_links_map: std::collections::HashMap<String, Vec<serde_json::Value>> = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT file_name, url, note, sort_order FROM video_novel_links WHERE video_id=?1 ORDER BY sort_order"
    ) {
        if let Ok(rows) = stmt.query_map(rusqlite::params![&videoId], |row| {
            let fname: String = row.get(0)?;
            let url: String = row.get(1)?;
            let note: String = row.get(2)?;
            Ok((fname, url, note))
        }) {
            for row in rows.flatten() {
                db_links_map.entry(row.0)
                    .or_default()
                    .push(serde_json::json!({"url": row.1, "note": row.2}));
            }
        }
    }

    // 先扫描 小说/ 子目录（已管理的）
    if let Some(dir) = std::path::Path::new(&video_path).parent().map(|p| p.join("小说")) {
        if dir.exists() && dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.ends_with(".txt") && !name.ends_with(".mp3") { continue; }
                    if name.ends_with(".mp3") { continue; }
                    if !seen_names.insert(name.clone()) { continue; }
                    if let Ok(meta) = entry.metadata() {
                        let base_name = name.strip_suffix(".txt").unwrap_or(&name);
                        let audio_path = dir.join(format!("{}.mp3", base_name));
                        let audio_path2 = dir.join(format!("{}_audio.mp3", base_name));
                        let has_audio = audio_path.exists() || audio_path2.exists();
                        // 优先使用数据库中的链接，不再解析文件内容
                        let links = db_links_map.remove(&name);
                        novels.push(serde_json::json!({
                            "name": name,
                            "size": meta.len(),
                            "modified": chrono::DateTime::<chrono::Local>::from(meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH))
                                .format("%Y-%m-%d %H:%M:%S").to_string(),
                            "hasAudio": has_audio,
                            "links": links,
                            "source": "managed",
                        }));
                    }
                }
            }
        }
    }

    // 再扫描视频同级目录下的 .txt 文件（未管理的）
    if let Some(parent) = std::path::Path::new(&video_path).parent() {
        if parent.exists() && parent.is_dir() {
            if let Ok(entries) = std::fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.ends_with(".txt") { continue; }
                    if name == "简介.txt" { continue; }
                    if !seen_names.insert(name.clone()) { continue; }
                    if let Ok(meta) = entry.metadata() {
                        let base_name = name.strip_suffix(".txt").unwrap_or(&name);
                        let audio_path = parent.join(format!("{}.mp3", base_name));
                        let has_audio = audio_path.exists();
                        let links = db_links_map.remove(&name);
                        novels.push(serde_json::json!({
                            "name": name,
                            "size": meta.len(),
                            "modified": chrono::DateTime::<chrono::Local>::from(meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH))
                                .format("%Y-%m-%d %H:%M:%S").to_string(),
                            "hasAudio": has_audio,
                            "links": links,
                            "source": "direct",
                        }));
                    }
                }
            }
        }
    }

    // 数据库中有链接但磁盘上无对应文件的纯链接小说
    for (name, links) in db_links_map {
        seen_names.insert(name.clone());
        novels.push(serde_json::json!({
            "name": name,
            "size": 0,
            "modified": "",
            "hasAudio": false,
            "links": links,
            "source": "link",
        }));
    }

    let order: Vec<String> = serde_json::from_str(&novel_order_str).unwrap_or_default();
    Ok(serde_json::json!({ "novels": novels, "order": order }))
}

#[tauri::command]
pub fn delete_novel(db: State<DbPool>, videoId: String, fileName: String) -> Result<(), String> {
    tracing::info!(target: "videos", "删除小说: videoId={}, fileName={}", videoId, fileName);
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let video_path: String = conn.query_row(
        "SELECT filepath FROM videos WHERE id = ?1",
        [&videoId],
        |row| row.get(0),
    ).map_err(|e| format!("未找到视频: {}", e))?;

    let novel_path = std::path::Path::new(&video_path).parent()
        .ok_or("无法获取视频目录")?
        .join("小说")
        .join(&fileName);

    if novel_path.exists() {
        std::fs::remove_file(&novel_path).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    // 同时删除数据库中的链接记录
    let _ = conn.execute(
        "DELETE FROM video_novel_links WHERE video_id=?1 AND file_name=?2",
        rusqlite::params![&videoId, &fileName],
    );
    Ok(())
}

#[tauri::command]
pub fn bind_novel(db: State<DbPool>, videoId: String, fileName: String, fileContent: String) -> Result<(), String> {
    let safe_name = sanitize_filename(&fileName);
    tracing::info!(target: "videos", "绑定小说: videoId={}, fileName={}", videoId, safe_name);
    // 解码 base64 内容
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&fileContent)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;
    let content = String::from_utf8(decoded).map_err(|e| format!("内容编码错误: {}", e))?;

    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let video_path: String = conn.query_row(
        "SELECT filepath FROM videos WHERE id = ?1",
        [&videoId],
        |row| row.get(0),
    ).map_err(|e| format!("未找到视频: {}", e))?;

    use std::io::Write;
    let novel_dir = std::path::Path::new(&video_path).parent()
        .ok_or("无法获取视频目录")?
        .join("小说");
    std::fs::create_dir_all(&novel_dir).map_err(|e| format!("创建目录失败: {}", e))?;
    let novel_path = novel_dir.join(&safe_name);
    let mut file = std::fs::File::create(&novel_path).map_err(|e| format!("写入文件失败: {}", e))?;
    file.write_all(content.as_bytes()).map_err(|e| format!("写入文件失败: {}", e))?;

    tracing::info!(target: "videos", "小说已绑定: {}", novel_path.display());
    Ok(())
}

#[tauri::command]
pub fn reorder_novels(db: State<DbPool>, videoId: String, novelNames: Vec<String>) -> Result<(), String> {
    tracing::info!(target: "videos", "重排小说: videoId={}, count={}", videoId, novelNames.len());
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let order_json = serde_json::to_string(&novelNames).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE videos SET novel_order = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![order_json, now, videoId],
    ).map_err(|e| e.to_string())?;
    let _ = crate::service::sidecar::sync_video_sidecar(&conn, &videoId);
    Ok(())
}

/// 辅助：检查目录中是否有小说/音频文件，并提取首链接 URL 和备注
/// 返回 (status, first_link_url, first_link_note)
/// status: "none" | "novel" | "audio"
fn check_dir_for_novel_audio(dir: &std::path::Path) -> (String, String, String) {
    if !dir.exists() || !dir.is_dir() {
        return ("none".to_string(), String::new(), String::new());
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut has_novel = false;
        let mut has_audio = false;
        let mut first_link = String::new();
        let mut first_note = String::new();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".mp3") { has_audio = true; }
            if name.ends_with(".txt") || name.ends_with(".md") {
                has_novel = true;
                if first_link.is_empty() {
                    if let Ok(content) = std::fs::read_to_string(entry.path()) {
                        let trimmed = content.trim();
                        if trimmed.starts_with("[") {
                            // JSON 多链接格式，取首条 url + note
                            if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(trimmed) {
                                if let Some(first) = arr.first() {
                                    if let Some(url) = first.get("url").and_then(|v| v.as_str()) {
                                        if url.starts_with("http://") || url.starts_with("https://") {
                                            first_link = url.to_string();
                                            first_note = first.get("note").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                        }
                                    }
                                }
                            }
                        } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                            first_link = trimmed.to_string();
                            // 单 URL 格式无备注
                        }
                    }
                }
            }
        }
        if has_audio { return ("audio".to_string(), first_link, first_note); }
        if has_novel { return ("novel".to_string(), first_link, first_note); }
    }
    ("none".to_string(), String::new(), String::new())
}

/// 批量查询视频的文本文件状态（智能版，自动回退到视频同级目录）
/// 优先检查 video_dir/小说/，回退到 video_dir/
/// 返回: Record<videoId, [status, has_link]>
#[tauri::command]
pub fn get_novel_status_batch(db: State<DbPool>, videoIds: Vec<String>) -> Result<std::collections::HashMap<String, (String, String, String)>, String> {
    use std::collections::HashMap;
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let mut results = HashMap::new();

    for chunk in videoIds.chunks(50) {
        let placeholders: Vec<String> = chunk.iter().enumerate()
            .map(|(i, _)| format!("?{}", i + 1)).collect();
        let sql = format!(
            "SELECT id, filepath FROM videos WHERE id IN ({})",
            placeholders.join(",")
        );
        let params: Vec<&dyn rusqlite::types::ToSql> = chunk.iter()
            .map(|id| id as &dyn rusqlite::types::ToSql).collect();

        if let Ok(mut stmt) = conn.prepare(&sql) {
            if let Ok(rows) = stmt.query_map(params.as_slice(), |row| {
                let id: String = row.get(0)?;
                let path: String = row.get(1)?;
                Ok((id, path))
            }) {
                for row in rows.flatten() {
                    let (mut status, mut first_link, mut first_note) = match find_novel_or_text_dir(&row.1) {
                        Some(dir) => check_dir_for_novel_audio(&dir),
                        None => ("none".to_string(), String::new(), String::new()),
                    };

                    // 文件扫描未找到链接时，回退查询 video_novel_links 数据库表
                    // （因为 save_novel_links 保存链接到 DB，不一定会写入文本文件）
                    if first_link.is_empty() {
                        if let Ok(mut link_stmt) = conn.prepare(
                            "SELECT url, note FROM video_novel_links WHERE video_id = ?1 ORDER BY sort_order LIMIT 1"
                        ) {
                            if let Ok(link_row) = link_stmt.query_row([&row.0], |lrow| {
                                let url: String = lrow.get(0)?;
                                let note: String = lrow.get(1)?;
                                Ok((url, note))
                            }) {
                                first_link = link_row.0;
                                first_note = link_row.1;
                                if status == "none" {
                                    status = "novel".to_string();
                                }
                            }
                        }
                    }

                    results.insert(row.0, (status, first_link, first_note));
                }
            }
        }
    }
    Ok(results)
}

/// 智能扫描视频目录下的所有文本文件，自动分类
/// 返回每个文件的分类、置信度、元数据
#[tauri::command]
pub fn scan_video_text_files(db: State<DbPool>, videoId: String) -> Result<text_scanner::VideoTextScanResult, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let (video_path, library_id): (String, String) = conn.query_row(
        "SELECT filepath, library_id FROM videos WHERE id = ?1",
        [&videoId],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| format!("未找到视频: {}", e))?;

    // 加载库的扫描配置
    let cfg = load_scanner_config(&conn, &library_id);
    let result = text_scanner::scan_video_text_files(&videoId, &video_path, &cfg);

    // 提取简介文件内容并保存到数据库
    if let Some(intro_file) = result.files.iter().find(|f| f.category == text_scanner::TextCategory::Intro) {
        if !intro_file.first_lines.is_empty() {
            // 保存前 20 行作为简介内容
            let _ = conn.execute(
                "UPDATE videos SET intro_content=?1, updated_at=?2 WHERE id=?3",
                rusqlite::params![intro_file.first_lines, chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(), videoId],
            );
        }
    }

    Ok(result)
}

/// 从库配置 JSON 构建 ScannerConfig
fn load_scanner_config(conn: &rusqlite::Connection, library_id: &str) -> text_scanner::ScannerConfig {
    let row: Result<(String, String, String, String), _> = conn.query_row(
        "SELECT COALESCE(l.classify_rules,'[]'), COALESCE(l.confidence_thresholds,'{}'),
                COALESCE(l.scan_params,'{}'), COALESCE(l.audio_pair_rules,'[]')
         FROM libraries l WHERE l.id=?1",
        [library_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    );
    match row {
        Ok((cr, ct, sp, apr)) => {
            let mut cfg = text_scanner::ScannerConfig::default();
            cfg.classify_rules = text_scanner::ScannerConfig::parse_classify_rules(&cr);
            cfg.thresholds = text_scanner::ScannerConfig::parse_thresholds(&ct);
            let params = text_scanner::ScannerConfig::parse_scan_params(&sp);
            cfg.audio_pair_rules = text_scanner::ScannerConfig::parse_audio_pair_rules(&apr);
            if let Some(v) = params.read_lines { cfg.head_lines = v; }
            if let Some(v) = params.read_limit { cfg.max_read_size = v; }
            if let Some(v) = params.preview_lines { cfg.preview_lines = v; }
            if let Some(v) = params.min_novel_size { cfg.min_novel_size = v; }
            if let Some(ref kw) = params.novel_keywords { cfg.novel_keywords = kw.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(); }
            if let Some(ref im) = params.intro_match { cfg.intro_match_names = im.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(); }
            cfg
        }
        Err(_) => text_scanner::ScannerConfig::default(),
    }
}

/// 批量扫描多个视频的文本状态（完整信息版）
/// 返回每个视频的完整文本文件列表 + 兼容的 novelStatus
#[tauri::command]
pub fn batch_scan_text_status(db: State<DbPool>, videoIds: Vec<String>) -> Result<std::collections::HashMap<String, text_scanner::TextFileSummary>, String> {
    use std::collections::HashMap;
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let mut results = HashMap::new();
    // 缓存各库的配置
    use std::collections::BTreeMap;
    let mut lib_configs: BTreeMap<String, text_scanner::ScannerConfig> = BTreeMap::new();

    for chunk in videoIds.chunks(50) {
        let placeholders: Vec<String> = chunk.iter().enumerate()
            .map(|(i, _)| format!("?{}", i + 1)).collect();
        let sql = format!(
            "SELECT id, filepath, library_id FROM videos WHERE id IN ({})",
            placeholders.join(",")
        );
        let params: Vec<&dyn rusqlite::types::ToSql> = chunk.iter()
            .map(|id| id as &dyn rusqlite::types::ToSql).collect();

        if let Ok(mut stmt) = conn.prepare(&sql) {
            if let Ok(rows) = stmt.query_map(params.as_slice(), |row| {
                let id: String = row.get(0)?;
                let path: String = row.get(1)?;
                let lib_id: String = row.get(2)?;
                Ok((id, path, lib_id))
            }) {
                for row in rows.flatten() {
                    let cfg = lib_configs.entry(row.2.clone()).or_insert_with(|| load_scanner_config(&conn, &row.2));
                    let summary = text_scanner::get_text_file_summary(&row.1, &cfg);
                    results.insert(row.0, summary);
                }
            }
        }
    }
    Ok(results)
}

/// 扫描小说文件的元数据，内置解析规则
#[derive(serde::Serialize)]
pub struct NovelMetadata {
    pub title: String,
    pub author: String,
    pub word_count: u64,
    pub chapter_count: u32,
    pub volume_count: u32,
    pub chapters: Vec<String>,
    pub volumes: Vec<String>,
    pub description: String,
    pub file_size: u64,
}

#[tauri::command]
pub fn scan_novel_metadata(db: State<DbPool>, videoId: String, novelFileName: String) -> Result<NovelMetadata, String> {
    use std::io::{BufRead, BufReader};
    use std::fs::File;

    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let video_path: String = conn.query_row(
        "SELECT filepath FROM videos WHERE id = ?1",
        [&videoId],
        |row| row.get(0),
    ).map_err(|e| format!("未找到视频: {}", e))?;

    // 先尝试 小说/ 子目录，再尝试视频同级目录
    let novel_path = match std::path::Path::new(&video_path).parent() {
        Some(parent) => {
            let novel_sub = parent.join("小说").join(&novelFileName);
            if novel_sub.exists() {
                novel_sub
            } else {
                parent.join(&novelFileName)
            }
        }
        None => return Err("无法获取视频目录".into()),
    };

    if !novel_path.exists() {
        return Err(format!("小说文件不存在: {}", novelFileName));
    }

    let file_size = std::fs::metadata(&novel_path).map(|m| m.len()).unwrap_or(0);
    let file = File::open(&novel_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let reader = BufReader::new(file);

    let mut title = String::new();
    let mut author = String::new();
    let mut word_count: u64 = 0;
    let mut chapter_count_meta: u32 = 0;
    let mut chapter_count_actual: u32 = 0;
    let mut volume_count: u32 = 0;
    let mut chapters: Vec<String> = Vec::new();
    let mut volumes: Vec<String> = Vec::new();
    let mut description = String::new();
    let mut in_desc = false;
    let mut desc_lines: Vec<String> = Vec::new();

    for line in reader.lines().flatten() {
        // 元数据行（文件头）
        if title.is_empty() && line.starts_with("书名：") {
            title = line[3..].trim().to_string();
            continue;
        }
        if author.is_empty() && line.starts_with("作者：") {
            author = line[3..].trim().to_string();
            continue;
        }
        if line.starts_with("字数：") {
            word_count = line[3..].trim().chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0);
            continue;
        }
        if chapter_count_meta == 0 && line.starts_with("章节：") {
            chapter_count_meta = line[3..].trim().parse().unwrap_or(0);
            continue;
        }

        // 简介区域
        if line.trim() == "简介：" && !in_desc {
            in_desc = true;
            continue;
        }
        if in_desc {
            if line.trim().is_empty() || line.contains("====") {
                if !desc_lines.is_empty() && line.contains("====") {
                    in_desc = false;
                } else if line.trim().is_empty() && desc_lines.len() > 3 {
                    in_desc = false;
                }
            }
            if in_desc {
                desc_lines.push(line.trim().to_string());
                continue;
            }
        }

        // 卷标记：【第一卷：XXX】
        if line.contains('【') && line.contains('卷') && line.contains('】') {
            let vol = line.trim().trim_matches('【').trim_matches('】').to_string();
            if !vol.is_empty() && !volumes.contains(&vol) {
                volumes.push(vol);
                volume_count = volumes.len() as u32;
            }
            continue;
        }

        // 章节标记：第X章 XXX
        if line.trim().starts_with("第") && line.contains("章") {
            chapter_count_actual += 1;
            let ch = line.trim().to_string();
            if chapters.len() < 30 {
                chapters.push(ch);
            }
        }
    }

    if !desc_lines.is_empty() {
        description = desc_lines.join(" ");
        if description.len() > 200 {
            description = description[..200].to_string() + "...";
        }
    }

    Ok(NovelMetadata {
        title: if title.is_empty() { novelFileName.replace(".txt", "") } else { title },
        author,
        word_count,
        chapter_count: chapter_count_meta.max(chapter_count_actual),
        volume_count,
        chapters: chapters.into_iter().take(8).collect(),
        volumes,
        description,
        file_size,
    })
}

/// 读取小说前 N 行作为预览
#[tauri::command]
pub fn read_novel_preview(db: State<DbPool>, videoId: String, novelFileName: String, maxLines: u32) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use std::fs::File;

    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let video_path: String = conn.query_row(
        "SELECT filepath FROM videos WHERE id = ?1",
        [&videoId],
        |row| row.get(0),
    ).map_err(|e| format!("未找到视频: {}", e))?;

    let novel_path = match std::path::Path::new(&video_path).parent() {
        Some(parent) => {
            let novel_sub = parent.join("小说").join(&novelFileName);
            if novel_sub.exists() {
                novel_sub
            } else {
                parent.join(&novelFileName)
            }
        }
        None => return Err("无法获取视频目录".into()),
    };

    if !novel_path.exists() {
        return Err("小说文件不存在".into());
    }

    let file = File::open(&novel_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let reader = BufReader::new(file);
    let mut preview = String::new();
    let mut count = 0;

    for line in reader.lines().flatten() {
        if count >= maxLines { break; }
        preview.push_str(&line);
        preview.push('\n');
        count += 1;
    }

    Ok(preview)
}

/// 扫描视频目录下的简介文件（固定名称如"简介.txt"），解析结构化信息
#[derive(serde::Serialize)]
pub struct VideoIntro {
    pub title: String,
    pub description: String,
    pub episodes: String,
    pub raw_text: String,
    pub file_name: String,
}

#[tauri::command]
pub fn scan_video_intro(db: State<DbPool>, videoId: String, fileName: String) -> Result<VideoIntro, String> {
    use std::io::{BufRead, BufReader};
    use std::fs::File;

    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let video_path: String = conn.query_row(
        "SELECT filepath FROM videos WHERE id = ?1",
        [&videoId],
        |row| row.get(0),
    ).map_err(|e| format!("未找到视频: {}", e))?;

    let video_dir = std::path::Path::new(&video_path).parent()
        .ok_or("无法获取视频目录")?;
    let intro_path = video_dir.join(&fileName);

    if !intro_path.exists() {
        return Err(format!("简介文件不存在: {}", intro_path.display()));
    }

    let file = File::open(&intro_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let reader = BufReader::new(file);
    let mut raw_lines: Vec<String> = Vec::new();
    for line in reader.lines().flatten() {
        raw_lines.push(line);
    }
    let raw_text = raw_lines.join("\n");

    let mut title = String::new();
    let mut episodes = String::new();
    let mut in_desc = false;
    let mut desc_parts: Vec<String> = Vec::new();

    for line in &raw_lines {
        if line.starts_with("标题：") || line.starts_with("标题:") {
            let val = line.trim_start_matches("标题：").trim_start_matches("标题:").trim().to_string();
            if !val.is_empty() { title = val; }
            continue;
        }
        if line.starts_with("简介：") || line.starts_with("简介:") {
            in_desc = true;
            let val = line.trim_start_matches("简介：").trim_start_matches("简介:").trim().to_string();
            if !val.is_empty() { desc_parts.push(val); }
            continue;
        }
        if line.starts_with("集数：") || line.starts_with("集数:") {
            episodes = line.trim_start_matches("集数：").trim_start_matches("集数:").trim().to_string();
            continue;
        }
        if in_desc {
            desc_parts.push(line.trim().to_string());
        }
    }

    let description = desc_parts.join(" ");

    Ok(VideoIntro {
        title,
        description,
        episodes,
        raw_text,
        file_name: fileName,
    })
}

/// 单个文件的操作结果
#[derive(serde::Serialize)]
pub struct FileOrganizeAction {
    pub file_name: String,
    pub category: String,
    pub action: String,   // "moved" | "created" | "skipped"
    pub from: String,
    pub to: String,
}

/// 整理结果
#[derive(serde::Serialize)]
pub struct OrganizeResult {
    pub video_id: String,
    pub video_dir: String,
    pub actions: Vec<FileOrganizeAction>,
}

/// 将视频目录下的文件按分类整理到标准化文件夹
///
/// 标准化结构:
///   视频目录/
///   ├── 简介.txt           (保持不变)
///   ├── 小说/               (小说文件)
///   ├── 字幕/               (字幕文件，与音频同名)
///   ├── 封面/               (封面图片)
///   └── 音频/               (音频文件，与字幕同名)
#[tauri::command]
pub fn organize_text_files(db: State<DbPool>, videoId: String) -> Result<OrganizeResult, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let (video_path, library_id): (String, String) = conn.query_row(
        "SELECT filepath, library_id FROM videos WHERE id = ?1",
        [&videoId],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| format!("未找到视频: {}", e))?;

    let video_dir = std::path::Path::new(&video_path)
        .parent()
        .ok_or("无法获取视频目录")?;

    let cfg = load_scanner_config(&conn, &library_id);
    let scan_result = text_scanner::scan_video_text_files(&videoId, &video_path, &cfg);
    let mut actions: Vec<FileOrganizeAction> = Vec::new();

    // 使用 TextCategory 自带的 target_dir() 方法确定目录
    // 简介(intro) 返回 None → 不移动

    for file in &scan_result.files {
        let category = file.category.label();
        let file_name = &file.file_name;

        // 通过枚举的 target_dir 判断是否需要移动
        let dir_name = match file.category {
            text_scanner::TextCategory::Intro => {
                // 简介留在原地
                actions.push(FileOrganizeAction {
                    file_name: file_name.clone(),
                    category: category.to_string(),
                    action: "skipped".to_string(),
                    from: String::new(),
                    to: String::new(),
                });
                continue;
            }
            other => match other.target_dir() {
                Some(d) => d,
                None => {
                    actions.push(FileOrganizeAction {
                        file_name: file_name.clone(),
                        category: category.to_string(),
                        action: "skipped".to_string(),
                        from: String::new(),
                        to: String::new(),
                    });
                    continue;
                }
            },
        };

        // 源文件路径（考虑可能已经在子文件夹内）
        let source_path = if file_name.starts_with("小说/") {
            video_dir.join(file_name)
        } else {
            video_dir.join(file_name)
        };

        if !source_path.exists() {
            continue;
        }

        // 目标目录
        let target_dir = video_dir.join(dir_name);
        std::fs::create_dir_all(&target_dir).map_err(|e| format!("创建目录 {} 失败: {}", dir_name, e))?;

        // 目标文件路径（去除可能的子目录前缀）
        let base_name = std::path::Path::new(file_name)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| file_name.clone());

        let target_path = target_dir.join(&base_name);

        // 如果已经存在且路径相同，跳过
        if target_path == source_path {
            actions.push(FileOrganizeAction {
                file_name: base_name.clone(),
                category: category.to_string(),
                action: "skipped".to_string(),
                from: source_path.to_string_lossy().to_string(),
                to: target_path.to_string_lossy().to_string(),
            });
            continue;
        }

        // 如果目标已存在，添加序号
        let final_target = if target_path.exists() {
            let stem = std::path::Path::new(&base_name)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let ext = std::path::Path::new(&base_name)
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let mut i = 1;
            let mut new_path;
            loop {
                new_path = target_dir.join(format!("{}_{}{}", stem, i, ext));
                if !new_path.exists() { break; }
                i += 1;
            }
            new_path
        } else {
            target_path.clone()
        };

        // 移动文件
        match std::fs::rename(&source_path, &final_target) {
            Ok(_) => {
                actions.push(FileOrganizeAction {
                    file_name: base_name,
                    category: category.to_string(),
                    action: "moved".to_string(),
                    from: source_path.to_string_lossy().to_string(),
                    to: final_target.to_string_lossy().to_string(),
                });
            }
            Err(e) => {
                // Fallback: copy + delete if rename fails (cross-device)
                match std::fs::copy(&source_path, &final_target) {
                    Ok(_) => {
                        let _ = std::fs::remove_file(&source_path);
                        actions.push(FileOrganizeAction {
                            file_name: base_name,
                            category: category.to_string(),
                            action: "moved".to_string(),
                            from: source_path.to_string_lossy().to_string(),
                            to: final_target.to_string_lossy().to_string(),
                        });
                    }
                    Err(e2) => {
                        tracing::error!(target: "videos", "移动文件失败: {} (rename: {}, copy: {})", source_path.display(), e, e2);
                    }
                }
            }
        }
    }

    Ok(OrganizeResult {
        video_id: videoId,
        video_dir: video_dir.to_string_lossy().to_string(),
        actions,
    })
}

/// 批量删除视频（仅删除数据库记录，不删源文件）
#[tauri::command]
pub fn batch_delete_videos(db: State<DbPool>, videoIds: Vec<String>) -> Result<u32, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut count = 0u32;
    for id in &videoIds {
        match conn.execute("UPDATE videos SET deleted = 1, updated_at = ?1 WHERE id = ?2", rusqlite::params![now, id]) {
            Ok(n) => count += n as u32,
            Err(e) => tracing::error!(target: "videos", "批量删除失败: id={}, err={}", id, e),
        }
    }
    tracing::info!(target: "videos", "批量删除: count={}", count);
    Ok(count)
}


/// 批量导出视频信息到文件
#[tauri::command]
pub fn batch_export_videos(db: State<DbPool>, video_ids: Vec<String>, format: String) -> Result<String, String> {
    use std::io::Write;
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let mut videos = Vec::new();
    for id in &video_ids {
        let sql = format!(
            "SELECT {} FROM videos v WHERE v.id = ?1",
            COLUMNS
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        if let Ok(v) = stmt.query_row(rusqlite::params![id], row_to_video) {
            videos.push(v);
        }
    }
    let data: Vec<serde_json::Value> = videos.iter().map(|v| {
        serde_json::json!({
            "filename": v.filename,
            "filepath": v.filepath,
            "size": v.size,
            "duration": v.duration,
            "width": v.width,
            "height": v.height,
            "fps": v.fps,
            "bitrate": v.bitrate,
            "video_codec": v.video_codec,
            "audio_codec": v.audio_codec,
            "format": v.format,
            "note": v.note,
            "favorite": v.favorite,
            "series": v.series,
            "category": v.category,
            "added_at": v.added_at,
        })
    }).collect();

    let content = if format == "csv" {
        if data.is_empty() { return Ok("[]".to_string()); }
        let keys: Vec<&str> = data[0].as_object()
            .ok_or_else(|| "导出数据格式异常：首项不是 JSON 对象".to_string())?
            .keys().map(|k| k.as_str()).collect();
        let header = keys.join(",");
        let rows: Vec<String> = data.iter().map(|item| {
            keys.iter().map(|k| {
                item.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string()
            }).collect::<Vec<_>>().join(",")
        }).collect();
        header + "\n" + &rows.join("\n")
    } else {
        serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?
    };

    let ts = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("export-videos-{}.{}", ts, format);
    let path = std::env::current_dir()
        .unwrap_or_default()
        .join(&filename);
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
