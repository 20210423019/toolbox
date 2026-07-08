use std::path::Path;
use std::sync::Mutex;

fn search_in_path(name: &str) -> Option<String> {
    std::env::var_os("PATH").and_then(|paths| {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(name);
            if candidate.exists() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
        None
    })
}

pub fn find_ffprobe() -> String {
    search_in_path("ffprobe.exe")
        .or_else(|| search_in_path("ffprobe"))
        .unwrap_or_default()
}

pub fn find_ffmpeg() -> String {
    search_in_path("ffmpeg.exe")
        .or_else(|| search_in_path("ffmpeg"))
        .unwrap_or_default()
}

pub fn resolve_ffprobe(settings: &Mutex<std::collections::HashMap<String, String>>) -> String {
    if let Ok(s) = settings.lock() {
        if let Some(path) = s.get("ffprobe_path") {
            if !path.is_empty() && Path::new(path).exists() {
                return path.clone();
            }
        }
    }
    find_ffprobe()
}

pub fn resolve_ffmpeg(settings: &Mutex<std::collections::HashMap<String, String>>) -> String {
    if let Ok(s) = settings.lock() {
        if let Some(path) = s.get("ffmpeg_path") {
            if !path.is_empty() && Path::new(path).exists() {
                return path.clone();
            }
        }
    }
    find_ffmpeg()
}
