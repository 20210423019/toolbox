export interface Category {
  id: string; name: string; icon: string; note: string;
  sort_order: number; is_default: boolean; is_deletable: boolean;
  status: string; storage_path: string;
  created_at: string; updated_at: string;
  
  lib_count: number | null;
  video_count: number | null;
  total_size: number | null;
  total_duration: number | null;
}

export interface VideoLibrary {
  id: string; category_id: string; name: string; icon: string;
  description: string; status: string; sort_order: number;
  scan_paths: Array<{ id?: string | null; path: string; enabled: boolean; sort_order?: number }> | string;
  exclude_paths: string[] | string;
  filter_formats: string[] | string; filter_mode: string; scan_interval: number;
  last_scan_at: string; auto_scan: boolean;
  created_at: string; updated_at: string;
  
  video_count: number | null;
  total_size: number | null;
  total_duration: number | null;
  auto_clean_days: number;
  default_view: string; default_sort: string; sort_dir: string;
  layout_density: string;
  cover_rules?: Array<{ id?: string | null; rule: string; priority: number; enabled: boolean }>;
  classify_rules?: string;
  confidence_thresholds?: string;
  scan_params?: string;
  audio_pair_rules?: string;
}


export interface VideoMetadata {
  pix_fmt: string | null;
  time_base: string | null;
  codec_level: string | null;
  encoder: string | null;
  audio_profile: string | null;
  [key: string]: string | null;
}

export interface Video {
  id: string; library_id: string; filename: string; filepath: string;
  size: number; duration: number; width: number; height: number;
  fps: number; bitrate: number; video_codec: string;
  video_codec_profile: string; audio_codec: string;
  audio_sample_rate: number; audio_channels: number; format: string;
  resolution?: string;

  thumbnail_path: string;

  metadata: VideoMetadata;
  file_created_at: string; file_modified_at: string;
  added_at: string; note: string; series: string; category: string; favorite: boolean;
  status: string; intro_content: string; deleted: boolean; novel_order: string;
  uuid: string; content_hash: string;
  created_at: string; updated_at: string;
}


export interface TagClass {
  id: string;
  library_id: string;
  
  parent_id: string | null;
  name: string;
  color: string;
  icon: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  
  child_count: number;
  
  tag_count: number;
}


export type TagType = "text" | "path" | "url";


export interface TagName {
  id: string;
  class_id: string;
  library_id: string;
  
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  
  video_count: number;
  
  tag_type: string;
}




export interface TagClassTreeNode {
  id: string;
  name: string;
  color: string;
  icon: string;
  tag_count: number;
  children: TagClassTreeNode[];
  
  tags: TagName[];
}




export interface EncodingPreset {
  id: string; name: string; description: string;

  
  encoder_type: string;
  
  profile: string;
  
  encoder_level: string;
  
  width: number;
  
  height: number;
  
  pix_fmt: string;
  
  video_bitrate: string;
  
  max_bitrate: string;
  
  fps: string;
  
  time_base: string;
  
  encoder_tag: string;

  encoder_brand: string;
  resolution_mode: string;
  fps_mode: string;
  bitrate_mode: string;
  crf_value: string;
  min_crf: string;
  max_crf: string;
  preset: string;
  
  tune: string;

  
  audio_codec: string;
  
  audio_sample_rate: string;
  
  audio_channels: string;
  
  channel_layout: string;
  
  audio_profile: string;
  
  audio_bitrate: string;

  audio_volume: string;
  output_format: string;
  output_suffix: string;
  is_default: boolean;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProcessingTask {
  id: string; name: string;
  video_id: string; library_id: string;
  preset_id: string; source_path: string; output_path: string;
  output_filename_template: string;
  status: string; priority: number;
  progress: number; total_files: number; completed_files: number;
  failed_files: number; skipped_files: number;
  current_file: string; current_progress: number;
  encode_speed: number; estimated_remaining: string;
  total_input_size: number; total_output_size: number;
  started_at: string | null; completed_at: string | null;
  error_message: string; retry_count: number;
  created_at: string; updated_at: string;
}

export interface AppSettings {
  theme: string; language: string; font_size: string;
  default_storage: string;
  temp_dir: string; log_dir: string; backup_dir: string;
  default_sort_by: string; default_view_mode: string; page_size: number;
  ffmpeg_path: string; ffprobe_path: string;
  scan_concurrency: number; encode_concurrency: number; auto_start: boolean; notify_on_complete: boolean;
  auto_scan: boolean; scan_interval: number;
  enable_telemetry: boolean; log_level: string;
  max_log_days: number; backup_interval_days: number;
  
  cover_quality: number;
  cover_concurrency: number;
  browser_path: string;
}

export interface ScanProgress {
  status: string; library_id: string; total_files: number; scanned_files: number;
  new_files: number; updated_files: number; removed_files: number;
  errors: string[]; percentage: number; elapsed_secs: number; message: string;
}

export interface ScanLogEntry {
  level: string;
  message: string;
  timestamp: string;
}

export interface ScannedVideoPayload {
  id: string;
  library_id: string;
  filename: string;
  filepath: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  video_codec: string;
  video_codec_profile: string;
  audio_codec: string;
  audio_sample_rate: number;
  audio_channels: number;
  format: string;
  
  thumbnail_path: string;
  
  metadata: VideoMetadata;
  file_created_at: string;
  file_modified_at: string;
  added_at: string;
}

export interface DuplicateGroup {
  group_id: string; videos: string[];
  match_type: string; similarity: number; total_size_saved: number;
}

export interface VideoDetail {
  video: Video;
  tags: TagName[];
  
  tagValues?: string[];
}

export interface ModuleNavItem {
  id: string;
  label: string;
  icon: string;
  pageId: string;
  description?: string;
  isDialog?: boolean;
}

export interface ModuleConfig {
  id: string;
  label: string;
  icon: string;
  color: string;
  navItems: ModuleNavItem[];
}

// ─── 智能文本扫描类型 ───

export type TextCategory = "novel" | "intro" | "subtitle" | "cover" | "audio";

export interface ScannedTextFile {
  file_name: string;
  file_size: number;
  category: TextCategory;
  confidence: number;
  has_audio: boolean;
  paired_audio_name: string | null;
  parsed_title: string | null;
  parsed_author: string | null;
  parsed_word_count: string | null;
  parsed_episodes: string | null;
  estimated_chapters: number | null;
  first_lines: string;
}

export interface VideoTextScanResult {
  video_id: string;
  video_path: string;
  video_dir: string;
  files: ScannedTextFile[];
}

export interface TextFileSummary {
  novel_status: NovelStatus;
  files: ScannedTextFile[];
}

// 兼容旧版的状态类型
export type NovelStatus = "none" | "novel" | "audio";

// ─── 控制台日志类型 ───

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  source: string;
  stack?: string;
  timestamp: string;
  count: number;
}

// ─── 扫描历史类型 ───

export interface ScanHistory {
  id: string;
  library_id: string;
  scan_type: string;
  status: string;
  total_files_found: number;
  new_files_added: number;
  files_updated: number;
  files_removed: number;
  failed_files: number;
  errors: string;
  duration_ms: number;
  started_at: string;
  completed_at: string | null;
}
