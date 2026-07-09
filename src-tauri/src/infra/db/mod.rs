use std::path::Path;
use std::sync::Mutex;
use rusqlite::{Connection, params};

pub struct DbPool {
    pub app: Mutex<Connection>,
    pub data_dir: String,
}

impl DbPool {
    pub fn new(data_dir: &Path) -> Result<Self, rusqlite::Error> {
        std::fs::create_dir_all(data_dir).ok();
        let app_path = data_dir.join("app.db");
        let app = Connection::open(&app_path)?;
        app.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-64000; PRAGMA mmap_size=268435456;")?;
        let pool = DbPool {
            app: Mutex::new(app),
            data_dir: data_dir.to_string_lossy().to_string(),
        };
        pool.init_schema()?;
        Ok(pool)
    }

    pub fn new_worker(data_dir: &Path) -> Result<Self, rusqlite::Error> {
        std::fs::create_dir_all(data_dir).ok();
        let app_path = data_dir.join("app.db");
        let app = Connection::open(&app_path)?;
        app.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-64000; PRAGMA mmap_size=268435456;")?;
        Ok(DbPool {
            app: Mutex::new(app),
            data_dir: data_dir.to_string_lossy().to_string(),
        })
    }

    pub fn checkpoint(&self) {
        if let Ok(conn) = self.app.lock() {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=WAL;");
        }
    }

    fn init_schema(&self) -> Result<(), rusqlite::Error> {
        let conn = self.app.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT '', note TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0, is_default INTEGER DEFAULT 0, is_deletable INTEGER DEFAULT 1,
                status TEXT DEFAULT 'normal', storage_path TEXT DEFAULT '',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS libraries (
                id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                name TEXT NOT NULL, icon TEXT DEFAULT '📁', description TEXT DEFAULT '',
                status TEXT DEFAULT 'normal', sort_order INTEGER DEFAULT 0,
                filter_formats TEXT DEFAULT '.mp4,.mov,.avi,.mkv,.webm,.flv',
                filter_mode TEXT DEFAULT 'whitelist',
                scan_interval INTEGER DEFAULT 0, last_scan_at TEXT DEFAULT '', auto_scan INTEGER DEFAULT 0,
                card_info_fields TEXT DEFAULT '[\"size\",\"date\",\"resolution\"]',
                card_tag_ids TEXT DEFAULT '[]',
                exclude_paths TEXT DEFAULT '',
                auto_clean_days INTEGER DEFAULT 0,
                default_view TEXT DEFAULT 'card',
                default_sort TEXT DEFAULT 'filename',
                sort_dir TEXT DEFAULT 'asc',
                layout_density TEXT DEFAULT 'normal',
                classify_rules TEXT DEFAULT '[]',
                confidence_thresholds TEXT DEFAULT '{}',
                scan_params TEXT DEFAULT '{}',
                audio_pair_rules TEXT DEFAULT '[]',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS library_scan_paths (
                id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
                path TEXT NOT NULL, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS library_cover_rules (
                id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
                rule TEXT NOT NULL, priority INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
                filename TEXT NOT NULL, filepath TEXT NOT NULL,
                size INTEGER DEFAULT 0, duration REAL DEFAULT 0.0, width INTEGER DEFAULT 0, height INTEGER DEFAULT 0,
                fps REAL DEFAULT 0.0, bitrate INTEGER DEFAULT 0,
                video_codec TEXT DEFAULT '', video_codec_profile TEXT DEFAULT '',
                audio_codec TEXT DEFAULT '', audio_sample_rate INTEGER DEFAULT 0, audio_channels INTEGER DEFAULT 0,
                format TEXT DEFAULT '',
                thumbnail_path TEXT DEFAULT '',
                pix_fmt TEXT DEFAULT '', time_base TEXT DEFAULT '', codec_level TEXT DEFAULT '',
                encoder TEXT DEFAULT '', audio_profile TEXT DEFAULT '',
                file_created_at TEXT DEFAULT '', file_modified_at TEXT DEFAULT '',
                added_at TEXT NOT NULL, note TEXT DEFAULT '', favorite INTEGER DEFAULT 0,
                status TEXT DEFAULT 'normal', series TEXT DEFAULT '', category TEXT DEFAULT '',
                deleted INTEGER DEFAULT 0, novel_order TEXT DEFAULT '', intro_content TEXT DEFAULT '',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scan_history (
                id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
                scan_type TEXT DEFAULT 'full', status TEXT DEFAULT 'running',
                total_files_found INTEGER DEFAULT 0, new_files_added INTEGER DEFAULT 0,
                files_updated INTEGER DEFAULT 0, files_removed INTEGER DEFAULT 0,
                failed_files INTEGER DEFAULT 0, errors TEXT DEFAULT '[]',
                duration_ms INTEGER DEFAULT 0, started_at TEXT NOT NULL, completed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS encoding_presets (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
                encoder_type TEXT DEFAULT 'H.264', encoder_brand TEXT DEFAULT 'NVIDIA',
                profile TEXT DEFAULT 'main', encoder_level TEXT DEFAULT '',
                width INTEGER DEFAULT 1920, height INTEGER DEFAULT 1080,
                pix_fmt TEXT DEFAULT 'yuv420p',
                video_bitrate TEXT DEFAULT '', max_bitrate TEXT DEFAULT '',
                fps TEXT DEFAULT '30', time_base TEXT DEFAULT '', encoder_tag TEXT DEFAULT '',
                bitrate_mode TEXT DEFAULT 'CRF', crf_value TEXT DEFAULT '23',
                min_crf TEXT DEFAULT '', max_crf TEXT DEFAULT '',
                resolution_mode TEXT DEFAULT '', fps_mode TEXT DEFAULT '',
                preset TEXT DEFAULT 'medium', tune TEXT DEFAULT '',
                audio_codec TEXT DEFAULT 'AAC', audio_sample_rate TEXT DEFAULT '44100',
                audio_channels TEXT DEFAULT '2', channel_layout TEXT DEFAULT 'stereo',
                audio_profile TEXT DEFAULT 'aac_low', audio_bitrate TEXT DEFAULT '192k',
                audio_volume TEXT DEFAULT '100',
                output_format TEXT DEFAULT 'mp4', output_suffix TEXT DEFAULT '_encoded',
                is_default INTEGER DEFAULT 0, is_builtin INTEGER DEFAULT 0,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS processing_tasks (
                id TEXT PRIMARY KEY, name TEXT NOT NULL,
                video_id TEXT DEFAULT '', library_id TEXT DEFAULT '',
                preset_id TEXT DEFAULT '', source_path TEXT DEFAULT '', output_path TEXT DEFAULT '',
                output_filename_template TEXT DEFAULT '{name}_encoded{ext}',
                status TEXT DEFAULT 'pending', priority INTEGER DEFAULT 0, progress REAL DEFAULT 0.0,
                total_files INTEGER DEFAULT 0, completed_files INTEGER DEFAULT 0,
                failed_files INTEGER DEFAULT 0, skipped_files INTEGER DEFAULT 0,
                current_file TEXT DEFAULT '', current_progress REAL DEFAULT 0.0,
                encode_speed REAL DEFAULT 0.0, estimated_remaining TEXT DEFAULT '',
                total_input_size INTEGER DEFAULT 0, total_output_size INTEGER DEFAULT 0,
                started_at TEXT, completed_at TEXT,
                error_message TEXT DEFAULT '', retry_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS task_logs (
                id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES processing_tasks(id) ON DELETE CASCADE,
                level TEXT DEFAULT 'info', source TEXT DEFAULT '', code TEXT DEFAULT '',
                message TEXT NOT NULL, file_name TEXT DEFAULT '', progress REAL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS task_schedules (
                task_id TEXT PRIMARY KEY REFERENCES processing_tasks(id) ON DELETE CASCADE,
                enabled INTEGER DEFAULT 0, schedule_type TEXT DEFAULT '',
                schedule_value TEXT DEFAULT '', auto_start INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS task_monitors (
                task_id TEXT PRIMARY KEY REFERENCES processing_tasks(id) ON DELETE CASCADE,
                enabled INTEGER DEFAULT 0, interval_minutes INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY, value TEXT NOT NULL,
                value_type TEXT DEFAULT 'string', description TEXT DEFAULT '',
                category TEXT DEFAULT 'general',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_videos_library ON videos(library_id);
            CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
            CREATE INDEX IF NOT EXISTS idx_videos_added ON videos(added_at);
            CREATE INDEX IF NOT EXISTS idx_libraries_category ON libraries(category_id);
            CREATE INDEX IF NOT EXISTS idx_scan_history_library ON scan_history(library_id);
            CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id);
            CREATE INDEX IF NOT EXISTS idx_task_logs_created ON task_logs(created_at);
            -- 标签系统
            CREATE TABLE IF NOT EXISTS tag_classes (
                id TEXT PRIMARY KEY,
                library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
                parent_id TEXT REFERENCES tag_classes(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                color TEXT DEFAULT '#059669',
                icon TEXT DEFAULT '',
                description TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS class_tags (
                id TEXT PRIMARY KEY,
                class_id TEXT NOT NULL REFERENCES tag_classes(id) ON DELETE CASCADE,
                library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                color TEXT DEFAULT '#059669',
                sort_order INTEGER DEFAULT 0,
                tag_type TEXT DEFAULT 'text',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS video_class_tags (
                video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES class_tags(id) ON DELETE CASCADE,
                value TEXT DEFAULT '',
                assigned_at TEXT NOT NULL,
                PRIMARY KEY (video_id, tag_id)
            );
            -- 小说链接（从文件迁移到数据库）
            CREATE TABLE IF NOT EXISTS video_novel_links (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                file_name TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL,
                note TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_novel_links_video ON video_novel_links(video_id);
            CREATE INDEX IF NOT EXISTS idx_tag_classes_library ON tag_classes(library_id);
            CREATE INDEX IF NOT EXISTS idx_tag_classes_parent ON tag_classes(parent_id);
            CREATE INDEX IF NOT EXISTS idx_class_tags_class ON class_tags(class_id);
            CREATE INDEX IF NOT EXISTS idx_class_tags_library ON class_tags(library_id);
            CREATE INDEX IF NOT EXISTS idx_video_class_tags_video ON video_class_tags(video_id);
            CREATE INDEX IF NOT EXISTS idx_video_class_tags_tag ON video_class_tags(tag_id);
            -- 复合索引
            CREATE INDEX IF NOT EXISTS idx_videos_library_status_added ON videos(library_id, status, added_at, filename);
            CREATE INDEX IF NOT EXISTS idx_videos_library_filename ON videos(library_id, filename);
            CREATE INDEX IF NOT EXISTS idx_videos_library_size ON videos(library_id, size);
            CREATE INDEX IF NOT EXISTS idx_videos_library_duration ON videos(library_id, duration);
            CREATE INDEX IF NOT EXISTS idx_videos_filepath ON videos(filepath);
            CREATE INDEX IF NOT EXISTS idx_videos_filename ON videos(filename);
            CREATE INDEX IF NOT EXISTS idx_libraries_category_sort ON libraries(category_id, sort_order, name);
            CREATE INDEX IF NOT EXISTS idx_videos_library_favorite ON videos(library_id, favorite);
            -- 清理日志
            CREATE TABLE IF NOT EXISTS cleanup_log (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                library_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL,
                size INTEGER DEFAULT 0,
                duration REAL DEFAULT 0.0,
                format TEXT DEFAULT '',
                resolution TEXT DEFAULT '',
                video_codec TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'cleaned',
                reason TEXT DEFAULT '',
                detected_at TEXT NOT NULL,
                cleaned_at TEXT,
                recovered_at TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_cleanup_log_library ON cleanup_log(library_id);
            CREATE INDEX IF NOT EXISTS idx_cleanup_log_status ON cleanup_log(status);
            CREATE INDEX IF NOT EXISTS idx_cleanup_log_detected ON cleanup_log(detected_at);
            "
        )?;

        // 数据库迁移：为 libraries 表添加扫描规则配置列（幂等处理，新库已在 CREATE TABLE 中包含）
        let migration_cols = [
            ("classify_rules", "TEXT DEFAULT '[]'"),
            ("confidence_thresholds", "TEXT DEFAULT '{}'"),
            ("scan_params", "TEXT DEFAULT '{}'"),
            ("audio_pair_rules", "TEXT DEFAULT '[]'"),
        ];
        for (col_name, col_def) in &migration_cols {
            let sql = format!("ALTER TABLE libraries ADD COLUMN {} {}", col_name, col_def);
            let _ = conn.execute_batch(&sql);
        }

        // 数据库迁移：为 videos 表添加简介内容列（幂等处理，新库已在 CREATE TABLE 中包含）
        let _ = conn.execute_batch("ALTER TABLE videos ADD COLUMN intro_content TEXT DEFAULT ''");

        // 数据库迁移：为 videos 表添加侧车 UUID 和内容哈希列（幂等处理）
        for (col, def) in &[("uuid", "TEXT DEFAULT ''"), ("content_hash", "TEXT DEFAULT ''")] {
            let _ = conn.execute_batch(&format!("ALTER TABLE videos ADD COLUMN {} {}", col, def));
        }

        // 数据库迁移：升级封面质量默认值 320 → 640 → 1920
        let _ = conn.execute_batch("UPDATE app_settings SET value='1920', updated_at=datetime('now','localtime') WHERE key='cover_quality' AND (value='320' OR value='640')");

        // 数据库优化：删除冗余单列索引（已由复合索引覆盖）
        let _ = conn.execute_batch("DROP INDEX IF EXISTS idx_videos_library");
        // idx_videos_library(library_id) 被 idx_videos_library_status_added(library_id,status,added_at,filename) 覆盖

        let _ = conn.execute_batch("DROP INDEX IF EXISTS idx_videos_status");
        // idx_videos_status(status) 选择性过低，单列索引收益极低

        // 数据库迁移：为标签表添加 category_id 列（跨库标签共享），幂等处理
        for (tbl, join_sql) in &[
            ("tag_classes", "SELECT category_id FROM libraries WHERE id = tag_classes.library_id"),
            ("class_tags", "SELECT l.category_id FROM libraries l INNER JOIN tag_classes tc ON tc.id = class_tags.class_id WHERE tc.library_id = l.id"),
        ] {
            let _ = conn.execute_batch(&format!("ALTER TABLE {} ADD COLUMN category_id TEXT DEFAULT ''", tbl));
            let _ = conn.execute_batch(&format!("UPDATE {} SET category_id = ({}) WHERE category_id IS NULL OR category_id = ''", tbl, join_sql));
        }
        // 为 category_id 建索引（幂等）
        for idx in &[
            "CREATE INDEX IF NOT EXISTS idx_tag_classes_category ON tag_classes(category_id)",
            "CREATE INDEX IF NOT EXISTS idx_class_tags_category ON class_tags(category_id)",
        ] {
            let _ = conn.execute_batch(idx);
        }

        // 初始默认设置（仅在空表时填充）
        if conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM app_settings", [], |r| r.get(0)).unwrap_or(0) == 0 {
            let t = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let defaults: Vec<(&str, &str, &str, &str)> = vec![
                ("theme","dark","string","general"),
                ("language","zh-CN","string","general"),
                ("font_size","standard","string","general"),
                ("default_storage","","string","storage"),
                ("temp_dir","","string","system"),
                ("log_dir","","string","system"),
                ("backup_dir","backups","string","system"),
                ("default_sort_by","added_at","string","video"),
                ("default_view_mode","card","string","video"),
                ("page_size","100","number","video"),
                ("ffmpeg_path","","string","processing"),
                ("ffprobe_path","","string","processing"),
                ("scan_concurrency","2","number","processing"),
                ("encode_concurrency","1","number","processing"),
                ("auto_start","false","boolean","processing"),
                ("notify_on_complete","true","boolean","processing"),
                ("auto_scan","false","boolean","scan"),
                ("scan_interval","30","number","scan"),
                ("log_level","info","string","advanced"),
                ("max_log_days","30","number","advanced"),
                ("backup_interval_days","7","number","advanced"),
                ("enable_telemetry","false","boolean","advanced"),
                ("cover_quality","1920","number","video"),
                ("cover_concurrency","2","number","processing"),
                ("browser_path","","string","browser"),
            ];
            for (k,v,vt,cat) in defaults {
                conn.execute("INSERT INTO app_settings (key,value,value_type,description,category,created_at,updated_at) VALUES (?1,?2,?3,'',?4,?5,?5)",
                    params![k, v, vt, cat, t])?;
            }
        }
        Ok(())
    }
}
