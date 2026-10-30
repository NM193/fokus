//! The sound at the end of a phase.
//!
//! Played by the app rather than the web view: the main window is usually
//! hidden when a phase ends, and a hidden web view's audio is not to be relied
//! on. Fokus's own chime is the same two notes as the browser build's,
//! rendered to a file by scripts/make-assets.py; the others are the Mac's.
//! Either way macOS's own `afplay` plays it. Windows has only the chime, and
//! plays it itself (PlaySound) from memory, its samples scaled to the volume.

#[cfg(not(windows))]
use std::path::PathBuf;
#[cfg(not(windows))]
use std::process::Command;
use std::thread;

const CHIME: &[u8] = include_bytes!("../sounds/chime.wav");
/// The chime is rendered quietly (its loudest is 0.41 of full scale); this
/// brings full volume up to the Mac's own sounds.
const CHIME_GAIN: f64 = 2.4;
/// The Mac's sounds Settings offers (SOUNDS in src/lib/settings.ts). Nothing
/// else is played, so no name from the frontend becomes a path.
#[cfg(not(windows))]
const SYSTEM: [&str; 8] = ["Glass", "Ping", "Purr", "Hero", "Submarine", "Funk", "Tink", "Pop"];

/// `sound` is "chime" or one of `SYSTEM`; `volume` is 0 to 1.
#[cfg(not(windows))]
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

/// Always the chime: Windows has none of the Mac's sounds.
#[cfg(windows)]
pub fn play(_sound: &str, volume: f64) {
    use windows_sys::Win32::Media::Audio::{PlaySoundW, SND_MEMORY, SND_NODEFAULT, SND_SYNC};

    let wav = louder(CHIME, volume.clamp(0.0, 1.0) * CHIME_GAIN);
    // Played to the end on a thread of its own, which keeps the bytes alive
    // for as long as Windows reads them.
    thread::spawn(move || unsafe {
        PlaySoundW(wav.as_ptr() as *const u16, std::ptr::null_mut(), SND_MEMORY | SND_SYNC | SND_NODEFAULT);
    });
}

/// The chime with every sample times `gain`. It is 16-bit PCM
/// (make-assets.py); its samples are whatever follows the "data" chunk's
/// header.
#[cfg(windows)]
fn louder(wav: &[u8], gain: f64) -> Vec<u8> {
    let mut out = wav.to_vec();
    let Some(at) = wav.windows(4).position(|w| w == b"data") else {
        return out;
    };
    for sample in out[at + 8..].chunks_exact_mut(2) {
        let value = i16::from_le_bytes([sample[0], sample[1]]) as f64 * gain;
        let value = value.round().clamp(i16::MIN as f64, i16::MAX as f64) as i16;
        sample.copy_from_slice(&value.to_le_bytes());
    }
    out
}
