use tauri::State;
use crate::domain::settings::AppSettings;
use crate::infra::db::DbPool;
use crate::repository::settings as settings_repo;

#[tauri::command]
pub fn get_settings(db: State<DbPool>) -> Result<AppSettings, String> {
    tracing::info!(target: "settings", "获取设置");
    let conn = db.app.lock().map_err(|e| { 
        tracing::error!(target: "settings", "获取数据库连接失败: {}", e); 
        e.to_string() 
    })?;
    
    match settings_repo::get_settings(&conn) {
        Ok(settings) => {
            tracing::info!(target: "settings", "✅ 获取设置成功: theme={}, language={}", settings.theme, settings.language);
            Ok(settings)
        },
        Err(e) => {
            tracing::error!(target: "settings", "❌ 获取设置失败: {:?}", e);
            Err(format!("{:?}", e))
        }
    }
}

#[tauri::command]
pub fn update_settings(db: State<DbPool>, settings: AppSettings) -> Result<(), String> {
    tracing::info!(target: "settings", "更新全部设置: theme={}, language={}", settings.theme, settings.language);
    let conn = db.app.lock().map_err(|e| { 
        tracing::error!(target: "settings", "获取数据库连接失败: {}", e); 
        e.to_string() 
    })?;
    
    match settings_repo::save_settings(&conn, &settings) {
        Ok(_) => {
            tracing::info!(target: "settings", "✅ 设置更新成功");
            Ok(())
        },
        Err(e) => {
            tracing::error!(target: "settings", "❌ 设置更新失败: {:?}", e);
            Err(format!("{:?}", e))
        }
    }
}

#[tauri::command]
pub fn update_setting(db: State<DbPool>, key: String, value: String) -> Result<(), String> {
    tracing::info!(target: "settings", "更新单项设置: {}={}", key, value);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "settings", "更新设置失败: {}", e); e.to_string() })?;
    settings_repo::update_single(&conn, &key, &value).map_err(|e| { tracing::error!(target: "settings", "更新设置失败: {:?}", e); format!("{:?}", e) })
}

#[tauri::command]
pub fn reset_settings(db: State<DbPool>) -> Result<(), String> {
    tracing::info!(target: "settings", "重置全部设置为默认值");
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "settings", "重置设置失败: {}", e); e.to_string() })?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute("DELETE FROM app_settings", []).map_err(|e| e.to_string())?;
    let defaults: Vec<(&str, &str, &str, &str)> = vec![
        ("theme","dark","string","general"),("language","zh-CN","string","general"),("font_size","standard","string","general"),
        ("default_storage","","string","storage"),("temp_dir","","string","system"),("log_dir","","string","system"),("backup_dir","backups","string","system"),
        ("default_sort_by","added_at","string","video"),("default_view_mode","card","string","video"),("page_size","100","number","video"),
        ("ffmpeg_path","","string","processing"),("ffprobe_path","","string","processing"),
        ("scan_concurrency","2","number","processing"),("encode_concurrency","1","number","processing"),
        ("auto_start","false","boolean","processing"),("notify_on_complete","true","boolean","processing"),
        ("auto_scan","false","boolean","scan"),("scan_interval","30","number","scan"),
        ("log_level","info","string","advanced"),("max_log_days","30","number","advanced"),("backup_interval_days","7","number","advanced"),
        ("enable_telemetry","false","boolean","advanced"),
        ("cover_quality","1920","number","video"),("cover_concurrency","2","number","processing"),
        ("browser_path","","string","browser"),
    ];
    for (k,v,vt,cat) in defaults {
        conn.execute("INSERT INTO app_settings (key,value,value_type,description,category,created_at,updated_at) VALUES (?1,?2,?3,'',?4,?5,?5)",
            rusqlite::params![k, v, vt, cat, now]).map_err(|e| e.to_string())?;
    }
    Ok(())
}
