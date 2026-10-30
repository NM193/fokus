//! The mini timer: a small glass window that floats over everything.
//!
//! It loads the same frontend as the main window; src/main.tsx sees the
//! window's label and renders only the widget. It holds no timer of its own --
//! the main window sends it state and takes its commands as events.
//! It floats over everything (float.rs).
//!
//! Nothing about it jumps: it fades in and out, and grows and shrinks in one
//! glide. Its page never changes size on the way: it is laid out once, at
//! full size, and pinned to the corner the window grows from (`pin_page`), so
//! the window only uncovers more or less of it. A web view that is resized
//! redraws a frame or two late, and its content shakes.

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::float::{self, GLIDE};
use crate::glass;

pub const LABEL: &str = "widget";
/// From the screen's right edge, and down from the top past the menu bar.
const MARGIN: f64 = 24.0;
const TOP: f64 = 44.0;
/// How often the pointer is looked for over the widget.
const POLL: Duration = Duration::from_millis(100);
/// Polls the pointer has to stay off before the widget shrinks back: one
/// passing the edge should not pull it out from under itself.
const LINGER: u8 = 4;
/// Shown even if its page never says it is ready.
const REVEAL_ANYWAY: Duration = Duration::from_millis(1500);

/// How the widget sits on screen. Settings decides (the frontend works out
/// the size from what the widget shows); the frontend calls `set_look` at
/// launch and on every change.
#[derive(Clone, Copy)]
pub struct Look {
    pub width: f64,
    pub height: f64,
    /// 0 to 1, the whole window: glass, text and shadow.
    pub opacity: f64,
    /// Set when the widget shows only the time until the pointer is over it:
    /// the size it shrinks to then.
    pub idle: Option<(f64, f64)>,
}

/// What the widget's page needs to move in step with its window. Sent as
/// `fokus://widget-place` whenever it changes.
#[derive(Clone, Copy, PartialEq, Serialize)]
struct Place {
    /// The pointer is over it.
    over: bool,
    /// The corner it grows from and shrinks back to: the one nearest the
    /// screen's edges, so it stays where it was put, and on screen.
    right: bool,
    top: bool,
}

pub struct State(Mutex<Inner>);

struct Inner {
    look: Look,
    place: Place,
    /// Polls in a row the pointer has been off it.
    away: u8,
    /// The window glides until then, so where it is now says nothing about
    /// where it was put.
    settles: Instant,
    /// It opens hidden and is shown once its page is ready.
    shown: bool,
    /// Fading out, on its way to closing.
    closing: bool,
}

impl Inner {
    fn size(&self) -> (f64, f64) {
        match self.look.idle {
            Some(idle) if !self.place.over => idle,
            _ => (self.look.width, self.look.height),
        }
    }
}

const HOME: Place = Place { over: false, right: true, top: true };

impl Default for State {
    fn default() -> Self {
        let look = Look { width: 240.0, height: 72.0, opacity: 1.0, idle: None };
        Self(Mutex::new(Inner {
            look,
            place: HOME,
            away: 0,
            settles: Instant::now(),
            shown: false,
            closing: false,
        }))
    }
}

pub fn toggle(app: &AppHandle) {
    if is_open(app) {
        close(app);
        return;
    }
    if open(app).is_ok() {
        let _ = app.emit("fokus://widget", true);
    }
}

pub fn is_open(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL).is_some()
}

pub fn set_look(app: &AppHandle, look: Look) {
    let state = app.state::<State>();
    let (from, to, place, fade_to, page) = {
        let mut inner = state.0.lock().unwrap();
        let from = inner.size();
        let fade = inner.look.opacity != look.opacity && inner.shown && !inner.closing;
        let page = inner.look.width != look.width || inner.look.height != look.height;
        inner.look = look;
        let to = inner.size();
        if from != to {
            inner.settles = Instant::now() + GLIDE;
        }
        (from, to, inner.place, fade.then_some(look.opacity), page)
    };
    // A closing widget is left alone: no glide may start on it (float::close).
    if !is_open(app) || state.0.lock().unwrap().closing {
        return;
    }
    if page {
        pin_page(app, (look.width, look.height), place);
    }
    if from != to {
        resize(app, to, place);
    }
    if let Some(opacity) = fade_to {
        float::fade(app, LABEL, opacity.clamp(0.2, 1.0));
    }
}

/// Watches for the pointer over the widget, for as long as the app runs. The
/// widget's web view cannot tell by itself: macOS sends hover only to the
/// window in front, and the widget is rarely that.
pub fn watch(app: AppHandle) {
    let handle = app.clone();
    app.listen("fokus://widget-ready", move |_| {
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || reveal(&app));
    });
    thread::spawn(move || loop {
        thread::sleep(POLL);
        if is_open(&app) {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || check(&handle));
        }
    });
}

/// On the main thread: AppKit's windows live there.
fn check(app: &AppHandle) {
    let Some(inside) = pointer_inside(app) else {
        return;
    };
    let state = app.state::<State>();
    let (place, resize_to, full, moved) = {
        let mut inner = state.0.lock().unwrap();
        if !inner.shown || inner.closing {
            return;
        }
        let before = inner.place;
        inner.away = if inside { 0 } else { inner.away.saturating_add(1) };
        let over = inside || (before.over && inner.away < LINGER);
        // The corner is read only while it sits small and still: read while it
        // glides, it would wander off a little with every grow and shrink.
        let (right, top) = if !over && !before.over && Instant::now() >= inner.settles {
            corner(app).unwrap_or((before.right, before.top))
        } else {
            (before.right, before.top)
        };
        let place = Place { over, right, top };
        if place == before {
            return;
        }
        let from = inner.size();
        inner.place = place;
        let to = inner.size();
        if from != to {
            inner.settles = Instant::now() + GLIDE;
        }
        let moved = (right, top) != (before.right, before.top);
        (place, (from != to).then_some(to), (inner.look.width, inner.look.height), moved)
    };
    if moved {
        pin_page(app, full, place);
    }
    let _ = app.emit_to(LABEL, "fokus://widget-place", place);
    if let Some(size) = resize_to {
        resize(app, size, place);
    }
}

fn open(app: &AppHandle) -> tauri::Result<()> {
    let state = app.state::<State>();
    let ((width, height), full) = {
        let mut inner = state.0.lock().unwrap();
        inner.place = HOME;
        inner.away = 0;
        inner.shown = false;
        inner.closing = false;
        (inner.size(), (inner.look.width, inner.look.height))
    };
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Fokus")
        .inner_size(width, height)
        .resizable(false)
        .decorations(false)
        // Windows has no glass behind it: its page paints the paper, and
        // Windows rounds the corners (frame.rs).
        .transparent(cfg!(not(windows)))
        .shadow(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .visible(false)
        .theme(Some(tauri::Theme::Light));

    // Top right of the main screen, where a glance goes anyway.
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
        builder = builder.position(size.width - width - MARGIN, TOP);
    }

    let window = builder.build()?;
    glass::float(&window);
    #[cfg(windows)]
    crate::frame::round(&window);
    float::to_panel(&window, true)?;
    pin_page(app, full, HOME);

    // It is shown when its page says it is ready (`watch`), so it never fades
    // in empty; or after a while regardless.
    let handle = app.clone();
    thread::spawn(move || {
        thread::sleep(REVEAL_ANYWAY);
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || reveal(&app));
    });
    Ok(())
}

/// Lays the page out at the widget's full size and pins it to `place`'s
/// corner. AppKit then keeps it there as the window grows and shrinks.
#[cfg(target_os = "macos")]
fn pin_page(app: &AppHandle, (width, height): (f64, f64), place: Place) {
    use tauri_nspanel::objc2::runtime::AnyClass;
    use tauri_nspanel::objc2_app_kit::NSAutoresizingMaskOptions as Mask;
    use tauri_nspanel::objc2_foundation::NSObjectProtocol;
    use tauri_nspanel::{ManagerExt, NSPoint, NSRect, NSSize};

    let Ok(panel) = app.get_webview_panel(LABEL) else {
        return;
    };
    let Some(web_view) = AnyClass::get(c"WKWebView") else {
        return;
    };
    let content = panel.content_view();
    let Some(page) = content.subviews().iter().find(|view| view.isKindOfClass(web_view)) else {
        return;
    };
    let bounds = content.bounds();
    // AppKit's y goes up: the top is the far end. The flexible margin is the
    // one away from the corner.
    let x = if place.right { bounds.size.width - width } else { 0.0 };
    let y = if place.top { bounds.size.height - height } else { 0.0 };
    let across = if place.right { Mask::ViewMinXMargin } else { Mask::ViewMaxXMargin };
    let down = if place.top { Mask::ViewMinYMargin } else { Mask::ViewMaxYMargin };
    page.setAutoresizingMask(across | down);
    page.setFrame(NSRect::new(NSPoint::new(x, y), NSSize::new(width, height)));
}

#[cfg(not(target_os = "macos"))]
fn pin_page(_: &AppHandle, _: (f64, f64), _: Place) {}

/// Shows the widget, fading in. Once per opening, whichever comes first: its
/// page being ready or the wait running out.
fn reveal(app: &AppHandle) {
    let state = app.state::<State>();
    let opacity = {
        let mut inner = state.0.lock().unwrap();
        if inner.shown || inner.closing || !is_open(app) {
            return;
        }
        inner.shown = true;
        inner.look.opacity.clamp(0.2, 1.0)
    };
    float::reveal(app, LABEL, opacity);
}

/// Fades the widget out, then closes it.
fn close(app: &AppHandle) {
    {
        let state = app.state::<State>();
        let mut inner = state.0.lock().unwrap();
        if inner.closing {
            return;
        }
        inner.closing = true;
    }
    float::close(app, LABEL);
}

#[cfg(target_os = "macos")]
fn resize(app: &AppHandle, (width, height): (f64, f64), place: Place) {
    use tauri_nspanel::objc2_app_kit::NSAnimatablePropertyContainer;
    use tauri_nspanel::{ManagerExt, NSRect, NSSize};

    let Ok(panel) = app.get_webview_panel(LABEL) else {
        return;
    };
    let window = panel.as_panel();
    let frame = window.frame();
    // AppKit's origin is the bottom left, with y going up.
    let mut origin = frame.origin;
    if place.right {
        origin.x += frame.size.width - width;
    }
    if place.top {
        origin.y += frame.size.height - height;
    }
    let to = NSRect::new(origin, NSSize::new(width, height));
    float::glide(|| window.animator().setFrame_display(to, true));
}

/// At once, keeping the corner it grows from where it is. Screen y goes down.
#[cfg(not(target_os = "macos"))]
fn resize(app: &AppHandle, (width, height): (f64, f64), place: Place) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let (Ok(origin), Ok(size), Ok(scale)) = (window.outer_position(), window.outer_size(), window.scale_factor())
    else {
        return;
    };
    let to = tauri::LogicalSize::new(width, height).to_physical::<i32>(scale);
    let mut at = origin;
    if place.right {
        at.x += size.width as i32 - to.width;
    }
    if !place.top {
        at.y += size.height as i32 - to.height;
    }
    let _ = window.set_position(at);
    let _ = window.set_size(to);
}

#[cfg(target_os = "macos")]
fn pointer_inside(app: &AppHandle) -> Option<bool> {
    use tauri_nspanel::ManagerExt;

    let panel = app.get_webview_panel(LABEL).ok()?;
    let window = panel.as_panel();
    let size = window.frame().size;
    let at = window.mouseLocationOutsideOfEventStream();
    Some(at.x >= 0.0 && at.y >= 0.0 && at.x < size.width && at.y < size.height)
}

#[cfg(not(target_os = "macos"))]
fn pointer_inside(app: &AppHandle) -> Option<bool> {
    let window = app.get_webview_window(LABEL)?;
    let at = app.cursor_position().ok()?;
    let origin = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let (left, top) = (origin.x as f64, origin.y as f64);
    Some(at.x >= left && at.y >= top && at.x < left + size.width as f64 && at.y < top + size.height as f64)
}

/// Which corner of its screen the widget is nearest: (right, top).
#[cfg(target_os = "macos")]
fn corner(app: &AppHandle) -> Option<(bool, bool)> {
    use tauri_nspanel::ManagerExt;

    let panel = app.get_webview_panel(LABEL).ok()?;
    let window = panel.as_panel();
    let frame = window.frame();
    let screen = window.screen()?.frame();
    Some((
        frame.origin.x + frame.size.width / 2.0 > screen.origin.x + screen.size.width / 2.0,
        frame.origin.y + frame.size.height / 2.0 > screen.origin.y + screen.size.height / 2.0,
    ))
}

/// Screen y goes down here: the top half is the smaller y.
#[cfg(not(target_os = "macos"))]
fn corner(app: &AppHandle) -> Option<(bool, bool)> {
    let window = app.get_webview_window(LABEL)?;
    let origin = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let screen = window.current_monitor().ok()??;
    let middle = |start: i32, length: u32| start as f64 + length as f64 / 2.0;
    let (at, area) = (screen.position(), screen.size());
    Some((
        middle(origin.x, size.width) > middle(at.x, area.width),
        middle(origin.y, size.height) < middle(at.y, area.height),
    ))
}
