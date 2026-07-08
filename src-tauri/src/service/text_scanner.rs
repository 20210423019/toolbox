//! 智能文本发现与分类引擎
//!
//! 扫描视频目录下所有关联文件，通过启发式分析进行分类。
//! 支持：小说(novel)、简介(intro)、字幕(subtitle)、封面(cover)、音频(audio)。
//! 字幕与音频命名保持一致，识别后整理到标准化子目录。

use std::io::{BufRead, BufReader};
use std::path::Path;
use regex::Regex;
use crate::service::rule_engine::{DiscoveryScope, TEXT_EXTS, IMAGE_EXTS, AUDIO_EXTS};

/// 文件分类枚举（简化版）
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TextCategory {
    Novel,     // 小说
    Intro,     // 简介
    Subtitle,  // 字幕
    Cover,     // 封面
    Audio,     // 音频
}

impl TextCategory {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Novel => "novel",
            Self::Intro => "intro",
            Self::Subtitle => "subtitle",
            Self::Cover => "cover",
            Self::Audio => "audio",
        }
    }

    pub fn display_label(&self) -> &'static str {
        match self {
            Self::Novel => "小说",
            Self::Intro => "简介",
            Self::Subtitle => "字幕",
            Self::Cover => "封面",
            Self::Audio => "音频",
        }
    }

    /// 获取目标子目录名（None 表示留在根目录不移动）
    pub fn target_dir(&self) -> Option<&'static str> {
        match self {
            Self::Novel => Some("小说"),
            Self::Subtitle | Self::Audio => Some("字幕音频"),
            Self::Cover => Some("封面"),
            Self::Intro => None, // 简介留在根目录
        }
    }
}

/// 单文本文件的扫描结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScannedTextFile {
    pub file_name: String,
    pub file_size: u64,
    pub category: TextCategory,
    pub confidence: f64,
    pub has_audio: bool,
    pub paired_audio_name: Option<String>,
    pub parsed_title: Option<String>,
    pub parsed_author: Option<String>,
    pub parsed_word_count: Option<String>,
    pub parsed_episodes: Option<String>,
    pub estimated_chapters: Option<u32>,
    pub first_lines: String, // 前20行，用于预览
}

/// 视频的文本文件扫描结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VideoTextScanResult {
    pub video_id: String,
    pub video_path: String,
    pub video_dir: String,
    pub files: Vec<ScannedTextFile>,
}

/// 批量文本状态摘要（兼容旧版 novelStatus）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TextFileSummary {
    pub novel_status: String,       // "none" | "novel" | "audio" — 兼容旧 UI
    pub files: Vec<ScannedTextFile>, // 完整文件列表
}

// ─── 扫描配置结构体 ───

/// 分类规则：文件名模式 → 分类映射
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClassifyRule {
    pub pattern: String,
    pub category: String, // "novel" | "intro" | "subtitle" | "cover" | "audio"
    pub priority: i64,
    pub weight: f64,
    pub enabled: bool,
}

/// 预编译的分类规则（启动时编译一次，全扫描复用）
#[derive(Debug, Clone)]
pub(crate) struct CompiledClassifyRule {
    pub regex: Regex,
    pub category: String,
    pub weight: f64,
}

/// 将 glob 模式转换为正则表达式
fn glob_to_regex(glob: &str) -> String {
    let mut re = String::with_capacity(glob.len() + 4);
    re.push('^');
    for ch in glob.chars() {
        match ch {
            '*' => re.push_str(".*"),
            '?' => re.push('.'),
            '.' => re.push_str("\\."),
            '/' => re.push('/'),
            '\\' => re.push_str("\\\\"),
            other => re.push(other),
        }
    }
    re.push('$');
    re
}

/// 置信度阈值：每类最低置信度
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct ConfidenceThresholds {
    pub novel: Option<f64>,
    pub intro: Option<f64>,
    pub subtitle: Option<f64>,
    pub cover: Option<f64>,
    pub audio: Option<f64>,
}

/// 扫描参数：读取行数、关键词等
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct ScanParams {
    pub read_lines: Option<u64>,
    pub read_limit: Option<u64>,
    pub preview_lines: Option<u64>,
    pub min_novel_size: Option<u64>,
    pub novel_keywords: Option<String>,
    pub intro_match: Option<String>,
}

/// 音频配对规则
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioPairRule {
    pub pattern: String,
    pub enabled: bool,
    pub extensions: Option<String>,
}

/// 完整扫描配置（所有可配置项的聚合）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScannerConfig {
    pub head_lines: u64,
    pub max_read_size: u64,
    pub preview_lines: u64,
    pub min_novel_size: u64,
    pub classify_rules: Vec<ClassifyRule>,
    pub thresholds: ConfidenceThresholds,
    pub scan_params: ScanParams,
    pub audio_pair_rules: Vec<AudioPairRule>,
    pub novel_keywords: Vec<String>,
    pub intro_match_names: Vec<String>,
    /// 预编译分类规则缓存，避免每次 scan_video_text_files 调用重新编译正则
    #[serde(skip)]
    pub(crate) compiled_rules: Vec<CompiledClassifyRule>,
}

impl Default for ScannerConfig {
    fn default() -> Self {
        Self {
            head_lines: 200,
            max_read_size: 512 * 1024,
            preview_lines: 20,
            min_novel_size: 10 * 1024,
            classify_rules: vec![
                ClassifyRule { pattern: "简介.*".into(), category: "intro".into(), priority: 1, weight: 0.9, enabled: true },
                ClassifyRule { pattern: "*.srt".into(), category: "subtitle".into(), priority: 2, weight: 1.0, enabled: true },
                ClassifyRule { pattern: "*.ass".into(), category: "subtitle".into(), priority: 3, weight: 1.0, enabled: true },
                ClassifyRule { pattern: "小说/*.txt".into(), category: "novel".into(), priority: 4, weight: 1.0, enabled: true },
                ClassifyRule { pattern: "*.jpg / *.png".into(), category: "cover".into(), priority: 5, weight: 1.0, enabled: true },
            ],
            thresholds: ConfidenceThresholds {
                novel: Some(0.6), intro: Some(0.6), subtitle: Some(0.5),
                cover: Some(0.5), audio: Some(0.5),
            },
            scan_params: ScanParams {
                read_lines: None, read_limit: None, preview_lines: None, min_novel_size: None,
                novel_keywords: Some("书名：, 作者：, 字数：, 章节：, 第, 章, 卷".into()),
                intro_match: Some("简介.txt, 简介.md".into()),
            },
            audio_pair_rules: vec![
                AudioPairRule { pattern: "{novel_name}.mp3".into(), enabled: true, extensions: Some("mp3,wav,flac,ogg,aac,m4a".into()) },
                AudioPairRule { pattern: "{novel_name}_audio.{ext}".into(), enabled: true, extensions: None },
                AudioPairRule { pattern: "小说/{novel_name}/audio/*.{ext}".into(), enabled: false, extensions: None },
            ],
            novel_keywords: vec!["书名：".into(), "书名:".into(), "作者：".into(), "作者:".into(), "字数：".into(), "字数:".into(), "章节：".into(), "章节:".into()],
            intro_match_names: vec!["简介.txt".into(), "简介.md".into()],
            compiled_rules: Vec::new(),
        }
    }
}

impl ScannerConfig {
    /// 从 JSON 数组解析分类规则
    pub fn parse_classify_rules(json: &str) -> Vec<ClassifyRule> {
        if json.is_empty() || json == "[]" { return Self::default().classify_rules; }
        serde_json::from_str(json).unwrap_or_else(|_| Self::default().classify_rules)
    }
    /// 从 JSON 解析置信度阈值
    pub fn parse_thresholds(json: &str) -> ConfidenceThresholds {
        if json.is_empty() || json == "{}" { return Self::default().thresholds; }
        serde_json::from_str(json).unwrap_or_default()
    }
    /// 从 JSON 解析扫描参数
    pub fn parse_scan_params(json: &str) -> ScanParams {
        if json.is_empty() || json == "{}" { return Self::default().scan_params; }
        serde_json::from_str(json).unwrap_or_default()
    }
    /// 从 JSON 解析音频配对规则
    pub fn parse_audio_pair_rules(json: &str) -> Vec<AudioPairRule> {
        if json.is_empty() || json == "[]" { return Self::default().audio_pair_rules; }
        serde_json::from_str(json).unwrap_or_else(|_| Self::default().audio_pair_rules)
    }

    /// 预编译所有启用的分类规则为 Regex（启动时调用一次，全扫描复用）
    pub(crate) fn precompile_rules(&self) -> Vec<CompiledClassifyRule> {
        let mut compiled: Vec<CompiledClassifyRule> = Vec::new();
        let mut raw: Vec<(usize, &ClassifyRule)> = self.classify_rules.iter()
            .filter(|r| r.enabled).enumerate().collect();
        // 按优先级排序
        raw.sort_by(|a, b| b.1.priority.cmp(&a.1.priority));
        for (_, rule) in &raw {
            let re_str = glob_to_regex(&rule.pattern);
            match Regex::new(&re_str) {
                Ok(regex) => compiled.push(CompiledClassifyRule {
                    regex,
                    category: rule.category.clone(),
                    weight: rule.weight,
                }),
                Err(e) => tracing::warn!(target: "scanner", "分类规则无效 pattern='{}' regex='{}': {}", rule.pattern, re_str, e),
            }
        }
        compiled
    }
}

// ─── 公共 API ───

/// 扫描视频目录下的所有文本文件，返回分类结果
/// config: 可选的扫描配置（传空字符串使用默认值）
pub fn scan_video_text_files(
    video_id: &str,
    video_path: &str,
    config: &ScannerConfig,
) -> VideoTextScanResult {
    let video_dir = Path::new(video_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut files: Vec<ScannedTextFile> = Vec::new();

    // 使用 DiscoveryScope 跨所有搜索目录（根目录 + 归类子目录）发现文件
    // 路径无关：无论文件在根目录还是 封面/小说/字幕音频 子目录，都能找到
    let scope = DiscoveryScope::new(Path::new(video_path));
    if !scope.root().exists() || !scope.root().is_dir() {
        return VideoTextScanResult {
            video_id: video_id.to_string(),
            video_path: video_path.to_string(),
            video_dir,
            files,
        };
    }

    // 合并所有支持的扩展名，跨范围搜索
    let all_exts: Vec<&str> = TEXT_EXTS
        .iter()
        .chain(IMAGE_EXTS.iter())
        .chain(AUDIO_EXTS.iter())
        .copied()
        .collect();
    let paths_to_scan = scope.find_by_ext(&all_exts);

    if paths_to_scan.is_empty() {
        return VideoTextScanResult {
            video_id: video_id.to_string(),
            video_path: video_path.to_string(),
            video_dir,
            files,
        };
    }

    // 对每个文件进行分类（使用配置中的参数）
    let compiled_rules = if config.compiled_rules.is_empty() {
        config.precompile_rules()
    } else {
        config.compiled_rules.clone()
    };
    let effective_head_lines = config.head_lines as usize;
    let effective_max_read = config.max_read_size;
    for (display_name, full_path) in &paths_to_scan {
        let analyzed = analyze_text_file(
            display_name,
            full_path,
            effective_head_lines,
            effective_max_read,
            config,
            &compiled_rules,
        );
        files.push(analyzed);
    }

    // 按分类排序：小说 > 简介 > 字幕 > 封面 > 音频
    files.sort_by_key(|f| match f.category {
        TextCategory::Novel => 0,
        TextCategory::Intro => 1,
        TextCategory::Subtitle => 2,
        TextCategory::Cover => 3,
        TextCategory::Audio => 4,
    });

    VideoTextScanResult {
        video_id: video_id.to_string(),
        video_path: video_path.to_string(),
        video_dir,
        files,
    }
}

/// 获取文本文件摘要（兼容旧的 novelStatus）
pub fn get_text_file_summary(video_path: &str, config: &ScannerConfig) -> TextFileSummary {
    let scan_result = scan_video_text_files("", video_path, config);

    let mut novel_status = "none".to_string();
    let mut has_novel = false;
    let mut has_audio = false;

    for f in &scan_result.files {
        match f.category {
            TextCategory::Novel => {
                has_novel = true;
                if f.has_audio {
                    has_audio = true;
                }
            }
            _ => {}
        }
    }

    if has_audio {
        novel_status = "audio".to_string();
    } else if has_novel {
        novel_status = "novel".to_string();
    }

    TextFileSummary {
        novel_status,
        files: scan_result.files,
    }
}

// ─── 内部实现 ───

fn analyze_text_file(display_name: &str, full_path: &str, head_lines: usize, max_read_size: u64, config: &ScannerConfig, compiled_rules: &[CompiledClassifyRule]) -> ScannedTextFile {
    let path = Path::new(full_path);
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let file_size = std::fs::metadata(full_path)
        .map(|m| m.len())
        .unwrap_or(0);

    let ext = Path::new(&file_name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
    let audio_exts = ["mp3", "wav", "flac", "ogg", "aac", "m4a"];

    // 图片和音频文件直接通过扩展名分类，跳过内容分析
    let (category, confidence) = if image_exts.contains(&ext.as_str()) {
        (TextCategory::Cover, 1.0)
    } else if audio_exts.contains(&ext.as_str()) {
        (TextCategory::Audio, 1.0)
    } else {
        let head_content = read_head_lines(full_path, head_lines, max_read_size);
        classify(&head_content, &file_name, file_size, config, compiled_rules)
    };

    let (parsed_title, parsed_author, parsed_word_count, parsed_episodes, estimated_chapters) =
        if category == TextCategory::Novel || category == TextCategory::Intro {
            let meta = parse_meta(&read_head_lines(full_path, head_lines, max_read_size), category);
            (meta.title, meta.author, meta.word_count, meta.episodes, meta.estimated_chapters)
        } else {
            (None, None, None, None, None)
        };

    // 查找配对音频（遍历音频配对规则）
    let base_name = Path::new(&file_name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let video_dir = path.parent().unwrap_or(Path::new(""));
    let mut has_audio = false;
    let mut paired_audio_name = None;
    if category == TextCategory::Novel {
        for rule in &config.audio_pair_rules {
            if !rule.enabled { continue; }
            let exts = rule.extensions.clone().unwrap_or_else(|| "mp3,wav,flac,ogg,aac,m4a".into());
            for ext in exts.split(',') {
                let pattern = rule.pattern.replace("{novel_name}", &base_name).replace("{ext}", ext.trim());
                let audio_path = video_dir.join(&pattern);
                if audio_path.exists() {
                    has_audio = true;
                    paired_audio_name = Some(audio_path.file_name().unwrap_or_default().to_string_lossy().to_string());
                    break;
                }
            }
            if has_audio { break; }
        }
    }

    // 取预览文本（仅对文本文件）
    let preview_lines = config.preview_lines as usize;
    let first_lines = if category == TextCategory::Cover || category == TextCategory::Audio {
        String::new()
    } else {
        read_head_lines(full_path, preview_lines, max_read_size).join("\n")
    };

    ScannedTextFile {
        file_name: display_name.to_string(),
        file_size,
        category,
        confidence,
        has_audio,
        paired_audio_name,
        parsed_title,
        parsed_author,
        parsed_word_count,
        parsed_episodes,
        estimated_chapters,
        first_lines,
    }
}

/// 读取文件头部 N 行
fn read_head_lines(file_path: &str, max_lines: usize, max_bytes: u64) -> Vec<String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Vec::new();
    }

    // 尝试用 BufReader 读取
    if let Ok(file) = std::fs::File::open(path) {
        let reader = BufReader::new(file);
        let lines: Vec<String> = reader
            .lines()
            .flatten()
            .take(max_lines)
            .collect();
        return lines;
    }

    // fallback: 读取前 N 字节
    if let Ok(meta) = std::fs::metadata(file_path) {
        let read_size = meta.len().min(max_bytes);
        if let Ok(mut f) = std::fs::File::open(file_path) {
            use std::io::Read;
            let mut buf = vec![0u8; read_size as usize];
            if f.read_exact(&mut buf).is_ok() {
                let content = String::from_utf8_lossy(&buf);
                return content.lines().take(max_lines).map(|s| s.to_string()).collect();
            }
        }
    }

    Vec::new()
}

/// 分类引擎：基于文件名和内容模式进行简化分类
/// 封面(cover)和音频(audio)由文件扩展名直接判定
/// 使用配置中的关键词和阈值
fn classify(lines: &[String], file_name: &str, file_size: u64, config: &ScannerConfig, compiled_rules: &[CompiledClassifyRule]) -> (TextCategory, f64) {
    let name = file_name.to_lowercase();
    let ext = Path::new(file_name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    // ── 1. 扩展名优先匹配 ──
    match ext.as_str() {
        "srt" | "ass" | "vtt" => return (TextCategory::Subtitle, config.thresholds.subtitle.unwrap_or(0.5)),
        "mp3" | "wav" | "flac" | "ogg" | "aac" | "m4a" => return (TextCategory::Audio, config.thresholds.audio.unwrap_or(1.0)),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" => return (TextCategory::Cover, config.thresholds.cover.unwrap_or(1.0)),
        _ => {}
    }

    // ── 2. 预编译分类规则匹配（按优先级，最高优先） ──
    for cr in compiled_rules {
        if cr.regex.is_match(&name) {
            let cat = match cr.category.as_str() {
                "novel" => TextCategory::Novel,
                "intro" => TextCategory::Intro,
                "subtitle" => TextCategory::Subtitle,
                "cover" => TextCategory::Cover,
                "audio" => TextCategory::Audio,
                _ => continue,
            };
            return (cat, cr.weight);
        }
    }

    // ── 3. 文件名精确匹配 ──
    for match_name in &config.intro_match_names {
        if name == match_name.to_lowercase() {
            return (TextCategory::Intro, config.thresholds.intro.unwrap_or(0.9));
        }
    }

    if lines.is_empty() {
        return (TextCategory::Intro, 0.3);
    }

    // ── 3. 内容模式评分（仅判断小说 vs 简介） ──
    let mut novel_score: f64 = 0.0;
    let mut intro_score: f64 = 0.0;

    // 从配置中读取小说关键词进行匹配
    for keyword in &config.novel_keywords {
        if has_any(lines, &[keyword.as_str()]) {
            novel_score += 30.0;
        }
    }

    let chapter_matches = count_matches(lines, "第") + count_matches(lines, "章");
    if chapter_matches >= 6 { novel_score += 30.0; }
    else if chapter_matches >= 3 { novel_score += 15.0; }

    let min_novel = config.min_novel_size;
    if file_size > 500 * 1024 { novel_score += 20.0; }
    else if file_size > min_novel { novel_score += 10.0; }

    // 简介特征
    if has_any(lines, &["标题：", "标题:", "简介：", "简介:", "集数：", "集数:"]) {
        intro_score += 20.0;
    }
    if file_size < 2 * 1024 { intro_score += 10.0; }

    // ── 4. 判定 ──
    let total = novel_score + intro_score;
    if total == 0.0 {
        // 无任何小说/简介特征匹配 → 默认归类为简介
        return (TextCategory::Intro, 0.5);
    }

    let novel_conf = config.thresholds.novel.unwrap_or(0.6);

    if novel_score > intro_score {
        let confidence = (novel_score / total).min(1.0);
        if confidence >= novel_conf {
            // 小文件且得分接近 → 判定为简介
            if file_size < config.min_novel_size && novel_score - intro_score < 15.0 {
                return (TextCategory::Intro, (intro_score / total).min(1.0));
            }
            (TextCategory::Novel, confidence)
        } else {
            (TextCategory::Intro, (intro_score / total).min(1.0))
        }
    } else {
        (TextCategory::Intro, (intro_score / total).min(1.0))
    }
}

struct ParsedMeta {
    title: Option<String>,
    author: Option<String>,
    word_count: Option<String>,
    episodes: Option<String>,
    estimated_chapters: Option<u32>,
}

/// 解析元数据
fn parse_meta(lines: &[String], category: TextCategory) -> ParsedMeta {
    let mut meta = ParsedMeta {
        title: None,
        author: None,
        word_count: None,
        episodes: None,
        estimated_chapters: None,
    };

    match category {
        TextCategory::Novel => {
            // 文件名优先作为书名
            for line in lines {
                if meta.title.is_none() {
                    if let Some(val) = extract_value(line, &["书名：", "书名:"]) {
                        if !val.is_empty() {
                            meta.title = Some(val);
                        }
                    }
                }
                if meta.author.is_none() {
                    if let Some(val) = extract_value(line, &["作者：", "作者:"]) {
                        if !val.is_empty() {
                            meta.author = Some(val);
                        }
                    }
                }
                if meta.word_count.is_none() {
                    if let Some(val) = extract_value(line, &["字数：", "字数:"]) {
                        if !val.is_empty() {
                            meta.word_count = Some(val);
                        }
                    }
                }
                if meta.title.is_some() && meta.author.is_some() && meta.word_count.is_some() {
                    break;
                }
            }

            // 章节统计
            let chapters: Vec<&str> = lines
                .iter()
                .filter(|l| l.trim().starts_with("第") && l.contains("章"))
                .map(|l| l.as_str())
                .collect();
            if !chapters.is_empty() {
                meta.estimated_chapters = Some(chapters.len() as u32);
            }
        }
        TextCategory::Intro => {
            for line in lines {
                if meta.title.is_none() {
                    if let Some(val) = extract_value(line, &["标题：", "标题:"]) {
                        if !val.is_empty() {
                            meta.title = Some(val);
                        }
                    }
                }
                if meta.episodes.is_none() {
                    if let Some(val) = extract_value(line, &["集数：", "集数:"]) {
                        if !val.is_empty() {
                            meta.episodes = Some(val);
                        }
                    }
                }
                if meta.title.is_some() && meta.episodes.is_some() {
                    break;
                }
            }
        }
        _ => {}
    }

    meta
}

// ─── 工具函数 ───

fn has_any(lines: &[String], targets: &[&str]) -> bool {
    targets.iter().any(|t| lines.iter().any(|l| l.contains(t)))
}

fn count_matches(lines: &[String], pattern: &str) -> usize {
    lines.iter().filter(|l| l.contains(pattern)).count()
}

fn extract_value<'a>(line: &'a str, prefixes: &[&str]) -> Option<String> {
    let trimmed = line.trim_start();
    for prefix in prefixes {
        if let Some(val) = trimmed.strip_prefix(prefix) {
            let v = val.trim().to_string();
            if !v.is_empty() {
                return Some(v);
            }
        }
    }
    None
}
