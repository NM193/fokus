//! Windows only: what the Mac does with glass and panels, Windows does with
//! its window manager (DWM). The main window keeps Windows's own title bar,
//! buttons and Snap layouts, painted in the palette's colours; the floating
//! windows get Windows 11's round corners. Windows 10 knows neither and keeps
//! its own look, which is fine.
//!
//! Also the taskbar's theme, which picks the tray icon (tray.rs).

use tauri::WebviewWindow;
use windows_sys::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
};
use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};

/// The title bar, its text and the window's rim, each "#rrggbb". The frontend
/// reads them from the palette (styles.css) and sends them on every change.
pub fn paint(window: &WebviewWindow, caption: &str, text: &str, border: &str) {
    for (attribute, hex) in [
        (DWMWA_CAPTION_COLOR, caption),
        (DWMWA_TEXT_COLOR, text),
        (DWMWA_BORDER_COLOR, border),
    ] {
        if let Some(color) = colorref(hex) {
            set(window, attribute, color);
        }
    }
}

/// Round corners for a window without a title bar: Windows 11 rounds only
/// the ones with one by itself.
pub fn round(window: &WebviewWindow) {
    set(window, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND as u32);
}

/// Whether the taskbar is light. Windows keeps it apart from the apps' theme,
/// as "SystemUsesLightTheme"; missing, as on older Windows, it is dark.
pub fn light_taskbar() -> bool {
    let key = wide(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
    let value = wide("SystemUsesLightTheme");
    let mut data: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            &mut data as *mut u32 as *mut _,
            &mut size,
        )
    };
    status == 0 && data == 1
}

fn set(window: &WebviewWindow, attribute: i32, value: u32) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    // Refused on Windows 10, which has none of these: the window stays as it was.
    unsafe {
        DwmSetWindowAttribute(
            hwnd.0 as _,
            attribute as u32,
            &value as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

/// "#rrggbb" as Windows wants a colour: 0x00bbggrr.
fn colorref(hex: &str) -> Option<u32> {
    let hex = hex.trim().strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let rgb = u32::from_str_radix(hex, 16).ok()?;
    let (r, g, b) = (rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff);
    Some(b << 16 | g << 8 | r)
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}
