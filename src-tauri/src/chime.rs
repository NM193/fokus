//! The sound at the end of a phase.
//!
//! Played by the app rather than the web view: the main window is usually
//! hidden when a phase ends, and a hidden web view's audio is not to be relied
//! on. Fokus's own chime is the same two notes as the browser build's,
//! rendered to a file by scripts/make-assets.py; the others are the Mac's.
//! Either way macOS's own `afplay` plays it.

use std::path::PathBuf;
use std::process::Command;
use std::thread;

const CHIME: &[u8] = include_bytes!("../sounds/chime.wav");
/// The chime is rendered quietly (its loudest is 0.41 of full scale); this
/// brings full volume up to the Mac's own sounds.
const CHIME_GAIN: f64 = 2.4;
/// The Mac's sounds Settings offers (SOUNDS in src/lib/settings.ts). Nothing
/// else is played, so no name from the frontend becomes a path.
const SYSTEM: [&str; 8] = ["Glass", "Ping", "Purr", "Hero", "Submarine", "Funk", "Tink", "Pop"];

/// `sound` is "chime" or one of `SYSTEM`; `volume` is 0 to 1.
pub fn play(sound: &str, volume: f64) {
    let (path, gain) = match SYSTEM.iter().find(|name| **name == sound) {
        Some(name) => (PathBuf::from(format!("/System/Library/Sounds/{name}.aiff")), 1.0),
        None => {
            let path = std::env::temp_dir().join("fokus-chime.wav");
            if !path.exists() && std::fs::write(&path, CHIME).is_err() {
                return;
            }
            (path, CHIME_GAIN)
        }
    };
    let volume = (volume.clamp(0.0, 1.0) * gain).to_string();
    if let Ok(mut child) = Command::new("/usr/bin/afplay").arg("-v").arg(volume).arg(&path).spawn() {
        // Reap it, or every chime leaves a zombie behind.
        thread::spawn(move || {
            let _ = child.wait();
        });
    }
}
