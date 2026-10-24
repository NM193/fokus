import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { install, keepLooking, useUpdater } from "../lib/updater";

/**
 * A new version, in the sidebar (src/lib/updater.ts finds it). Later puts
 * this one away; the next look hands back a new one, and it comes back. An
 * install started elsewhere (Settings, the menu bar) shows here too.
 */
export function UpdateNotice() {
  const { update, percent, error } = useUpdater();
  const [later, setLater] = useState<Update | null>(null);

  useEffect(() => keepLooking(), []);

  if (!update || (later === update && percent === null)) return null;

  return (
    <div className="side__update">
      <b>Fokus {update.version}</b>
      <small>{update.body || "A new version is ready."}</small>
      {error && <small className="side__update-error">{error}</small>}
      {percent === null ? (
        <div className="side__update-actions">
          <button type="button" className="ghost ghost--small" onClick={() => setLater(update)}>
            Later
          </button>
          <button type="button" className="cta cta--small" onClick={() => void install()}>
            Update
          </button>
        </div>
      ) : (
        <UpdateProgress percent={percent} />
      )}
    </div>
  );
}

export function UpdateProgress({ percent }: { percent: number }) {
  return (
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
  );
}
