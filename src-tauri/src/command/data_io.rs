use tauri::State;
use crate::infra::db::DbPool;
use crate::domain::library::Library;
use crate::domain::video::{Video, VideoMetadata};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct LibraryExport {
    library: Library,
    videos: Vec<Video>,
}

#[derive(Serialize, Deserialize)]
struct FullExport {
    version: String,
    exported_at: String,
    settings: Vec<(String, String)>,
    libraries: Vec<LibraryExport>,
}

fn now() -> String { chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string() }

#[tauri::command]
pub fn export_library(db: State<DbPool>, libraryId: String, outputPath: Option<String>) -> Result<String, String> {
    tracing::info!(target: "data_io", "导出媒体库: libraryId={}", libraryId);
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "data_io", "导出媒体库失败: {}", e); e.to_string() })?;
    let lib = crate::repository::libraries::get_by_id(&conn, &libraryId).map_err(|e| { tracing::error!(target: "data_io", "导出媒体库失败: {:?}", e); format!("{:?}", e) })?;

    let mut stmt = conn.prepare("SELECT id,library_id,filename,filepath,size,duration,width,height,fps,bitrate,video_codec,video_codec_profile,audio_codec,audio_sample_rate,audio_channels,format,thumbnail_path,pix_fmt,time_base,codec_level,encoder,audio_profile,file_created_at,file_modified_at,added_at,note,favorite,status,series,category,deleted,novel_order,intro_content,created_at,updated_at FROM videos WHERE library_id=?1")
        .map_err(|e| e.to_string())?;
    let videos: Vec<Video> = stmt.query_map(rusqlite::params![libraryId], |row| {
        Ok(Video {
            id: row.get(0)?, library_id: row.get(1)?, filename: row.get(2)?, filepath: row.get(3)?,
            size: row.get(4)?, duration: row.get(5)?, width: row.get(6)?, height: row.get(7)?,
            fps: row.get(8)?, bitrate: row.get(9)?, video_codec: row.get(10)?,
            video_codec_profile: row.get(11)?, audio_codec: row.get(12)?,
            audio_sample_rate: row.get(13)?, audio_channels: row.get(14)?, format: row.get(15)?,
            thumbnail_path: row.get(16)?,
            metadata: VideoMetadata { pix_fmt: row.get(17)?, time_base: row.get(18)?, codec_level: row.get(19)?, encoder: row.get(20)?, audio_profile: row.get(21)? },
            file_created_at: row.get(22)?, file_modified_at: row.get(23)?,
            added_at: row.get(24)?, note: row.get(25)?,
            favorite: row.get::<_,i32>(26)? != 0, status: row.get(27)?,
            series: row.get(28)?, category: row.get(29)?,
            deleted: row.get::<_,i32>(30)? != 0,
            novel_order: row.get::<_, Option<String>>(31)?.unwrap_or_default(),
            intro_content: row.get::<_, Option<String>>(32)?.unwrap_or_default(),
            resolution: format!("{}x{}", row.get::<_, i32>(6)?, row.get::<_, i32>(7)?),
            uuid: String::new(),
            content_hash: String::new(),
            created_at: row.get(33)?, updated_at: row.get(34)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let export = LibraryExport { library: lib, videos };
    let json = serde_json::to_string_pretty(&export).map_err(|e| e.to_string())?;
    if let Some(path) = outputPath { std::fs::write(&path, &json).map_err(|e| e.to_string())?; }
    tracing::info!(target: "data_io", "导出媒体库完成: libraryId={}", libraryId);
    Ok(json)
}

#[tauri::command]
pub fn import_library(db: State<DbPool>, categoryId: Option<String>, jsonData: Option<String>, filePath: Option<String>) -> Result<String, String> {
    tracing::info!(target: "data_io", "导入媒体库");
    let json = if let Some(ref d) = jsonData { d.clone() }
               else if let Some(ref p) = filePath { std::fs::read_to_string(p).map_err(|e| e.to_string())? }
               else { return Err("必须提供 jsonData 或 filePath".into()) };

    let export: LibraryExport = serde_json::from_str(&json).map_err(|e| { tracing::error!(target: "data_io", "导入媒体库解析失败: {}", e); e.to_string() })?;
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "data_io", "导入媒体库失败: {}", e); e.to_string() })?;
    let new_lib_id = uuid::Uuid::new_v4().to_string();
    let cat_id = categoryId.unwrap_or_else(|| export.library.category_id.clone());
    let n = now();

    conn.execute(
        "INSERT INTO libraries (id,category_id,name,icon,description,status,sort_order,filter_formats,filter_mode,scan_interval,last_scan_at,auto_scan,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        rusqlite::params![new_lib_id, cat_id, export.library.name, export.library.icon, export.library.description,
                export.library.status, export.library.sort_order,
                export.library.filter_formats.join(","), export.library.filter_mode.as_str(),
                export.library.scan_interval, "", false as i32, n, n],
    ).map_err(|e| { tracing::error!(target: "data_io", "导入媒体库失败: {}", e); e.to_string() })?;

    for v in &export.videos {
        let new_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO videos (id,library_id,filename,filepath,size,duration,width,height,fps,bitrate,video_codec,video_codec_profile,audio_codec,audio_sample_rate,audio_channels,format,thumbnail_path,pix_fmt,time_base,codec_level,encoder,audio_profile,file_created_at,file_modified_at,added_at,note,favorite,status,series,category,deleted,novel_order,intro_content,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,?35)",
            rusqlite::params![new_id, new_lib_id, v.filename, v.filepath, v.size, v.duration, v.width, v.height, v.fps, v.bitrate,
                    v.video_codec, v.video_codec_profile, v.audio_codec, v.audio_sample_rate, v.audio_channels, v.format,
                    v.thumbnail_path, v.metadata.pix_fmt, v.metadata.time_base, v.metadata.codec_level, v.metadata.encoder, v.metadata.audio_profile,
                    v.file_created_at, v.file_modified_at, v.added_at, v.note, v.favorite as i32, v.status, v.series, v.category,
                    v.deleted as i32, v.novel_order, v.intro_content, n, n],
        ).map_err(|e| { tracing::error!(target: "data_io", "导入视频失败: {}", e); e.to_string() })?;
    }
    tracing::info!(target: "data_io", "导入媒体库完成: newLibId={}, 视频数={}", new_lib_id, export.videos.len());
    Ok(new_lib_id)
}

#[tauri::command]
pub fn backup_data(db: State<DbPool>) -> Result<String, String> {
    tracing::info!(target: "data_io", "备份数据");
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "data_io", "备份数据失败: {}", e); e.to_string() })?;
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings").map_err(|e| e.to_string())?;
    let settings: Vec<(String, String)> = stmt.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,String>(1)?)))
        .map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut libs = Vec::new();
    let mut stmt = conn.prepare("SELECT id FROM libraries").map_err(|e| e.to_string())?;
    let lib_ids: Vec<String> = stmt.query_map([], |r| r.get::<_,String>(0))
        .map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    drop(stmt);

    for lid in &lib_ids {
        let lib = crate::repository::libraries::get_by_id(&conn, lid).map_err(|e| format!("{:?}", e))?;
        let mut stmt2 = conn.prepare("SELECT id,library_id,filename,filepath,size,duration,width,height,fps,bitrate,video_codec,video_codec_profile,audio_codec,audio_sample_rate,audio_channels,format,thumbnail_path,pix_fmt,time_base,codec_level,encoder,audio_profile,file_created_at,file_modified_at,added_at,note,favorite,status,series,category,deleted,novel_order,intro_content,created_at,updated_at FROM videos WHERE library_id=?1")
            .map_err(|e| e.to_string())?;
        let videos: Vec<Video> = stmt2.query_map(rusqlite::params![lid], |row| {
            Ok(Video {
                id: row.get(0)?, library_id: row.get(1)?, filename: row.get(2)?, filepath: row.get(3)?,
                size: row.get(4)?, duration: row.get(5)?, width: row.get(6)?, height: row.get(7)?,
                fps: row.get(8)?, bitrate: row.get(9)?, video_codec: row.get(10)?,
                video_codec_profile: row.get(11)?, audio_codec: row.get(12)?,
                audio_sample_rate: row.get(13)?, audio_channels: row.get(14)?, format: row.get(15)?,
                thumbnail_path: row.get(16)?,
                metadata: VideoMetadata { pix_fmt: row.get(17)?, time_base: row.get(18)?, codec_level: row.get(19)?, encoder: row.get(20)?, audio_profile: row.get(21)? },
                file_created_at: row.get(22)?, file_modified_at: row.get(23)?,
                added_at: row.get(24)?, note: row.get(25)?,
                favorite: row.get::<_,i32>(26)? != 0, status: row.get(27)?,
                series: row.get(28)?, category: row.get(29)?,
                deleted: row.get::<_,i32>(30)? != 0,
                novel_order: row.get::<_, Option<String>>(31)?.unwrap_or_default(),
                intro_content: row.get::<_, Option<String>>(32)?.unwrap_or_default(),
                resolution: format!("{}x{}", row.get::<_, i32>(6)?, row.get::<_, i32>(7)?),
                uuid: String::new(),
                content_hash: String::new(),
                created_at: row.get(33)?, updated_at: row.get(34)?,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
        libs.push(LibraryExport { library: lib, videos });
    }

    let export = FullExport { version: "2.0".into(), exported_at: now(), settings, libraries: libs };
    let json = serde_json::to_string_pretty(&export).map_err(|e| e.to_string())?;
    let backup_dir = std::path::Path::new(&db.data_dir).join("backups");
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let file = backup_dir.join(format!("backup_{}.json", chrono::Local::now().format("%Y%m%d_%H%M%S")));
    std::fs::write(&file, &json).map_err(|e| e.to_string())?;
    tracing::info!(target: "data_io", "备份完成: {}", file.to_string_lossy());
    Ok(file.to_string_lossy().to_string())
}

#[tauri::command]
pub fn restore_data(db: State<DbPool>, filePath: String) -> Result<(), String> {
    tracing::info!(target: "data_io", "恢复数据: {}", filePath);
    let json = std::fs::read_to_string(&filePath).map_err(|e| { tracing::error!(target: "data_io", "读取备份文件失败: {}", e); e.to_string() })?;
    let backup: FullExport = serde_json::from_str(&json).map_err(|e| { tracing::error!(target: "data_io", "解析备份文件失败: {}", e); e.to_string() })?;
    let conn = db.app.lock().map_err(|e| { tracing::error!(target: "data_io", "恢复数据失败: {}", e); e.to_string() })?;
    let n = now();

    for (k, v) in &backup.settings {
        let _ = conn.execute("INSERT OR REPLACE INTO app_settings (key,value,value_type,description,category,created_at,updated_at) VALUES (?1,?2,COALESCE((SELECT value_type FROM app_settings WHERE key=?1),'string'),COALESCE((SELECT description FROM app_settings WHERE key=?1),''),COALESCE((SELECT category FROM app_settings WHERE key=?1),'general'),?3,?3)", rusqlite::params![k, v, n]);
    }
    for lib_export in &backup.libraries {
        let new_lib_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO libraries (id,category_id,name,icon,description,status,sort_order,filter_formats,filter_mode,scan_interval,last_scan_at,auto_scan,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            rusqlite::params![new_lib_id, lib_export.library.category_id, lib_export.library.name, lib_export.library.icon,
                    lib_export.library.description, lib_export.library.status, lib_export.library.sort_order,
                    lib_export.library.filter_formats.join(","), lib_export.library.filter_mode.as_str(),
                    lib_export.library.scan_interval, "", false as i32, n, n],
        ).map_err(|e| { tracing::error!(target: "data_io", "恢复媒体库失败: {}", e); e.to_string() })?;
        for v in &lib_export.videos {
            let new_id = uuid::Uuid::new_v4().to_string();
            let _ = conn.execute(
                "INSERT INTO videos (id,library_id,filename,filepath,size,duration,width,height,fps,bitrate,video_codec,video_codec_profile,audio_codec,audio_sample_rate,audio_channels,format,thumbnail_path,pix_fmt,time_base,codec_level,encoder,audio_profile,file_created_at,file_modified_at,added_at,note,favorite,status,series,category,deleted,novel_order,intro_content,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,?35)",
                rusqlite::params![new_id, new_lib_id, v.filename, v.filepath, v.size, v.duration, v.width, v.height, v.fps, v.bitrate,
                    v.video_codec, v.video_codec_profile, v.audio_codec, v.audio_sample_rate, v.audio_channels, v.format,
                    v.thumbnail_path, v.metadata.pix_fmt, v.metadata.time_base, v.metadata.codec_level, v.metadata.encoder, v.metadata.audio_profile,
                    v.file_created_at, v.file_modified_at, v.added_at, v.note, v.favorite as i32, v.status, v.series, v.category,
                    v.deleted as i32, v.novel_order, v.intro_content, n, n]);
        }
    }
    tracing::info!(target: "data_io", "恢复数据完成");
    Ok(())
}

/// 导出整个 data 目录为 zip 文件（用于完整数据备份）
#[tauri::command]
pub fn export_data_zip(db: State<DbPool>, output_path: String) -> Result<String, String> {
    use std::io::Write;
    
    tracing::info!(target: "data_io", "导出数据目录为 zip: {}", output_path);
    
    let data_dir = std::path::Path::new(&db.data_dir);
    if !data_dir.exists() {
        return Err("数据目录不存在".into());
    }
    
    // 创建 zip 文件
    let file = std::fs::File::create(&output_path)
        .map_err(|e| format!("创建 zip 文件失败: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);
    
    // 递归添加文件到 zip
    fn add_dir_to_zip(
        zip: &mut zip::ZipWriter<std::fs::File>,
        options: zip::write::FileOptions,
        src_dir: &std::path::Path,
        zip_prefix: &str,
    ) -> Result<(), String> {
        for entry in std::fs::read_dir(src_dir)
            .map_err(|e| format!("读取目录失败: {}", e))? {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();
            let name = path.file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| format!("无效文件名: {}", path.display()))?;
            let zip_path = if zip_prefix.is_empty() {
                name.to_string()
            } else {
                format!("{}/{}", zip_prefix, name)
            };
            
            if path.is_dir() {
                zip.add_directory(&zip_path, options)
                    .map_err(|e| format!("添加目录到 zip 失败: {}", e))?;
                add_dir_to_zip(zip, options, &path, &zip_path)?;
            } else {
                let data = std::fs::read(&path)
                    .map_err(|e| format!("读取文件失败: {}", e))?;
                zip.start_file(&zip_path, options)
                    .map_err(|e| format!("创建 zip 文件项失败: {}", e))?;
                zip.write_all(&data)
                    .map_err(|e| format!("写入 zip 失败: {}", e))?;
            }
        }
        Ok(())
    }
    
    add_dir_to_zip(&mut zip, options, data_dir, "")?;
    zip.finish().map_err(|e| format!("完成 zip 写入失败: {}", e))?;
    
    tracing::info!(target: "data_io", "数据导出完成: {}", output_path);
    Ok(output_path)
}

/// 从 zip 文件导入数据目录（用于完整数据恢复）
#[tauri::command]
pub fn import_data_zip(db: State<DbPool>, zip_path: String, clear_existing: bool) -> Result<String, String> {
    tracing::info!(target: "data_io", "从 zip 导入数据: zip_path={}, clear_existing={}", zip_path, clear_existing);
    
    let data_dir = std::path::Path::new(&db.data_dir);
    
    // 如果需要清空现有数据
    if clear_existing && data_dir.exists() {
        std::fs::remove_dir_all(data_dir)
            .map_err(|e| format!("清空现有数据失败: {}", e))?;
    }
    
    // 创建数据目录
    std::fs::create_dir_all(data_dir)
        .map_err(|e| format!("创建数据目录失败: {}", e))?;
    
    // 打开 zip 文件
    let file = std::fs::File::open(&zip_path)
        .map_err(|e| format!("打开 zip 文件失败: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("读取 zip 文件失败: {}", e))?;
    
    // 解压文件
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("读取 zip 项失败: {}", e))?;
        let outpath = data_dir.join(file.name());
        
        if file.name().ends_with('/') {
            // 目录
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("创建目录失败: {}", e))?;
        } else {
            // 文件
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("创建父目录失败: {}", e))?;
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("创建文件失败: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("解压文件失败: {}", e))?;
        }
    }
    
    tracing::info!(target: "data_io", "数据导入完成: {} 个文件", archive.len());
    Ok(format!("成功导入 {} 个文件", archive.len()))
}

/// 选择导出路径（打开保存对话框）
#[tauri::command]
pub fn select_export_path() -> Result<String, String> {
    use tauri::api::dialog::FileDialogBuilder;
    
    let (tx, rx) = std::sync::mpsc::channel();
    
    FileDialogBuilder::new()
        .set_file_name(&format!("toolbox_backup_{}.zip", chrono::Local::now().format("%Y%m%d_%H%M%S")))
        .add_filter("Zip Archive", &["zip"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });
    
    rx.recv()
        .map_err(|e| format!("对话框错误: {}", e))?
        .map(|p| Ok(p.to_string_lossy().to_string()))
        .unwrap_or_else(|| Err("用户取消".into()))
}

/// 选择导入文件（打开文件选择对话框）
#[tauri::command]
pub fn select_import_path() -> Result<String, String> {
    use tauri::api::dialog::FileDialogBuilder;
    
    let (tx, rx) = std::sync::mpsc::channel();
    
    FileDialogBuilder::new()
        .add_filter("Zip Archive", &["zip"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    
    rx.recv()
        .map_err(|e| format!("对话框错误: {}", e))?
        .map(|p| Ok(p.to_string_lossy().to_string()))
        .unwrap_or_else(|| Err("用户取消".into()))
}

/// 将文本内容写入文件（前端导出用）
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("写入文件失败: {}", e))
}
