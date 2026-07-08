use std::path::Path;
use crate::service::rule_engine::{self, DiscoveryScope, COVER_EXTS};

const COMMON_NAMES: &[&str] = &["poster", "cover", "thumb", "thumbnail", "fanart"];

/// 清理 Windows 路径前缀 \\?\
pub fn clean_path(p: &str) -> String {
    rule_engine::clean_path(p)
}

/// 查找视频的所有封面文件（路径无关）
///
/// 使用 DiscoveryScope 自动搜索视频根目录 + 封面/ 子目录，
/// 规则按优先级匹配，优先使用用户规则，其次硬编码常见封面名，最后兜底。
///
/// 无论文件是否被 classify_and_organize 移动到 封面/ 子目录，
/// 此函数都能正确发现。
pub fn find_all_covers(video_path: &Path, rules_json: &str) -> Vec<String> {
    let scope = DiscoveryScope::new(video_path);
    let mut result: Vec<String> = Vec::new();

    // 阶段1：用户规则匹配
    if !rules_json.is_empty() && rules_json != "[]" {
        result.extend(match_by_rules(&scope, rules_json, &video_path));
    }

    // 阶段2（规则未命中时）：硬编码文件名模式匹配
    if result.is_empty() {
        result.extend(match_hardcoded(&scope));
    }

    // 阶段3（仍为空时）：兜底 — 搜索所有图片，取最大的5个
    if result.is_empty() {
        result.extend(scope.find_images_fallback(5));
    }

    result
}

/// 通过用户规则匹配封面（跨所有 search_dirs）
fn match_by_rules(scope: &DiscoveryScope, rules_json: &str, video_path: &Path) -> Vec<String> {
    let mut result = Vec::new();
    let stem = match video_path.file_stem() {
        Some(s) => s.to_string_lossy(),
        None => return result,
    };
    let rules: Vec<serde_json::Value> = match serde_json::from_str(rules_json) {
        Ok(r) => r,
        _ => return result,
    };

    let mut sorted: Vec<&serde_json::Value> = rules.iter().collect();
    sorted.sort_by_key(|r| r.get("priority").and_then(|v| v.as_i64()).unwrap_or(999));

    for rule_val in sorted {
        if rule_val.get("enabled").and_then(|v| v.as_bool()) == Some(false) {
            continue;
        }
        let rule = match rule_val.get("rule").and_then(|v| v.as_str()) {
            Some(r) if !r.trim().is_empty() => r.trim(),
            _ => continue,
        };

        // 展开规则模板
        let expanded = expand_rule(rule, &stem);
        for pattern in &expanded {
            let normalized = pattern.trim_start_matches("./");
            if normalized.contains('*') || normalized.contains('{') {
                // 通配符模式 → 跨范围 glob 搜索
                result.extend(scope.find_glob(normalized));
            } else {
                // 精确模式 → 跨范围模板搜索
                result.extend(scope.find_template(normalized));
            }
        }
    }

    // 去重
    result.sort();
    result.dedup();
    result
}

/// 硬编码常见封面名匹配（跨所有 search_dirs）
fn match_hardcoded(scope: &DiscoveryScope) -> Vec<String> {
    let mut result = Vec::new();
    let stem = &scope.video_stem;

    // 模板列表：要跨所有 search_dirs 搜索的命名模式
    let templates: Vec<String> = {
        let mut t = Vec::new();
        // {filename}.{ext}
        for ext in COVER_EXTS {
            t.push(format!("{}.{}", stem, ext));
        }
        // {filename}_{common}.{ext}
        for name in COMMON_NAMES {
            for ext in COVER_EXTS {
                t.push(format!("{}_{}.{}", stem, name, ext));
            }
        }
        // {common}.{ext}
        for name in COMMON_NAMES {
            for ext in COVER_EXTS {
                t.push(format!("{}.{}", name, ext));
            }
        }
        t
    };

    for dir in scope.search_dirs() {
        for candidate_name in &templates {
            let candidate = dir.join(candidate_name);
            if candidate.exists() && candidate.is_file() {
                let cleaned = clean_path(&candidate.to_string_lossy());
                if !result.contains(&cleaned) {
                    result.push(cleaned);
                }
            }
        }
    }

    // 防止同一文件在多个 search_dir 中被重复加入
    result.sort();
    result.dedup();
    result
}

/// 展开规则模板（与原有 expand_rule 兼容）
fn expand_rule(rule: &str, stem: &str) -> Vec<String> {
    let with_stem = rule.replace("{filename}", stem);
    let mut results = vec![with_stem];

    if results[0].contains("{exts}") {
        let base = results[0].clone();
        results = COVER_EXTS
            .iter()
            .map(|e| base.replace("{exts}", e))
            .collect();
    }

    let mut expanded = Vec::new();
    for r in &results {
        if let Some(start) = r.find(".{") {
            if let Some(end) = r[start..].find('}') {
                let group = &r[start + 2..start + end];
                let prefix = &r[..start];
                let suffix = &r[start + end + 1..];
                for ext in group.split(',') {
                    expanded.push(format!("{}.{}{}", prefix, ext.trim_start_matches('.'), suffix));
                }
                continue;
            }
        }
        expanded.push(r.clone());
    }
    expanded
}

/// 判断文件是否是封面类型的图片
pub fn is_cover_file(path: &Path) -> bool {
    path.exists()
        && path.is_file()
        && path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| COVER_EXTS.iter().any(|ce| e.eq_ignore_ascii_case(ce)))
            .unwrap_or(false)
}
