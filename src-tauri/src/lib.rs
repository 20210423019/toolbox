use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;
use tauri::Manager;

pub mod config;
pub mod domain;
pub mod error;
pub mod infra;
pub mod repository;
pub mod service;
pub mod command;

use infra::db::DbPool;
use infra::resource::AppResourceManager;
use service::scanner::ScanState;
use service::thumbnail::ThumbnailEngine;
use command::encoder::FFmpegState;

pub struct SettingsCache {
    pub map: Mutex<std::collections::HashMap<String, String>>,
}



pub struct CoverCache {
    map: Mutex<std::collections::HashMap<String, (String, Instant)>>,
    max_entries: usize,
}

impl CoverCache {
    pub fn new(max: usize) -> Self {
        CoverCache { map: Mutex::new(std::collections::HashMap::new()), max_entries: max }
    }
    pub fn get(&self, key: &str) -> Option<String> {
        let map = self.map.lock().ok()?;
        map.get(key).map(|(v, _)| v.clone())
    }
    pub fn set(&self, key: String, val: String) {
        if let Ok(mut map) = self.map.lock() {
            if map.len() >= self.max_entries {

                if let Some(oldest_key) = map.iter().min_by_key(|(_, (_, t))| *t).map(|(k, _)| k.clone()) {
                    map.remove(&oldest_key);
                }
            }
            map.insert(key, (val, Instant::now()));
        }
    }
    pub fn invalidate_file(&self, filepath: &str) {
        if let Ok(mut map) = self.map.lock() {
            map.retain(|k, _| !k.starts_with(filepath));
        }
    }
}


pub struct CatalogCache {
    pub categories: Mutex<Option<(String, Instant)>>,
    pub libraries: RwLock<std::collections::HashMap<String, (String, Instant)>>,
}

impl Default for CatalogCache {
    fn default() -> Self {
        Self::new()
    }
}

impl CatalogCache {
    pub fn new() -> Self {
        CatalogCache {
            categories: Mutex::new(None),
            libraries: RwLock::new(std::collections::HashMap::new()),
        }
    }

    pub fn get_categories(&self) -> Option<String> {
        let guard = self.categories.lock().ok()?;
        guard.as_ref().and_then(|(data, time)| {
            if time.elapsed() < std::time::Duration::from_secs(5) {
                Some(data.clone())
            } else {
                None
            }
        })
    }

    pub fn set_categories(&self, data: String) {
        if let Ok(mut guard) = self.categories.lock() {
            *guard = Some((data, Instant::now()));
        }
    }

    pub fn get_libraries(&self, category_id: &str) -> Option<String> {
        let guard = self.libraries.read().ok()?;
        guard.get(category_id).and_then(|(data, time)| {
            if time.elapsed() < std::time::Duration::from_secs(5) {
                Some(data.clone())
            } else {
                None
            }
        })
    }

    pub fn set_libraries(&self, category_id: String, data: String) {
        if let Ok(mut guard) = self.libraries.write() {
            guard.insert(category_id, (data, Instant::now()));
        }
    }

    pub fn invalidate_categories(&self) {
        if let Ok(mut guard) = self.categories.lock() {
            *guard = None;
        }
        if let Ok(mut guard) = self.libraries.write() {
            guard.clear();
        }
    }

    pub fn invalidate_libraries(&self, category_id: Option<&str>) {
        if let Ok(mut guard) = self.libraries.write() {
            if let Some(cid) = category_id {
                guard.remove(cid);
            } else {
                guard.clear();
            }
        }
    }
}

fn resolve_project_root() -> std::path::PathBuf {
    config::resolve_project_root()
}

pub fn run() {
    let _ = tauri::Builder::default()
        .setup(|app| {
            let data_dir = resolve_project_root().join("data");
            let data_str = data_dir.to_string_lossy().to_string();
            crate::infra::logger::init(&data_str);
            tracing::info!(target: "app", "ToolBox v2 启动");
            tracing::info!(target: "app", "数据目录: {}", data_str);

            let pool = DbPool::new(&data_dir)
                .map_err(|e| {
                    tracing::error!(target: "app", "数据库初始化失败: {}", e);
                    Box::new(std::io::Error::other(e.to_string()))
                })?;

            let sc = Arc::new(SettingsCache { map: Mutex::new(std::collections::HashMap::new()) });
            if let Ok(conn) = pool.app.lock() {
                crate::repository::settings::load_settings_into_mutex(&conn, &sc.map);
            }
            let cache = Arc::new(CatalogCache::new());
            let cover_cache = Arc::new(CoverCache::new(500));
            let thumb_engine = Arc::new(ThumbnailEngine::new(&data_dir));

            let cpu_count = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4) as u32;
            let (s, e) = (cpu_count.min(12), (cpu_count / 2).max(1).min(6));
            tracing::info!(target: "app", "自动并发: scan={}, encode={} (CPU={})", s, e, cpu_count);

            app.manage(pool);
            app.manage(sc);
            app.manage(cache);
            app.manage(cover_cache);
            app.manage(thumb_engine);
            app.manage(Arc::new(AppResourceManager::new(s, e)));
            app.manage(Arc::new(ScanState::new()));
            app.manage(Arc::new(FFmpegState::new()));

            tracing::info!(target: "app", "ToolBox v2 启动完成");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            command::categories::get_categories,
            command::categories::create_category,
            command::categories::delete_category,
            command::categories::update_category_status,
            command::categories::update_category_sort,
            command::categories::update_category,
            command::libraries::get_libraries,
            command::libraries::create_library,
            command::libraries::update_library,
            command::libraries::delete_library,
            command::libraries::update_library_sort,
            command::libraries::set_primary_cover,
            command::libraries::reorder_covers,
            command::libraries::read_file_as_data_url,
            command::libraries::read_cover_base64,
            command::videos::get_videos,
            command::videos::get_video_count,
            command::videos::get_all_videos_count,
            command::videos::get_total_storage,
            command::videos::get_video_detail,
            command::videos::update_video,
            command::videos::batch_update_videos,
            command::videos::delete_video,
            command::videos::batch_rename,
            command::videos::save_novel_links,
            command::videos::bind_novel,
            command::videos::get_video_novels,
            command::videos::delete_novel,
            command::videos::reorder_novels,
            command::videos::get_novel_status_batch,
            command::videos::scan_novel_metadata,
            command::videos::read_novel_preview,
            command::videos::scan_video_intro,
            command::videos::scan_video_text_files,
            command::videos::batch_scan_text_status,
            command::videos::organize_text_files,
            command::videos::batch_delete_videos,
            command::videos::batch_export_videos,
            command::tags::get_tag_classes_by_library,
            command::tags::create_tag_class,
            command::tags::update_tag_class,
            command::tags::delete_tag_class,
            command::tags::move_tag_class,
            command::tags::copy_tag_class,
            command::tags::get_class_tags,
            command::tags::create_class_tag,
            command::tags::update_class_tag,
            command::tags::delete_class_tag,
            command::tags::get_all_class_tags,
            command::tags::search_class_tags,
            command::tags::batch_tag_videos,
            command::tags::batch_remove_tags,
            command::tags::get_tag_class_tree,
            command::tags::save_tag_template,
            command::tags::load_tag_template,
            command::tags::get_video_taggings_batch,
            command::tags::cleanup_unused_tags,
            command::tags::batch_create_and_tag_videos,
            command::tags::batch_set_tag_values,
            command::tags::get_tag_distinct_values,
            command::presets::get_presets,
            command::presets::create_preset,
            command::presets::update_preset,
            command::presets::delete_preset,
            command::presets::set_default_preset,

            command::scanner::start_scan,
            command::scanner::get_scan_progress,
            command::scanner::get_scan_history,
            command::scanner::cancel_scan,
            command::encoder::execute_encode_task,
            command::encoder::execute_batch_encode_task,
            command::encoder::encode_video,

            command::settings::get_settings,
            command::settings::update_settings,
            command::settings::update_setting,
            command::settings::reset_settings,
            command::duplicate::find_duplicates,
            command::duplicate::get_duplicate_groups,
            command::duplicate::resolve_duplicate,
            command::data_io::export_library,
            command::data_io::import_library,
            command::data_io::backup_data,
            command::data_io::restore_data,
            command::data_io::export_data_zip,
            command::data_io::import_data_zip,
            command::data_io::select_export_path,
            command::data_io::select_import_path,
            command::data_io::write_text_file,

            command::system::get_system_metrics,
            command::window::minimize_window,
            command::window::maximize_window,
            command::window::is_maximized,
            command::window::close_window,
            command::window::toggle_fullscreen,

            command::window::start_dragging,
            command::window::toggle_always_on_top,
            command::open_file::open_file,
            command::open_file::show_in_folder,
            command::open_url::open_url,
            command::open_url::detect_browsers,
            command::card_display::get_card_display_config,
            command::card_display::set_card_display_config,
            command::thumbnail::get_thumbnail,
            command::thumbnail::get_thumbnails_batch,

            command::logs::forward_frontend_logs,

            command::cleanup::check_and_cleanup,
            command::cleanup::get_cleanup_logs,
            command::cleanup::recover_cleanup_entry,
            command::cleanup::purge_cleanup_entry,





        ])
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                if let Some(pool) = event.window().try_state::<DbPool>() {
                    pool.checkpoint();
                }
            }
        })
        .run(tauri::generate_context!());
}
