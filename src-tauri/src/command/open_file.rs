use std::process::Command;

#[tauri::command]
pub fn open_file(filepath: String) -> Result<(), String> {
    tracing::info!(target: "open_file", "打开文件: {}", filepath);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        // 使用 PowerShell 的 Start-Process 打开文件（无命令行窗口）
        Command::new("powershell")
            .args(["-WindowStyle", "Hidden", "-Command", &format!("Start-Process -FilePath '{}'", filepath.replace("'", "''"))])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| { tracing::error!(target: "open_file", "打开文件失败: {}", e); e.to_string() })?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&filepath)
            .spawn()
            .map_err(|e| { tracing::error!(target: "open_file", "打开文件失败: {}", e); e.to_string() })?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&filepath)
            .spawn()
            .map_err(|e| { tracing::error!(target: "open_file", "打开文件失败: {}", e); e.to_string() })?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn show_in_folder(filepath: String) -> Result<(), String> {
    tracing::info!(target: "open_file", "在文件管理器中显示: {}", filepath);
    
    let path = std::path::Path::new(&filepath);
    let target = if path.is_file() {
        path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| path.to_path_buf())
    } else {
        path.to_path_buf()
    };
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        // explorer /select,"filepath" 会打开文件管理器并选中文件
        if path.is_file() {
            Command::new("explorer")
                .args(["/select,", &filepath])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| { tracing::error!(target: "open_file", "打开文件管理器失败: {}", e); e.to_string() })?;
        } else {
            Command::new("explorer")
                .arg(&target)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| { tracing::error!(target: "open_file", "打开文件管理器失败: {}", e); e.to_string() })?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&filepath)
            .spawn()
            .map_err(|e| { tracing::error!(target: "open_file", "打开文件管理器失败: {}", e); e.to_string() })?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| { tracing::error!(target: "open_file", "打开文件管理器失败: {}", e); e.to_string() })?;
    }
    
    Ok(())
}
