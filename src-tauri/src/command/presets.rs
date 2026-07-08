use tauri::State;
use crate::domain::preset::EncodingPreset;
use crate::infra::db::DbPool;
use crate::repository::presets as repo;

#[tauri::command]
pub fn get_presets(db: State<DbPool>) -> Result<Vec<EncodingPreset>, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    repo::get_all(&conn).map_err(|e| format!("{:?}", e))
}

#[tauri::command]
pub fn create_preset(db: State<DbPool>, name: String, encoder_type: String, width: i32, height: i32, fps: String) -> Result<EncodingPreset, String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let p = EncodingPreset::new(name, encoder_type, width, height, fps);
    repo::insert(&conn, &p).map_err(|e| format!("{:?}", e))?;
    Ok(p)
}

#[tauri::command]
pub fn update_preset(db: State<DbPool>, preset: EncodingPreset) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    repo::update(&conn, &preset).map_err(|e| format!("{:?}", e))
}

#[tauri::command]
pub fn delete_preset(db: State<DbPool>, id: String) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    repo::delete(&conn, &id).map_err(|e| format!("{:?}", e))
}

#[tauri::command]
pub fn set_default_preset(db: State<DbPool>, id: String) -> Result<(), String> {
    let conn = db.app.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute("UPDATE encoding_presets SET is_default=0", []).map_err(|e| e.to_string())?;
    conn.execute("UPDATE encoding_presets SET is_default=1, updated_at=?1 WHERE id=?2", rusqlite::params![now, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
