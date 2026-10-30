//! Opening at login, quietly: the timer belongs in the menu bar from the
//! moment the Mac starts, without a window in the way. On Windows the same
//! plugin writes the registry's Run key instead.

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Wry};
#[cfg(target_os = "macos")]
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;

/// Passed by the login item, so a launch at login stays in the menu bar.
const HIDDEN: &str = "--hidden";

pub fn plugin() -> TauriPlugin<Wry> {
    let builder = tauri_plugin_autostart::Builder::new();
    #[cfg(target_os = "macos")]
    let builder = builder.macos_launcher(MacosLauncher::LaunchAgent);
    builder.args([HIDDEN]).build()
}

pub fn launched_hidden() -> bool {
    std::env::args().any(|arg| arg == HIDDEN)
}

/// Settings decides; the frontend calls this at launch and on every change.
pub fn set(app: &AppHandle, on: bool) {
    // A dev build would register target/debug as the thing to open at login.
    if cfg!(debug_assertions) {
        return;
    }
    let manager = app.autolaunch();
    if manager.is_enabled().unwrap_or(false) == on {
        return;
    }
    let _ = if on { manager.enable() } else { manager.disable() };
}
