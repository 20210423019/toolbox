use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};

/// 侧车文件名（所有视频统一为：数据.json）
pub const SIDECAR_FILENAME: &str = "数据.json";

/// 侧车文件存储的元数据结构（v2）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoSidecar {
    pub v: u32,
    pub uuid: String,
    pub content_hash: String,
    /// 视频原始文件路径，便于孤岛检测时反向映射
    /// v2 新增，旧侧车无此字段 → #[serde(default)]
    #[serde(default)]
    pub original_path: String,
    pub created: String,
    pub updated: String,
    pub note: String,
    pub favorite: bool,
    pub series: String,
    pub category: String,
    pub status: String,
    pub novel_order: Vec<String>,
    pub tags: Vec<SidecarTag>,
}

/// 单个标签的侧车存储结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarTag {
    #[serde(rename = "classId")]
    pub class_id: String,
    #[serde(rename = "className")]
    pub class_name: String,
    #[serde(rename = "tagId")]
    pub tag_id: String,
    #[serde(rename = "tagName")]
    pub tag_name: String,
    pub value: String,
}

// ─── 路径 ───

/// 计算侧车文件路径：`{parent}/数据.json`
pub fn sidecar_path(video_path: &Path) -> PathBuf {
    let parent = video_path.parent().unwrap_or(Path::new(""));
    parent.join(SIDECAR_FILENAME)
}

/// 从侧车文件路径推导对应的视频文件路径（读取 sidecar JSON 中的 original_path）
pub fn video_path_from_sidecar(sidecar: &Path) -> PathBuf {
    if let Some(sc) = read_sidecar(sidecar) {
        return PathBuf::from(sc.original_path);
    }
    // 统一名称下无法从文件名推断，返回空路径
    PathBuf::new()
}

// ─── 读写 ───

pub fn read_sidecar(path: &Path) -> Option<VideoSidecar> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn write_sidecar(path: &Path, data: &VideoSidecar) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("序列化侧车失败: {}", e))?;
    std::fs::write(path, &json)
        .map_err(|e| format!("写入侧车文件失败: {}", e))
}

// ─── 内容哈希 ───

/// 计算内容抽样哈希（快速、不读全文件）
/// 读头 4KB + 尾 4KB + 文件大小 + 文件名 → DefaultHasher
/// 兼容 Windows（不用 read_at）
pub fn compute_content_hash(path: &Path) -> Option<String> {
    let size = std::fs::metadata(path).ok()?.len();
    if size == 0 {
        return Some("0".to_string());
    }

    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    use std::io::{Read, Seek, SeekFrom};

    let mut hasher = DefaultHasher::new();
    size.hash(&mut hasher);

    let mut buf = [0u8; 4096];
    if let Ok(mut f) = std::fs::File::open(path) {
        // 读文件头 4KB
        if f.read(&mut buf).ok().map_or(false, |n| n > 0) {
            buf.hash(&mut hasher);
        }
        // 读文件尾 4KB
        if size > 4096 {
            let _ = f.seek(SeekFrom::End(-4096));
            if f.read(&mut buf).ok().map_or(false, |n| n > 0) {
                buf.hash(&mut hasher);
            }
        }
    }

    // 文件名也参与哈希
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.hash(&mut hasher));

    Some(format!("{:016x}", hasher.finish()))
}

// ─── 孤岛检测 ───

/// 在目录下搜索 content_hash 匹配的孤岛侧车
/// 搜索与视频同级的 *.vidtool，不递归
pub fn find_orphan_by_hash(dir: &Path, hash: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.to_string_lossy().ends_with(SIDECAR_FILENAME) {
            // 读侧车比较 hash
            if let Some(sc) = read_sidecar(&path) {
                if sc.content_hash == hash {
                    return Some(path);
                }
            }
        }
    }
    None
}

/// 从数据库同步侧车文件（供外部命令调用）
pub fn sync_video_sidecar(conn: &rusqlite::Connection, video_id: &str) -> Result<(), String> {
    use crate::repository::{videos, tags};
    let video = videos::get_by_id(conn, video_id).map_err(|e| format!("查询视频失败: {}", e))?;
    let tag_details = tags::get_video_tag_details(conn, video_id).unwrap_or_default();
    let sc_tags: Vec<SidecarTag> = tag_details.into_iter().map(|(tag, value)| {
        let class_name = conn.query_row(
            "SELECT COALESCE(name,'') FROM tag_classes WHERE id=?1",
            rusqlite::params![&tag.class_id],
            |row| row.get::<_, String>(0),
        ).unwrap_or_default();
        SidecarTag {
            class_id: tag.class_id,
            class_name,
            tag_id: tag.id,
            tag_name: tag.name,
            value,
        }
    }).collect();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let hash = compute_content_hash(std::path::Path::new(&video.filepath)).unwrap_or_default();
    let sc = VideoSidecar {
        v: 2,
        uuid: video.id.clone(),
        content_hash: hash.clone(),
        original_path: video.filepath.clone(),
        created: video.created_at.clone(),
        updated: now,
        note: video.note,
        favorite: video.favorite,
        series: video.series,
        category: video.category,
        status: video.status,
        novel_order: serde_json::from_str(&video.novel_order).unwrap_or_default(),
        tags: sc_tags,
    };
    let sc_path = sidecar_path(std::path::Path::new(&video.filepath));
    write_sidecar(&sc_path, &sc)
}

/// 发现目录下所有孤岛侧车（对应视频文件已不存在）
pub fn discover_orphans(dir: &Path) -> Vec<PathBuf> {
    let mut orphans = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else { return orphans };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.to_string_lossy().ends_with(SIDECAR_FILENAME) {
            // 读侧车 JSON 获取 original_path，检查对应视频是否存在
            if let Some(sc) = read_sidecar(&path) {
                let vp = PathBuf::from(&sc.original_path);
                if !vp.exists() {
                    orphans.push(path);
                }
            } else {
                // 无法解析的侧车文件也视为孤岛
                orphans.push(path);
            }
        }
    }
    orphans
}

/// 清理目录下所有旧格式的侧车文件（兼容历史版本：.vidtool / .vidtool.json）
pub fn cleanup_old_formats(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }
        let name = path.to_string_lossy();
        if name.ends_with(".vidtool") || name.ends_with(".vidtool.json") || name.ends_with("数据.数据.json") {
            let _ = std::fs::remove_file(&path);
        }
    }
}
