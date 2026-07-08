use std::process::Command as ProcessCommand;
use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
pub struct DetectedBrowser {
    pub name: String,
    pub path: String,
}

/// 使用指定浏览器打开 URL
///
/// - 无自定义浏览器: 用 tauri::api::shell::open（内部 ShellExecuteW / open / xdg-open），
///   正确处理含 & 等特殊字符的 URL，无 cmd.exe 解析问题
/// - 有自定义浏览器: 用 ProcessCommand 直接启动，不经过 cmd /c start，避免 & 截断
#[tauri::command]
pub fn open_url(app_handle: tauri::AppHandle, url: String, browser_path: Option<String>) -> Result<(), String> {
    let browser = browser_path.filter(|p| !p.is_empty());

    // 有自定义浏览器 → 直接启动
    if let Some(b) = &browser {
        if cfg!(target_os = "windows") {
            ProcessCommand::new(b)
                .arg(&url)
                .spawn()
                .map_err(|e| format!("打开失败: {}", e))?;
        } else if cfg!(target_os = "macos") {
            ProcessCommand::new("open")
                .args(&["-a", b, &url])
                .spawn()
                .map_err(|e| format!("打开失败: {}", e))?;
        } else {
            ProcessCommand::new(b)
                .arg(&url)
                .spawn()
                .map_err(|e| format!("打开失败: {}", e))?;
        }
        return Ok(());
    }

    // 无自定义浏览器 → 使用系统默认方式（ShellExecuteW / xdg-open / open）
    tauri::api::shell::open(&app_handle.shell_scope(), &url, None::<tauri::api::shell::Program>)
        .map_err(|e| format!("打开失败: {}", e))
}

/// 检测系统已安装的浏览器
#[tauri::command]
pub fn detect_browsers() -> Vec<DetectedBrowser> {
    let mut browsers = Vec::new();

    if cfg!(target_os = "windows") {
        let common_paths = vec![
            ("Google Chrome", r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            ("Google Chrome (x86)", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
            ("Microsoft Edge", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            ("Microsoft Edge", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
            ("Mozilla Firefox", r"C:\Program Files\Mozilla Firefox\firefox.exe"),
            ("Mozilla Firefox (x86)", r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe"),
            ("Brave Browser", r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"),
            ("Opera Browser", r"C:\Program Files\Opera\launcher.exe"),
            ("Chromium", r"C:\Program Files\Chromium\Application\chrome.exe"),
        ];

        let mut found_paths = std::collections::HashSet::new();
        for (name, path) in common_paths {
            if found_paths.contains(path) { continue; }
            if std::path::Path::new(path).exists() {
                browsers.push(DetectedBrowser { name: name.to_string(), path: path.to_string() });
                found_paths.insert(path.to_string());
            }
        }
        // Vivaldi 默认安装在 %LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            let vivaldi_path = format!(r"{}\Vivaldi\Application\vivaldi.exe", local_appdata);
            if !found_paths.contains(&vivaldi_path) && std::path::Path::new(&vivaldi_path).exists() {
                let p = vivaldi_path.clone();
                browsers.push(DetectedBrowser { name: "Vivaldi".to_string(), path: p });
                found_paths.insert(vivaldi_path);
            }
        }
        // 也检查 %APPDATA% (部分便携版安装在这里)
        if let Ok(appdata) = std::env::var("APPDATA") {
            let vivaldi_path = format!(r"{}\Vivaldi\Application\vivaldi.exe", appdata);
            if !found_paths.contains(&vivaldi_path) && std::path::Path::new(&vivaldi_path).exists() {
                let p = vivaldi_path.clone();
                browsers.push(DetectedBrowser { name: "Vivaldi".to_string(), path: p });
                found_paths.insert(vivaldi_path);
            }
        }
    } else if cfg!(target_os = "macos") {
        let apps = vec![
            ("Google Chrome", "/Applications/Google Chrome.app", "Google Chrome"),
            ("Microsoft Edge", "/Applications/Microsoft Edge.app", "Microsoft Edge"),
            ("Mozilla Firefox", "/Applications/Firefox.app", "firefox"),
            ("Brave Browser", "/Applications/Brave Browser.app", "Brave Browser"),
            ("Opera", "/Applications/Opera.app", "Opera"),
            ("Safari", "/Applications/Safari.app", "Safari"),
        ];
        for (name, app_path, _) in apps {
            if std::path::Path::new(app_path).exists() {
                browsers.push(DetectedBrowser { name: name.to_string(), path: app_path.to_string() });
            }
        }
    } else {
        let exes = vec![
            ("Google Chrome", "google-chrome"),
            ("Chromium", "chromium-browser"),
            ("Firefox", "firefox"),
            ("Brave", "brave-browser"),
            ("Opera", "opera"),
        ];
        for (name, exe) in exes {
            let path = format!("/usr/bin/{}", exe);
            if std::path::Path::new(&path).exists() {
                browsers.push(DetectedBrowser { name: name.to_string(), path });
            }
        }
    }

    browsers
}
