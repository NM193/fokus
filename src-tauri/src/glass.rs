//! The frosted windows, taken from Tzz.
//!
//! macOS paints a blurred copy of whatever is behind the window. Both windows
//! are always transparent; with the glass off, the frontend simply paints an
//! opaque background over the main one. The windows are forced to the light
//! appearance (tauri.conf.json, widget.rs) so the blur stays pale under the
//! pastel tint even when the Mac is in dark mode.

use tauri::{AppHandle, Manager, WebviewWindow};

/// Turn the main window's glass on or off. Settings decides; the frontend
/// calls this at launch and on every change.
pub fn main(app: &AppHandle, glass: bool) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{
            apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
        };
        // Failing either way means a plain window: never a reason to refuse
        // to start, and never a reason to fail the command.
        if glass {
            let _ = apply_vibrancy(
                &window,
                NSVisualEffectMaterial::UnderWindowBackground,
                Some(NSVisualEffectState::Active),
                Some(18.0),
            );
        } else {
            let _ = clear_vibrancy(&window);
        }
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (window, glass);
}

/// The floating windows -- the mini timer, the end-of-phase card -- are always
/// glass: they have no other look.
pub fn float(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
        // Active even when another app is in front, which is the whole time.
        let _ = apply_vibrancy(
            window,
            NSVisualEffectMaterial::Popover,
            Some(NSVisualEffectState::Active),
            // The same as the window's own corners (float.rs).
            Some(14.0),
        );
    }

    #[cfg(not(target_os = "macos"))]
    let _ = window;
}
