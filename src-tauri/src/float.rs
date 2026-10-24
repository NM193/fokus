//! What the mini timer, the end-of-phase card and its effect have in common:
//! windows that float over everything, full-screen apps too, and never jump.
//!
//! On the Mac they are NSPanels rather than windows: only a panel that does
//! not activate its app may float over another app's full screen. Clicking
//! one also leaves whatever app you are in in front.

use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager};

/// Every change of a floating window -- growing, shrinking, fading -- takes
/// this long on this curve. Their pages move with the same (`--glide` and
/// `--ease` in styles.css): change both.
pub const GLIDE: Duration = Duration::from_millis(320);
#[cfg(target_os = "macos")]
const EASE: [f32; 4] = [0.2, 0.8, 0.2, 1.0];
/// Their corners, the same as the glass's (glass.rs).
#[cfg(target_os = "macos")]
const RADIUS: f64 = 14.0;

#[cfg(target_os = "macos")]
tauri_nspanel::tauri_panel! {
    panel!(FloatPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
    })
}

/// Makes a freshly built, hidden window a floating panel. With `rim` it is cut
/// to the glass's corners and rimmed like it, whatever part of its page
/// shows. It stays fully transparent until `reveal`.
#[cfg(target_os = "macos")]
pub fn to_panel(window: &tauri::WebviewWindow, rim: bool) -> tauri::Result<()> {
    use tauri_nspanel::objc2_app_kit::NSColor;
    use tauri_nspanel::{CollectionBehavior, PanelLevel, StyleMask, WebviewWindowExt};

    let panel = window.to_panel::<FloatPanel>()?;
    panel.set_level(PanelLevel::Floating.value());
    // A panel that activated Fokus would pull you out of a full-screen app.
    let _ = panel.add_style_mask(StyleMask::empty().nonactivating_panel().into());
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .can_join_all_spaces()
            .full_screen_auxiliary()
            .into(),
    );
    panel.set_hides_on_deactivate(false);
    panel.set_alpha_value(0.0);
    if !rim {
        return Ok(());
    }

    let content = panel.content_view();
    content.setWantsLayer(true);
    if let Some(layer) = content.layer() {
        layer.setCornerRadius(RADIUS);
        layer.setMasksToBounds(true);
        layer.setBorderWidth(1.0);
        let rim = NSColor::colorWithWhite_alpha(1.0, 0.4).CGColor();
        // Sent by hand: the typed setter is behind a feature nothing here enables.
        let _: () = unsafe { tauri_nspanel::objc2::msg_send![&layer, setBorderColor: &*rim] };
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn to_panel(_: &tauri::WebviewWindow, _: bool) -> tauri::Result<()> {
    Ok(())
}

/// Shows a floating window, fading in to `alpha`.
pub fn reveal(app: &AppHandle, label: &str, alpha: f64) {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel(label) {
            panel.show();
        }
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
    }
    fade(app, label, alpha);
}

/// Steps in the fade before a close.
const CLOSE_STEPS: u32 = 16;
/// After the fade, before the close: any glide begun just before it is over.
const SETTLE: Duration = Duration::from_millis(80);

/// Fades a floating window out, then closes it.
///
/// This fade is stepped by hand, not left to AppKit's animator. AppKit
/// watches a property while it animates it (KVO), and before closing the
/// panel turns back into Tauri's own kind of window (`to_window`); a watch
/// still on it then throws, and the app goes down with it.
pub fn close(app: &AppHandle, label: &'static str) {
    let from = alpha(app, label);
    let handle = app.clone();
    thread::spawn(move || {
        for step in 1..=CLOSE_STEPS {
            thread::sleep(GLIDE / CLOSE_STEPS);
            // Ease out, near enough EASE.
            let t = f64::from(step) / f64::from(CLOSE_STEPS);
            let left = from * (1.0 - t).powi(3);
            let app = handle.clone();
            let _ = handle.run_on_main_thread(move || set_alpha(&app, label, left));
        }
        thread::sleep(SETTLE);
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            // The panel goes back to being Tauri's window first: Tauri owns it
            // and releases it on close.
            #[cfg(target_os = "macos")]
            {
                use tauri_nspanel::ManagerExt;
                if let Some(window) = app.get_webview_panel(label).ok().and_then(|p| p.to_window()) {
                    let _ = window.close();
                    return;
                }
            }
            if let Some(window) = app.get_webview_window(label) {
                let _ = window.close();
            }
        });
    });
}

#[cfg(target_os = "macos")]
fn alpha(app: &AppHandle, label: &str) -> f64 {
    use tauri_nspanel::ManagerExt;
    app.get_webview_panel(label).map(|panel| panel.as_panel().alphaValue()).unwrap_or(1.0)
}

#[cfg(not(target_os = "macos"))]
fn alpha(_: &AppHandle, _: &str) -> f64 {
    1.0
}

/// At once, with no animator watching.
#[cfg(target_os = "macos")]
fn set_alpha(app: &AppHandle, label: &str, alpha: f64) {
    use tauri_nspanel::ManagerExt;
    if let Ok(panel) = app.get_webview_panel(label) {
        panel.set_alpha_value(alpha);
    }
}

#[cfg(not(target_os = "macos"))]
fn set_alpha(_: &AppHandle, _: &str, _: f64) {}

/// 0 to 1, the whole window: glass, text and shadow.
#[cfg(target_os = "macos")]
pub fn fade(app: &AppHandle, label: &str, alpha: f64) {
    use tauri_nspanel::objc2_app_kit::NSAnimatablePropertyContainer;
    use tauri_nspanel::ManagerExt;

    if let Ok(panel) = app.get_webview_panel(label) {
        let window = panel.as_panel();
        glide(|| window.animator().setAlphaValue(alpha));
    }
}

#[cfg(not(target_os = "macos"))]
pub fn fade(_: &AppHandle, _: &str, _: f64) {}

/// Runs `change` as one glide: AppKit animates whatever a window's animator
/// is asked to do in it.
#[cfg(target_os = "macos")]
pub fn glide(change: impl FnOnce()) {
    use tauri_nspanel::objc2::runtime::{AnyObject, MessageReceiver};
    use tauri_nspanel::objc2::{class, msg_send, sel};
    use tauri_nspanel::objc2_app_kit::NSAnimationContext;

    NSAnimationContext::beginGrouping();
    let context = NSAnimationContext::currentContext();
    context.setDuration(GLIDE.as_secs_f64());
    // msg_send! cannot spell a selector with unnamed parts.
    let [a, b, c, d] = EASE;
    let curve: *mut AnyObject = unsafe {
        class!(CAMediaTimingFunction).send_message(sel!(functionWithControlPoints::::), (a, b, c, d))
    };
    if !curve.is_null() {
        let _: () = unsafe { msg_send![&context, setTimingFunction: curve] };
    }
    change();
    NSAnimationContext::endGrouping();
}
