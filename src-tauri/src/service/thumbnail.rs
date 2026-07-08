use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Duration;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;

/// 统一缩略图输出尺寸（16:9 裁切居中 + 缩放）
const THUMB_W: u32 = 640;
const THUMB_H: u32 = 360;
const JPEG_QUALITY: u8 = 90;
const MEM_CACHE_MAX: usize = 500;
const DISK_CACHE_DAYS: u64 = 30;

/// 缩略图磁盘缓存目录名
const THUMB_DIR: &str = "thumbnails";

pub struct ThumbnailEngine {
    mem_cache: Arc<Mutex<lru::LruCache<String, String>>>,
    thumb_dir: PathBuf,
}

impl ThumbnailEngine {
    pub fn new(data_dir: &Path) -> Self {
        let thumb_dir = data_dir.join(THUMB_DIR);
        std::fs::create_dir_all(&thumb_dir).ok();
        ThumbnailEngine {
            mem_cache: Arc::new(Mutex::new(lru::LruCache::new(
                std::num::NonZeroUsize::new(MEM_CACHE_MAX).unwrap()
            ))),
            thumb_dir,
        }
    }

    /// 磁盘缓存文件路径：{hash}_{W}x{H}.jpg
    fn thumb_path(&self, src: &Path) -> PathBuf {
        use std::hash::{Hash, Hasher};
        use std::collections::hash_map::DefaultHasher;
        let mut hasher = DefaultHasher::new();
        src.to_string_lossy().as_bytes().hash(&mut hasher);
        THUMB_W.hash(&mut hasher);
        THUMB_H.hash(&mut hasher);
        let hash = hasher.finish();
        self.thumb_dir.join(format!("{:016x}_{}x{}.jpg", hash, THUMB_W, THUMB_H))
    }

    fn image_to_data_url(data: &[u8]) -> String {
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(data);
        format!("data:image/jpeg;base64,{}", b64)
    }

    /// 将任意源图统一缩放为 THUMB_W × THUMB_H（居中裁切 + Lanczos3）
    pub fn get_thumbnail_sync(&self, src_path: &str, _max_width: Option<u32>, quality: Option<u8>) -> Result<String, String> {
        let q = quality.unwrap_or(JPEG_QUALITY).clamp(1, 100);
        let path = Path::new(src_path);
        if !path.exists() { return Err("文件不存在".into()); }

        let cache_key = format!("{}|{}x{}|q{}", src_path, THUMB_W, THUMB_H, q);

        // 内存缓存
        {
            let mut cache = self.mem_cache.blocking_lock();
            if let Some(cached) = cache.get(&cache_key) {
                return Ok(cached.clone());
            }
        }

        let thumb_path = self.thumb_path(path);

        // 磁盘缓存
        if thumb_path.exists() {
            let age = std::fs::metadata(&thumb_path)
                .and_then(|m| m.modified()).ok()
                .and_then(|t| t.elapsed().ok())
                .unwrap_or(Duration::from_secs(999999));
            if age < Duration::from_secs(DISK_CACHE_DAYS * 86400) {
                if let Ok(data) = std::fs::read(&thumb_path) {
                    let b64 = Self::image_to_data_url(&data);
                    let mut cache = self.mem_cache.blocking_lock();
                    cache.put(cache_key, b64.clone());
                    return Ok(b64);
                }
            }
        }

        // 生成缩略图
        match image::open(path) {
            Ok(img) => {
                // 统一裁切 + 缩放至 THUMB_W × THUMB_H
                let resized = img.resize_to_fill(THUMB_W, THUMB_H, FilterType::Lanczos3);
                let rgb = resized.to_rgb8();

                // 写入磁盘缓存
                if let Ok(file) = std::fs::File::create(&thumb_path) {
                    let mut buf = std::io::BufWriter::new(file);
                    let mut enc = JpegEncoder::new_with_quality(&mut buf, q);
                    let _ = enc.encode(&rgb, rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8);
                }

                // 编码为 base64
                let mut buf = std::io::Cursor::new(Vec::new());
                let mut enc = JpegEncoder::new_with_quality(&mut buf, q);
                let _ = enc.encode(&rgb, rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8);
                let final_bytes = buf.into_inner();

                let b64 = Self::image_to_data_url(&final_bytes);
                let mut cache = self.mem_cache.blocking_lock();
                cache.put(cache_key, b64.clone());
                Ok(b64)
            }
            Err(e) => Err(format!("图片解码失败: {}", e)),
        }
    }

    pub fn get_thumbnails_batch_sync(&self, paths: &[String], max_width: Option<u32>, quality: Option<u8>) -> Vec<(String, Result<String, String>)> {
        // 限制最大并发线程数，避免扫描期间缩略图线程爆发耗尽系统资源
        const MAX_CONCURRENT: usize = 4;
        let results: std::sync::Mutex<Vec<(usize, String, Result<String, String>)>> = std::sync::Mutex::new(Vec::with_capacity(paths.len()));
        std::thread::scope(|s| {
            let mut active: Vec<std::thread::ScopedJoinHandle<'_, ()>> = Vec::with_capacity(MAX_CONCURRENT);
            for (i, p) in paths.iter().enumerate() {
                let idx = i;
                let path = p.clone();
                let results_ref = &results;
                // 等待正在进行的线程完成，保持并发不超过 MAX_CONCURRENT
                while active.len() >= MAX_CONCURRENT {
                    if let Some(h) = active.drain(..1).next() { h.join().ok(); }
                }
                active.push(s.spawn(move || {
                    let r = self.get_thumbnail_sync(&path, max_width, quality);
                    results_ref.lock().unwrap().push((idx, path, r));
                }));
            }
            for h in active { h.join().ok(); }
        });
        let mut sorted = results.into_inner().unwrap();
        sorted.sort_by_key(|(i, _, _)| *i);
        sorted.into_iter().map(|(_, p, r)| (p, r)).collect()
    }

    /// 清理源图对应的所有缓存（兼容新旧格式）
    pub fn invalidate_file(&self, src_path: &str) {
        let path = Path::new(src_path);

        // 旧格式：{hash}.jpg（无尺寸后缀）
        {
            use std::hash::{Hash, Hasher};
            use std::collections::hash_map::DefaultHasher;
            let mut hasher = DefaultHasher::new();
            path.to_string_lossy().as_bytes().hash(&mut hasher);
            let old_hash = hasher.finish();
            let _ = std::fs::remove_file(self.thumb_dir.join(format!("{:016x}.jpg", old_hash)));
        }

        // 旧格式：{hash}_{width}.jpg（兼容之前仅宽度限制的缓存）
        for mw in [0u32, 85, 120, 240, 320, 480, 640, 800, 1280] {
            let fname = {
                use std::hash::{Hash, Hasher};
                use std::collections::hash_map::DefaultHasher;
                let mut hasher = DefaultHasher::new();
                path.to_string_lossy().as_bytes().hash(&mut hasher);
                mw.hash(&mut hasher);
                let hash = hasher.finish();
                format!("{:016x}_{}.jpg", hash, mw)
            };
            let _ = std::fs::remove_file(self.thumb_dir.join(&fname));
        }

        // 当前统一格式：{hash}_{W}x{H}.jpg
        let _ = std::fs::remove_file(self.thumb_path(path));
    }

    pub fn clear_mem_cache(&self) { let mut c = self.mem_cache.blocking_lock(); c.clear(); }
}
