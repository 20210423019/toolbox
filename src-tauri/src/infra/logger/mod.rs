use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use std::io;

pub fn init(data_dir: &str) {
    let log_dir = std::path::Path::new(data_dir).join("logs");
    std::fs::create_dir_all(&log_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&log_dir, "app.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    let filter = EnvFilter::from_default_env()
        .add_directive("info".parse().unwrap())
        .add_directive("tao=error".parse().unwrap());

    let stdout_layer = fmt::layer()
        .with_writer(io::stdout)
        .with_target(true)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false)
        .with_ansi(true)
        .with_filter(filter.clone());

    let file_layer = fmt::layer()
        .json()
        .with_writer(non_blocking)
        .with_filter(filter);

    tracing_subscriber::registry()
        .with(stdout_layer)
        .with(file_layer)
        .init();

    std::mem::forget(_guard);
}
