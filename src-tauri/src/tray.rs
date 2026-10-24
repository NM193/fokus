//! The menu bar icon: the time left beside it, and a menu to run the timer
//! without opening the window.
//!
//! The menu never runs the timer itself. It sends the window a command, so
//! the window, the mini timer and the menu all go through one code path. A
//! new version is the same: the window finds it and installs it, the menu
//! only offers it, for a window that is never opened.

use std::sync::Mutex;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

use crate::{shortcut, widget};

const TRAY_ID: &str = "fokus";
const MENU_TOGGLE: &str = "toggle";
const MENU_SKIP: &str = "skip";
const MENU_WIDGET: &str = "widget";
const MENU_OPEN: &str = "open";
const MENU_QUIT: &str = "quit";
const MENU_UPDATE: &str = "update";

// Baked into the binary: the resource directory differs between `tauri dev`
// and a bundled app, and an icon that fails to load leaves no menu bar item.
// Drawn by scripts/make-assets.py.
const TRAY_PNG: &[u8] = include_bytes!("../icons/tray.png");

/// What the menu shows beside its fixed items.
#[derive(Default)]
pub struct State(Mutex<Shown>);

#[derive(Default, Clone)]
struct Shown {
    running: bool,
    /// A newer version the window found (UpdateNotice).
    update: Option<String>,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(TRAY_PNG)?)
        // Template images are recoloured by macOS, so the icon stays legible
        // in a light menu bar and a dark one.
        .icon_as_template(true)
        .menu(&menu(app, &Shown::default())?)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .build(app)?;
    Ok(())
}

fn menu(app: &AppHandle, shown: &Shown) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    if let Some(version) = &shown.update {
        let label = format!("Update to Fokus {version}");
        menu.append(&MenuItem::with_id(app, MENU_UPDATE, label, true, None::<&str>)?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    let label = if shown.running { "Pause" } else { "Start" };
    // The accelerator only labels the item: the shortcut itself is global
    // (shortcut.rs) and works without the menu open.
    menu.append(&MenuItem::with_id(app, MENU_TOGGLE, label, true, Some(shortcut::ACCELERATOR))?)?;
    menu.append(&MenuItem::with_id(app, MENU_SKIP, "Skip to next", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, MENU_WIDGET, "Mini timer", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, MENU_OPEN, "Open Fokus", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, MENU_QUIT, "Quit Fokus", true, None::<&str>)?)?;
    Ok(menu)
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        MENU_TOGGLE | MENU_SKIP => {
            let _ = app.emit_to("main", "fokus://command", id);
        }
        MENU_WIDGET => widget::toggle(app),
        MENU_OPEN => show_main(app),
        // The window shows the download, and the restart that follows is no surprise.
        MENU_UPDATE => {
            show_main(app);
            let _ = app.emit_to("main", "fokus://update", ());
        }
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

/// Start becomes Pause and back. Only rebuilt when that flips, not per tick.
pub fn refresh(app: &AppHandle, running: bool) {
    change(app, |shown| shown.running = running);
}

/// A newer version to offer at the top of the menu, or none.
pub fn set_update(app: &AppHandle, update: Option<String>) {
    change(app, |shown| shown.update = update);
}

fn change(app: &AppHandle, edit: impl FnOnce(&mut Shown)) {
    let shown = match app.state::<State>().0.lock() {
        Ok(mut shown) => {
            edit(&mut shown);
            shown.clone()
        }
        Err(_) => return,
    };
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), menu(app, &shown)) {
        let _ = tray.set_menu(Some(menu));
    }
}

pub fn set_title(app: &AppHandle, title: &str) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(if title.is_empty() { None } else { Some(title) });
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
