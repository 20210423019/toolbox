//! 路径无关的文件发现引擎
//!
//! 核心设计：规则不再绑定固定目录，而是在 DiscoveryScope（发现范围）内搜索。
//! DiscoveryScope 自动包含视频根目录 + 所有已归类子目录（封面/小说/字幕音频），
//! 规则匹配文件身份（文件名+扩展名）而非绝对路径。
//!
//! 边界安全：
//! - 所有搜索入口从 video_path.parent() 出发
//! - 子目录通过 parent.join() 生成，不会逃逸
//! - WalkDir/read_dir 以每个 search_dir 为根，不上溯
//! - is_within_boundary 双重校验

use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// 所有已知的归类子目录
pub const ORGANIZED_SUBDIRS: &[&str] = &["封面", "小说", "字幕音频"];

/// 封面图片扩展名
pub const COVER_EXTS: &[&str] = &[
    "jpg", "JPG", "jpeg", "JPEG", "jpe", "JPE", "jif", "jfif",
    "png", "webp", "bmp", "dib", "gif", "tif", "tiff",
];

/// 文本文件扩展名
pub const TEXT_EXTS: &[&str] = &["txt", "md", "srt", "ass", "vtt"];

/// 音频文件扩展名
pub const AUDIO_EXTS: &[&str] = &["mp3", "wav", "flac", "ogg", "aac", "m4a"];

/// 图片文件扩展名
pub const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp"];

/// 路径无关的文件引用
#[derive(Debug, Clone)]
pub struct FileRef {
    /// 相对于 scope root 的显示名（如 "cover.jpg" 或 "封面/cover.jpg"）
    pub display_name: String,
    /// 解析后的绝对路径
    pub absolute_path: PathBuf,
    /// 文件名
    pub filename: String,
    /// 扩展名（小写，不含点）
    pub extension: String,
}

/// 文件发现范围 —— 在视频根目录 + 所有归类子目录内搜索文件
pub struct DiscoveryScope {
    /// 视频所在目录（硬边界）
    root: PathBuf,
    /// 实际搜索目录列表：root + 所有存在的归类子目录
    search_dirs: Vec<PathBuf>,
    /// 视频文件主名（不含扩展名）
    pub video_stem: String,
}

impl DiscoveryScope {
    /// 从视频文件路径创建 Scope
    /// 自动发现已存在的归类子目录并纳入搜索范围
    pub fn new(video_path: &Path) -> Self {
        let root = match video_path.parent() {
            Some(p) => p.to_path_buf(),
            None => PathBuf::new(),
        };
        let video_stem = video_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        let mut search_dirs = vec![root.clone()];
        for subdir in ORGANIZED_SUBDIRS {
            let p = root.join(subdir);
            if p.exists() && p.is_dir() {
                search_dirs.push(p);
            }
        }

        Self {
            root,
            search_dirs,
            video_stem,
        }
    }

    /// 获取根目录
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// 获取所有搜索目录（供外部遍历使用）
    pub fn search_dirs(&self) -> &[PathBuf] {
        &self.search_dirs
    }

    /// 边界校验：路径是否在 scope 的根目录之下
    pub fn is_within_boundary(&self, path: &Path) -> bool {
        path.starts_with(&self.root)
    }

    // ─── 文件发现方法 ───

    /// 跨所有搜索目录查找匹配 glob 模式的文件
    /// pattern: 相对于视频目录的模式，如 "*.jpg"、"封面/*.jpg"
    /// 返回绝对路径列表
    pub fn find_glob(&self, pattern: &str) -> Vec<String> {
        let mut results = Vec::new();
        for dir in &self.search_dirs {
            let recursive = pattern.contains("**");
            let depth = if recursive {
                usize::MAX
            } else {
                pattern.split('/').count() + 2
            };
            for entry in WalkDir::new(dir).max_depth(depth).into_iter().filter_map(Result::ok) {
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path();
                if !self.is_within_boundary(path) {
                    continue;
                }
                let rel = path
                    .strip_prefix(&self.root)
                    .ok()
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_default();
                if wildcard_match(pattern, &rel) {
                    let cleaned = clean_path(&path.to_string_lossy());
                    if !results.contains(&cleaned) {
                        results.push(cleaned);
                    }
                }
            }
        }
        results.sort();
        results
    }

    /// 跨所有搜索目录查找精确命名的文件（模板可包含 {filename} / {ext}）
    /// template: 如 "{filename}.jpg"、"{filename}_cover.{ext}"
    pub fn find_template(&self, template: &str) -> Vec<String> {
        let expanded = expand_template(template, &self.video_stem);
        let mut results = Vec::new();
        for name in &expanded {
            for dir in &self.search_dirs {
                let candidate = dir.join(name);
                if candidate.exists() && candidate.is_file() {
                    let cleaned = clean_path(&candidate.to_string_lossy());
                    if !results.contains(&cleaned) {
                        results.push(cleaned);
                    }
                }
            }
        }
        results
    }

    /// 跨所有搜索目录查找通配符模板（模板可包含 *）
    /// pattern: 如 "{filename}_*.{jpg,png}"
    pub fn find_wildcard_template(&self, template: &str) -> Vec<String> {
        let expanded = expand_template(template, &self.video_stem);
        let mut results = Vec::new();
        for pat in &expanded {
            results.extend(self.find_glob(pat));
        }
        results
    }

    /// 跨所有搜索目录按扩展名查找文件
    /// 返回 (display_name, absolute_path) 列表
    pub fn find_by_ext(&self, exts: &[&str]) -> Vec<(String, String)> {
        let mut results = Vec::new();
        for dir in &self.search_dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let fp = entry.path();
                    if !fp.is_file() {
                        continue;
                    }
                    if !self.is_within_boundary(&fp) {
                        continue;
                    }
                    let ext = fp
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if !exts.iter().any(|e| e.eq_ignore_ascii_case(&ext)) {
                        continue;
                    }
                    let abs = clean_path(&fp.to_string_lossy());
                    let rel = fp
                        .strip_prefix(&self.root)
                        .ok()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|| {
                            fp.file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_default()
                        });
                    if !results.iter().any(|(_, a): &(String, String)| a == &abs) {
                        results.push((rel, abs));
                    }
                }
            }
        }
        results
    }

    /// 跨所有搜索目录查找任意图片文件（兜底），按文件大小降序取前 n 个
    pub fn find_images_fallback(&self, max_count: usize) -> Vec<String> {
        let mut fallback: Vec<(PathBuf, u64)> = Vec::new();
        for dir in &self.search_dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let fp = entry.path();
                    if !fp.is_file() {
                        continue;
                    }
                    if !self.is_within_boundary(&fp) {
                        continue;
                    }
                    let ext = fp
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("");
                    if !COVER_EXTS.iter().any(|ce| ext.eq_ignore_ascii_case(ce)) {
                        continue;
                    }
                    let size = std::fs::metadata(&fp).map(|m| m.len()).unwrap_or(0);
                    fallback.push((fp, size));
                }
            }
        }
        fallback.sort_by(|a, b| b.1.cmp(&a.1));
        fallback
            .into_iter()
            .take(max_count)
            .map(|(fp, _)| clean_path(&fp.to_string_lossy()))
            .collect()
    }
}

// ─── 路径工具 ───

/// 清理 Windows 路径前缀 \\?\
pub fn clean_path(p: &str) -> String {
    #[cfg(windows)]
    {
        if let Some(stripped) = p.strip_prefix(r"\\?\") {
            return stripped.to_string();
        }
        if let Some(stripped) = p.strip_prefix(r"\\?\UNC\") {
            return format!(r"\{}", stripped);
        }
    }
    p.to_string()
}

/// 展开文件名模板
/// 支持：{filename} → video_stem, {ext} → 多个扩展名变体,
///       {jpg,png} 花括号枚举展开, * 通配符保留
fn expand_template(template: &str, stem: &str) -> Vec<String> {
    let with_stem = template.replace("{filename}", stem);
    let mut results = vec![with_stem];

    // 展开 {ext} 为所有封面扩展名
    if results[0].contains("{ext}") {
        let base = results[0].clone();
        results = COVER_EXTS
            .iter()
            .map(|e| base.replace("{ext}", e))
            .collect();
    }

    // 展开花括号枚举 {a,b,c}
    let mut expanded = Vec::new();
    for r in &results {
        if let Some(start) = r.find('{') {
            if let Some(end) = r[start..].find('}') {
                let group = &r[start + 1..start + end];
                let prefix = &r[..start];
                let suffix = &r[start + end + 1..];
                for item in group.split(',') {
                    expanded.push(format!("{}{}{}", prefix, item.trim(), suffix));
                }
                continue;
            }
        }
        expanded.push(r.clone());
    }
    expanded
}

// ─── 通配符匹配 ───

/// glob 通配符匹配（支持 * 和 **）
pub fn wildcard_match(pattern: &str, text: &str) -> bool {
    expand_braces(pattern)
        .into_iter()
        .any(|pat| wildcard_match_expanded(&pat, text))
}

fn wildcard_match_expanded(pattern: &str, text: &str) -> bool {
    let pats: Vec<&str> = pattern.split('/').filter(|p| !p.is_empty()).collect();
    let texts: Vec<&str> = text.split('/').filter(|p| !p.is_empty()).collect();
    wildcard_parts(&pats, &texts)
}

fn expand_braces(pattern: &str) -> Vec<String> {
    let Some(start) = pattern.find('{') else {
        return vec![pattern.to_string()];
    };
    let Some(end_rel) = pattern[start + 1..].find('}') else {
        return vec![pattern.to_string()];
    };
    let end = start + 1 + end_rel;
    let prefix = &pattern[..start];
    let suffix = &pattern[end + 1..];
    let mut out = Vec::new();
    for item in pattern[start + 1..end].split(',') {
        let expanded = format!("{}{}{}", prefix, item.trim(), suffix);
        out.extend(expand_braces(&expanded));
    }
    out
}

fn wildcard_parts(pattern: &[&str], text: &[&str]) -> bool {
    if pattern.is_empty() {
        return text.is_empty();
    }
    if pattern[0] == "**" {
        return wildcard_parts(&pattern[1..], text)
            || (!text.is_empty() && wildcard_parts(pattern, &text[1..]));
    }
    !text.is_empty()
        && wc_seg(pattern[0], text[0])
        && wildcard_parts(&pattern[1..], &text[1..])
}

fn wc_seg(pattern: &str, text: &str) -> bool {
    let (pat, txt) = (pattern.as_bytes(), text.as_bytes());
    let (mut pi, mut ti, mut si, mut st) = (0usize, 0usize, None, 0);
    while ti < txt.len() {
        if pi < pat.len() && pat[pi] == b'*' {
            si = Some(pi);
            pi += 1;
            st = ti;
        } else if pi < pat.len() && pat[pi].eq_ignore_ascii_case(&txt[ti]) {
            pi += 1;
            ti += 1;
        } else if let Some(sp) = si {
            pi = sp + 1;
            st += 1;
            ti = st;
        } else {
            return false;
        }
    }
    while pi < pat.len() && pat[pi] == b'*' {
        pi += 1;
    }
    pi == pat.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wildcard_match() {
        assert!(wildcard_match("*.jpg", "photo.jpg"));
        assert!(!wildcard_match("*.jpg", "photo.png"));
        assert!(wildcard_match("**/*.{jpg,png}", "a/b/image.png"));
        assert!(wildcard_match("**/*.{jpg,png}", "image.png"));
        assert!(wildcard_match("*.{jpg,png}", "image.png"));
        assert!(!wildcard_match("*.{jpg,png}", "a/b/image.png"));
    }

    #[test]
    fn test_expand_template() {
        let r = expand_template("{filename}_cover.{ext}", "my_video");
        assert!(r.contains(&"my_video_cover.jpg".to_string()));
        assert!(r.contains(&"my_video_cover.png".to_string()));
    }

    #[test]
    fn test_boundary() {
        let scope = DiscoveryScope::new(Path::new("/videos/movie/video.mp4"));
        assert!(scope.is_within_boundary(Path::new("/videos/movie/cover.jpg")));
        assert!(!scope.is_within_boundary(Path::new("/videos/other/cover.jpg")));
    }
}
