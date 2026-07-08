use rusqlite::{params, Connection};
use crate::domain::preset::{BitrateMode, EncodingPreset};
use crate::error::{AppError, AppResult};

const COLS: &str = "id,name,description,\
 encoder_type,encoder_brand,profile,encoder_level,\
 width,height,pix_fmt,video_bitrate,max_bitrate,\
 fps,time_base,encoder_tag,\
 bitrate_mode,crf_value,min_crf,max_crf,resolution_mode,fps_mode,preset,tune,\
 audio_codec,audio_sample_rate,audio_channels,channel_layout,audio_profile,audio_bitrate,audio_volume,\
 output_format,output_suffix,\
 is_default,is_builtin,created_at,updated_at";

pub fn row_to(row: &rusqlite::Row) -> rusqlite::Result<EncodingPreset> {
    Ok(EncodingPreset {
        id: row.get(0)?, name: row.get(1)?, description: row.get(2)?,
        encoder_type: row.get(3)?, encoder_brand: row.get(4)?,
        profile: row.get(5)?, encoder_level: row.get(6)?,
        width: row.get(7)?, height: row.get(8)?, pix_fmt: row.get(9)?,
        video_bitrate: row.get(10)?, max_bitrate: row.get(11)?,
        fps: row.get(12)?, time_base: row.get(13)?, encoder_tag: row.get(14)?,
        bitrate_mode: BitrateMode::from_str(&row.get::<_, String>(15)?),
        crf_value: row.get(16)?,
        min_crf: row.get::<_, Option<String>>(17)?.unwrap_or_default(),
        max_crf: row.get::<_, Option<String>>(18)?.unwrap_or_default(),
        resolution_mode: row.get::<_, Option<String>>(19)?.unwrap_or_default(),
        fps_mode: row.get::<_, Option<String>>(20)?.unwrap_or_default(),
        preset: row.get(21)?, tune: row.get(22)?,
        audio_codec: row.get(23)?, audio_sample_rate: row.get(24)?,
        audio_channels: row.get(25)?, channel_layout: row.get(26)?,
        audio_profile: row.get(27)?, audio_bitrate: row.get(28)?,
        audio_volume: row.get(29)?,
        output_format: row.get(30)?, output_suffix: row.get(31)?,
        is_default: row.get::<_, i32>(32)? != 0,
        is_builtin: row.get::<_, i32>(33)? != 0,
        created_at: row.get(34)?, updated_at: row.get(35)?,
    })
}

pub fn get_all(conn: &Connection) -> AppResult<Vec<EncodingPreset>> {
    let sql = format!("SELECT {} FROM encoding_presets ORDER BY is_default DESC, created_at", COLS);
    let mut stmt = conn.prepare(&sql).map_err(AppError::Db)?;
    let items = stmt.query_map([], row_to).map_err(AppError::Db)?.filter_map(|r| r.ok()).collect();
    Ok(items)
}

pub fn insert(conn: &Connection, p: &EncodingPreset) -> AppResult<()> {
    conn.execute(
        &format!("INSERT INTO encoding_presets ({}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,?35,?36)", COLS),
        params![p.id, p.name, p.description,
                p.encoder_type, p.encoder_brand, p.profile, p.encoder_level,
                p.width, p.height, p.pix_fmt, p.video_bitrate, p.max_bitrate,
                p.fps, p.time_base, p.encoder_tag,
                p.bitrate_mode.as_str(), p.crf_value,
                p.min_crf, p.max_crf, p.resolution_mode, p.fps_mode,
                p.preset, p.tune,
                p.audio_codec, p.audio_sample_rate, p.audio_channels,
                p.channel_layout, p.audio_profile, p.audio_bitrate, p.audio_volume,
                p.output_format, p.output_suffix,
                p.is_default as i32, p.is_builtin as i32, p.created_at, p.updated_at],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn update(conn: &Connection, p: &EncodingPreset) -> AppResult<()> {
    conn.execute(
        "UPDATE encoding_presets SET name=?1,description=?2,encoder_type=?3,encoder_brand=?4,profile=?5,encoder_level=?6,width=?7,height=?8,pix_fmt=?9,video_bitrate=?10,max_bitrate=?11,fps=?12,time_base=?13,encoder_tag=?14,bitrate_mode=?15,crf_value=?16,min_crf=?17,max_crf=?18,resolution_mode=?19,fps_mode=?20,preset=?21,tune=?22,audio_codec=?23,audio_sample_rate=?24,audio_channels=?25,channel_layout=?26,audio_profile=?27,audio_bitrate=?28,audio_volume=?29,output_format=?30,output_suffix=?31,is_default=?32,is_builtin=?33,updated_at=?34 WHERE id=?35",
        params![p.name, p.description, p.encoder_type, p.encoder_brand, p.profile, p.encoder_level,
                p.width, p.height, p.pix_fmt, p.video_bitrate, p.max_bitrate,
                p.fps, p.time_base, p.encoder_tag,
                p.bitrate_mode.as_str(), p.crf_value,
                p.min_crf, p.max_crf, p.resolution_mode, p.fps_mode,
                p.preset, p.tune,
                p.audio_codec, p.audio_sample_rate, p.audio_channels,
                p.channel_layout, p.audio_profile, p.audio_bitrate, p.audio_volume,
                p.output_format, p.output_suffix,
                p.is_default as i32, p.is_builtin as i32, p.updated_at, p.id],
    ).map_err(AppError::Db)?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM encoding_presets WHERE id=?1 AND is_builtin=0", params![id])
        .map_err(AppError::Db)?;
    Ok(())
}
