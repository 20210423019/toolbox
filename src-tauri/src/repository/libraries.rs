use rusqlite::{params, Connection};
use crate::domain::library::{CoverRule, Library, ScanPath};
use crate::error::{AppError, AppResult};

fn load_scan_paths(conn: &Connection, library_id: &str) -> AppResult<Vec<ScanPath>> {
    let mut stmt = conn.prepare(
        "SELECT id,path,enabled,sort_order FROM library_scan_paths WHERE library_id=?1 ORDER BY sort_order,path"
    ).map_err(AppError::Db)?;
    let rows = stmt.query_map(params![library_id], |row| {
        Ok(ScanPath {
            id: row.get(0)?,
            path: row.get(1)?,
            enabled: row.get::<_, i32>(2)? != 0,
            sort_order: row.get(3)?,
        })
    }).map_err(AppError::Db)?.filter_map(|r| r.ok()).collect();
    Ok(rows)
}

fn load_cover_rules(conn: &Connection, library_id: &str) -> AppResult<Vec<CoverRule>> {
    let mut stmt = conn.prepare(
        "SELECT id,rule,priority,enabled FROM library_cover_rules WHERE library_id=?1 ORDER BY priority,rule"
    ).map_err(AppError::Db)?;
    let rows = stmt.query_map(params![library_id], |row| {
        Ok(CoverRule {
            id: row.get(0)?,
            rule: row.get(1)?,
            priority: row.get(2)?,
            enabled: row.get::<_, i32>(3)? != 0,
        })
    }).map_err(AppError::Db)?.filter_map(|r| r.ok()).collect();
    Ok(rows)
}

pub fn get_by_category(conn: &Connection, category_id: &str) -> AppResult<Vec<Library>> {
    let mut stmt = conn.prepare(
        "SELECT l.id,l.category_id,l.name,COALESCE(l.icon,'📁'),COALESCE(l.description,''),
                COALESCE(l.status,'normal'),l.sort_order,
                COALESCE(l.filter_formats,''),COALESCE(l.filter_mode,'whitelist'),
                l.scan_interval,COALESCE(l.last_scan_at,''),l.auto_scan,
                l.created_at,l.updated_at,
                l.card_info_fields,l.card_tag_ids,
                COALESCE(l.exclude_paths,''),
                COALESCE(l.auto_clean_days,0),
                COALESCE(l.default_view,'card'),
                COALESCE(l.default_sort,'filename'),
                COALESCE(l.sort_dir,'asc'),
                COALESCE(l.layout_density,'normal'),
                COALESCE(l.classify_rules,'[]'),
                COALESCE(l.confidence_thresholds,'{}'),
                COALESCE(l.scan_params,'{}'),
                COALESCE(l.audio_pair_rules,'[]'),
                COALESCE(vs.video_count,0),
                COALESCE(vs.total_size,0),
                COALESCE(vs.total_duration,0.0)
         FROM libraries l
         LEFT JOIN (
             SELECT v.library_id,
                    COUNT(*) as video_count,
                    COALESCE(SUM(v.size),0) as total_size,
                    COALESCE(SUM(v.duration),0.0) as total_duration
             FROM videos v
             GROUP BY v.library_id
         ) vs ON vs.library_id = l.id
         WHERE l.category_id=?1 ORDER BY l.sort_order,l.created_at"
    ).map_err(AppError::Db)?;

    let mut libs: Vec<Library> = stmt.query_map(params![category_id], |row| {
        Ok(Library {
            id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?,
            icon: row.get(3)?, description: row.get(4)?,
            status: row.get(5)?, sort_order: row.get(6)?,
            scan_paths: vec![],
            exclude_paths: row.get::<_, String>(16)?.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
            filter_formats: row.get::<_, String>(7)?.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
            filter_mode: crate::domain::library::FilterMode::from_str(&row.get::<_, String>(8)?),
            scan_interval: row.get(9)?, last_scan_at: row.get(10)?,
            auto_scan: row.get::<_, i32>(11)? != 0,
            cover_rules: vec![],
            created_at: row.get(12)?, updated_at: row.get(13)?,
            card_info_fields: row.get(14)?,
            card_tag_ids: row.get(15)?,
            classify_rules: row.get(22)?,
            confidence_thresholds: row.get(23)?,
            scan_params: row.get(24)?,
            audio_pair_rules: row.get(25)?,
            auto_clean_days: row.get(17)?,
            default_view: row.get::<_, Option<String>>(18)?.filter(|s| !s.is_empty()).unwrap_or_else(|| "card".into()),
            default_sort: row.get::<_, Option<String>>(19)?.filter(|s| !s.is_empty()).unwrap_or_else(|| "filename".into()),
            sort_dir: row.get::<_, Option<String>>(20)?.filter(|s| !s.is_empty()).unwrap_or_else(|| "asc".into()),
            layout_density: row.get::<_, Option<String>>(21)?.filter(|s| !s.is_empty()).unwrap_or_else(|| "normal".into()),
            video_count: row.get(26)?,
            total_size: row.get(27)?,
            total_duration: row.get(28)?,
        })
    }).map_err(AppError::Db)?.filter_map(|r| r.ok()).collect();
    for lib in &mut libs {
        lib.scan_paths = load_scan_paths(conn, &lib.id)?;
        lib.cover_rules = load_cover_rules(conn, &lib.id)?;
    }
    Ok(libs)
}

pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Library> {
    let mut lib = conn.query_row(
        "SELECT l.id,l.category_id,l.name,COALESCE(l.icon,'📁'),COALESCE(l.description,''),
                COALESCE(l.status,'normal'),l.sort_order,
                COALESCE(l.filter_formats,''),COALESCE(l.filter_mode,'whitelist'),
                l.scan_interval,COALESCE(l.last_scan_at,''),l.auto_scan,
                l.created_at,l.updated_at,
                l.card_info_fields,l.card_tag_ids,
                COALESCE(l.exclude_paths,''),
                COALESCE(l.auto_clean_days,0),
                COALESCE(l.default_view,'card'),
                COALESCE(l.default_sort,'filename'),
                COALESCE(l.sort_dir,'asc'),
                COALESCE(l.layout_density,'normal'),
                COALESCE(l.classify_rules,'[]'),
                COALESCE(l.confidence_thresholds,'{}'),
                COALESCE(l.scan_params,'{}'),
                COALESCE(l.audio_pair_rules,'[]'),
                COALESCE(vs.video_count,0),
                COALESCE(vs.total_size,0),
                COALESCE(vs.total_duration,0.0)
         FROM libraries l
         LEFT JOIN (
             SELECT v.library_id,
                    COUNT(*) as video_count,
                    COALESCE(SUM(v.size),0) as total_size,
                    COALESCE(SUM(v.duration),0.0) as total_duration
             FROM videos v
             GROUP BY v.library_id
         ) vs ON vs.library_id = l.id
         WHERE l.id=?1",
        params![id],
        |row| Ok(Library {
            id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?,
            icon: row.get(3)?, description: row.get(4)?,
            status: row.get(5)?, sort_order: row.get(6)?,
            scan_paths: vec![],
            exclude_paths: row.get::<_, String>(16)?.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
            filter_formats: row.get::<_, String>(7)?.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
            filter_mode: crate::domain::library::FilterMode::from_str(&row.get::<_, String>(8)?),
            scan_interval: row.get(9)?, last_scan_at: row.get(10)?,
            auto_scan: row.get::<_, i32>(11)? != 0,
            cover_rules: vec![],
            created_at: row.get(12)?, updated_at: row.get(13)?,
            card_info_fields: row.get(14)?,
            card_tag_ids: row.get(15)?,
            classify_rules: row.get(22)?,
            confidence_thresholds: row.get(23)?,
            scan_params: row.get(24)?,
            audio_pair_rules: row.get(25)?,
            auto_clean_days: row.get(17)?,
            default_view: row.get::<_, Option<String>>(18)?.filter(|s| !s.is_empty()).unwrap_or_else(|| "card".into()),
            default_sort: row.get::<_, Option<String>>(19)?.filter(|s| !s.is_empty()).unwrap_or_else(|| "filename".into()),
            sort_dir: row.get::<_, Option<String>>(20)?.filter(|s| !s.is_empty()).unwrap_or_else(|| "asc".into()),
            layout_density: row.get::<_, Option<String>>(21)?.filter(|s| !s.is_empty()).unwrap_or_else(|| "normal".into()),
            video_count: row.get(26)?,
            total_size: row.get(27)?,
            total_duration: row.get(28)?,
        }),
    ).map_err(AppError::Db)?;
    lib.scan_paths = load_scan_paths(conn, &lib.id)?;
    lib.cover_rules = load_cover_rules(conn, &lib.id)?;
    Ok(lib)
}

pub fn insert(conn: &Connection, lib: &Library) -> AppResult<()> {
    conn.execute(
        "INSERT INTO libraries (id,category_id,name,icon,description,status,sort_order,
         filter_formats,filter_mode,scan_interval,last_scan_at,auto_scan,
         card_info_fields,card_tag_ids,
         classify_rules,confidence_thresholds,scan_params,audio_pair_rules,
         exclude_paths,auto_clean_days,default_view,default_sort,sort_dir,layout_density,
         created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,
                 ?15,?16,?17,?18,
                 ?19,?20,?21,?22,?23,?24,
                 ?25,?26)",
        params![lib.id, lib.category_id, lib.name, lib.icon, lib.description, lib.status,
                lib.sort_order, lib.filter_formats.join(","),
                lib.filter_mode.as_str(), lib.scan_interval, lib.last_scan_at,
                lib.auto_scan as i32, lib.card_info_fields, lib.card_tag_ids,
                lib.classify_rules, lib.confidence_thresholds, lib.scan_params, lib.audio_pair_rules,
                lib.exclude_paths.join(","), lib.auto_clean_days,
                lib.default_view, lib.default_sort, lib.sort_dir, lib.layout_density,
                lib.created_at, lib.updated_at],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn update_sort(conn: &Connection, id: &str, sort_order: i32) -> AppResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE libraries SET sort_order=?1, updated_at=?2 WHERE id=?3",
        params![sort_order, now, id],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    // 包裹在事务中，保证库及其全部关联数据原子删除；任一步失败整体回滚
    conn.execute_batch("BEGIN TRANSACTION").map_err(AppError::Db)?;
    let result: AppResult<()> = (|| {
        // 孤儿数据清理：优先删除依赖视频/库的子表
        conn.execute(
            "DELETE FROM video_novel_links WHERE video_id IN (SELECT id FROM videos WHERE library_id=?1)",
            params![id],
        ).map_err(AppError::Db)?;
        conn.execute("DELETE FROM cleanup_log WHERE library_id=?1", params![id]).map_err(AppError::Db)?;
        conn.execute("DELETE FROM scan_history WHERE library_id=?1", params![id]).map_err(AppError::Db)?;
        // 主表数据
        conn.execute("DELETE FROM videos WHERE library_id=?1", params![id]).map_err(AppError::Db)?;
        conn.execute("DELETE FROM video_class_tags WHERE tag_id IN (SELECT id FROM class_tags WHERE library_id=?1)", params![id]).map_err(AppError::Db)?;
        conn.execute("DELETE FROM class_tags WHERE library_id=?1", params![id]).map_err(AppError::Db)?;
        conn.execute("DELETE FROM tag_classes WHERE library_id=?1", params![id]).map_err(AppError::Db)?;
        conn.execute("DELETE FROM libraries WHERE id=?1", params![id]).map_err(AppError::Db)?;
        Ok(())
    })();
    match result {
        Ok(_) => { conn.execute_batch("COMMIT").map_err(AppError::Db)?; }
        Err(e) => { let _ = conn.execute_batch("ROLLBACK"); return Err(e); }
    }
    Ok(())
}
