use std::collections::HashMap;
use std::sync::Mutex;
use rusqlite::{params, Connection};
use crate::domain::settings::AppSettings;
use crate::error::{AppError, AppResult};

pub fn load_settings_map(conn: &Connection) -> AppResult<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings").map_err(AppError::Db)?;
    let map = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(AppError::Db)?.filter_map(|r| r.ok()).collect();
    Ok(map)
}

pub fn get_settings(conn: &Connection) -> AppResult<AppSettings> {
    let map = load_settings_map(conn)?;
    Ok(AppSettings {
        theme: gs(&map, "theme"),
        language: gs(&map, "language"),
        font_size: gs(&map, "font_size"),
        default_storage: gs(&map, "default_storage"),
        temp_dir: gs(&map, "temp_dir"),
        log_dir: gs(&map, "log_dir"),
        backup_dir: gs(&map, "backup_dir"),
        default_sort_by: gs(&map, "default_sort_by"),
        default_view_mode: gs(&map, "default_view_mode"),
        page_size: gi(&map, "page_size"),
        ffmpeg_path: gs(&map, "ffmpeg_path"),
        ffprobe_path: gs(&map, "ffprobe_path"),
        scan_concurrency: clamp(gi(&map, "scan_concurrency"), 1, cpu_threads()),
        encode_concurrency: clamp(gi(&map, "encode_concurrency"), 1, 5),
        auto_start: gb(&map, "auto_start"),
        notify_on_complete: gb(&map, "notify_on_complete"),
        auto_scan: gb(&map, "auto_scan"),
        scan_interval: gi(&map, "scan_interval"),
        log_level: gs(&map, "log_level"),
        max_log_days: gi(&map, "max_log_days"),
        backup_interval_days: gi(&map, "backup_interval_days"),
        enable_telemetry: gb(&map, "enable_telemetry"),
        cover_quality: gi(&map, "cover_quality"),
        cover_concurrency: gi(&map, "cover_concurrency"),
        browser_path: gs(&map, "browser_path"),
    })
}

pub fn save_settings(conn: &Connection, settings: &AppSettings) -> AppResult<()> {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let max_days = settings.max_log_days.to_string();
    let backup_days = settings.backup_interval_days.to_string();
    let page = settings.page_size.to_string();
    let scan_conc = settings.scan_concurrency.to_string();
    let encode_conc = settings.encode_concurrency.to_string();
    let scan_int = settings.scan_interval.to_string();
    let cover_quality = settings.cover_quality.to_string();
    let cover_conc = settings.cover_concurrency.to_string();

    let pairs: Vec<(&str, &str)> = vec![
        ("theme", &settings.theme), ("language", &settings.language),
        ("font_size", &settings.font_size), ("default_storage", &settings.default_storage),
        ("temp_dir", &settings.temp_dir), ("log_dir", &settings.log_dir),
        ("backup_dir", &settings.backup_dir),
        ("default_sort_by", &settings.default_sort_by),
        ("default_view_mode", &settings.default_view_mode),
        ("page_size", &page),
        ("ffmpeg_path", &settings.ffmpeg_path), ("ffprobe_path", &settings.ffprobe_path),
        ("scan_concurrency", &scan_conc), ("encode_concurrency", &encode_conc),
        ("auto_start", if settings.auto_start { "true" } else { "false" }),
        ("notify_on_complete", if settings.notify_on_complete { "true" } else { "false" }),
        ("auto_scan", if settings.auto_scan { "true" } else { "false" }),
        ("scan_interval", &scan_int),
        ("log_level", &settings.log_level),
        ("max_log_days", &max_days),
        ("backup_interval_days", &backup_days),
        ("enable_telemetry", if settings.enable_telemetry { "true" } else { "false" }),
        ("cover_quality", &cover_quality),
        ("cover_concurrency", &cover_conc),
        ("browser_path", &settings.browser_path),
    ];
    for (k, v) in pairs {
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key,value,value_type,description,category,created_at,updated_at) VALUES (?1,?2,COALESCE((SELECT value_type FROM app_settings WHERE key=?1),'string'),COALESCE((SELECT description FROM app_settings WHERE key=?1),''),COALESCE((SELECT category FROM app_settings WHERE key=?1),'general'),COALESCE((SELECT created_at FROM app_settings WHERE key=?1),?3),?3)",
            params![k, v, now],
        ).map_err(AppError::Db)?;
    }
    Ok(())
}

pub fn update_single(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let val = match key {
        "scan_concurrency" => value.parse::<i32>().map(|v| clamp(v, 1, cpu_threads()).to_string()).unwrap_or(value.to_string()),
        "encode_concurrency" => value.parse::<i32>().map(|v| clamp(v, 1, 5).to_string()).unwrap_or(value.to_string()),
        _ => value.to_string(),
    };
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key,value,value_type,description,category,created_at,updated_at) VALUES (?1,?2,COALESCE((SELECT value_type FROM app_settings WHERE key=?1),'string'),COALESCE((SELECT description FROM app_settings WHERE key=?1),''),COALESCE((SELECT category FROM app_settings WHERE key=?1),'general'),COALESCE((SELECT created_at FROM app_settings WHERE key=?1),?3),?3)",
        params![key, val, now],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn load_settings_into_mutex(conn: &Connection, cache: &Mutex<HashMap<String, String>>) {
    if let Ok(map) = load_settings_map(conn) {
        if let Ok(mut c) = cache.lock() {
            *c = map;
        }
    }
}

fn cpu_threads() -> i32 { std::thread::available_parallelism().map(|n| n.get() as i32).unwrap_or(4) }
fn clamp(v: i32, min: i32, max: i32) -> i32 { v.max(min).min(max) }
fn gs(map: &HashMap<String, String>, key: &str) -> String { map.get(key).cloned().unwrap_or_default() }
fn gi(map: &HashMap<String, String>, key: &str) -> i32 { map.get(key).and_then(|v| v.parse().ok()).unwrap_or(0) }
fn gb(map: &HashMap<String, String>, key: &str) -> bool { map.get(key).map(|v| v == "true").unwrap_or(false) }
