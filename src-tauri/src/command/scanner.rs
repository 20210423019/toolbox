use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::State;
use crate::domain::scan::{ScanProgress, ScanHistory};
use crate::infra::db::DbPool;
use crate::infra::resource::AppResourceManager;
use crate::infra::ffmpeg;
use crate::service::scanner::{ScanState, scan_library};
use crate::SettingsCache;

fn to_progress(state: &ScanState, library_id: &str) -> Option<ScanProgress> {
    let p = state.progress.lock().ok()?;

    if p.library_id != library_id { return None; }
    Some(ScanProgress {
        status: p.status.clone(), library_id: p.library_id.clone(),
        total_files: p.total_files, scanned_files: p.scanned_files,
        new_files: p.new_files, updated_files: p.updated_files, removed_files: p.removed_files,
        errors: p.errors.clone(), percentage: p.percentage, elapsed_secs: p.elapsed_secs,
        message: p.message.clone(),
    })
}

fn auto_scan_workers() -> usize {
    let cpus = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    (cpus * 1).clamp(2, 12)
}

fn load_cover_rules_json(conn: &rusqlite::Connection, library_id: &str) -> Result<String, String> {
    let mut stmt = conn.prepare(
        "SELECT rule,priority,enabled FROM library_cover_rules WHERE library_id=?1 ORDER BY priority,rule"
    ).map_err(|e| e.to_string())?;
    let rules: Vec<serde_json::Value> = stmt.query_map(rusqlite::params![library_id], |r| {
        Ok(serde_json::json!({
            "rule": r.get::<_, String>(0)?,
            "priority": r.get::<_, i32>(1)?,
            "enabled": r.get::<_, i32>(2)? != 0,
        }))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    serde_json::to_string(&rules).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_scan(
    app_handle: tauri::AppHandle, db: State<DbPool>, state: State<Arc<ScanState>>,
    resource_manager: State<Arc<AppResourceManager>>, settings: State<Arc<SettingsCache>>, libraryId: String,
) -> Result<(), String> {

    {
        let running = state.running.lock().map_err(|e| e.to_string())?;
        if running.as_deref() == Some(&libraryId) {
            return Err("该库正在扫描中".into());
        }
    }
    let ffp = ffmpeg::resolve_ffprobe(&settings.map);
    if ffp.is_empty() { return Err("ffprobe 未找到".into()); }

    let w = auto_scan_workers();
    tracing::info!(target: "scanner", "开始扫描: libraryId={}, workers={} (CPU={})", libraryId, w, std::thread::available_parallelism().map(|n| n.get()).unwrap_or(0));
    let sa = state.inner().clone();
    let rm = resource_manager.inner().clone();
    let dd = db.data_dir.clone();

    std::thread::spawn(move || {
        let _g = rm.scan.acquire();
        let pool = match DbPool::new_worker(std::path::Path::new(&dd)) {
            Ok(p) => p, Err(e) => {
                tracing::error!(target: "scanner", "扫描数据库连接失败: {}", e);
                let mut p = sa.progress.lock().unwrap();
                p.library_id = libraryId.clone();
                p.status = crate::domain::scan::ScanStatus::Error;
                p.errors.push(format!("数据库连接失败: {}", e));
                *sa.running.lock().unwrap() = None;
                return;
            }
        };
        let (sp, fmt, md, cv) = {
            let c = match pool.app.lock() { Ok(c) => c, Err(_) => { *sa.running.lock().unwrap() = None; return; } };
            let r = c.query_row(
                "SELECT COALESCE(sp.paths,''),COALESCE(l.filter_formats,''),
                        COALESCE(l.filter_mode,'whitelist')
                 FROM libraries l LEFT JOIN (SELECT library_id,GROUP_CONCAT(path,'|') as paths FROM library_scan_paths WHERE enabled=1 GROUP BY library_id) sp ON sp.library_id=l.id
                 WHERE l.id=?1",
                rusqlite::params![&libraryId],
                |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?))
            );
            let (sp, fmt, md) = match r { Ok(v) => v, Err(_) => { *sa.running.lock().unwrap() = None; return; } };
            let cv = load_cover_rules_json(&c, &libraryId).unwrap_or_else(|_| "[]".into());
            (sp, fmt, md, cv)
        };
        let paths: Vec<_> = sp.split('|').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
        let excl: Vec<String> = vec![];
        let fmts: Vec<_> = fmt.split(',').map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).collect();
        if let Err(e) = scan_library(&pool, &libraryId, &sa, false, &ffp, &cv, Some(&app_handle), w, &paths, &excl, &fmts, md != "blacklist") {
            tracing::error!(target: "scanner", "扫描失败: {}", e);
            // 更新 scan_history 状态为 error
            if let Some(sid) = sa.scan_id.lock().ok().and_then(|g| g.clone()) {
                if let Ok(conn) = pool.app.lock() {
                    let ts_now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    let _ = conn.execute(
                        "UPDATE scan_history SET status='error', errors=?1, completed_at=?2 WHERE id=?3",
                        rusqlite::params![format!("[\"{}\"]", e.to_string().replace('"', "\\\"")), ts_now, sid],
                    );
                }
            }
            let mut p = sa.progress.lock().unwrap();
            p.library_id = libraryId.clone();
            p.status = crate::domain::scan::ScanStatus::Error;
            p.errors.push(format!("扫描失败: {}", e));
        } else {
            tracing::info!(target: "scanner", "扫描完成: libraryId={}", libraryId);
        }
        pool.checkpoint();

        {
            let mut r = sa.running.lock().unwrap();
            if r.as_deref() == Some(&libraryId) {
                *r = None;
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn get_scan_progress(state: State<Arc<ScanState>>, libraryId: String) -> Result<Option<ScanProgress>, String> {
    Ok(to_progress(&state, &libraryId))
}

#[tauri::command]
pub fn get_scan_history(db: State<DbPool>, libraryId: String) -> Result<Vec<ScanHistory>, String> {
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "scanner", "获取扫描历史失败: {}", e); e.to_string() })?;
    let mut stmt = conn.prepare("SELECT id,library_id,scan_type,status,total_files_found,new_files_added,files_updated,files_removed,failed_files,errors,duration_ms,started_at,completed_at FROM scan_history WHERE library_id=?1 ORDER BY started_at DESC")
        .map_err(|e| e.to_string())?;
    let h = stmt.query_map(rusqlite::params![libraryId], |row| {
        Ok(ScanHistory {
            id: row.get(0)?, library_id: row.get(1)?, scan_type: row.get(2)?, status: row.get(3)?,
            total_files_found: row.get(4)?, new_files_added: row.get(5)?, files_updated: row.get(6)?,
            files_removed: row.get(7)?, failed_files: row.get(8)?, errors: row.get(9)?,
            duration_ms: row.get(10)?, started_at: row.get(11)?, completed_at: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    Ok(h)
}

#[tauri::command]
pub fn cancel_scan(state: State<Arc<ScanState>>, libraryId: String) -> Result<(), String> {
    tracing::info!(target: "scanner", "取消扫描: libraryId={}", libraryId);
    let mut r = state.running.lock().map_err(|e| e.to_string())?;
    if r.as_deref() != Some(&libraryId) {
        return Err("该库没有正在执行的扫描任务".into());
    }
    *r = None;
    state.abort.store(true, Ordering::Relaxed);
    Ok(())
}
