//! The menu bar clock, and the alarm for a phase that ends while the window
//! is hidden.
//!
//! The timer's logic lives in the frontend. What it cannot do on its own is
//! keep the menu bar ticking and notice the end of a phase while its window is
//! hidden: a hidden web view's timers are slowed right down. So the window
//! hands its state over on every change, and a thread here does both.

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::tray;

/// What the window says the timer is doing. Mirrors `sync_timer` in
/// src/lib/useDesktop.ts -- change one, change the other.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    /// "focus", "short" or "long".
    pub phase: String,
    /// When the running phase ends, in ms since the epoch. None while stopped.
    pub ends_at: Option<u64>,
    /// What is left of a stopped phase, in ms.
    pub left: u64,
    /// Started at some point and not reset since.
    pub touched: bool,
}

impl TimerState {
    pub fn running(&self) -> bool {
        self.ends_at.is_some()
    }
}

#[derive(Default)]
pub struct Clock {
    state: Mutex<TimerState>,
}

impl Clock {
    /// Store the new state and return the old one.
    pub fn replace(&self, next: TimerState) -> TimerState {
        match self.state.lock() {
            Ok(mut state) => std::mem::replace(&mut *state, next),
            Err(_) => TimerState::default(),
        }
    }

    fn get(&self) -> TimerState {
        self.state.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

pub fn start(app: AppHandle) {
    thread::spawn(move || {
        let mut shown = String::new();
        let mut last_due: Option<Instant> = None;
        loop {
            let state = app.state::<Clock>().get();
            let now = now_ms();

            let next = title(&state, now);
            if next != shown {
                tray::set_title(&app, &next);
                shown = next;
            }

            // Say it again every couple of seconds until the window answers
            // with a new state: an event to a sleeping web view can be late.
            if state.ends_at.is_some_and(|end| now >= end)
                && last_due.map_or(true, |at| at.elapsed() >= Duration::from_secs(2))
            {
                let _ = app.emit_to("main", "fokus://due", ());
                last_due = Some(Instant::now());
            }

            thread::sleep(Duration::from_millis(250));
        }
    });
}

/// The text beside the menu bar icon. Empty when nothing has started, so an
/// idle timer is just the icon.
pub fn title(state: &TimerState, now: u64) -> String {
    let left = match state.ends_at {
        Some(end) => end.saturating_sub(now),
        None if state.touched => state.left,
        None => return String::new(),
    };
    let time = clock(left);
    match (state.running(), state.phase.as_str()) {
        (true, "focus") => time,
        (true, _) => format!("Break {time}"),
        (false, _) => format!("‖ {time}"),
    }
}

/// Minutes and seconds, rounded up -- the same as `clock` in src/lib/format.ts.
fn clock(ms: u64) -> String {
    let total = ms.div_ceil(1000);
    format!("{:02}:{:02}", total / 60, total % 60)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(phase: &str, ends_at: Option<u64>, left: u64, touched: bool) -> TimerState {
        TimerState { phase: phase.into(), ends_at, left, touched }
    }

    #[test]
    fn idle_shows_only_the_icon() {
        assert_eq!(title(&state("focus", None, 0, false), 0), "");
    }

    #[test]
    fn focus_shows_the_time_left_rounded_up() {
        assert_eq!(title(&state("focus", Some(1_500_000), 0, true), 0), "25:00");
        assert_eq!(title(&state("focus", Some(61_001), 0, true), 0), "01:02");
    }

    #[test]
    fn a_break_says_so() {
        assert_eq!(title(&state("short", Some(300_000), 0, true), 0), "Break 05:00");
    }

    #[test]
    fn paused_shows_what_is_left() {
        assert_eq!(title(&state("focus", None, 754_000, true), 0), "‖ 12:34");
    }

    #[test]
    fn an_overdue_phase_reads_zero() {
        assert_eq!(title(&state("focus", Some(1_000), 0, true), 5_000), "00:00");
    }
}
