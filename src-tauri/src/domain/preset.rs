use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncodingPreset {
    pub id: String,
    pub name: String,
    pub description: String,

    pub encoder_type: String,          // H.264, H.265, AV1, VP9
    pub encoder_brand: String,         // NVENC, AMD, Software, QuickSync
    pub profile: String,               // baseline, main, high, high10, high422, high444
    pub encoder_level: String,         // 4.0, 4.1, 5.0, 5.1, 5.2
    pub width: i32,                    // 视频宽度
    pub height: i32,                   // 视频高度
    pub pix_fmt: String,               // yuv420p, yuv422p, yuv444p
    pub video_bitrate: String,         // 视频码率 如 5000k
    pub max_bitrate: String,           // 最大码率
    pub fps: String,                   // 帧率
    pub time_base: String,             // 时间基准 如 1/1000
    pub encoder_tag: String,           // 编码标签/附加参数
    pub bitrate_mode: BitrateMode,     // CRF / CQP / CBR / VBR
    pub crf_value: String,             // CRF 值
    pub min_crf: String,               // CRF 最小值
    pub max_crf: String,               // CRF 最大值
    pub resolution_mode: String,       // 分辨率模式
    pub fps_mode: String,              // 帧率模式
    pub preset: String,                // slow, medium, fast, veryfast, ultrafast
    pub tune: String,                  // film, animation, grain, stillimage, zerolatency

    pub audio_codec: String,           // AAC, MP3, AC3, Opus, FLAC, copy
    pub audio_sample_rate: String,     // 44100, 48000, 96000
    pub audio_channels: String,        // 1, 2, 6, 8
    pub channel_layout: String,        // mono, stereo, 5.1, 7.1
    pub audio_profile: String,         // aac_low, aac_he
    pub audio_bitrate: String,         // 192k, 320k
    pub audio_volume: String,          // 音量 100

    pub output_format: String,         // mp4, mkv, mov
    pub output_suffix: String,         // _encoded

    pub is_default: bool,
    pub is_builtin: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BitrateMode {
    Crf, Cqp, Cbr, Vbr,
}

impl BitrateMode {
    pub fn as_str(&self) -> &'static str {
        match self { BitrateMode::Crf => "CRF", BitrateMode::Cqp => "CQP", BitrateMode::Cbr => "CBR", BitrateMode::Vbr => "VBR" }
    }
    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() { "CBR" => BitrateMode::Cbr, "VBR" => BitrateMode::Vbr, "CQP" => BitrateMode::Cqp, _ => BitrateMode::Crf }
    }
}

impl EncodingPreset {

    pub fn new(name: String, encoder_type: String, width: i32, height: i32, fps: String) -> Self {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        EncodingPreset {
            id: uuid::Uuid::new_v4().to_string(),
            name, description: String::new(),
            encoder_type, encoder_brand: "NVIDIA".into(),
            profile: "main".into(), encoder_level: String::new(),
            width, height, pix_fmt: "yuv420p".into(),
            video_bitrate: String::new(), max_bitrate: String::new(),
            fps, time_base: String::new(), encoder_tag: String::new(),
            bitrate_mode: BitrateMode::Crf, crf_value: "23".into(),
            min_crf: String::new(), max_crf: String::new(),
            resolution_mode: String::new(), fps_mode: String::new(),
            preset: "medium".into(), tune: String::new(),
            audio_codec: "AAC".into(), audio_sample_rate: "44100".into(),
            audio_channels: "2".into(), channel_layout: "stereo".into(),
            audio_profile: "aac_low".into(), audio_bitrate: "192k".into(),
            audio_volume: "100".into(),
            output_format: "mp4".into(), output_suffix: "_encoded".into(),
            is_default: false, is_builtin: false,
            created_at: now.clone(), updated_at: now,
        }
    }
}
