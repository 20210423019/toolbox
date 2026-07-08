use tauri::Window;

#[tauri::command]
pub fn minimize_window(window: Window) { let _ = window.minimize(); }

#[tauri::command]
pub fn maximize_window(window: Window) {
    if window.is_maximized().unwrap_or(false) { let _ = window.unmaximize(); }
    else { let _ = window.maximize(); }
}

#[tauri::command]
pub fn is_maximized(window: Window) -> bool { window.is_maximized().unwrap_or(false) }

#[tauri::command]
pub fn close_window(window: Window) { let _ = window.close(); }

#[tauri::command]
pub fn toggle_fullscreen(window: Window) {
    if window.is_fullscreen().unwrap_or(false) { let _ = window.set_fullscreen(false); }
    else { let _ = window.set_fullscreen(true); }
}

#[tauri::command]
pub fn start_dragging(window: Window) { let _ = window.start_dragging(); }

#[tauri::command]
pub fn toggle_always_on_top(window: Window, current: bool) -> bool {
    let new = !current;
    let _ = window.set_always_on_top(new);
    new
}
