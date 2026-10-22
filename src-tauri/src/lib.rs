mod chime;
mod clock;
mod commands;
mod glass;
mod tray;
mod widget;

use tauri::{Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(clock::Clock::default())
        .setup(|app| {
            tray::build(app.handle())?;
            clock::start(app.handle().clone());
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
            commands::ring,
            commands::set_glass,
            commands::toggle_widget,
            commands::widget_open,
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
