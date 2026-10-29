// Everything here but the notifications is the Mac's (and later a desktop's):
// on a phone Fokus is its web view and the phone's notifications
// (src/lib/usePhone.ts).
#[cfg(desktop)]
mod alert;
#[cfg(desktop)]
mod chime;
#[cfg(desktop)]
mod clock;
#[cfg(desktop)]
mod commands;
#[cfg(desktop)]
mod effect;
#[cfg(desktop)]
mod float;
#[cfg(desktop)]
mod glass;
#[cfg(desktop)]
mod login;
#[cfg(desktop)]
mod shortcut;
#[cfg(desktop)]
mod tray;
#[cfg(desktop)]
mod widget;

#[cfg(desktop)]
use tauri::{Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(mobile)]
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("failed to start the app");

    #[cfg(desktop)]
    desktop();
}

#[cfg(desktop)]
fn desktop() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    builder
        .manage(clock::Clock::default())
        .manage(tray::State::default())
        .manage(widget::State::default())
        .manage(alert::State::default())
        .manage(effect::State::default())
        .plugin(login::plugin())
        .plugin(shortcut::plugin())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            tray::build(app.handle())?;
            clock::start(app.handle().clone());
            widget::watch(app.handle().clone());
            shortcut::register(app);
            // The window starts hidden (tauri.conf.json) and is shown here,
            // unless this is a launch at login: then the menu bar is enough.
            if !login::launched_hidden() {
                tray::show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing the window must not stop the timer or take the menu bar
            // clock with it. Quit is in the menu, and Cmd-Q still works.
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Destroyed if window.label() == widget::LABEL => {
                let _ = window.app_handle().emit("fokus://widget", false);
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::sync_timer,
            commands::set_update,
            commands::ring,
            commands::prepare_alert,
            commands::show_alert,
            commands::alert_notice,
            commands::hide_alert,
            commands::prepare_effect,
            commands::show_effect,
            commands::set_glass,
            commands::set_open_at_login,
            commands::toggle_widget,
            commands::widget_open,
            commands::set_widget_look,
        ])
        .build(tauri::generate_context!())
        .expect("failed to start the app")
        .run(|app, event| {
            // Clicking the Dock icon brings back a window that was closed.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                tray::show_main(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
