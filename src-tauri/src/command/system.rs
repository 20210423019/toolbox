use serde::Serialize;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, System};

#[derive(Serialize)]
pub struct SystemMetrics {
    cpu_usage: f64, memory_used: u64, memory_total: u64, memory_percent: f64,
    processes: u32, uptime_secs: u64,
}

thread_local! {
    static SYS: std::cell::RefCell<Option<System>> = const { std::cell::RefCell::new(None) };
}

#[tauri::command]
pub fn get_system_metrics() -> SystemMetrics {
    SYS.with(|cache| {
        let mut sys = cache.borrow_mut();
        if sys.is_none() {
            let mut s = System::new();
            s.refresh_cpu_specifics(CpuRefreshKind::everything());
            std::thread::sleep(std::time::Duration::from_millis(200));
            s.refresh_cpu_specifics(CpuRefreshKind::everything());
            *sys = Some(s);
        }
        if let Some(ref mut s) = *sys {
            s.refresh_cpu_specifics(CpuRefreshKind::everything());
            s.refresh_memory_specifics(MemoryRefreshKind::everything());
            SystemMetrics {
                cpu_usage: s.global_cpu_usage() as f64,
                memory_used: s.used_memory(),
                memory_total: s.total_memory(),
                memory_percent: if s.total_memory() > 0 { (s.used_memory() as f64 / s.total_memory() as f64) * 100.0 } else { 0.0 },
                processes: s.processes().len() as u32,
                uptime_secs: System::uptime(),
            }
        } else {
            SystemMetrics { cpu_usage: 0.0, memory_used: 0, memory_total: 0, memory_percent: 0.0, processes: 0, uptime_secs: 0 }
        }
    })
}
