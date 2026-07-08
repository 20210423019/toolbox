use tauri::State;
use std::sync::Arc;
use crate::service::thumbnail::ThumbnailEngine;

#[tauri::command]
pub async fn get_thumbnail(path: String, max_width: Option<u32>, quality: Option<u8>, engine: State<'_, Arc<ThumbnailEngine>>) -> Result<String, String> {
    let engine = engine.inner().clone();
    tokio::task::spawn_blocking(move || {
        engine.get_thumbnail_sync(&path, max_width, quality)
    }).await.map_err(|e| format!("缩略图任务失败: {}", e))?
}

#[tauri::command]
pub async fn get_thumbnails_batch(paths: Vec<String>, max_width: Option<u32>, quality: Option<u8>, engine: State<'_, Arc<ThumbnailEngine>>) -> Result<Vec<(String, String)>, String> {
    let engine = engine.inner().clone();
    tokio::task::spawn_blocking(move || {
        let results = engine.get_thumbnails_batch_sync(&paths, max_width, quality);
        Ok(results.into_iter()
            .filter_map(|(orig, r)| r.ok().map(|b64| (orig, b64)))
            .collect::<Vec<_>>())
    }).await.map_err(|e| format!("批量缩略图失败: {}", e))?
}


