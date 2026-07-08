use std::collections::HashMap;
use std::io::BufRead;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::State;
use crate::domain::preset::{BitrateMode, EncodingPreset};
use crate::infra::db::DbPool;
use crate::infra::ffmpeg;
use crate::infra::resource::AppResourceManager;
use crate::infra::event;
use crate::SettingsCache;

pub struct FFmpegState {
    pub cancel_signals: Mutex<HashMap<String, mpsc::Sender<()>>>,
    pub progress_map: Mutex<HashMap<String, f64>>,
    pub paused_pids: Mutex<HashMap<String, u32>>,
}

impl Default for FFmpegState {
    fn default() -> Self {
        Self::new()
    }
}

/// RAII guard 自动释放并发信号量
struct SemGuard<'a> {
    inner: &'a std::sync::atomic::AtomicI32,
}
impl<'a> Drop for SemGuard<'a> {
    fn drop(&mut self) {
        self.inner.fetch_add(1, std::sync::atomic::Ordering::Release);
    }
}

impl FFmpegState {
    pub fn new() -> Self {
        FFmpegState {
            cancel_signals: Mutex::new(HashMap::new()),
            progress_map: Mutex::new(HashMap::new()),
            paused_pids: Mutex::new(HashMap::new()),
        }
    }
}

fn map_channels(channels: &str) -> Option<&'static str> {
    let ch = channels.to_lowercase();
    if ch.contains("立体声") || ch == "stereo" || ch == "2" { Some("2") }
    else if ch.contains("单声道") || ch == "mono" || ch == "1" { Some("1") }
    else if ch.contains("5.1") || ch.contains("环绕") || ch == "6" { Some("6") }
    else if ch == "7.1" || ch == "8" { Some("8") }
    else { None }
}

pub(crate) fn build_ffmpeg_args(input: &str, output: &str, preset: &EncodingPreset) -> Vec<String> {
    let mut args = vec!["-i".into(), input.into(), "-progress".into(), "pipe:".into(), "-nostats".into()];

    let enc = preset.encoder_type.to_lowercase();
    if !enc.is_empty() {
        args.extend(["-c:v".into(), enc.clone()]);

        if !preset.preset.is_empty() {
            args.push(if enc.contains("amf") { "-quality".into() } else { "-preset".into() });
            args.push(preset.preset.clone());
        }

        if !preset.tune.is_empty() && !enc.contains("amf") { args.extend(["-tune".into(), preset.tune.clone()]); }

        if !preset.profile.is_empty() && preset.profile != "自动" {
            args.extend(["-profile:v".into(), preset.profile.clone()]);
        }

        if !preset.encoder_level.is_empty() {
            args.extend(["-level:v".into(), preset.encoder_level.clone()]);
        }
    }

    if !preset.pix_fmt.is_empty() && preset.pix_fmt != "自动" {
        args.extend(["-pix_fmt".into(), preset.pix_fmt.clone()]);
    }

    match preset.bitrate_mode {
        BitrateMode::Crf | BitrateMode::Cqp => {
            if !preset.crf_value.is_empty() { args.extend(["-crf".into(), preset.crf_value.clone()]); }
        }
        BitrateMode::Cbr | BitrateMode::Vbr => {
            if !preset.video_bitrate.is_empty() { args.extend(["-b:v".into(), preset.video_bitrate.clone()]); }
            if !preset.max_bitrate.is_empty() && matches!(preset.bitrate_mode, BitrateMode::Vbr) {
                args.extend(["-maxrate".into(), preset.max_bitrate.clone(), "-bufsize".into(), preset.max_bitrate.clone()]);
            }
        }
    }

    if preset.width > 0 && preset.height > 0 {
        args.extend(["-vf".into(), format!("scale={}:{}", preset.width, preset.height)]);
    }

    if !preset.fps.is_empty() && preset.fps != "原始" && preset.fps != "0" {
        args.extend(["-r".into(), preset.fps.clone()]);
    }

    if !preset.time_base.is_empty() {
        args.extend(["-time_base".into(), preset.time_base.clone()]);
    }

    if !preset.encoder_tag.is_empty() {
        for part in preset.encoder_tag.split_whitespace() {
            args.push(part.into());
        }
    }

    if !preset.audio_codec.is_empty() {
        let ac = preset.audio_codec.to_lowercase();
        if ac == "copy" || ac == "原始" || ac == "原样" {
            args.extend(["-c:a".into(), "copy".into()]);
        } else {
            args.extend(["-c:a".into(), ac.clone()]);

            if !preset.audio_bitrate.is_empty() { args.extend(["-b:a".into(), preset.audio_bitrate.clone()]); }

            if !preset.audio_sample_rate.is_empty() { args.extend(["-ar".into(), preset.audio_sample_rate.clone()]); }

            if !preset.audio_channels.is_empty() {
                if let Some(ch) = map_channels(&preset.audio_channels) { args.extend(["-ac".into(), ch.into()]); }
            }

            if !preset.channel_layout.is_empty() {
                args.extend(["-channel_layout".into(), preset.channel_layout.clone()]);
            }

            if !preset.audio_profile.is_empty() && preset.audio_profile != "自动" {
                args.extend(["-profile:a".into(), preset.audio_profile.clone()]);
            }
        }
    }
    args.extend(["-y".into(), output.into()]);
    args
}

fn parse_time(time: &str) -> Option<f64> {
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() == 3 {
        Some(parts[0].parse::<f64>().ok()? * 3600.0 + parts[1].parse::<f64>().ok()? * 60.0 + parts[2].parse::<f64>().ok()?)
    } else { None }
}

fn parse_duration(line: &str) -> Option<f64> {
    let trimmed = line.trim();
    if let Some(dur) = trimmed.strip_prefix("Duration: ") {
        if let Some(end) = dur.find(',') { return parse_time(dur[..end].trim()); }
    }
    None
}

fn parse_progress(line: &str) -> Option<f64> {
    let trimmed = line.trim();
    if let Some(time) = trimmed.strip_prefix("out_time=") { parse_time(time.trim()) }
    else { None }
}

fn parse_speed(line: &str) -> Option<f64> {
    let trimmed = line.trim();
    if let Some(sp) = trimmed.strip_prefix("speed=") {
        sp.trim_end_matches('x').trim().parse::<f64>().ok()
    } else { None }
}

fn probe_duration(ffprobe: &str, path: &str) -> Option<f64> {
    let mut cmd = Command::new(ffprobe);
    cmd.args(["-v", "quiet", "-print_format", "json", "-show_format", path]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let out = cmd.output().ok()?;
    if !out.status.success() { return None; }
    let json: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    json["format"]["duration"].as_str().and_then(|s| s.parse().ok())
}

#[tauri::command]
pub fn execute_encode_task(
    db: State<DbPool>, ffmpeg_state: State<Arc<FFmpegState>>,
    resource_manager: State<Arc<AppResourceManager>>,
    settings: State<Arc<SettingsCache>>, app_handle: tauri::AppHandle, taskId: String,
) -> Result<(), String> {
    tracing::info!(target: "encoder", "执行编码任务: taskId={}", taskId);
    let (input, output, preset) = {
        let conn = db.app.lock().map_err(|e| { tracing::error!(target: "encoder", "编码任务获取数据库连接失败: {}", e); e.to_string() })?;
        let (src, out, pid): (String, String, String) = conn.query_row(
            "SELECT source_path, output_path, preset_id FROM processing_tasks WHERE id=?1",
            rusqlite::params![taskId], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        ).map_err(|_| { tracing::error!(target: "encoder", "任务不存在: {}", taskId); format!("任务 {} 不存在", taskId) })?;
        if pid.is_empty() { return Err("任务未关联编码预设".into()); }
        let mut stmt = conn.prepare("SELECT * FROM encoding_presets WHERE id=?1").map_err(|e| e.to_string())?;
        let p = stmt.query_row(rusqlite::params![pid], crate::repository::presets::row_to)
            .map_err(|_| { tracing::error!(target: "encoder", "预设不存在: {}", pid); format!("预设 {} 不存在", pid) })?;
        (src, out, p)
    };

    let _guard = resource_manager.encode.acquire();
    if !Path::new(&input).exists() {
        tracing::error!(target: "encoder", "输入文件不存在: {}", input);
        return Err(format!("输入文件不存在: {}", input));
    }

    let now = || chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    {
        let conn = db.app.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE processing_tasks SET status='running', started_at=?1, updated_at=?1 WHERE id=?2",
            rusqlite::params![now(), taskId]).map_err(|e| e.to_string())?;
    }
    {
        let conn = db.app.lock().map_err(|e| e.to_string())?;
        let _ = conn.execute("INSERT INTO task_logs (id,task_id,level,source,code,message,created_at) VALUES (?1,?2,'info','system','START',?3,?4)",
            rusqlite::params![uuid::Uuid::new_v4().to_string(), taskId, format!("开始编码: {}", input), now()]);
    }

    let ffmpeg_cmd = ffmpeg::resolve_ffmpeg(&settings.map);
    if ffmpeg_cmd.is_empty() { return Err("ffmpeg 未找到".into()); }
    let ffprobe_cmd = ffmpeg::resolve_ffprobe(&settings.map);
    let args = build_ffmpeg_args(&input, &output, &preset);

    tracing::info!(target: "encoder", "FFmpeg 命令: {} {}", ffmpeg_cmd, args.join(" "));

    let mut progress_offset = 0.0f64;
    if Path::new(&output).exists() {
        if let Some(dur) = probe_duration(&ffprobe_cmd, &output) {
            if dur > 0.0 { progress_offset = dur; std::fs::remove_file(&output).ok(); }
        }
    }

    let mut cmd = Command::new(&ffmpeg_cmd);
    cmd.args(&args).stdout(Stdio::null()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd.spawn().map_err(|e| { tracing::error!(target: "encoder", "FFmpeg 启动失败: {}", e); format!("FFmpeg 启动失败: {}", e) })?;
    let stderr = child.stderr.take().ok_or("无法读取 FFmpeg 输出")?;
    let child_pid = child.id();
    {
        let mut pids = ffmpeg_state.paused_pids.lock().map_err(|e| e.to_string())?;
        pids.insert(taskId.clone(), child_pid);
    }
    let (cancel_tx, cancel_rx) = mpsc::channel::<()>();
    {
        let mut sigs = ffmpeg_state.cancel_signals.lock().map_err(|e| e.to_string())?;
        sigs.insert(taskId.clone(), cancel_tx);
    }

    let state_arc = ffmpeg_state.inner().clone();
    let tid = taskId.clone();
    let po = progress_offset;
    let stopped = Arc::new(AtomicBool::new(false));
    let st = stopped.clone();

    let progress_thread = std::thread::Builder::new().name(format!("ffmpeg-{}", &tid)).spawn(move || {
        let mut total_dur: Option<f64> = None;
        let reader = std::io::BufReader::new(stderr);
        for line in reader.lines() {
            if st.load(Ordering::Relaxed) { break; }
            if cancel_rx.try_recv().is_ok() { break; }
            let line = match line { Ok(l) => l, Err(_) => break };
            if total_dur.is_none() { total_dur = parse_duration(&line); }
            if let Some(cur) = parse_progress(&line) {
                if let Some(dur) = total_dur {
                    if dur > 0.0 {
                        let pct = ((cur + po) / (dur + po) * 100.0).min(99.9);
                        if let Ok(mut pm) = state_arc.progress_map.lock() { pm.insert(tid.clone(), pct); }
                    }
                }
            }
            if let Some(spd) = parse_speed(&line) {
                if let Ok(mut pm) = state_arc.progress_map.lock() { pm.insert(format!("{}_speed", tid), spd); }
            }
        }
        if let Ok(mut pm) = state_arc.progress_map.lock() { pm.remove(&tid); pm.remove(&format!("{}_speed", tid)); }
    }).map_err(|e| format!("创建进度线程失败: {}", e))?;

    let status = child.wait().map_err(|e| { tracing::error!(target: "encoder", "FFmpeg 等待失败: {}", e); format!("FFmpeg 等待失败: {}", e) })?;
    stopped.store(true, Ordering::Relaxed);
    {
        let mut pids = ffmpeg_state.paused_pids.lock().map_err(|e| e.to_string())?; pids.remove(&taskId);
    }
    {
        let mut sigs = ffmpeg_state.cancel_signals.lock().map_err(|e| e.to_string())?; sigs.remove(&taskId);
    }

    let conn = db.app.lock().map_err(|e| e.to_string())?;
    if status.success() {
        tracing::info!(target: "encoder", "编码完成: taskId={}, output={}", taskId, output);
        conn.execute("UPDATE processing_tasks SET status='completed',progress=100.0,completed_at=?1,updated_at=?1 WHERE id=?2",
            rusqlite::params![now(), taskId]).ok();
        let _ = conn.execute("INSERT INTO task_logs (id,task_id,level,source,code,message,created_at) VALUES (?1,?2,'info','system','COMPLETED',?3,?4)",
            rusqlite::params![uuid::Uuid::new_v4().to_string(), taskId, format!("编码完成: {}", output), now()]);
    } else {
        let exit_code = status.code().unwrap_or(-1);
        tracing::error!(target: "encoder", "编码失败: taskId={}, 退出码={}", taskId, exit_code);
        conn.execute("UPDATE processing_tasks SET status='failed',error_message=?1,completed_at=?2,updated_at=?2 WHERE id=?3",
            rusqlite::params![format!("FFmpeg 退出码: {}", exit_code), now(), taskId]).ok();
        let _ = conn.execute("INSERT INTO task_logs (id,task_id,level,source,code,message,created_at) VALUES (?1,?2,'error','system','ERROR',?3,?4)",
            rusqlite::params![uuid::Uuid::new_v4().to_string(), taskId, format!("编码失败: 退出码 {}", exit_code), now()]);
    }
    event::emit(&app_handle, event::TASK_UPDATED, serde_json::json!({"taskId": taskId}));
    let _ = progress_thread.join();
    Ok(())
}

#[tauri::command]
pub fn execute_batch_encode_task(
    db: State<DbPool>, ffmpeg_state: State<Arc<FFmpegState>>,
    resource_manager: State<Arc<AppResourceManager>>,
    settings: State<Arc<SettingsCache>>, app_handle: tauri::AppHandle, taskId: String,
) -> Result<(), String> {
    tracing::info!(target: "encoder", "执行批量编码任务: taskId={}", taskId);
    let (source, out_dir, preset) = {
        let conn = db.app.lock().map_err(|e| { tracing::error!(target: "encoder", "批量编码获取数据库连接失败: {}", e); e.to_string() })?;
        let (source, out_dir, pid): (String, String, String) = conn.query_row("SELECT source_path, output_path, preset_id FROM processing_tasks WHERE id=?1",
            rusqlite::params![taskId], |r| Ok((r.get::<_,String>(0)?, r.get::<_,String>(1)?, r.get::<_,String>(2)?)))
            .map_err(|_| { tracing::error!(target: "encoder", "任务不存在: {}", taskId); format!("任务 {} 不存在", taskId) })?;
        if pid.is_empty() { return Err("任务未关联预设".into()); }
        let mut stmt = conn.prepare("SELECT * FROM encoding_presets WHERE id=?1").map_err(|e| e.to_string())?;
        let preset = stmt.query_row(rusqlite::params![pid], crate::repository::presets::row_to)
            .map_err(|_| "预设不存在".to_string())?;
        (source, out_dir, preset)
    };

    let _guard = resource_manager.encode.acquire();
    let output_dir = std::path::Path::new(&out_dir);
    std::fs::create_dir_all(output_dir).map_err(|e| e.to_string())?;
    let ffmpeg_cmd = ffmpeg::resolve_ffmpeg(&settings.map);
    if ffmpeg_cmd.is_empty() { return Err("ffmpeg 未找到".into()); }
    {
        let conn = db.app.lock().map_err(|e| e.to_string())?;
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        conn.execute("UPDATE processing_tasks SET status='running',started_at=COALESCE(started_at,?1),updated_at=?1 WHERE id=?2",
            rusqlite::params![now, taskId]).ok();
    }

    let video_exts = ["ts", "mp4", "mkv", "avi", "mov", "flv", "wmv", "m2ts"];
    let mut files: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&source) {
        for e in entries.flatten() {
            let path = e.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str())
                .map(|e| video_exts.contains(&e.to_lowercase().as_str())).unwrap_or(false) { files.push(path); }
        }
    } else if std::path::Path::new(&source).is_file() {
        files.push(std::path::PathBuf::from(&source));
    }
    files.sort();

    let total = files.len() as i32;
    tracing::info!(target: "encoder", "批量编码: 发现 {} 个文件", total);
    {
        let conn = db.app.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE processing_tasks SET total_files=?1, updated_at=?2 WHERE id=?3",
            rusqlite::params![total, chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(), taskId]).ok();
    }
    if total == 0 {
        let conn = db.app.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE processing_tasks SET status='completed',progress=100.0,completed_at=?1,updated_at=?1 WHERE id=?2",
            rusqlite::params![chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(), taskId]).ok();
        return Ok(());
    }
    {
        let mut cs = ffmpeg_state.cancel_signals.lock().map_err(|e| e.to_string())?;
        let (tx, _) = mpsc::channel::<()>();
        cs.insert(taskId.clone(), tx);
    }

    // 并行编码：使用 scoped threads + 基于 Core 数的并发控制
    let completed = Arc::new(std::sync::atomic::AtomicI32::new(0));
    let failed = Arc::new(std::sync::atomic::AtomicI32::new(0));
    let max_concurrent = std::thread::available_parallelism()
        .map(|n| (n.get() as i32 / 2).max(1)) // CPU 数 / 2，至少 1
        .unwrap_or(2);
    let semaphore = Arc::new(std::sync::atomic::AtomicI32::new(max_concurrent));
    let _db_pool = db.inner();

    let (result_tx, result_rx) = mpsc::channel::<Result<(), String>>();

    // 取消标记
    let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));

    let total_files = files.len();

    // 在 scope 中启动所有编码任务
    std::thread::scope(|s| {
        for f in &files {
            // 检查取消信号（scope 内使用 unwrap，死锁/中毒时 panic 退出）
            let cancel_map = ffmpeg_state.cancel_signals.lock().unwrap();
            if !cancel_map.contains_key(&taskId) { cancelled.store(true, std::sync::atomic::Ordering::Relaxed); break; }
            drop(cancel_map);

            // 等待并发槽（轮询）
            loop {
                if cancelled.load(std::sync::atomic::Ordering::Relaxed) { break; }
                let current = semaphore.load(std::sync::atomic::Ordering::Acquire);
                if current > 0 {
                    if semaphore.compare_exchange(current, current - 1, std::sync::atomic::Ordering::AcqRel, std::sync::atomic::Ordering::Relaxed).is_ok() {
                        break;
                    }
                } else {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }
            if cancelled.load(std::sync::atomic::Ordering::Relaxed) { break; }

            let f = f.clone();
            let ffmpeg_cmd = ffmpeg_cmd.clone();
            let preset = preset.clone();
            let ffmpeg_state = ffmpeg_state.inner().clone();
            let task_id = taskId.clone();
            let output_dir = output_dir.to_path_buf();
            let completed = completed.clone();
            let failed = failed.clone();
            let semaphore = semaphore.clone();
            let cancelled = cancelled.clone();
            let _result_tx = result_tx.clone();

            s.spawn(move || {
                // 释放信号量的 guard：使用 ScopeGuard 确保无论成功/失败都释放
                let sem = SemGuard { inner: &semaphore };

                // 再次检查取消
                {
                    let check = ffmpeg_state.cancel_signals.lock().unwrap();
                    if !check.contains_key(&task_id) { cancelled.store(true, std::sync::atomic::Ordering::Relaxed); return; }
                }

                let stem = f.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
                let out_path = output_dir.join(format!("{}_encoded{}", stem, ".mp4"));

                let args = build_ffmpeg_args(&f.to_string_lossy(), &out_path.to_string_lossy(), &preset);
                let mut cmd = Command::new(&ffmpeg_cmd);
                cmd.args(&args);
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x08000000);
                }
                let status = cmd.status().map_err(|e| {
                    tracing::error!(target: "encoder", "FFmpeg 启动失败: {}", e);
                    format!("FFmpeg 启动失败: {}", e)
                });

                match status {
                    Ok(s) if s.success() => {
                        completed.fetch_add(1, std::sync::atomic::Ordering::Release);
                    }
                    Ok(s) => {
                        failed.fetch_add(1, std::sync::atomic::Ordering::Release);
                        tracing::error!(target: "encoder", "批量编码文件失败: {}, 退出码: {}", f.to_string_lossy(), s.code().unwrap_or(-1));
                        // 在线程中无法安全使用 DB 连接，推迟到主线程统一记录日志
                    }
                    Err(_e) => {
                        failed.fetch_add(1, std::sync::atomic::Ordering::Release);
                    }
                }

                // 更新进度
                let c = completed.load(std::sync::atomic::Ordering::Acquire);
                let fl = failed.load(std::sync::atomic::Ordering::Acquire);
                let pct = ((c + fl) as f64 / total_files as f64) * 100.0;
                if let Ok(mut pm) = ffmpeg_state.progress_map.lock() {
                    pm.insert(task_id.clone(), pct);
                }
                drop(sem);
            });
        }
    });

    let total_completed = completed.load(std::sync::atomic::Ordering::Acquire);
    let total_failed = failed.load(std::sync::atomic::Ordering::Acquire);

    // 等待所有结果并记录错误日志
    drop(result_tx);
    for result in result_rx {
        if let Err(_) = result {}
    }

    // 并行编码完成，统一刷新 DB
    let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    {
        let conn = db.app.lock().map_err(|e| e.to_string())?;
        let final_pct = ((total_completed + total_failed) as f64 / total_files as f64) * 100.0;
        let status = if total_failed > 0 { "failed" } else { "completed" };

        conn.execute(
            "UPDATE processing_tasks SET status=?1,progress=?2,completed_files=?3,failed_files=?4,completed_at=?5,updated_at=?5 WHERE id=?6",
            rusqlite::params![status, final_pct, total_completed, total_failed, now_str, taskId],
        ).ok();
    }

    tracing::info!(target: "encoder", "批量编码完成: taskId={}, 成功={}, 失败={}", taskId, total_completed, total_failed);
    let mut cs = ffmpeg_state.cancel_signals.lock().map_err(|e| e.to_string())?; cs.remove(&taskId);
    event::emit(&app_handle, event::TASK_UPDATED, serde_json::json!({"taskId": taskId}));
    Ok(())
}

/// 前端批量编码：直接调用 ffmpeg 执行编码（简化接口适配前端 BatchPanel 调用）
#[tauri::command]
pub fn encode_video(
    input: String, output: String, codec: String, crf: i32, resolution: String, keepAudio: bool,
) -> Result<(), String> {
    let ffmpeg_path = crate::infra::ffmpeg::find_ffmpeg();
    if ffmpeg_path.is_empty() {
        return Err("未找到 ffmpeg，请先在设置中配置 ffmpeg 路径".into());
    }
    let mut cmd = std::process::Command::new(&ffmpeg_path);
    cmd.arg("-i").arg(&input);
    
    // 分辨率
    if resolution != "original" {
        if resolution == "1080p" {
            cmd.args(["-vf", "scale=-2:1080"]);
        } else if resolution == "720p" {
            cmd.args(["-vf", "scale=-2:720"]);
        } else if resolution == "480p" {
            cmd.args(["-vf", "scale=-2:480"]);
        }
    }
    
    // 编码器
    cmd.args(["-c:v", &codec]);
    cmd.args(["-crf", &crf.to_string()]);
    
    // 音频
    if keepAudio {
        cmd.args(["-c:a", "copy"]);
    } else {
        cmd.args(["-an"]);
    }
    
    cmd.arg("-y").arg(&output);
    
    tracing::info!(target: "encoder", "编码视频: {} → {} (codec={}, crf={})", input, output, codec, crf);
    
    let status = cmd.status().map_err(|e| format!("启动 ffmpeg 失败: {}", e))?;
    if !status.success() {
        return Err(format!("ffmpeg 编码失败: {:?}", status.code()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use crate::domain::preset::BitrateMode;

    // 使用临时目录避免权限问题
    fn get_test_dir() -> PathBuf {
        std::env::temp_dir().join("video_toolbox_test")
    }
    
    fn get_output_dir() -> PathBuf {
        std::env::temp_dir().join("video_toolbox_test_output")
    }
    
    const FFMPEG_CMD: &str = "ffmpeg";

    fn test_preset() -> EncodingPreset {
        EncodingPreset {
            id: "test".into(),
            name: "测试预设".into(),
            description: "".into(),
            encoder_type: "libx264".into(),
            encoder_brand: "Software".into(),
            profile: "high".into(),
            encoder_level: "".into(),
            width: 640,
            height: 360,
            pix_fmt: "yuv420p".into(),
            video_bitrate: "".into(),
            max_bitrate: "".into(),
            fps: "".into(),
            time_base: "".into(),
            encoder_tag: "".into(),
            bitrate_mode: BitrateMode::Crf,
            crf_value: "28".into(),
            min_crf: String::new(),
            max_crf: String::new(),
            resolution_mode: String::new(),
            fps_mode: String::new(),
            preset: "veryfast".into(),
            tune: "".into(),
            audio_codec: "aac".into(),
            audio_sample_rate: "44100".into(),
            audio_channels: "2".into(),
            channel_layout: "stereo".into(),
            audio_profile: "".into(),
            audio_bitrate: "128k".into(),
            audio_volume: "100".into(),
            output_format: "mp4".into(),
            output_suffix: "_encoded".into(),
            is_default: false,
            is_builtin: false,
            created_at: "".into(),
            updated_at: "".into(),
        }
    }

    fn collect_videos(dir: &str) -> Vec<PathBuf> {
        let mut files = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    files.extend(collect_videos(&path.to_string_lossy()));
                } else if let Some(ext) = path.extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if ["mp4", "mkv", "avi", "mov", "flv", "wmv"].contains(&ext.as_str()) {
                        files.push(path);
                    }
                }
            }
        }
        files.sort();
        files
    }

    #[test]
    fn test_encode_pipeline() {
        let test_dir = get_test_dir();
        let out_dir = get_output_dir();
        
        // 创建测试目录和输出目录
        std::fs::create_dir_all(&test_dir).expect("创建测试目录失败");
        std::fs::create_dir_all(&out_dir).expect("创建输出目录失败");

        let videos = collect_videos(test_dir.to_str().unwrap());
        if videos.is_empty() {
            println!("\n⚠️  跳过编码管道测试: 测试目录中未找到视频文件");
            println!("  测试目录: {}", test_dir.display());
            println!("  请在测试目录中放置一些视频文件后重新运行测试\n");
            return;
        }
        
        println!("\n═══════════════════════════════════════");
        println!("  编码管道集成测试");
        println!("  测试目录: {}", test_dir.display());
        println!("  输出目录: {}", out_dir.display());
        println!("  发现 {} 个视频文件", videos.len());
        println!("═══════════════════════════════════════\n");

        let preset = test_preset();
        let mut passed = 0u32;
        let mut failed = 0u32;

        for (i, video) in videos.iter().enumerate() {
            let input = video.to_string_lossy();
            let stem = video.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");
            let output = out_dir.join(format!("{}_encoded.mp4", stem));
            let output_str = output.to_string_lossy().to_string();

            print!("  [{}/{}] {} ... ", i + 1, videos.len(), stem);
            std::io::Write::flush(&mut std::io::stdout()).ok();

            let args = build_ffmpeg_args(&input, &output_str, &preset);

            if !video.exists() {
                println!("✗ 输入不存在");
                failed += 1;
                continue;
            }

            let start = std::time::Instant::now();
            let status = Command::new(FFMPEG_CMD)
                .args(&args)
                .stdout(std::io::stdout())
                .stderr(std::process::Stdio::null())
                .status();

            match status {
                Ok(s) if s.success() => {
                    let elapsed = start.elapsed();
                    let size_mb = std::fs::metadata(&output).map(|m| m.len() as f64 / 1_048_576.0).unwrap_or(0.0);
                    println!("✓ ({:.1}s, {:.1}MB)", elapsed.as_secs_f64(), size_mb);
                    passed += 1;
                }
                Ok(s) => {
                    println!("✗ ffmpeg 退出码 {}", s.code().unwrap_or(-1));
                    failed += 1;
                }
                Err(e) => {
                    println!("✗ 启动 ffmpeg 失败: {}", e);
                    failed += 1;
                }
            }
        }

        println!("\n═══════════════════════════════════════");
        println!("  测试结果");
        println!("  总计: {}", videos.len());
        println!("  通过: {}", passed);
        println!("  失败: {}", failed);
        println!("  输出目录: {}", out_dir.display());
        if failed > 0 {
            println!("\n  ⚠ 有 {} 个编码任务失败", failed);
        } else {
            println!("\n  ✓ 全部通过");
        }
        println!("═══════════════════════════════════════\n");

        assert!(passed > 0, "所有编码任务均失败，请检查 ffmpeg 是否可用");
    }

    #[test]
    fn test_build_ffmpeg_args() {
        let preset = test_preset();
        let args = build_ffmpeg_args("input.mp4", "output.mp4", &preset);

        assert!(args.contains(&"-i".into()));
        assert!(args.contains(&"input.mp4".into()));
        assert!(args.contains(&"-c:v".into()));
        assert!(args.contains(&"libx264".into()));
        assert!(args.contains(&"-preset".into()));
        assert!(args.contains(&"veryfast".into()));
        assert!(args.contains(&"-crf".into()));
        assert!(args.contains(&"28".into()));
        assert!(args.contains(&"-vf".into()));
        assert!(args.contains(&"scale=640:360".into()));
        assert!(args.contains(&"-c:a".into()));
        assert!(args.contains(&"aac".into()));
        assert!(args.contains(&"-y".into()));
        assert!(args.contains(&"output.mp4".into()));

        println!("ffmpeg args 测试通过: {}", args.join(" "));
    }
}
