//! The sound at the end of a phase.
//!
//! Played by the app rather than the web view: the main window is usually
//! hidden when a phase ends, and a hidden web view's audio is not to be relied
//! on. The sound is the same two notes as the browser build's, rendered to a
//! file by scripts/make-assets.py and played with macOS's own `afplay`.

use std::process::Command;
use std::thread;

const CHIME: &[u8] = include_bytes!("../sounds/chime.wav");

pub fn play() {
    let path = std::env::temp_dir().join("fokus-chime.wav");
    if !path.exists() && std::fs::write(&path, CHIME).is_err() {
        return;
    }
    if let Ok(mut child) = Command::new("/usr/bin/afplay").arg(&path).spawn() {
        // Reap it, or every chime leaves a zombie behind.
        thread::spawn(move || {
            let _ = child.wait();
        });
    }
}
