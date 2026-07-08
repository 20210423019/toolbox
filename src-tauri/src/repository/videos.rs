use rusqlite::{params, Connection};
use crate::domain::video::{Video, VideoMetadata};
use crate::error::{AppError, AppResult};

fn row_to_video(row: &rusqlite::Row) -> rusqlite::Result<Video> {
    Ok(Video {
        id: row.get(0)?, library_id: row.get(1)?, filename: row.get(2)?, filepath: row.get(3)?,
        size: row.get(4)?, duration: row.get(5)?, width: row.get(6)?, height: row.get(7)?,
        fps: row.get(8)?, bitrate: row.get(9)?, video_codec: row.get(10)?,
        video_codec_profile: row.get(11)?, audio_codec: row.get(12)?,
        audio_sample_rate: row.get(13)?, audio_channels: row.get(14)?, format: row.get(15)?,
        thumbnail_path: row.get(16)?,
        metadata: VideoMetadata {
            pix_fmt: row.get(17)?, time_base: row.get(18)?,
            codec_level: row.get(19)?, encoder: row.get(20)?, audio_profile: row.get(21)?,
        },
        file_created_at: row.get(22)?, file_modified_at: row.get(23)?,
        added_at: row.get(24)?, note: row.get(25)?,
        favorite: row.get::<_, i32>(26)? != 0,
        status: row.get(27)?, series: row.get(28)?, category: row.get(29)?,
        deleted: row.get::<_, i32>(30)? != 0,
        novel_order: row.get::<_, Option<String>>(31)?.unwrap_or_default(),
        intro_content: row.get::<_, Option<String>>(32)?.unwrap_or_default(),
        resolution: format!("{}x{}", row.get::<_, i32>(6)?, row.get::<_, i32>(7)?),
        uuid: row.get::<_, Option<String>>(33)?.unwrap_or_default(),
        content_hash: row.get::<_, Option<String>>(34)?.unwrap_or_default(),
        created_at: row.get(35)?, updated_at: row.get(36)?,
    })
}

pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Video> {
    conn.query_row(
        "SELECT id,library_id,filename,filepath,size,duration,width,height,fps,bitrate,
                video_codec,video_codec_profile,audio_codec,audio_sample_rate,audio_channels,
                format,thumbnail_path,
                pix_fmt,time_base,codec_level,encoder,audio_profile,
                file_created_at,file_modified_at,added_at,note,favorite,status,series,category,
                deleted,novel_order,intro_content,uuid,content_hash,created_at,updated_at
         FROM videos WHERE id=?1",
        params![id], row_to_video,
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound { entity: "Video", id: id.to_string() },
        e => AppError::Db(e),
    })
}

pub fn get_count(conn: &Connection, library_id: &str) -> AppResult<i64> {
    conn.query_row("SELECT COUNT(*) FROM videos WHERE library_id=?1", params![library_id], |r| r.get(0))
        .map_err(AppError::Db)
}

pub fn get_total_count(conn: &Connection) -> AppResult<i64> {
    conn.query_row("SELECT COUNT(*) FROM videos", [], |r| r.get(0)).map_err(AppError::Db)
}

pub fn get_total_storage(conn: &Connection) -> AppResult<i64> {
    conn.query_row("SELECT COALESCE(SUM(size),0) FROM videos", [], |r| r.get(0)).map_err(AppError::Db)
}

pub fn insert(conn: &Connection, v: &Video) -> AppResult<()> {
    conn.execute(
        "INSERT INTO videos (id,library_id,filename,filepath,size,duration,width,height,fps,bitrate,
         video_codec,video_codec_profile,audio_codec,audio_sample_rate,audio_channels,format,
         thumbnail_path,pix_fmt,time_base,codec_level,encoder,audio_profile,
         file_created_at,file_modified_at,added_at,note,favorite,status,series,category,
         deleted,novel_order,intro_content,uuid,content_hash,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,?35,?36,?37)",
        params![v.id, v.library_id, v.filename, v.filepath, v.size, v.duration, v.width, v.height,
                v.fps, v.bitrate, v.video_codec, v.video_codec_profile,
                v.audio_codec, v.audio_sample_rate, v.audio_channels, v.format,
                v.thumbnail_path, v.metadata.pix_fmt, v.metadata.time_base,
                v.metadata.codec_level, v.metadata.encoder, v.metadata.audio_profile,
                v.file_created_at, v.file_modified_at, v.added_at,
                v.note, v.favorite as i32, v.status, v.series, v.category,
                v.deleted as i32, v.novel_order, v.intro_content, v.uuid, v.content_hash, v.created_at, v.updated_at],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM video_class_tags WHERE video_id=?1", params![id]).map_err(AppError::Db)?;
    conn.execute("DELETE FROM videos WHERE id=?1", params![id]).map_err(AppError::Db)?;
    Ok(())
}

/// 读取并清理 thumbnail_path：移除磁盘上已不存在的路径
/// 归类操作可能将封面文件移动到子目录或删除，此函数确保 thumbnail_path 始终指向真实文件
pub fn clean_thumbnail_path(conn: &Connection, video_id: &str) {
    let json: String = conn
        .query_row(
            "SELECT COALESCE(thumbnail_path, '[]') FROM videos WHERE id=?1",
            params![video_id],
            |row| row.get(0),
        )
        .unwrap_or_default();
    if json.is_empty() || json == "[]" {
        return;
    }
    if let Ok(paths) = serde_json::from_str::<Vec<String>>(&json) {
        let original_count = paths.len();
        let valid: Vec<String> = paths.into_iter()
            .filter(|p| !p.is_empty() && std::path::Path::new(p).exists())
            .collect();
        if valid.len() < original_count {  // 有无效路径被移除
            let cleaned = serde_json::to_string(&valid).unwrap_or_default();
            let _ = conn.execute(
                "UPDATE videos SET thumbnail_path=?1, updated_at=?2 WHERE id=?3",
                params![cleaned, chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(), video_id],
            );
        }
    }
}
