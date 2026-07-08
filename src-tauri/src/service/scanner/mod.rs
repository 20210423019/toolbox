use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::time::Instant;

use walkdir::WalkDir;
use crate::domain::scan::ScanStatus;
use crate::domain::video::{ScannedVideoPayload, Video, VideoMetadata};
use crate::error::{AppError, AppResult};
use crate::infra::db::DbPool;
use crate::infra::event;
use crate::repository::videos as video_repo;
use crate::service::sidecar;
use crate::service::text_scanner;

fn normalize_path(p: &str) -> String {
    let cleaned = if cfg!(windows) {
        p.trim_start_matches(r"\\?\")
    } else { p };
    cleaned.replace('\\', "/")
}

pub struct ScanState {

    pub running: Mutex<Option<String>>,
    pub abort: AtomicBool,
    pub progress: Mutex<ScanProgressInternal>,
    pub scan_id: Mutex<Option<String>>,
}

#[derive(Clone)]
pub struct ScanProgressInternal {
    pub status: ScanStatus,
    pub library_id: String,
    pub total_files: u64,
    pub scanned_files: u64,
    pub new_files: u64,
    pub updated_files: u64,
    pub removed_files: u64,
    pub errors: Vec<String>,
    pub percentage: f64,
    pub elapsed_secs: u64,
    pub message: String,
}

impl Default for ScanState {
    fn default() -> Self { Self::new() }
}

impl ScanState {
    pub fn new() -> Self {
        ScanState {
            running: Mutex::new(None),
            abort: AtomicBool::new(false),
            progress: Mutex::new(ScanProgressInternal {
                status: ScanStatus::Idle, library_id: String::new(), total_files: 0, scanned_files: 0,
                new_files: 0, updated_files: 0, removed_files: 0,
                errors: vec![], percentage: 0.0, elapsed_secs: 0, message: String::new(),
            }),
            scan_id: Mutex::new(None),
        }
    }
}

struct WorkerTask { path: PathBuf, is_new: bool }

#[derive(Default)]
struct WorkerResult {
    filename: String, is_new: bool, error: Option<String>,
}

struct ProbeResult {
    duration: f64, width: i32, height: i32, fps: f64, bitrate: i64,
    video_codec: String, video_codec_profile: String, pix_fmt: String, time_base: String,
    audio_codec: String, audio_sample_rate: i32, audio_channels: i32,
    codec_level: String, encoder: String, audio_profile: String,
    media_created_at: Option<String>,
}

fn emit_progress(state: &ScanState, app_handle: Option<&tauri::AppHandle>) {
    if let Some(app) = app_handle {
        if let Ok(p) = state.progress.lock() {
            let snapshot = crate::domain::scan::ScanProgress {
                status: p.status.clone(),
                library_id: p.library_id.clone(),
                total_files: p.total_files, scanned_files: p.scanned_files,
                new_files: p.new_files, updated_files: p.updated_files, removed_files: p.removed_files,
                errors: p.errors.clone(), percentage: p.percentage, elapsed_secs: p.elapsed_secs,
                message: p.message.clone(),
            };
            event::emit(app, event::SCAN_PROGRESS_UPDATE, snapshot);
        }
    }
}

/// 发射详细扫描日志事件（供前端控制台日志查看器展示）
fn emit_scan_log(app_handle: Option<&tauri::AppHandle>, level: &str, message: &str) {
    if let Some(app) = app_handle {
        let entry = crate::domain::scan::ScanLogEntry {
            level: level.to_string(),
            message: message.to_string(),
            timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        };
        event::emit(app, event::SCAN_LOG_ENTRY, entry);
    }
}

/// `classify_and_organize` 的线程安全版本 —— 直接接收 `rusqlite::Connection` 引用
/// 供工作线程内联调用，避免跨线程借用 DbPool
fn classify_and_organize_inline(
    conn: &rusqlite::Connection,
    video_id: &str,
    video_path: &str,
    library_id: &str,
    app_handle: &Option<tauri::AppHandle>,
) {
    // 直接用 DiscoveryScope 发现并归类文本文件（路径无关）
    let cfg = load_scanner_config_static(conn, library_id);
    let scan_result = text_scanner::scan_video_text_files(video_id, video_path, &cfg);
    if scan_result.files.is_empty() {
        return;
    }

    // 保存简介内容到 intro_content
    for file in &scan_result.files {
        if file.category == text_scanner::TextCategory::Intro && !file.first_lines.is_empty() {
    let _ = conn.execute(
        "UPDATE videos SET intro_content=?1, updated_at=?2 WHERE id=?3",
        rusqlite::params![file.first_lines, chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(), video_id],
    );
            break;
        }
    }

    // 将文件移动到标准化子目录
    let video_dir = match Path::new(video_path).parent() {
        Some(d) => d.to_path_buf(),
        None => return,
    };

    let mut organized_count = 0u32;
    let mut cover_moves: HashMap<String, String> = HashMap::new();
    for file in &scan_result.files {
        if file.category == text_scanner::TextCategory::Intro {
            continue;
        }
        let dir_name = match file.category.target_dir() {
            Some(d) => d,
            None => continue,
        };

        let source = video_dir.join(&file.file_name);
        if !source.exists() {
            continue;
        }

        let target_dir = video_dir.join(dir_name);
        if std::fs::create_dir_all(&target_dir).is_err() {
            continue;
        }

        let base_name = Path::new(&file.file_name)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| file.file_name.clone());
        let target = target_dir.join(&base_name);
        if target == source {
            continue;
        }

        let final_target = if target.exists() {
            let stem = Path::new(&base_name)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let ext = Path::new(&base_name)
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let mut i = 1;
            let mut new_path;
            loop {
                new_path = target_dir.join(format!("{}_{}{}", stem, i, ext));
                if !new_path.exists() {
                    break;
                }
                i += 1;
            }
            new_path
        } else {
            target.clone()
        };

        match std::fs::rename(&source, &final_target) {
            Ok(_) => {
                organized_count += 1;
                if file.category == text_scanner::TextCategory::Cover {
                    let src_cleaned = crate::service::cover::clean_path(&source.to_string_lossy());
                    let dst_cleaned =
                        crate::service::cover::clean_path(&final_target.to_string_lossy());
                    cover_moves.insert(src_cleaned, dst_cleaned);
                }
            }
            Err(_) => {
                if std::fs::copy(&source, &final_target).is_ok() {
                    let _ = std::fs::remove_file(&source);
                    organized_count += 1;
                    if file.category == text_scanner::TextCategory::Cover {
                        let src_cleaned =
                            crate::service::cover::clean_path(&source.to_string_lossy());
                        let dst_cleaned =
                            crate::service::cover::clean_path(&final_target.to_string_lossy());
                        cover_moves.insert(src_cleaned, dst_cleaned);
                    }
                }
            }
        }
    }

    if organized_count > 0 {
        if let Some(app) = app_handle {
            emit_scan_log_static(
                app,
                "info",
                &format!("归类: {} 个文件已整理到子目录", organized_count),
            );
        }
    }

    // 封面文件移动后更新 thumbnail_path
    if !cover_moves.is_empty() {
        let existing_json: String = conn
            .query_row(
                "SELECT COALESCE(thumbnail_path, '[]') FROM videos WHERE id=?1",
                [video_id],
                |row| row.get(0),
            )
            .unwrap_or_default();
        if !existing_json.is_empty() && existing_json != "[]" {
            if let Ok(mut paths) = serde_json::from_str::<Vec<String>>(&existing_json) {
                let mut changed = false;
                for path in &mut paths {
                    if let Some(new_path) = cover_moves.get(path) {
                        *path = new_path.clone();
                        changed = true;
                    }
                }
                if changed {
                    if let Ok(updated_json) = serde_json::to_string(&paths) {
                        let _ = conn.execute(
                            "UPDATE videos SET thumbnail_path=?1, updated_at=?2 WHERE id=?3",
                            rusqlite::params![updated_json, chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(), video_id],
                        );
                    }
                }
            }
        }
    }
}

/// `load_scanner_config` 的线程安全版本 —— 直接接收 `rusqlite::Connection` 引用
fn load_scanner_config_static(conn: &rusqlite::Connection, library_id: &str) -> text_scanner::ScannerConfig {
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
            if let Some(ref kw) = params.novel_keywords {
                cfg.novel_keywords = kw.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            }
            if let Some(ref im) = params.intro_match {
                cfg.intro_match_names = im.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            }
            cfg
        }
        Err(_) => text_scanner::ScannerConfig::default(),
    }
}

/// `emit_scan_log` 的线程安全版本 —— 接收 `&tauri::AppHandle` 而非 `Option`
fn emit_scan_log_static(app: &tauri::AppHandle, level: &str, message: &str) {
    let entry = crate::domain::scan::ScanLogEntry {
        level: level.to_string(),
        message: message.to_string(),
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    crate::infra::event::emit(app, crate::infra::event::SCAN_LOG_ENTRY, entry);
}

pub fn scan_library(
    db: &DbPool, library_id: &str, state: &ScanState, _incremental: bool,
    ffprobe_path: &str, cover_rules_json: &str, app_handle: Option<&tauri::AppHandle>,
    worker_count: usize, scan_paths: &[String], exclude_paths: &[String],
    formats: &[String], is_include: bool,
) -> AppResult<()> {

    {
        let mut running = state.running.lock().map_err(|e| AppError::Internal(e.to_string()))?;

        if running.as_deref() == Some(library_id) {
            return Err(AppError::Concurrency("该库正在扫描中".into()));
        }
        *running = Some(library_id.to_string());
    }

    {
        let mut p = state.progress.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        p.status = ScanStatus::Scanning;
        p.library_id = library_id.to_string();
        p.total_files = 0; p.scanned_files = 0;
        p.new_files = 0; p.updated_files = 0; p.removed_files = 0;
        p.errors.clear(); p.percentage = 0.0; p.elapsed_secs = 0;
    }
    emit_progress(state, app_handle);

    let start = Instant::now();
    let scan_id = uuid::Uuid::new_v4().to_string();
    *state.scan_id.lock().unwrap() = Some(scan_id.clone());
    let ts = || chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let existing_files: HashMap<String, (String, i64)> = {
        let conn = db.app.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        let mut stmt = conn.prepare("SELECT id, filepath, size FROM videos WHERE library_id=?1")
            .map_err(AppError::Db)?;
        let rows: Vec<(String, (String, i64))> = stmt.query_map(rusqlite::params![library_id], |row| {
            Ok((row.get::<_, String>(1)?, (row.get::<_, String>(0)?, row.get::<_, i64>(2)?)))
        }).map_err(AppError::Db)?.filter_map(|r| r.ok()).collect();
        rows.into_iter().map(|(fp, (id, size))| (normalize_path(&fp), (id, size))).collect()
    };
    let existing_files = Arc::new(existing_files);

    // 构建内容指纹映射：(文件大小, 修改时间) → 视频ID
    // 用于识别重命名/移动后路径改变的视频
    let fingerprint_map: HashMap<(i64, String), String> = {
        let conn = db.app.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        let mut stmt = conn.prepare("SELECT id, size, file_modified_at FROM videos WHERE library_id=?1 AND file_modified_at IS NOT NULL")
            .map_err(AppError::Db)?;
        let rows: Vec<((i64, String), String)> = stmt.query_map(rusqlite::params![library_id], |row| {
            let size: i64 = row.get(1)?;
            let modified: String = row.get(2)?;
            let id: String = row.get(0)?;
            Ok(((size, modified), id))
        }).map_err(AppError::Db)?.filter_map(|r| r.ok()).collect();
        rows.into_iter().collect()
    };
    let fingerprint_map = Arc::new(fingerprint_map);
    // 记录已被指纹匹配"认领"的旧 ID，清理时跳过
    let reclaimed_ids: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));

    {
        let conn = db.app.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        conn.execute("INSERT INTO scan_history (id, library_id, scan_type, status, started_at) VALUES (?1,?2,'full','running',?3)",
            rusqlite::params![scan_id, library_id, ts()]).map_err(AppError::Db)?;
    }

    let max_concurrent = worker_count.max(1).min(12);

    let actual_workers = max_concurrent;
    let (task_tx, task_rx) = mpsc::sync_channel::<WorkerTask>(actual_workers * 8);
    let (result_tx, result_rx) = mpsc::channel::<WorkerResult>();
    let task_rx = Arc::new(Mutex::new(task_rx));

    let abort_flag = Arc::new(AtomicBool::new(false));
    state.abort.store(false, Ordering::Relaxed);
    let mut handles = vec![];
    let data_dir_shared = db.data_dir.clone();
    let lib_id = library_id.to_string();
    let cover_rules = cover_rules_json.to_string();
    let app = app_handle.cloned();
    let scan_id_clone = scan_id.clone();
    for i in 0..actual_workers {
        let rx = task_rx.clone();
        let tx = result_tx.clone();
        let fp = ffprobe_path.to_string();
        let abort = abort_flag.clone();
        let dd = data_dir_shared.clone();
        let lid = lib_id.clone();
        let cr = cover_rules.clone();
        let ah = app.clone();
        let _sid = scan_id_clone.clone();
        let ef = existing_files.clone();
        let fpm = fingerprint_map.clone();
        let rec = reclaimed_ids.clone();
        handles.push(std::thread::Builder::new()
            .name(format!("scan-{}", i))
            .spawn(move || {
                let aborted = || abort.load(Ordering::Relaxed);
                // 每个工作线程使用独立 DB 连接，避免锁竞争
                let worker_db = crate::infra::db::DbPool::new_worker(std::path::Path::new(&dd)).ok();
                loop {
                    if aborted() { break; }
                    let task = match rx.lock().ok().and_then(|g| g.recv().ok()) { Some(t) => t, None => break };
                    if aborted() { break; }

                    // 步骤1：获取文件元数据和探针（被编辑器占用时重试 3 次，短退避）
                    let meta = match (0u32..3).find_map(|attempt| {
                        if attempt > 0 {
                            std::thread::sleep(std::time::Duration::from_millis(200 * attempt as u64));
                        }
                        std::fs::metadata(&task.path).ok()
                    }) {
                        Some(m) => m,
                        None => {
                            let _ = tx.send(WorkerResult {
                                filename: String::new(), is_new: task.is_new,
                                error: Some("无法读取文件元数据（文件被占用，重试3次后放弃）".into()),
                            });
                            continue;
                        }
                    };
                    let path_clone = task.path.clone();
                    let probe = if !fp.is_empty() { probe_file(&fp, &task.path) } else { None };
                    let dt: chrono::DateTime<chrono::Local> = meta.modified().ok().map(|t| t.into()).unwrap_or_else(chrono::Local::now);
                    let ct: chrono::DateTime<chrono::Local> = meta.created().ok().map(|t| t.into()).unwrap_or_else(chrono::Local::now);
                    let media_date = probe.as_ref().and_then(|p| p.media_created_at.clone());
                    let created = media_date.unwrap_or_else(|| ct.format("%Y-%m-%d").to_string());
                    let filename = path_clone.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    let ext = task.path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();

                    // 步骤2：封面检测 + DB 写入 + 归类 + 事件发射（在线程内完成）
                    let path_str = crate::service::cover::clean_path(&task.path.to_string_lossy());
                    let covers = crate::service::cover::find_all_covers(&task.path, &cr);
                    let cleaned_covers: Vec<String> = covers.into_iter().map(|c| crate::service::cover::clean_path(&c)).collect();
                    let cover_json = serde_json::to_string(&cleaned_covers).unwrap_or_default();

                    if let Some(ref pool) = worker_db {
                        // 读取侧车文件用于 UUID 认领
                        let sidecar_path = sidecar::sidecar_path(&task.path);
                        let sidecar_data = sidecar::read_sidecar(&sidecar_path);
                        let content_hash = sidecar::compute_content_hash(&task.path).unwrap_or_default();

                        if task.is_new {
                            // 三重认领：content_hash > 指纹(size+mtime) > 同目录+同大小(改名兜底)
                            let mod_ts = dt.format("%Y-%m-%d %H:%M:%S").to_string();
                            let fp_key = (meta.len() as i64, mod_ts.clone());
                            let reclaimed_id = sidecar_data.as_ref()
                                .filter(|sc| !sc.content_hash.is_empty())
                                .and_then(|sc| {
                                    pool.app.lock().ok().and_then(|conn| {
                                        conn.query_row::<String, _, _>(
                                            "SELECT id FROM videos WHERE content_hash=?1 AND library_id=?2",
                                            rusqlite::params![&sc.content_hash, &lid],
                                            |row| row.get(0),
                                        ).ok()
                                    })
                                })
                                .or_else(|| fpm.get(&fp_key).cloned())
                                // 第三重：同目录 + 同大小 + 原路径磁盘不存在 = 改名（不受 mtime 变动影响）
                                .or_else(|| {
                                    let parent = task.path.parent()?;
                                    let conn = pool.app.lock().ok()?;
                                    let mut stmt = conn.prepare(
                                        "SELECT id, filepath FROM videos WHERE library_id=?1 AND size=?2 AND deleted=0"
                                    ).ok()?;
                                    let pairs: Vec<(String, String)> = stmt.query_map(
                                        rusqlite::params![&lid, meta.len() as i64],
                                        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                                    ).ok()?.filter_map(|r| r.ok()).collect();
                                    pairs.into_iter().find(|(_, fp)| {
                                        Path::new(fp).parent() == Some(parent) && !Path::new(fp).exists()
                                    }).map(|(id, _)| id)
                                });
                            if let Some(ref existing_id) = reclaimed_id {
                                // 指纹匹配成功：更新已有记录的新路径，保留ID和所有标签/属性
                                if let Ok(conn) = pool.app.lock() {
                                let _ = conn.execute(
                                    "UPDATE videos SET filename=?1, filepath=?2, size=?3, duration=?4, width=?5, height=?6, fps=?7, \
                                     bitrate=?8, video_codec=?9, video_codec_profile=?10, audio_codec=?11, \
                                     audio_sample_rate=?12, audio_channels=?13, format=?14, thumbnail_path=?15, \
                                     pix_fmt=?16, time_base=?17, codec_level=?18, encoder=?19, audio_profile=?20, \
                                     file_created_at=?21, file_modified_at=?22, updated_at=?23, uuid=?24, content_hash=?25, \
                                     deleted=0 \
                                     WHERE id=?26",
                                    rusqlite::params![
                                        filename, path_str, meta.len() as i64,
                                        probe.as_ref().map(|p| p.duration).unwrap_or(0.0),
                                        probe.as_ref().map(|p| p.width).unwrap_or(0),
                                        probe.as_ref().map(|p| p.height).unwrap_or(0),
                                        probe.as_ref().map(|p| p.fps).unwrap_or(0.0),
                                        probe.as_ref().map(|p| p.bitrate).unwrap_or(0),
                                        probe.as_ref().map(|p| p.video_codec.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.video_codec_profile.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.audio_codec.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.audio_sample_rate).unwrap_or(0),
                                        probe.as_ref().map(|p| p.audio_channels).unwrap_or(0),
                                        ext.clone(), cover_json,
                                        probe.as_ref().map(|p| p.pix_fmt.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.time_base.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.codec_level.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.encoder.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.audio_profile.clone()).unwrap_or_default(),
                                        created, mod_ts,
                                        chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                                        existing_id,  // uuid = existing_id
                                        content_hash,
                                        existing_id   // WHERE id
                                    ],
                                );
                                // 归类（移动文本文件到标准化子目录，更新封面路径）
                                classify_and_organize_inline(&conn, existing_id, &path_str, &lid, &ah);
                                // 清理失效封面路径：归类移动后不再存在的文件路径从 DB 中移除
                                crate::repository::videos::clean_thumbnail_path(&conn, existing_id);
                                // 从 DB 重新读取清理/更新后的封面路径（用于事件和侧车）
                                let final_cover: String = conn
                                    .query_row(
                                        "SELECT COALESCE(thumbnail_path, '[]') FROM videos WHERE id=?1",
                                        rusqlite::params![existing_id],
                                        |row| row.get(0),
                                    )
                                    .unwrap_or_else(|_| cover_json.clone());
                                // 写入侧车文件（同步元数据和标签到磁盘，使用清理后的封面路径）
                                write_sidecar_for_video(&conn, existing_id, &path_str, &content_hash);
                                // 标记已认领，清理时跳过
                                if let Ok(mut r) = rec.lock() { r.insert(existing_id.clone()); }
                                // 发射事件（使用清理后的封面路径，避免前端加载已移动的文件）
                                if let Some(ref app_h) = ah {
                                    crate::infra::event::emit(app_h, crate::infra::event::SCAN_VIDEO_ADDED,
                                        ScannedVideoPayload {
                                            id: existing_id.clone(), library_id: lid.clone(),
                                            filename: filename.clone(), filepath: path_str.clone(),
                                            size: meta.len() as i64,
                                            duration: probe.as_ref().map(|p| p.duration).unwrap_or(0.0),
                                            width: probe.as_ref().map(|p| p.width).unwrap_or(0),
                                            height: probe.as_ref().map(|p| p.height).unwrap_or(0),
                                            fps: probe.as_ref().map(|p| p.fps).unwrap_or(0.0),
                                            bitrate: probe.as_ref().map(|p| p.bitrate).unwrap_or(0),
                                            video_codec: probe.as_ref().map(|p| p.video_codec.clone()).unwrap_or_default(),
                                            video_codec_profile: probe.as_ref().map(|p| p.video_codec_profile.clone()).unwrap_or_default(),
                                            audio_codec: probe.as_ref().map(|p| p.audio_codec.clone()).unwrap_or_default(),
                                            audio_sample_rate: probe.as_ref().map(|p| p.audio_sample_rate).unwrap_or(0),
                                            audio_channels: probe.as_ref().map(|p| p.audio_channels).unwrap_or(0),
                                            format: ext.clone(),
                                            thumbnail_path: final_cover.clone(),
                                            metadata: VideoMetadata {
                                                pix_fmt: probe.as_ref().map(|p| p.pix_fmt.clone()),
                                                time_base: probe.as_ref().map(|p| p.time_base.clone()),
                                                codec_level: probe.as_ref().map(|p| p.codec_level.clone()),
                                                encoder: probe.as_ref().map(|p| p.encoder.clone()),
                                                audio_profile: probe.as_ref().map(|p| p.audio_profile.clone()),
                                            },
                                            file_created_at: created.clone(),
                                            file_modified_at: mod_ts,
                                            added_at: String::new(),
                                        });
                                }
                                let _ = tx.send(WorkerResult { filename, is_new: true, error: None });
                                } // end if let Ok(conn)
                            } else {
                                // 全新视频：创建新记录
                                if let Ok(conn) = pool.app.lock() {
                                let vid = uuid::Uuid::new_v4().to_string();
                                let added = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                                let video = Video {
                                    id: vid.clone(), library_id: lid.clone(),
                                    filename: filename.clone(), filepath: path_str.clone(),
                                    size: meta.len() as i64,
                                    duration: probe.as_ref().map(|p| p.duration).unwrap_or(0.0),
                                    width: probe.as_ref().map(|p| p.width).unwrap_or(0),
                                    height: probe.as_ref().map(|p| p.height).unwrap_or(0),
                                    fps: probe.as_ref().map(|p| p.fps).unwrap_or(0.0),
                                    bitrate: probe.as_ref().map(|p| p.bitrate).unwrap_or(0),
                                    video_codec: probe.as_ref().map(|p| p.video_codec.clone()).unwrap_or_default(),
                                    video_codec_profile: probe.as_ref().map(|p| p.video_codec_profile.clone()).unwrap_or_default(),
                                    audio_codec: probe.as_ref().map(|p| p.audio_codec.clone()).unwrap_or_default(),
                                    audio_sample_rate: probe.as_ref().map(|p| p.audio_sample_rate).unwrap_or(0),
                                    audio_channels: probe.as_ref().map(|p| p.audio_channels).unwrap_or(0),
                                    format: ext.clone(),
                                    thumbnail_path: cover_json.clone(),
                                    metadata: VideoMetadata {
                                        pix_fmt: probe.as_ref().map(|p| p.pix_fmt.clone()),
                                        time_base: probe.as_ref().map(|p| p.time_base.clone()),
                                        codec_level: probe.as_ref().map(|p| p.codec_level.clone()),
                                        encoder: probe.as_ref().map(|p| p.encoder.clone()),
                                        audio_profile: probe.as_ref().map(|p| p.audio_profile.clone()),
                                    },
                                    file_created_at: created.clone(), file_modified_at: mod_ts.clone(),
                                    added_at: added.clone(), note: String::new(), favorite: false,
                                    status: "normal".into(), series: String::new(), category: String::new(),
                                    deleted: false, novel_order: String::new(), intro_content: String::new(),
                                    resolution: format!("{}x{}", probe.as_ref().map(|p| p.width).unwrap_or(0), probe.as_ref().map(|p| p.height).unwrap_or(0)),
                                    uuid: vid.clone(), content_hash: content_hash.clone(),
                                    created_at: added.clone(), updated_at: added,
                                };
                                let _ = video_repo::insert(&conn, &video);
                                // 自动归类文本文件（在线程内完成，不阻塞主循环）
                                classify_and_organize_inline(&conn, &vid, &path_str, &lid, &ah);
                                // 清理失效封面路径
                                crate::repository::videos::clean_thumbnail_path(&conn, &vid);
                                // 从 DB 重新读取清理/更新后的封面路径
                                let final_cover: String = conn
                                    .query_row(
                                        "SELECT COALESCE(thumbnail_path, '[]') FROM videos WHERE id=?1",
                                        rusqlite::params![&vid],
                                        |row| row.get(0),
                                    )
                                    .unwrap_or_default();
                                // 写入侧车文件（同步元数据和标签到磁盘，使用清理后的封面路径）
                                write_sidecar_for_video(&conn, &vid, &path_str, &content_hash);
                                // 发射新视频事件（使用清理后的封面路径）
                                if let Some(ref app_h) = ah {
                                    let payload = ScannedVideoPayload {
                                        id: video.id.clone(), library_id: video.library_id.clone(),
                                        filename: video.filename.clone(), filepath: video.filepath.clone(),
                                        size: video.size, duration: video.duration, width: video.width, height: video.height,
                                        fps: video.fps, bitrate: video.bitrate,
                                        video_codec: video.video_codec.clone(), video_codec_profile: video.video_codec_profile.clone(),
                                        audio_codec: video.audio_codec.clone(), audio_sample_rate: video.audio_sample_rate,
                                        audio_channels: video.audio_channels, format: video.format.clone(),
                                        thumbnail_path: final_cover.clone(), metadata: video.metadata.clone(),
                                        file_created_at: video.file_created_at.clone(), file_modified_at: video.file_modified_at.clone(),
                                        added_at: video.added_at.clone(),
                                    };
                                    crate::infra::event::emit(app_h, crate::infra::event::SCAN_VIDEO_ADDED, payload);
                                }
                                let _ = tx.send(WorkerResult { filename, is_new: true, error: None });
                                } // end if let Ok(conn)
                            }
                        } else {
                            // 更新已有视频
                            let norm_path = normalize_path(&path_str);
                            if let Some((existing_id, _)) = ef.get(&norm_path) {
                                if let Ok(conn) = pool.app.lock() {
                                let _ = conn.execute(
                                    "UPDATE videos SET filename=?1, size=?2, duration=?3, width=?4, height=?5, fps=?6, \
                                     bitrate=?7, video_codec=?8, video_codec_profile=?9, audio_codec=?10, \
                                     audio_sample_rate=?11, audio_channels=?12, format=?13, thumbnail_path=?14, \
                                     pix_fmt=?15, time_base=?16, codec_level=?17, encoder=?18, audio_profile=?19, \
                                     file_created_at=?20, file_modified_at=?21, updated_at=?22, uuid=?23, content_hash=?24, \
                                     deleted=0 \
                                     WHERE id=?25",
                                    rusqlite::params![
                                        filename, meta.len() as i64,
                                        probe.as_ref().map(|p| p.duration).unwrap_or(0.0),
                                        probe.as_ref().map(|p| p.width).unwrap_or(0),
                                        probe.as_ref().map(|p| p.height).unwrap_or(0),
                                        probe.as_ref().map(|p| p.fps).unwrap_or(0.0),
                                        probe.as_ref().map(|p| p.bitrate).unwrap_or(0),
                                        probe.as_ref().map(|p| p.video_codec.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.video_codec_profile.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.audio_codec.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.audio_sample_rate).unwrap_or(0),
                                        probe.as_ref().map(|p| p.audio_channels).unwrap_or(0),
                                        ext.clone(), cover_json,
                                        probe.as_ref().map(|p| p.pix_fmt.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.time_base.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.codec_level.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.encoder.clone()).unwrap_or_default(),
                                        probe.as_ref().map(|p| p.audio_profile.clone()).unwrap_or_default(),
                                        created, dt.format("%Y-%m-%d %H:%M:%S").to_string(),
                                        chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                                        existing_id,  // uuid = existing_id
                                        content_hash,
                                        existing_id   // WHERE id
                                    ],
                                );
                                // 自动归类文本文件
                                classify_and_organize_inline(&conn, existing_id, &norm_path, &lid, &ah);
                                // 清理失效封面路径
                                crate::repository::videos::clean_thumbnail_path(&conn, existing_id);
                                // 写入侧车文件（同步元数据和标签到磁盘）
                                write_sidecar_for_video(&conn, existing_id, &norm_path, &content_hash);
                                } // end if let Ok(conn)
                            }
                            let _ = tx.send(WorkerResult { filename, is_new: false, error: None });
                        }
                    } else {
                        let _ = tx.send(WorkerResult { filename, is_new: task.is_new, error: Some("DB连接失败".into()) });
                    }
                }
            }).map_err(|e| AppError::Internal(format!("线程创建失败: {}", e)))?);
    }

    let mut total_submitted: u64 = 0;
    let mut seen_paths: std::collections::HashSet<String> = std::collections::HashSet::new();
    let _walk_start = Instant::now();

    for path_str in scan_paths {
        if state.running.lock().unwrap().as_deref() != Some(library_id) || abort_flag.load(Ordering::Relaxed) { break; }
        let path = match std::fs::canonicalize(path_str) { Ok(p) => p, Err(_) => continue };
        if !path.exists() { continue; }
        for entry in WalkDir::new(&path).follow_links(false).into_iter().filter_map(Result::ok) {
            if state.running.lock().unwrap().as_deref() != Some(library_id) || abort_flag.load(Ordering::Relaxed) { break; }
            if !entry.file_type().is_file() { continue; }
            let p_lower = entry.path().to_string_lossy().to_lowercase();
            if exclude_paths.iter().any(|ex| p_lower.contains(&ex.to_lowercase())) { continue; }
            if let Some(ext) = entry.path().extension() {
                let ext_str = format!(".{}", ext.to_string_lossy().to_lowercase());
                // 无格式过滤时接受所有文件；否则按白/黑名单过滤
                if formats.is_empty() || formats.contains(&ext_str) == is_include {
                    let canonical = entry.path().to_string_lossy().to_string();
                    let norm = normalize_path(&canonical);
                    if seen_paths.insert(norm.clone()) {
                        total_submitted += 1;
                        let is_new = !existing_files.contains_key(&norm);
                        if task_tx.send(WorkerTask { path: entry.path().to_path_buf(), is_new }).is_err() { break; }

                        if total_submitted.is_multiple_of(100) {
                            if let Ok(mut p) = state.progress.lock() {
                                p.total_files = total_submitted;
                                p.percentage = 0.0; // 遍历阶段保持 0%
                            }
                            emit_progress(state, app_handle);
                        }
                    }
                }
            }
        }
    }
    drop(task_tx);

    {
        let mut p = state.progress.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        p.total_files = total_submitted;
    }
    // 总工作量=本次实际要发现的文件数，不包含数据库中已有的旧文件
    // 旧文件是否还在磁盘上，在清理阶段单独处理
    let total_work = (total_submitted as f64).max(1.0);
    emit_progress(state, app_handle);

    // 发送详细扫描日志
    emit_scan_log(app_handle, "scan_start", &format!("扫描开始: 发现 {} 个文件", total_submitted));

    if total_submitted == 0 {
        let was_aborted = abort_flag.load(Ordering::Relaxed);
        // 取消扫描时不清除已有文件
        let removed = if was_aborted { 0 } else { existing_files.len() as u64 };
        if !was_aborted && !existing_files.is_empty() {
            if let Ok(conn) = db.app.lock() {
                for (_, (id, _)) in existing_files.iter() {
                    let _ = conn.execute("DELETE FROM videos WHERE id=?1 AND library_id=?2", rusqlite::params![id, library_id]);
                }
            }
        }
        {
            if let Ok(conn) = db.app.lock() {
                if was_aborted {
                    let _ = conn.execute(
                        "UPDATE scan_history SET status='cancelled', duration_ms=?1, completed_at=?2 WHERE id=?3",
                        rusqlite::params![start.elapsed().as_millis() as i64, ts(), scan_id],
                    );
                } else {
                    let _ = conn.execute(
                        "UPDATE scan_history SET status='completed', total_files_found=0, files_removed=?1, duration_ms=?2, completed_at=?3 WHERE id=?4",
                        rusqlite::params![removed as i64, start.elapsed().as_millis() as i64, ts(), scan_id],
                    );
                }
                let _ = conn.execute("UPDATE libraries SET last_scan_at=?1 WHERE id=?2", rusqlite::params![ts(), library_id]);
            }
            let mut p = state.progress.lock().map_err(|e| AppError::Internal(e.to_string()))?;
            p.status = if was_aborted { ScanStatus::Cancelled } else { ScanStatus::Completed };
            p.percentage = 100.0;
        }
        emit_progress(state, app_handle);
        if let Some(app) = app_handle { event::emit_signal(app, event::SCAN_DONE); }
        *state.running.lock().unwrap() = None;
        return Ok(());
    }


    // ─── 主进度聚合循环 ───
    // 工作线程已完成：探针+封面+DB写入+归类+事件发射
    // 主循环仅做轻量级进度聚合和节流发射
    let mut new_count = 0u64; let mut upd_count = 0u64; let mut scanned = 0u64; let mut fail_cnt = 0i64;
    for result in &result_rx {
        let is_last = scanned + 1 >= total_submitted;
        scanned += 1;
        if result.error.is_some() {
            fail_cnt += 1;
            continue;
        }
        if result.is_new {
            new_count += 1;
        } else {
            upd_count += 1;
        }
        // 每 10 个文件或最后一条时更新进度，让前端平滑刷新
        let should_emit = scanned == 1 || scanned.is_multiple_of(10) || is_last;
        if should_emit {
            let pct = ((scanned as f64) / total_work) * 99.0;
            if let Ok(mut p) = state.progress.lock() {
                p.scanned_files = scanned; p.new_files = new_count; p.updated_files = upd_count;
                p.percentage = pct.min(99.0);
                p.elapsed_secs = start.elapsed().as_secs();
                p.message = format!("正在扫描 {} ({}/{})", result.filename, scanned, total_submitted);
            }
            emit_progress(state, app_handle);
        }
        // 达到总量时立即跳出，等待所有工作线程结束
        if scanned >= total_submitted { break; }
        if state.running.lock().unwrap().as_deref() != Some(library_id) || abort_flag.load(Ordering::Relaxed) { break; }
    }

    for h in handles { let _ = h.join(); }

    // ─── 清理已删除文件 ───
    let mut removed_count = 0u64;
    // 存储 (normalized_path, video_id) 元组，DELETE 时用 ID 确保准确
    let mut deleted_paths: Vec<(String, String)> = Vec::new();
    for (fp, (id, _)) in existing_files.iter() {
        if !seen_paths.contains(fp.as_str()) {
            deleted_paths.push((fp.clone(), id.clone()));
        }
    }
    // 过滤掉已被指纹匹配认领的路径（它们是重命名/移动的旧路径，不应删除）
    {
        let reclaimed_set = reclaimed_ids.lock().unwrap_or_else(|e| e.into_inner());
        if !reclaimed_set.is_empty() {
            deleted_paths.retain(|(_fp, id)| {
                !reclaimed_set.contains(id)
            });
        }
    }
    emit_scan_log(app_handle, "info", &format!("扫描阶段完成: 新增 {} / 更新 {} / 失败 {}，待清理 {} 个已删除文件",
        new_count, upd_count, fail_cnt, deleted_paths.len()));
    if !deleted_paths.is_empty() {
        {
            if let Ok(mut p) = state.progress.lock() {
                p.message = format!("正在清理已删除文件... (共 {} 个)", deleted_paths.len());
            }
            emit_progress(state, app_handle);
        }
        const BATCH_DEL: usize = 500;
        for chunk in deleted_paths.chunks(BATCH_DEL) {
            if state.running.lock().unwrap().as_deref() != Some(library_id) { break; }
            if let Ok(conn) = db.app.lock() {
                for (_, id) in chunk {
                    let _ = conn.execute("DELETE FROM videos WHERE id=?1 AND library_id=?2", rusqlite::params![id, library_id]);
                }
            }
            removed_count += chunk.len() as u64;
            let cleanup_pct = 99.5 + (removed_count as f64 / total_work) * 0.4;
            if let Ok(mut p) = state.progress.lock() {
                p.removed_files = removed_count;
                p.percentage = cleanup_pct.min(99.9);
                p.message = format!("正在清理已删除文件... 已处理 {} / {}", removed_count, deleted_paths.len());
            }
            emit_progress(state, app_handle);
        }
    }

    *state.running.lock().unwrap() = None;

    {
        if let Ok(mut p) = state.progress.lock() {
            p.percentage = 99.9;
            p.message = "正在完成最终处理...".to_string();
        }
        emit_progress(state, app_handle);
    }
    let elapsed_ms = start.elapsed().as_millis() as i64;
    let was_aborted = abort_flag.load(Ordering::Relaxed);
    {
        if let Ok(mut p) = state.progress.lock() {
            p.message = "正在更新数据库...".to_string();
        }
        emit_progress(state, app_handle);
    }
    if let Ok(conn) = db.app.lock() {
        if was_aborted {
            let _ = conn.execute(
                "UPDATE scan_history SET status='cancelled', duration_ms=?1, completed_at=?2 WHERE id=?3",
                rusqlite::params![elapsed_ms, ts(), scan_id],
            );
        } else {
            let _ = conn.execute(
                "UPDATE scan_history SET status='completed', total_files_found=?1, new_files_added=?2, files_updated=?3, files_removed=?4, failed_files=?5, duration_ms=?6, completed_at=?7 WHERE id=?8",
                rusqlite::params![total_submitted as i64, new_count as i64, upd_count as i64, removed_count as i64, fail_cnt, elapsed_ms, ts(), scan_id],
            );
        }
        let _ = conn.execute("UPDATE libraries SET last_scan_at=?1 WHERE id=?2", rusqlite::params![ts(), library_id]);
    }
    {
        let mut p = state.progress.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        p.status = if was_aborted { ScanStatus::Cancelled } else { ScanStatus::Completed };
        p.scanned_files = scanned;
        p.new_files = new_count; p.updated_files = upd_count; p.removed_files = removed_count;
        p.percentage = 100.0; p.elapsed_secs = start.elapsed().as_secs();
    }
    emit_progress(state, app_handle);
    if let Some(app) = app_handle { event::emit_signal(app, event::SCAN_DONE); }

    // 发现孤岛侧车文件（视频已不存在但 .vidtool.json 还在）
    {
        let mut orphan_total = 0u64;
        for sp in scan_paths {
            let p = std::path::Path::new(sp);
            if p.exists() && p.is_dir() {
                let orphans = sidecar::discover_orphans(p);
                orphan_total += orphans.len() as u64;
                for o in &orphans {
                    emit_scan_log(app_handle, "debug", &format!("孤岛侧车: {}", o.display()));
                }
            }
        }
        if orphan_total > 0 {
            emit_scan_log(app_handle, "info", &format!("发现 {} 个孤岛侧车文件（视频已不存在）", orphan_total));
        }
    }

    if was_aborted {
        emit_scan_log(app_handle, "warn", &format!("扫描已取消"));
    } else {
        emit_scan_log(app_handle, "info", &format!("扫描完成: 新增 {} / 更新 {} / 移除 {} / 失败 {} / 耗时 {:.1}s",
            new_count, upd_count, removed_count, fail_cnt, start.elapsed().as_secs_f64()));
    }

    Ok(())
}

fn probe_file(ffprobe_path: &str, path: &Path) -> Option<ProbeResult> {
    let mut cmd = std::process::Command::new(ffprobe_path);
    cmd.args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", &path.to_string_lossy()]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().ok()?;
    if !output.status.success() { return None; }
    let json: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    let duration: f64 = json["format"]["duration"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let fmt_bitrate: i64 = json["format"]["bit_rate"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0);
    let (mut w, mut h, mut fps, mut br, mut vc) = (0i32, 0i32, 0.0f64, 0i64, String::new());
    let mut vp = String::new(); let mut pf = String::new(); let mut tb = String::new();
    let mut cl = String::new(); let mut enc = String::new();
    let mut ac = String::new(); let mut sr = 0i32; let mut ch = 0i32; let mut ap = String::new();
    if let Some(streams) = json["streams"].as_array() {
        for s in streams {
            match s["codec_type"].as_str() {
                Some("video") => {
                    w = s["width"].as_i64().unwrap_or(0) as i32;
                    h = s["height"].as_i64().unwrap_or(0) as i32;
                    br = s["bit_rate"].as_str().and_then(|v| v.parse().ok()).unwrap_or(fmt_bitrate);
                    vc = s["codec_name"].as_str().unwrap_or("").to_string();
                    vp = s["profile"].as_str().unwrap_or("").to_string();
                    pf = s["pix_fmt"].as_str().unwrap_or("").to_string();
                    if tb.is_empty() { tb = s["time_base"].as_str().unwrap_or("").to_string(); }
                    if cl.is_empty() { cl = s["level"].as_i64().map(|l| l.to_string()).unwrap_or_default(); }
                    if enc.is_empty() { enc = s["codec_tag_string"].as_str().filter(|v| !v.is_empty()).or_else(|| s["encoder"].as_str()).unwrap_or("").to_string(); }
                    let avg = s["avg_frame_rate"].as_str().or_else(|| s["r_frame_rate"].as_str()).unwrap_or("0/1");
                    if let Some((num, den)) = avg.split_once('/') {
                        let n: f64 = num.parse().unwrap_or(0.0);
                        let d: f64 = den.parse().unwrap_or(1.0);
                        if d > 0.0 { fps = n / d; }
                    }
                }
                Some("audio") => {
                    if ac.is_empty() {
                        ac = s["codec_name"].as_str().unwrap_or("").to_string();
                        sr = s["sample_rate"].as_str().and_then(|v| v.parse().ok()).unwrap_or(0);
                        ch = s["channels"].as_i64().unwrap_or(0) as i32;
                    }
                    if ap.is_empty() { ap = s["profile"].as_str().unwrap_or("").to_string(); }
                }
                _ => {}
            }
        }
    }
    // 解析视频内部创建时间（从 format.tags.creation_time）
    let media_created_at = json["format"]["tags"]["creation_time"].as_str()
        .and_then(|t| {
            // ffprobe 返回 ISO 8601 格式: "2024-01-15T14:30:00.000000Z"
            chrono::DateTime::parse_from_rfc3339(t).ok()
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .or_else(|| {
                    // 兜底：尝试直接取前10字符 (YYYY-MM-DD)
                    Some(t.chars().take(10).collect::<String>())
                })
        });
    Some(ProbeResult { duration, width: w, height: h, fps, bitrate: br, video_codec: vc, video_codec_profile: vp, pix_fmt: pf, time_base: tb, audio_codec: ac, audio_sample_rate: sr, audio_channels: ch, codec_level: cl, encoder: enc, audio_profile: ap, media_created_at })
}

/// 为视频写入/更新侧车文件 (scanner 专用)
fn write_sidecar_for_video(conn: &rusqlite::Connection, video_id: &str, video_path: &str, content_hash: &str) {
    use crate::repository::tags;
    // 查询视频
    let video = match crate::repository::videos::get_by_id(conn, video_id) {
        Ok(v) => v,
        Err(_) => return,
    };
    // 查询标签
    let tag_details = tags::get_video_tag_details(conn, video_id).unwrap_or_default();
    let sc_tags: Vec<sidecar::SidecarTag> = tag_details.into_iter().map(|(tag, value)| {
        let class_name = conn.query_row(
            "SELECT COALESCE(name,'') FROM tag_classes WHERE id=?1",
            rusqlite::params![&tag.class_id],
            |row| row.get::<_, String>(0),
        ).unwrap_or_default();
        sidecar::SidecarTag {
            class_id: tag.class_id,
            class_name,
            tag_id: tag.id,
            tag_name: tag.name,
            value,
        }
    }).collect();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let sc = sidecar::VideoSidecar {
        v: 2,
        uuid: video.id.clone(),
        content_hash: content_hash.to_string(),
        original_path: video_path.to_string(),
        created: video.created_at.clone(),
        updated: now,
        note: video.note,
        favorite: video.favorite,
        series: video.series,
        category: video.category,
        status: video.status,
        novel_order: serde_json::from_str(&video.novel_order).unwrap_or_default(),
        tags: sc_tags,
    };
    let sc_path = sidecar::sidecar_path(std::path::Path::new(video_path));
    // 清理同目录下旧命名的侧车文件（兼容历史版本）
    if let Some(parent) = sc_path.parent() {
        if let Ok(entries) = std::fs::read_dir(parent) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p == sc_path { continue; }
                let name = p.to_string_lossy();
                if name.ends_with(".vidtool") || name.ends_with(".vidtool.json") || name.ends_with("数据.数据.json") {
                    let _ = std::fs::remove_file(&p);
                }
            }
        }
    }
    let _ = sidecar::write_sidecar(&sc_path, &sc);
}
