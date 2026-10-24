import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { EVENTS, isDesktop, on } from "../lib/desktop";

/** How often a new version is looked for after launch: Fokus lives in the menu bar and is rarely started again. */
const EVERY_MS = 3 * 60 * 60 * 1000;
/** Bringing the window up looks again, when the last look is older than this. */
const STALE_MS = 60 * 60 * 1000;

/**
 * A new version, from the GitHub release scripts/release.sh made.
 *
 * Asked about at launch, every few hours after, and when the window comes up
 * a while after the last look. Nothing is downloaded until you say so; Later
 * puts it away until the next look. The menu bar menu offers it too, for a
 * window that is never opened, and choosing it there installs it here.
 * Updating restarts the app; a running timer survives that, since it is a
 * deadline in storage rather than a countdown in memory.
 */
export function UpdateNotice() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  // One look at a time.
  const looking = useRef(false);
  // No look while an update downloads: it would swap the update out from under it.
  const installing = useRef(false);
  // Every look hands back a new handle, even for the same version: the old one is let go.
  const shown = useRef<Update | null>(null);

  useEffect(() => {
    if (!isDesktop) return;
    let last = 0;
    function look() {
      if (looking.current || installing.current) return;
      looking.current = true;
      last = Date.now();
      check()
        .then((found) => {
          if (!found) return;
          if (installing.current) {
            void found.close().catch(() => {});
            return;
          }
          if (shown.current) void shown.current.close().catch(() => {});
          shown.current = found;
          setUpdate(found);
          setLater(false);
        })
        // No network, or no release yet: nothing worth saying.
        .catch(() => {})
        .finally(() => {
          looking.current = false;
        });
    }
    function onFocus() {
      if (Date.now() - last > STALE_MS) look();
    }
    look();
    const id = window.setInterval(look, EVERY_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  async function install() {
    if (!update || installing.current) return;
    installing.current = true;
    setLater(false);
    setPercent(0);
    setError(null);
    try {
      let had = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          had += event.data.chunkLength;
          if (total) setPercent((had / total) * 100);
        }
      });
      await relaunch();
    } catch (caught) {
      setError(String(caught));
      setPercent(null);
      installing.current = false;
    }
  }

  const version = update?.version ?? null;
  useEffect(() => {
    if (isDesktop) void invoke("set_update", { version });
  }, [version]);

  const installNow = useRef(install);
  installNow.current = install;
  useEffect(() => {
    if (!isDesktop) return;
    return on(EVENTS.update, () => void installNow.current());
  }, []);

  if (!update || later) return null;

  return (
    <div className="side__update">
      <b>Fokus {update.version}</b>
      <small>{update.body || "A new version is ready."}</small>
      {error && <small className="side__update-error">{error}</small>}
      {percent === null ? (
        <div className="side__update-actions">
          <button type="button" className="ghost ghost--small" onClick={() => setLater(true)}>
            Later
          </button>
          <button type="button" className="cta cta--small" onClick={() => void install()}>
            Update
          </button>
        </div>
      ) : (
        <div
          className="meter"
          role="progressbar"
          aria-label="Downloading the update"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
