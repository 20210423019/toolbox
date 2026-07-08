// ============================================================================
// 全量 Mock 数据系统 — 覆盖所有前端模块的后端命令模拟
// 当非 Tauri 环境（浏览器开发模式）时自动回退到此系统
// ============================================================================

// ===================== 1. 视频管理模块 =====================

// --- 1.1 分类 ---
let categories: any[] = [
  { id: "cat-1", name: "电影", icon: "🎬", note: "电影分类", sort_order: 0, is_default: true, is_deletable: false, status: "normal", storage_path: "D:/Media/Movies", created_at: "2025-01-01T00:00:00", updated_at: "2025-06-15T10:30:00", lib_count: 2, video_count: 8, total_size: 4294967296, total_duration: 36000 },
  { id: "cat-2", name: "电视剧", icon: "📺", note: "电视剧分类", sort_order: 1, is_default: false, is_deletable: true, status: "normal", storage_path: "D:/Media/TVShows", created_at: "2025-01-01T00:00:00", updated_at: "2025-06-10T08:00:00", lib_count: 1, video_count: 3, total_size: 2147483648, total_duration: 18000 },
  { id: "cat-3", name: "纪录片", icon: "📽️", note: "", sort_order: 2, is_default: false, is_deletable: true, status: "normal", storage_path: "", created_at: "2025-03-15T12:00:00", updated_at: "2025-06-01T09:00:00", lib_count: 1, video_count: 2, total_size: 8589934592, total_duration: 5400 },
];
let nextCatId = 4;

// --- 1.2 媒体库 ---
let libraries: any[] = [
  { id: "lib-1", category_id: "cat-1", name: "科幻电影", icon: "🚀", description: "经典与最新科幻片收藏", status: "normal", sort_order: 0, scan_paths: ["D:/Media/Movies/SciFi"], filter_formats: ".mp4,.mkv,.avi", filter_mode: "whitelist", scan_interval: 0, last_scan_at: "2025-06-18T10:00:00", auto_scan: false, created_at: "2025-01-01T00:00:00", updated_at: "2025-06-18T10:00:00", video_count: 5, total_size: 2147483648, total_duration: 18000, auto_clean_days: 0, default_view: "card", default_sort: "added_at", sort_dir: "desc", layout_density: "comfortable" },
  { id: "lib-2", category_id: "cat-1", name: "动漫电影", icon: "🎨", description: "日本与国产动漫电影", status: "normal", sort_order: 1, scan_paths: ["D:/Media/Movies/Anime"], filter_formats: ".mp4,.mkv", filter_mode: "whitelist", scan_interval: 0, last_scan_at: "2025-06-17T15:00:00", auto_scan: false, created_at: "2025-01-01T00:00:00", updated_at: "2025-06-17T15:00:00", video_count: 3, total_size: 1073741824, total_duration: 7200, auto_clean_days: 0, default_view: "card", default_sort: "name", sort_dir: "asc", layout_density: "compact" },
  { id: "lib-3", category_id: "cat-2", name: "国产剧", icon: "🇨🇳", description: "热门国产电视剧", status: "normal", sort_order: 0, scan_paths: ["D:/Media/TVShows/Chinese"], filter_formats: ".mp4", filter_mode: "whitelist", scan_interval: 30, last_scan_at: "2025-06-16T20:00:00", auto_scan: true, created_at: "2025-01-01T00:00:00", updated_at: "2025-06-16T20:00:00", video_count: 3, total_size: 2147483648, total_duration: 10800, auto_clean_days: 90, default_view: "list", default_sort: "added_at", sort_dir: "desc", layout_density: "comfortable" },
  { id: "lib-4", category_id: "cat-3", name: "自然纪录片", icon: "🌍", description: "BBC/国家地理纪录片", status: "normal", sort_order: 0, scan_paths: ["D:/Media/Docs/Nature"], filter_formats: ".mp4,.mkv,.webm", filter_mode: "whitelist", scan_interval: 0, last_scan_at: "", auto_scan: false, created_at: "2025-03-15T12:00:00", updated_at: "2025-03-15T12:00:00", video_count: 3, total_size: 8589934592, total_duration: 5400, auto_clean_days: 0, default_view: "card", default_sort: "added_at", sort_dir: "desc", layout_density: "comfortable" },
];
let nextLibId = 5;

// --- 1.3 视频 ---
const sampleVideos = [
  { filename: "星际穿越.mp4", filepath: "D:/Media/Movies/SciFi/星际穿越.mp4", size: 2147483648, duration: 10120, width: 1920, height: 1080, fps: 23.976, bitrate: 12500000, video_codec: "h264", video_codec_profile: "High@L4.1", audio_codec: "aac", audio_sample_rate: 48000, audio_channels: 6, format: "mp4", pix_fmt: "yuv420p", time_base: "1/48000", codec_level: "41", encoder: "libx264", audio_profile: "LC", file_created_at: "2024-06-15T10:00:00", file_modified_at: "2025-01-10T08:00:00" },
  { filename: "盗梦空间.mkv", filepath: "D:/Media/Movies/SciFi/盗梦空间.mkv", size: 3221225472, duration: 8880, width: 1920, height: 1080, fps: 24, bitrate: 15000000, video_codec: "hevc", video_codec_profile: "Main@L4.1", audio_codec: "dts", audio_sample_rate: 48000, audio_channels: 8, format: "mkv", pix_fmt: "yuv420p10le", time_base: "1/1000", codec_level: "150", encoder: "x265", audio_profile: "DTS-HD MA", file_created_at: "2024-08-20T14:00:00", file_modified_at: "2025-02-05T12:00:00" },
  { filename: "千与千寻.mp4", filepath: "D:/Media/Movies/Anime/千与千寻.mp4", size: 1572864000, duration: 7500, width: 1920, height: 1080, fps: 24, bitrate: 8000000, video_codec: "h264", video_codec_profile: "Main@L4.0", audio_codec: "aac", audio_sample_rate: 44100, audio_channels: 2, format: "mp4", pix_fmt: "yuv420p", time_base: "1/44100", codec_level: "40", encoder: "libx264", audio_profile: "LC", file_created_at: "2024-12-01T09:00:00", file_modified_at: "2025-03-01T10:00:00" },
  { filename: "你的名字.mp4", filepath: "D:/Media/Movies/Anime/你的名字.mp4", size: 1879048192, duration: 6360, width: 1920, height: 1080, fps: 24, bitrate: 10000000, video_codec: "h264", video_codec_profile: "High@L4.0", audio_codec: "aac", audio_sample_rate: 48000, audio_channels: 2, format: "mp4", pix_fmt: "yuv420p", time_base: "1/48000", codec_level: "40", encoder: "libx264", audio_profile: "LC", file_created_at: "2025-01-15T11:00:00", file_modified_at: "2025-03-20T14:00:00" },
  { filename: "流浪地球2.mp4", filepath: "D:/Media/Movies/SciFi/流浪地球2.mp4", size: 4294967296, duration: 10440, width: 3840, height: 2160, fps: 24, bitrate: 25000000, video_codec: "hevc", video_codec_profile: "Main@L5.1", audio_codec: "eac3", audio_sample_rate: 48000, audio_channels: 8, format: "mp4", pix_fmt: "yuv420p10le", time_base: "1/48000", codec_level: "153", encoder: "x265", audio_profile: "DD+", file_created_at: "2025-02-01T08:00:00", file_modified_at: "2025-04-10T16:00:00" },
  { filename: "大明王朝1566_EP01.mp4", filepath: "D:/Media/TVShows/Chinese/大明王朝1566_EP01.mp4", size: 1073741824, duration: 2700, width: 1920, height: 1080, fps: 25, bitrate: 6000000, video_codec: "h264", video_codec_profile: "High@L4.0", audio_codec: "aac", audio_sample_rate: 48000, audio_channels: 2, format: "mp4", pix_fmt: "yuv420p", time_base: "1/90000", codec_level: "40", encoder: "libx264", audio_profile: "LC", file_created_at: "2025-03-01T08:00:00", file_modified_at: "2025-05-01T10:00:00" },
  { filename: "大明王朝1566_EP02.mp4", filepath: "D:/Media/TVShows/Chinese/大明王朝1566_EP02.mp4", size: 1073741824, duration: 2700, width: 1920, height: 1080, fps: 25, bitrate: 6000000, video_codec: "h264", video_codec_profile: "High@L4.0", audio_codec: "aac", audio_sample_rate: 48000, audio_channels: 2, format: "mp4", pix_fmt: "yuv420p", time_base: "1/90000", codec_level: "40", encoder: "libx264", audio_profile: "LC", file_created_at: "2025-03-01T09:00:00", file_modified_at: "2025-05-01T10:30:00" },
  { filename: "大明王朝1566_EP03.mp4", filepath: "D:/Media/TVShows/Chinese/大明王朝1566_EP03.mp4", size: 1073741824, duration: 2700, width: 1920, height: 1080, fps: 25, bitrate: 6000000, video_codec: "h264", video_codec_profile: "High@L4.0", audio_codec: "aac", audio_sample_rate: 48000, audio_channels: 2, format: "mp4", pix_fmt: "yuv420p", time_base: "1/90000", codec_level: "40", encoder: "libx264", audio_profile: "LC", file_created_at: "2025-03-01T10:00:00", file_modified_at: "2025-05-01T11:00:00" },
  { filename: "地球脉动_S01E01.mp4", filepath: "D:/Media/Docs/Nature/地球脉动_S01E01.mp4", size: 3221225472, duration: 3600, width: 3840, height: 2160, fps: 25, bitrate: 20000000, video_codec: "hevc", video_codec_profile: "Main@L5.1", audio_codec: "eac3", audio_sample_rate: 48000, audio_channels: 6, format: "mp4", pix_fmt: "yuv420p10le", time_base: "1/48000", codec_level: "153", encoder: "x265", audio_profile: "DD+", file_created_at: "2025-04-01T12:00:00", file_modified_at: "2025-06-01T08:00:00" },
  { filename: "蓝色星球_S01E01.mp4", filepath: "D:/Media/Docs/Nature/蓝色星球_S01E01.mp4", size: 2684354560, duration: 3000, width: 3840, height: 2160, fps: 25, bitrate: 18000000, video_codec: "hevc", video_codec_profile: "Main@L5.1", audio_codec: "eac3", audio_sample_rate: 48000, audio_channels: 6, format: "mp4", pix_fmt: "yuv420p10le", time_base: "1/48000", codec_level: "153", encoder: "x265", audio_profile: "DD+", file_created_at: "2025-04-10T14:00:00", file_modified_at: "2025-06-05T09:00:00" },
  { filename: "疯狂动物城.mp4", filepath: "D:/Media/Movies/Anime/疯狂动物城.mp4", size: 1572864000, duration: 6480, width: 1920, height: 1080, fps: 24, bitrate: 9000000, video_codec: "h264", video_codec_profile: "Main@L4.0", audio_codec: "aac", audio_sample_rate: 48000, audio_channels: 6, format: "mp4", pix_fmt: "yuv420p", time_base: "1/48000", codec_level: "40", encoder: "libx264", audio_profile: "LC", file_created_at: "2025-05-01T10:00:00", file_modified_at: "2025-05-15T12:00:00" },
  { filename: "肖申克的救赎.mp4", filepath: "D:/Media/Movies/SciFi/肖申克的救赎.mp4", size: 1879048192, duration: 8520, width: 1920, height: 1080, fps: 24, bitrate: 11000000, video_codec: "h264", video_codec_profile: "High@L4.0", audio_codec: "aac", audio_sample_rate: 48000, audio_channels: 2, format: "mp4", pix_fmt: "yuv420p", time_base: "1/48000", codec_level: "40", encoder: "libx264", audio_profile: "LC", file_created_at: "2025-05-10T09:00:00", file_modified_at: "2025-06-01T10:00:00" },
];
const libVideoMapping: Record<string, number[]> = {
  "lib-1": [0, 1, 4, 11],     // 科幻：星际穿越、盗梦空间、流浪地球2、肖申克
  "lib-2": [2, 3, 10],         // 动漫：千与千寻、你的名字、疯狂动物城
  "lib-3": [5, 6, 7],          // 国产剧：大明王朝3集
  "lib-4": [8, 9],             // 纪录片：地球脉动、蓝色星球
};
let videos: any[] = [];
let nextVideoId = 1;
function initVideos() {
  if (videos.length > 0) return;
  for (const [libId, indices] of Object.entries(libVideoMapping)) {
    for (const idx of indices) {
      const sv = sampleVideos[idx];
      const id = `vid-${nextVideoId++}`;
      videos.push({
        id, library_id: libId, filename: sv.filename, filepath: sv.filepath,
        size: sv.size, duration: sv.duration, width: sv.width, height: sv.height,
        fps: sv.fps, bitrate: sv.bitrate, video_codec: sv.video_codec, video_codec_profile: sv.video_codec_profile,
        audio_codec: sv.audio_codec, audio_sample_rate: sv.audio_sample_rate, audio_channels: sv.audio_channels,
        format: sv.format,
        thumbnail_path: "",
        metadata: { pix_fmt: sv.pix_fmt, time_base: sv.time_base, codec_level: sv.codec_level, encoder: sv.encoder, audio_profile: sv.audio_profile },
        file_created_at: sv.file_created_at, file_modified_at: sv.file_modified_at,
        added_at: new Date().toISOString(), note: "", favorite: false, status: "normal", series: "", category: "",
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
    }
  }
  // 添加额外视频到 lib-4 使纪录片有3个
  const extraDoc = sampleVideos[8];
  const id = `vid-${nextVideoId++}`;
  videos.push({
    id, library_id: "lib-4", filename: "人类星球_S01E01.mp4", filepath: "D:/Media/Docs/Nature/人类星球_S01E01.mp4",
    size: 2684354560, duration: 3600, width: 3840, height: 2160, fps: 25, bitrate: 15000000,
    video_codec: "hevc", video_codec_profile: "Main@L5.1", audio_codec: "eac3", audio_sample_rate: 48000,
    audio_channels: 6, format: "mp4", thumbnail_path: "",
    metadata: { pix_fmt: "yuv420p10le", time_base: "1/48000", codec_level: "153", encoder: "x265", audio_profile: "DD+" },
    file_created_at: "2025-05-01T12:00:00", file_modified_at: "2025-06-10T08:00:00",
    added_at: new Date().toISOString(), note: "", favorite: false, status: "normal", series: "", category: "",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
}
initVideos();

// ===================== 2. 标签模块 =====================

let tagClasses: any[] = [
  { id: "tc-1", library_id: "lib-1", parent_id: null, name: "内容类型", color: "#ef4444", icon: "🎬", description: "按内容主题分类", sort_order: 0, created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", child_count: 3, tag_count: 0 },
  { id: "tc-2", library_id: "lib-1", parent_id: null, name: "技术规格", color: "#3b82f6", icon: "⚙", description: "视频编码/分辨率信息", sort_order: 1, created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", child_count: 0, tag_count: 0 },
  { id: "tc-3", library_id: "lib-1", parent_id: "tc-1", name: "电影类型", color: "#8b5cf6", icon: "🎥", description: "科幻/动作/剧情等", sort_order: 0, created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", child_count: 0, tag_count: 3 },
  { id: "tc-4", library_id: "lib-1", parent_id: "tc-1", name: "年代", color: "#f59e0b", icon: "📅", description: "按出品年代", sort_order: 1, created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", child_count: 0, tag_count: 4 },
  { id: "tc-5", library_id: "lib-1", parent_id: "tc-1", name: "评分", color: "#10b981", icon: "⭐", description: "按评分等级", sort_order: 2, created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", child_count: 0, tag_count: 0 },
  { id: "tc-6", library_id: "lib-2", parent_id: null, name: "动画类型", color: "#ec4899", icon: "🎨", description: "动画风格分类", sort_order: 0, created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", child_count: 0, tag_count: 2 },
  { id: "tc-7", library_id: "lib-3", parent_id: null, name: "剧集信息", color: "#6366f1", icon: "📺", description: "电视剧相关信息", sort_order: 0, created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", child_count: 0, tag_count: 1 },
];
let nextClassId = 8;

// --- 标签数据 ---
let classTagsData: any[] = [
  { id: "ct-1", class_id: "tc-3", library_id: "lib-1", name: "科幻", color: "#8b5cf6", sort_order: 0, tag_type: "text", created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", video_count: 0 },
  { id: "ct-2", class_id: "tc-3", library_id: "lib-1", name: "悬疑", color: "#8b5cf6", sort_order: 1, tag_type: "text", created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", video_count: 0 },
  { id: "ct-3", class_id: "tc-3", library_id: "lib-1", name: "剧情", color: "#8b5cf6", sort_order: 2, tag_type: "text", created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", video_count: 0 },
  { id: "ct-4", class_id: "tc-4", library_id: "lib-1", name: "2020s", color: "#f59e0b", sort_order: 0, tag_type: "text", created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", video_count: 0 },
  { id: "ct-5", class_id: "tc-4", library_id: "lib-1", name: "2010s", color: "#f59e0b", sort_order: 1, tag_type: "text", created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", video_count: 0 },
  { id: "ct-6", class_id: "tc-4", library_id: "lib-1", name: "2000s", color: "#f59e0b", sort_order: 2, tag_type: "text", created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", video_count: 0 },
  { id: "ct-7", class_id: "tc-4", library_id: "lib-1", name: "1990s", color: "#f59e0b", sort_order: 3, tag_type: "text", created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", video_count: 0 },
  { id: "ct-8", class_id: "tc-6", library_id: "lib-2", name: "剧场版", color: "#ec4899", sort_order: 0, tag_type: "text", created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", video_count: 0 },
  { id: "ct-9", class_id: "tc-6", library_id: "lib-2", name: "吉卜力", color: "#ec4899", sort_order: 1, tag_type: "text", created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", video_count: 0 },
  { id: "ct-10", class_id: "tc-7", library_id: "lib-3", name: "历史剧", color: "#6366f1", sort_order: 0, tag_type: "text", created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00", video_count: 0 },
];
let nextClassTagId = 11;

// --- 视频-标签关联 ---
let videoClassTags: { video_id: string; tag_id: string; value: string; assigned_at: string }[] = [
  { video_id: "vid-1", tag_id: "ct-1", value: "", assigned_at: "2025-01-15T10:00:00" },
  { video_id: "vid-1", tag_id: "ct-5", value: "", assigned_at: "2025-01-15T10:00:00" },
  { video_id: "vid-3", tag_id: "ct-9", value: "", assigned_at: "2025-01-15T10:00:00" },
  { video_id: "vid-4", tag_id: "ct-8", value: "", assigned_at: "2025-01-15T10:00:00" },
  { video_id: "vid-4", tag_id: "ct-5", value: "", assigned_at: "2025-01-15T10:00:00" },
  { video_id: "vid-5", tag_id: "ct-1", value: "", assigned_at: "2025-02-10T08:00:00" },
  { video_id: "vid-5", tag_id: "ct-4", value: "", assigned_at: "2025-02-10T08:00:00" },
  { video_id: "vid-8", tag_id: "ct-10", value: "", assigned_at: "2025-03-05T09:00:00" },
  { video_id: "vid-6", tag_id: "ct-10", value: "", assigned_at: "2025-03-05T09:00:00" },
  { video_id: "vid-7", tag_id: "ct-10", value: "", assigned_at: "2025-03-05T09:00:00" },
];

// ===================== 3. 编码预设 =====================

let presets: any[] = [
  {
    id: "pre-1", name: "H.264 高质量", description: "适合存档的高质量H.264编码",
    encoder_type: "H.264", encoder_brand: "Software", profile: "high", encoder_level: "4.1",
    width: 1920, height: 1080, pix_fmt: "yuv420p", video_bitrate: "10000k", max_bitrate: "15000k",
    fps: "30", time_base: "", encoder_tag: "", bitrate_mode: "CRF", crf_value: "18",
    min_crf: "0", max_crf: "51",
    preset: "slow", tune: "film",
    audio_codec: "AAC", audio_sample_rate: "48000", audio_channels: "2",
    channel_layout: "stereo", audio_profile: "aac_low", audio_bitrate: "256k",
    audio_volume: "100",
    output_format: "mp4", output_suffix: "_encoded", is_default: true, is_builtin: false,
    resolution_mode: "custom", fps_mode: "custom",
    created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00",
  },
  {
    id: "pre-2", name: "H.264 快速", description: "快速编码，适合预览",
    encoder_type: "H.264", encoder_brand: "Software", profile: "main", encoder_level: "4.0",
    width: 1920, height: 1080, pix_fmt: "yuv420p", video_bitrate: "5000k", max_bitrate: "",
    fps: "30", time_base: "", encoder_tag: "", bitrate_mode: "CRF", crf_value: "23",
    min_crf: "0", max_crf: "51",
    preset: "fast", tune: "",
    audio_codec: "AAC", audio_sample_rate: "44100", audio_channels: "2",
    channel_layout: "stereo", audio_profile: "aac_low", audio_bitrate: "192k",
    audio_volume: "100",
    output_format: "mp4", output_suffix: "_encoded", is_default: false, is_builtin: false,
    resolution_mode: "custom", fps_mode: "custom",
    created_at: "2025-01-01T00:00:00", updated_at: "2025-01-01T00:00:00",
  },
  {
    id: "pre-3", name: "HEVC 超清", description: "HEVC编码，4K超清输出",
    encoder_type: "H.265/HEVC", encoder_brand: "Software", profile: "main10", encoder_level: "5.1",
    width: 3840, height: 2160, pix_fmt: "yuv420p10le", video_bitrate: "20000k", max_bitrate: "30000k",
    fps: "60", time_base: "", encoder_tag: "", bitrate_mode: "CRF", crf_value: "22",
    min_crf: "0", max_crf: "51",
    preset: "medium", tune: "",
    audio_codec: "AAC", audio_sample_rate: "48000", audio_channels: "6",
    channel_layout: "5.1", audio_profile: "aac_low", audio_bitrate: "384k",
    audio_volume: "100",
    output_format: "mp4", output_suffix: "_4K", is_default: false, is_builtin: false,
    resolution_mode: "custom", fps_mode: "custom",
    created_at: "2025-03-01T00:00:00", updated_at: "2025-03-01T00:00:00",
  },
];
let nextPresetId = 4;

// ===================== 4. 转码任务 =====================

let tasks: any[] = [
  { id: "task-1", name: "转码星际穿越", video_id: "vid-1", library_id: "lib-1", preset_id: "pre-1", source_path: "D:/Media/Movies/SciFi/星际穿越.mp4", output_path: "D:/Output/星际穿越_encoded.mp4", output_filename_template: "{name}_encoded{ext}", status: "completed", priority: 0, progress: 100, total_files: 1, completed_files: 1, failed_files: 0, skipped_files: 0, current_file: "", current_progress: 0, encode_speed: 0, estimated_remaining: "", total_input_size: 2147483648, total_output_size: 1572864000, started_at: "2025-06-01T10:00:00", completed_at: "2025-06-01T10:45:00", error_message: "", retry_count: 0, created_at: "2025-06-01T09:00:00", updated_at: "2025-06-01T10:45:00" },
  { id: "task-2", name: "转码盗梦空间", video_id: "vid-2", library_id: "lib-1", preset_id: "pre-2", source_path: "D:/Media/Movies/SciFi/盗梦空间.mkv", output_path: "D:/Output/盗梦空间_encoded.mp4", output_filename_template: "{name}_encoded{ext}", status: "running", priority: 1, progress: 45, total_files: 1, completed_files: 0, failed_files: 0, skipped_files: 0, current_file: "D:/Media/Movies/SciFi/盗梦空间.mkv", current_progress: 45, encode_speed: 2.5, estimated_remaining: "15m", total_input_size: 3221225472, total_output_size: 0, started_at: "2025-06-18T14:00:00", completed_at: null, error_message: "", retry_count: 0, created_at: "2025-06-18T13:00:00", updated_at: "2025-06-18T14:30:00" },
  { id: "task-3", name: "批量转码动漫", video_id: "", library_id: "lib-2", preset_id: "pre-1", source_path: "D:/Media/Movies/Anime", output_path: "D:/Output/Anime/", output_filename_template: "{name}_encoded{ext}", status: "pending", priority: 0, progress: 0, total_files: 3, completed_files: 0, failed_files: 0, skipped_files: 0, current_file: "", current_progress: 0, encode_speed: 0, estimated_remaining: "", total_input_size: 3489660928, total_output_size: 0, started_at: null, completed_at: null, error_message: "", retry_count: 0, created_at: "2025-06-15T12:00:00", updated_at: "2025-06-15T12:00:00" },
  { id: "task-4", name: "转码地球脉动4K", video_id: "vid-9", library_id: "lib-4", preset_id: "pre-3", source_path: "D:/Media/Docs/Nature/地球脉动_S01E01.mp4", output_path: "D:/Output/地球脉动_S01E01_4K.mp4", output_filename_template: "{name}_4K{ext}", status: "failed", priority: 2, progress: 23, total_files: 1, completed_files: 0, failed_files: 1, skipped_files: 0, current_file: "D:/Media/Docs/Nature/地球脉动_S01E01.mp4", current_progress: 23, encode_speed: 0, estimated_remaining: "", total_input_size: 3221225472, total_output_size: 0, started_at: "2025-06-17T20:00:00", completed_at: "2025-06-17T20:30:00", error_message: "编码过程中出现错误：内存不足", retry_count: 2, created_at: "2025-06-17T19:00:00", updated_at: "2025-06-17T20:30:00" },
];

// ===================== 5. 系统设置 =====================

let appSettings: any = {
  theme: "system", language: "zh-CN", font_size: "standard",
  default_storage: "D:/Media", temp_dir: "D:/Temp/toolbox", log_dir: "D:/Logs/toolbox", backup_dir: "D:/Backups/toolbox",
  default_sort_by: "added_at", default_view_mode: "card", page_size: 20,
  ffmpeg_path: "ffmpeg", ffprobe_path: "ffprobe",
  scan_concurrency: 2, encode_concurrency: 1, auto_start: false, notify_on_complete: true,
  auto_scan: false, scan_interval: 30,
  enable_telemetry: false, log_level: "info", max_log_days: 30, backup_interval_days: 7,
  cover_quality: 640, cover_concurrency: 2,
};

// ===================== 6. 扫描进度 =====================

let scanProgress: any = null;

// ===================== 7. 编码进度 =====================

let encodeProgress: Record<string, number> = {};

// ===================== 8. 查重数据 =====================

let duplicateGroups: any[] = [
  {
    group_id: "dup-1",
    videos: ["vid-1", "vid-5"],
    match_type: "filename",
    similarity: 0.95,
    total_size_saved: 2147483648,
  },
];


// ===================== 10. 小说模块数据 =====================

let novels: Record<string, { fileName: string; fileContent: string }[]> = {
  "vid-1": [
    { fileName: "三体-注释.txt", fileContent: "《三体》是刘慈欣创作的科幻小说，讲述了地球文明与三体文明的首次接触。" },
  ],
};

// ===================== 11. 缩略图缓存 =====================

let thumbnailCache: Record<string, string> = {};

// ============================================================================
// Handlers 字典 — 所有命令的 mock 实现
// ============================================================================

function tv(ts?: string) { return ts || new Date().toISOString(); }

const handlers: Record<string, (args: any) => any> = {

  // ==============================
  // 1. 分类管理
  // ==============================
  get_categories: () => [...categories],

  create_category: (args) => {
    const id = `cat-${nextCatId++}`;
    const now = tv();
    const cat = { id, name: args.name, icon: "📁", note: "", sort_order: categories.length, is_default: false, is_deletable: true, status: "normal", storage_path: "", created_at: now, updated_at: now, lib_count: 0, video_count: 0, total_size: 0, total_duration: 0 };
    categories.push(cat);
    return cat;
  },

  update_category: (args) => {
    const c = categories.find(c => c.id === args.id);
    if (c) { Object.assign(c, args, { updated_at: tv() }); }
    return c ? { ...c } : null;
  },

  update_category_status: (args) => {
    const c = categories.find(c => c.id === args.id);
    if (c) { c.status = args.status; c.updated_at = tv(); }
    return c ? { ...c } : null;
  },

  update_category_sort: (args) => {
    const c = categories.find(c => c.id === args.id);
    if (c) { c.sort_order = args.sortOrder; c.updated_at = tv(); }
    return null;
  },

  delete_category: (args) => {
    categories = categories.filter(c => c.id !== args.id);
    if (args.deleteLibraries) {
      libraries = libraries.filter(l => l.category_id !== args.id);
      videos = videos.filter(v => !libraries.some(l => l.id === v.library_id));
    }
    return null;
  },

  // ==============================
  // 2. 媒体库管理
  // ==============================
  get_libraries: (args) => libraries.filter(l => l.category_id === (args.categoryId || args.category_id)).map(l => ({ ...l })),

  create_library: (args) => {
    const id = `lib-${nextLibId++}`;
    const now = tv();
    const lib = {
      id, category_id: args.categoryId || args.category_id, name: args.name, icon: "📁", description: "",
      status: "normal", sort_order: 0,
      scan_paths: [], exclude_paths: [],
      filter_formats: ".mp4,.mkv,.avi", filter_mode: "whitelist", scan_interval: 0, last_scan_at: "", auto_scan: false,
      auto_clean_days: 0, default_view: "card", default_sort: "added_at", sort_dir: "desc", layout_density: "comfortable",
      created_at: now, updated_at: now, video_count: 0, total_size: 0, total_duration: 0,
    };
    libraries.push(lib);
    return lib;
  },

  update_library: (args) => {
    const lib = libraries.find(l => l.id === (args.id || args.libraryId));
    if (lib) {
      const upd: any = {};
      if (args.name !== undefined) upd.name = args.name;
      if (args.description !== undefined) upd.description = args.description;
      if (args.icon !== undefined) upd.icon = args.icon;
      if (args.status !== undefined) upd.status = args.status;
      if (args.scan_paths !== undefined) upd.scan_paths = args.scan_paths;
      if (args.filter_formats !== undefined) upd.filter_formats = args.filter_formats;
      if (args.filter_mode !== undefined) upd.filter_mode = args.filter_mode;
      if (args.scan_interval !== undefined) upd.scan_interval = args.scan_interval;
      if (args.auto_scan !== undefined) upd.auto_scan = args.auto_scan;
      if (args.default_view !== undefined) upd.default_view = args.default_view;
      if (args.default_sort !== undefined) upd.default_sort = args.default_sort;
      if (args.sort_dir !== undefined) upd.sort_dir = args.sort_dir;
      if (args.layout_density !== undefined) upd.layout_density = args.layout_density;
      Object.assign(lib, upd, { updated_at: tv() });
    }
    return lib ? { ...lib } : null;
  },

  delete_library: (args) => {
    libraries = libraries.filter(l => l.id !== args.id);
    videos = videos.filter(v => v.library_id !== args.id);
    return null;
  },

  // ==============================
  // 3. 视频管理
  // ==============================
  get_videos: (args) => {
    let filtered = videos.filter(v => v.library_id === (args.libraryId || args.library_id));
    // 关键词搜索
    if (args.search) {
      const q = args.search.toLowerCase();
      if (args.searchScope === "filename" || !args.searchScope) {
        filtered = filtered.filter(v => v.filename.toLowerCase().includes(q));
      } else if (args.searchScope === "note") {
        filtered = filtered.filter(v => (v.note || "").toLowerCase().includes(q));
      } else {
        filtered = filtered.filter(v => v.filename.toLowerCase().includes(q) || (v.note || "").toLowerCase().includes(q));
      }
    }
    // 标签过滤
    if (args.tagId) {
      const tagIds = args.tagId.split(",").filter(Boolean);
      if (tagIds.length > 0) {
        filtered = filtered.filter(v => tagIds.some((tid: string) => videoClassTags.some(vct => vct.video_id === v.id && vct.tag_id === tid)));
      }
    }
    // 格式过滤
    if (args.formatFilter) {
      const formats = args.formatFilter.split(",").filter(Boolean);
      if (formats.length > 0) {
        filtered = filtered.filter(v => formats.includes(v.format));
      }
    }
    // 排序
    const sortBy = args.sortBy || "added_at";
    const sortDir = args.sortDir || "desc";
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name" || sortBy === "filename") cmp = a.filename.localeCompare(b.filename);
      else if (sortBy === "size") cmp = a.size - b.size;
      else if (sortBy === "duration") cmp = a.duration - b.duration;
      else if (sortBy === "added_at") cmp = new Date(a.added_at).getTime() - new Date(b.added_at).getTime();
      else if (sortBy === "created_at") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "desc" ? -cmp : cmp;
    });
    // 分页
    const pageSize = args.pageSize || 100;
    const page = Math.max(1, args.page || 1);
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  },

  get_video_count: (args) => videos.filter(v => v.library_id === (args.libraryId || args.library_id)).length,

  get_all_videos_count: () => videos.length,

  get_total_storage: () => videos.reduce((s, v) => s + v.size, 0),

  get_video_detail: (args) => {
    const video = videos.find(v => v.id === (args.id || args.videoId));
    if (!video) return null;
    const rels = videoClassTags.filter(vct => vct.video_id === video.id);
    const tags = rels.map(vct => {
      const ct = classTagsData.find(c => c.id === vct.tag_id);
      return ct ? { ...ct, video_count: videoClassTags.filter(vct2 => vct2.tag_id === ct.id).length } : null;
    }).filter(Boolean);
    const tagValues = rels.map(vct => vct.value || "");
    return { video: { ...video }, tags, tagValues: tagValues.length > 0 ? tagValues : undefined };
  },

  delete_video: (args) => {
    videos = videos.filter(v => v.id !== (args.id || args.videoId));
    return null;
  },

  update_video: (args) => {
    const v = videos.find(v => v.id === (args.id || args.videoId));
    if (v) Object.assign(v, args, { updated_at: tv() });
    return null;
  },

  batch_update_videos: (args) => {
    const ids = args.videoIds || [];
    ids.forEach((id: string) => {
      const v = videos.find(vx => vx.id === id);
      if (v) {
        if (args.note !== undefined) v.note = args.note;
        if (args.favorite !== undefined) v.favorite = args.favorite;
        if (args.status !== undefined) v.status = args.status;
        if (args.series !== undefined) v.series = args.series;
        if (args.category !== undefined) v.category = args.category;
        v.updated_at = tv();
      }
    });
    return null;
  },

  batch_rename: (args) => {
    const renames = args.renames || [];
    for (const [id, filepath, filename] of renames) {
      const v = videos.find(vx => vx.id === id);
      if (v) { v.filepath = filepath; v.filename = filename; v.updated_at = tv(); }
    }
    return null;
  },

  check_video_integrity: (args) => JSON.stringify({ exists: true, readable: true, size: 1000000 }),

  get_video_taggings_batch: (args) => {
    const ids = args.videoIds || [];
    const result: Record<string, Record<string, string>> = {};
    for (const vid of ids) {
      const rels = videoClassTags.filter(vct => vct.video_id === vid);
      const tagMap: Record<string, string> = {};
      for (const rel of rels) {
        tagMap[rel.tag_id] = rel.value || "";
      }
      result[vid] = tagMap;
    }
    return result;
  },

  // ==============================
  // 4. 标签管理
  // ==============================
  get_tag_classes_by_library: (args) => {
    const all = tagClasses.filter(tc => tc.library_id === (args.libraryId || args.library_id));
    return all.map(tc => ({
      ...tc,
      child_count: all.filter(c => c.parent_id === tc.id).length,
      tag_count: classTagsData.filter(ct => ct.class_id === tc.id).length,
    }));
  },

  get_all_class_tags: (args) => {
    const libId = args.libraryId || args.library_id;
    return classTagsData
      .filter(ct => ct.library_id === libId)
      .map(ct => ({ ...ct, video_count: videoClassTags.filter(vct => vct.tag_id === ct.id).length }));
  },

  create_tag_class: (args) => {
    const id = `tc-${nextClassId++}`;
    const now = tv();
    const tc = { id, library_id: args.libraryId || args.library_id, parent_id: args.parentId || args.parent_id || null, name: args.name, color: args.color || "#059669", icon: args.icon || "", description: "", sort_order: 0, created_at: now, updated_at: now, child_count: 0, tag_count: 0 };
    tagClasses.push(tc);
    return tc;
  },

  update_tag_class: (args) => {
    // 兼容两种参数名：tagClass（store调用方式）和 cls（旧方式）
    const data = args.tagClass || args.cls || args;
    const tc = tagClasses.find(t => t.id === data.id);
    if (tc) Object.assign(tc, data, { updated_at: tv() });
    return tc ? { ...tc } : null;
  },

  delete_tag_class: (args) => {
    const idsToDelete: string[] = [args.id];
    const collectChildren = (parentId: string) => { tagClasses.filter(tc => tc.parent_id === parentId).forEach(c => { idsToDelete.push(c.id); collectChildren(c.id); }); };
    collectChildren(args.id);
    classTagsData = classTagsData.filter(ct => !idsToDelete.includes(ct.class_id));
    videoClassTags = videoClassTags.filter(vct => !classTagsData.some(ct => ct.id === vct.tag_id));
    tagClasses = tagClasses.filter(tc => !idsToDelete.includes(tc.id));
    return null;
  },

  move_tag_class: (args) => {
    const tc = tagClasses.find(t => t.id === args.id);
    if (tc) { tc.parent_id = args.newParentId || args.new_parent_id || null; tc.updated_at = tv(); }
    return tc ? { ...tc } : null;
  },

  copy_tag_class: (args) => {
    const source = tagClasses.find(t => t.id === args.id);
    if (!source) return null;
    const id = `tc-${nextClassId++}`;
    const copy = { ...source, id, name: `${source.name}（副本）`, parent_id: args.newParentId || args.new_parent_id || null, created_at: tv(), updated_at: tv(), child_count: 0, tag_count: 0 };
    tagClasses.push(copy);
    return copy;
  },

  get_class_tags: (args) => classTagsData
    .filter(ct => ct.class_id === (args.classId || args.class_id))
    .map(ct => ({ ...ct, video_count: videoClassTags.filter(vct => vct.tag_id === ct.id).length })),

  create_class_tag: (args) => {
    const id = `ct-${nextClassTagId++}`;
    const now = tv();
    const ct = { id, class_id: args.classId || args.class_id, library_id: args.libraryId || args.library_id, name: args.name, color: args.color || "#059669", sort_order: 0, tag_type: "text", created_at: now, updated_at: now, video_count: 0 };
    classTagsData.push(ct);
    return ct;
  },

  update_class_tag: (args) => {
    // 兼容两种参数名
    const data = args.tag || args;
    const ct = classTagsData.find(t => t.id === data.id);
    if (ct) Object.assign(ct, data, { updated_at: tv() });
    return ct ? { ...ct } : null;
  },

  delete_class_tag: (args) => {
    classTagsData = classTagsData.filter(ct => ct.id !== args.id);
    videoClassTags = videoClassTags.filter(vct => vct.tag_id !== args.id);
    return null;
  },

  search_class_tags: (args) => classTagsData
    .filter(ct => ct.library_id === (args.libraryId || args.library_id) && (!args.query || ct.name.includes(args.query)))
    .map(ct => ({ ...ct, video_count: videoClassTags.filter(vct => vct.tag_id === ct.id).length })),

  batch_tag_videos: (args) => {
    const tagIds = args.tagIds || [];
    const values = args.tagValues || tagIds.map(() => "");
    const videoIds = args.videoIds || [];
    for (const vid of videoIds) {
      tagIds.forEach((tid: string, i: number) => {
        const existing = videoClassTags.findIndex(vct => vct.video_id === vid && vct.tag_id === tid);
        if (existing >= 0) { videoClassTags[existing].value = values[i]; }
        else { videoClassTags.push({ video_id: vid, tag_id: tid, value: values[i], assigned_at: tv() }); }
      });
    }
    return null;
  },

  batch_remove_tags: (args) => {
    videoClassTags = videoClassTags.filter(vct => !(args.videoIds || []).includes(vct.video_id) || !(args.tagIds || []).includes(vct.tag_id));
    return null;
  },

  get_tag_class_tree: (args) => {
    const libId = args.libraryId || args.library_id;
    const classes = tagClasses.filter(tc => tc.library_id === libId);
    function buildTree(parentId: string | null): any[] {
      return classes.filter(tc => tc.parent_id === parentId).map(tc => ({
        id: tc.id, name: tc.name, color: tc.color, icon: tc.icon,
        tag_count: classTagsData.filter(ct => ct.class_id === tc.id).length,
        children: buildTree(tc.id),
        tags: classTagsData.filter(ct => ct.class_id === tc.id).map(ct => ({ ...ct, video_count: videoClassTags.filter(vct => vct.tag_id === ct.id).length })),
      }));
    }
    return buildTree(null);
  },

  save_tag_template: (args) => {
    const libId = args.libraryId || args.library_id;
    const classes = tagClasses.filter(tc => tc.library_id === libId);
    function buildTree(parentId: string | null): any[] {
      return classes.filter(tc => tc.parent_id === parentId).map(tc => ({
        id: tc.id, name: tc.name, color: tc.color, icon: tc.icon,
        tag_count: classTagsData.filter(ct => ct.class_id === tc.id).length,
        children: buildTree(tc.id),
        tags: classTagsData.filter(ct => ct.class_id === tc.id).map(ct => ({ ...ct, video_count: 0 })),
      }));
    }
    return buildTree(null);
  },

  load_tag_template: () => null,

  cleanup_unused_tags: (args) => {
    const libId = args.libraryId || args.library_id;
    const usedIds = new Set(videoClassTags.map(vct => vct.tag_id));
    const toDelete = classTagsData.filter(ct => !usedIds.has(ct.id) && ct.library_id === libId);
    classTagsData = classTagsData.filter(ct => !toDelete.some(d => d.id === ct.id));
    return toDelete.length;
  },

  // ==============================
  // 5. 编码预设
  // ==============================
  get_presets: () => [...presets],

  create_preset: (args) => {
    const id = `pre-${nextPresetId++}`;
    const now = tv();
    const p = {
      id, name: args.name, description: "",
      encoder_type: args.encoderType || args.encoder_type || "H.264", encoder_brand: "Software",
      profile: "main", encoder_level: "",
      width: args.width || 1920, height: args.height || 1080, pix_fmt: "yuv420p",
      video_bitrate: "", max_bitrate: "",
      fps: args.fps || "30", time_base: "", encoder_tag: "",
      bitrate_mode: "CRF", crf_value: "23", min_crf: "0", max_crf: "51",
      preset: "medium", tune: "",
      audio_codec: "AAC", audio_sample_rate: "44100", audio_channels: "2",
      channel_layout: "stereo", audio_profile: "aac_low", audio_bitrate: "192k",
      audio_volume: "100",
      output_format: "mp4", output_suffix: "_encoded", is_default: false, is_builtin: false,
      resolution_mode: "custom", fps_mode: "custom",
      created_at: now, updated_at: now,
    };
    presets.push(p);
    return p;
  },

  update_preset: (args) => {
    const data = args.preset || args;
    const idx = presets.findIndex(p => p.id === data.id);
    if (idx >= 0) presets[idx] = { ...presets[idx], ...data, updated_at: tv() };
    return null;
  },

  delete_preset: (args) => {
    presets = presets.filter(p => p.id !== args.id);
    return null;
  },

  set_default_preset: (args) => {
    presets.forEach(p => p.is_default = p.id === args.id);
    return null;
  },

  // ==============================
  // 6. 转码任务
  // ==============================
  get_tasks: () => [...tasks],

  create_task: (args) => {
    const id = `task-${tasks.length + 10}`;
    const now = tv();
    tasks.push({
      id, name: args.name, video_id: "", library_id: "",
      preset_id: args.presetId, source_path: args.sourcePath, output_path: args.outputPath,
      output_filename_template: "{name}_encoded{ext}", status: "pending", priority: 0,
      progress: 0, total_files: 0, completed_files: 0, failed_files: 0, skipped_files: 0,
      current_file: "", current_progress: 0, encode_speed: 0, estimated_remaining: "",
      total_input_size: 0, total_output_size: 0, started_at: null, completed_at: null,
      error_message: "", retry_count: 0,
      created_at: now, updated_at: now,
    });
    return null;
  },

  update_task_status: (args) => {
    const t = tasks.find(t => t.id === args.id);
    if (t) { t.status = args.status; t.progress = args.progress ?? t.progress; t.updated_at = tv(); }
    return null;
  },

  delete_task: (args) => { tasks = tasks.filter(t => t.id !== args.id); return null; },

  clear_completed_tasks: () => { tasks = tasks.filter(t => t.status !== "completed" && t.status !== "failed"); return null; },

  // ==============================
  // 7. 扫描
  // ==============================
  start_scan: (args) => {
    scanProgress = {
      status: "completed", library_id: args.libraryId || "",
      total_files: 5, scanned_files: 5, new_files: 3, updated_files: 1, removed_files: 0,
      errors: [], percentage: 100, elapsed_secs: 12,
    };
    return null;
  },

  get_scan_progress: () => scanProgress ? { ...scanProgress } : null,

  cancel_scan: () => { scanProgress = null; return null; },

  // ==============================
  // 8. 编码执行
  // ==============================
  execute_encode_task: (args) => {
    encodeProgress[args.taskId] = 0;
    const t = tasks.find(t => t.id === args.taskId);
    if (t) { t.status = "running"; }
    return null;
  },

  execute_batch_encode_task: (args) => {
    encodeProgress[args.taskId] = 0;
    const t = tasks.find(t => t.id === args.taskId);
    if (t) { t.status = "running"; t.progress = 0; }
    // 模拟进度递增
    setTimeout(() => {
      const task = tasks.find(t => t.id === args.taskId);
      if (task) {
        let p = 0;
        const interval = setInterval(() => {
          p += Math.random() * 8 + 2;
          if (p >= 100) { p = 100; task.status = "completed"; task.completed_at = tv(); clearInterval(interval); }
          task.progress = Math.min(p, 100);
          task.updated_at = tv();
        }, 400);
      }
    }, 500);
    return null;
  },

  // ==============================
  // 9. 系统设置
  // ==============================
  get_settings: () => ({ ...appSettings }),

  update_settings: (args) => { appSettings = { ...appSettings, ...(args.settings || args) }; return null; },

  update_setting: (args) => { appSettings[args.key] = args.value; return null; },

  reset_settings: () => { return null; },

  // ==============================
  // 10. 系统监控
  // ==============================
  get_system_metrics: () => ({
    cpu_usage: 35.2 + Math.random() * 10,
    memory_used: 8589934592 + Math.random() * 1073741824,
    memory_total: 17179869184,
    memory_percent: 50 + Math.random() * 10,
    processes: 128 + Math.floor(Math.random() * 20),
    uptime_secs: 86400 + Math.floor(Math.random() * 3600),
  }),

  // ==============================
  // 11. 窗口控制
  // ==============================
  minimize_window: () => null,
  maximize_window: () => null,
  close_window: () => null,
  toggle_fullscreen: () => null,
  start_dragging: () => null,
  toggle_always_on_top: (args) => !(args.current ?? false),

  // ==============================
  // 12. 文件操作
  // ==============================
  open_file: () => null,

  // ==============================
  // 13. 封面/缩略图
  // ==============================
  read_cover_base64: () => { throw new Error("浏览器环境无法读取本地封面文件"); },
  set_primary_cover: () => null,
  reorder_covers: () => null,

  get_thumbnails_batch: (args) => {
    // 返回空缩略图路径
    const videoIds = args.videoIds || args.ids || [];
    return videoIds.map((id: string) => [id, ""] as [string, string]);
  },

  // ==============================
  // 14. 查重管理
  // ==============================
  find_duplicates: (args) => {
    // 模拟查重
    duplicateGroups = [
      { group_id: "dup-1", videos: ["vid-1", "vid-12"], match_type: "content", similarity: 0.92, total_size_saved: 2147483648 },
    ];
    return null;
  },

  get_duplicate_groups: () => [...duplicateGroups],

  resolve_duplicate: (args) => {
    duplicateGroups = duplicateGroups.filter(g => g.group_id !== args.groupId);
    return null;
  },

  // ==============================
  // 15. 数据导入导出
  // ==============================
  export_library: (args) => {
    return "D:/Exports/library_" + (args.libraryId || "unknown") + "_" + Date.now() + ".zip";
  },

  import_library: (args) => {
    return "lib-" + (nextLibId++);
  },

  backup_data: () => null,

  restore_data: (args) => null,

  // ==============================
  // 16. 小说管理
  // ==============================
  bind_novel: (args) => {
    const vid = args.videoId || args.video_id;
    if (!novels[vid]) novels[vid] = [];
    novels[vid].push({ fileName: args.fileName || args.file_name || "unknown.txt", fileContent: args.fileContent || args.file_content || "" });
    return null;
  },

  reorder_novels: (args) => null,

  delete_novel: (args) => {
    const vid = args.videoId || args.video_id;
    if (novels[vid]) novels[vid] = novels[vid].filter(n => n.fileName !== (args.fileName || args.file_name));
    return null;
  },

  // ── 导出/写入（Mock 版本：仅模拟成功） ──
  write_text_file: () => { console.log("[Mock] write_text_file"); return null; },
  encode_video: () => { console.log("[Mock] encode_video"); return null; },
  batch_export_videos: (args) => { console.log("[Mock] batch_export_videos", args); return `模拟导出 ${(args.video_ids || []).length} 个视频`; },

  // ── 标签值查询（Mock） ──
  get_tag_distinct_values: (args) => {
    console.log("[Mock] get_tag_distinct_values", args);
    return [
      ["热血番剧", 12],
      ["异世界穿越", 8],
      ["日常治愈", 6],
      ["后宫恋爱", 5],
      ["悬疑推理", 4],
      ["搞笑日常", 4],
      ["热门连载", 3],
      ["科幻星际", 2],
    ];
  },
};


// ============================================================================
// 导出 — handleMock 函数供 tauri-invoke.ts 调用
// ============================================================================

export function handleMock<T>(cmd: string, args?: Record<string, unknown>): T | null {
  const handler = handlers[cmd];
  if (!handler) {
    console.warn(`[Mock] 未注册的命令: ${cmd}`, args);
    return null;
  }
  const result = handler(args || {});
  return result as T;
}