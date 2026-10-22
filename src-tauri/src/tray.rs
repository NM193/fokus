//! The menu bar icon: the time left beside it, and a menu to run the timer
//! without opening the window.
//!
//! The menu never runs the timer itself. It sends the window a command, so
//! the window, the mini timer and the menu all go through one code path.

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

// Baked into the binary: the resource directory differs between `tauri dev`
// and a bundled app, and an icon that fails to load leaves no menu bar item.
// Drawn by scripts/make-assets.py.
const TRAY_PNG: &[u8] = include_bytes!("../icons/tray.png");

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(TRAY_PNG)?)
        // Template images are recoloured by macOS, so the icon stays legible
        // in a light menu bar and a dark one.
        .icon_as_template(true)
        .menu(&menu(app, false)?)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .build(app)?;
    Ok(())
}

fn menu(app: &AppHandle, running: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    let label = if running { "Pause" } else { "Start" };
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
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

/// Start becomes Pause and back. Only rebuilt when that flips, not per tick.
pub fn refresh(app: &AppHandle, running: bool) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), menu(app, running)) {
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
