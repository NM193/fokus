import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isDesktop } from "../lib/desktop";

/**
 * A new version, from the GitHub release scripts/release.sh made.
 *
 * Asked about once, at launch, and nothing is downloaded until you say so.
 * Updating restarts the app; a running timer survives that, since it is a
 * deadline in storage rather than a countdown in memory.
 */
export function UpdateNotice() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [later, setLater] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    check()
      .then((found) => found && setUpdate(found))
      // No network, or no release yet: nothing worth saying.
      .catch(() => {});
  }, []);

  if (!update || later) return null;

  async function install() {
    if (!update) return;
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
    }
  }

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
