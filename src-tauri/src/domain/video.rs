use serde::{Deserialize, Serialize};
use crate::domain::tag::TagName;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Video {
    pub id: String,
    pub library_id: String,
    pub filename: String,
    pub filepath: String,
    pub size: i64,
    pub duration: f64,
    pub width: i32,
    pub height: i32,
    pub fps: f64,
    pub bitrate: i64,
    pub video_codec: String,
    pub video_codec_profile: String,
    pub audio_codec: String,
    pub audio_sample_rate: i32,
    pub audio_channels: i32,
    pub format: String,
    pub thumbnail_path: String,
    pub metadata: VideoMetadata,
    pub file_created_at: String,
    pub file_modified_at: String,
    pub added_at: String,
    pub note: String,
    pub favorite: bool,
    pub status: String,
    pub series: String,
    pub category: String,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub novel_order: String,
    #[serde(default)]
    pub intro_content: String,
    #[serde(default)]
    pub resolution: String,
    #[serde(default)]
    pub uuid: String,
    #[serde(default)]
    pub content_hash: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VideoMetadata {
    pub pix_fmt: Option<String>,
    pub time_base: Option<String>,
    pub codec_level: Option<String>,
    pub encoder: Option<String>,
    pub audio_profile: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoDetail {
    pub video: Video,
    pub tags: Vec<TagName>,
    #[serde(rename = "tagValues")]
    pub tag_values: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedVideoPayload {
    pub id: String,
    pub library_id: String,
    pub filename: String,
    pub filepath: String,
    pub size: i64,
    pub duration: f64,
    pub width: i32,
    pub height: i32,
    pub fps: f64,
    pub bitrate: i64,
    pub video_codec: String,
    pub video_codec_profile: String,
    pub audio_codec: String,
    pub audio_sample_rate: i32,
    pub audio_channels: i32,
    pub format: String,
    pub thumbnail_path: String,
    pub metadata: VideoMetadata,
    pub file_created_at: String,
    pub file_modified_at: String,
    pub added_at: String,
}
