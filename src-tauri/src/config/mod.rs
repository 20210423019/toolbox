use std::path::PathBuf;

/// 返回应用数据根目录。
/// - 开发环境：返回项目根目录
/// - 生产环境：返回 exe 所在目录（保持便携性，数据随 exe 移动）
/// 所有数据库、日志、配置文件均存储在此目录的 data/ 子文件夹中。
pub fn resolve_data_dir() -> PathBuf {
    // 优先级1: 环境变量 TOOLBOX_DATA_DIR（用户自定义数据目录）
    if let Ok(env_dir) = std::env::var("TOOLBOX_DATA_DIR") {
        let p = PathBuf::from(env_dir);
        return p;
    }
    // 优先级2: exe 所在目录（便携模式，数据随 exe 移动）
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            return parent.to_path_buf();
        }
    }
    // 优先级3: 当前工作目录（兜底）
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// 兼容旧代码：返回数据根目录（同 resolve_data_dir）
pub fn resolve_project_root() -> PathBuf {
    resolve_data_dir()
}
