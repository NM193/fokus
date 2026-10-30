import { useCallback, useEffect, useRef, useState } from "react";
import { cloudSetUp, getCloud, type Cloud, type CloudUser } from "./cloud";
import type { Settings } from "./settings";
import { load, save } from "./store";
import type { Session, SessionApi, SessionRecord } from "./useSession";

/**
 * Sync: the same session, History and timer settings on every device signed
 * in to one account (cloud.ts). localStorage stays the truth on each device;
 * the cloud is how a change on one reaches the others, live.
 *
 * - The first time a device is linked it merges: the cloud's session with
 *   this device's own tasks added, both Histories together, the cloud's
 *   settings. An empty cloud takes this device's.
 * - After that the newest change wins, session and settings each as a whole.
 * - History is a set of records: one added anywhere is added everywhere, one
 *   deleted (Clear history) is deleted everywhere. `known` is what told the
 *   two apart: the records seen both here and in the cloud.
 */

/** What of Settings travels: how the timer runs and looks. Sound, alerts and the Mac's windows stay with each device. */
const SHARED = ["focus", "shortBreak", "longBreak", "every", "autoStart", "palette", "notes"] as const;
type Shared = Pick<Settings, (typeof SHARED)[number]>;
const shared = (s: Shared): Shared => Object.fromEntries(SHARED.map((k) => [k, s[k]])) as Shared;

type Meta = {
  /** The account this device's data was last joined with; null until then, and after signing out. */
  uid: string | null;
  /** When this device's session last changed here, or was taken from the cloud. */
  sessionAt: number;
  settingsAt: number;
  /** History records both here and in the cloud, as of the last look. */
  known: string[];
};

const KEY = "fokus.sync.v1";
const UNLINKED: Meta = { uid: null, sessionAt: 0, settingsAt: 0, known: [] };

/**
 * When a change made here happened: now, but always after the version it
 * was made on, so a device whose clock runs behind still wins with a later
 * change rather than losing it to the one it has just seen.
 */
const after = (seen: number) => Math.max(Date.now(), seen + 1);

/** A change here goes up once this device has been still for a moment. */
const SETTLE = 800;

export type SyncState =
  | { kind: "off" }
  | { kind: "connecting" }
  | { kind: "offline" }
  | { kind: "saving" }
  | { kind: "synced"; at: number }
  | { kind: "failed"; message: string };

export type SyncApi = ReturnType<typeof useSync>;

/** The first sign-in on a device: the cloud's session, plus the tasks only this device had. */
function joinSessions(mine: Session, theirs: Session): Session {
  const titles = new Set(theirs.tasks.map((t) => t.title.trim().toLowerCase()));
  const extra = mine.tasks.filter((t) => !titles.has(t.title.trim().toLowerCase()));
  return extra.length ? { ...theirs, tasks: [...theirs.tasks, ...extra] } : theirs;
}

function said(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")
    return "Wrong email or password.";
  if (code === "auth/invalid-email") return "That email does not look right.";
  if (code === "auth/too-many-requests") return "Too many tries. Wait a minute, then try again.";
  if (code === "auth/network-request-failed") return "No connection. Try again once you are online.";
  if (code === "permission-denied") return "The account cannot reach its data.";
  return (error as Error)?.message || "Something went wrong.";
}

export function useSync(session: SessionApi, settings: Settings, update: (patch: Partial<Settings>) => void) {
  const meta = useRef<Meta>({ ...UNLINKED, ...load<Partial<Meta>>(KEY, {}) });
  const remember = useCallback(() => save(KEY, meta.current), []);

  /** Load Firebase at launch only for a device that was signed in. */
  const [wanted, setWanted] = useState(() => cloudSetUp && meta.current.uid !== null);
  const cloud = useRef<Cloud | null>(null);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [userKnown, setUserKnown] = useState(false);

  const [looked, setLooked] = useState(0);
  const lookedAt = useRef(new Set<string>());
  const [pending, setPending] = useState(0);
  const [syncedAt, setSyncedAt] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  // The latest values, for handlers that outlive the render they were made in.
  const here = useRef({ session: session.state, history: session.history, settings: shared(settings) });
  here.current = { session: session.state, history: session.history, settings: shared(settings) };

  // What was last sent or taken: a change to anything else was made here.
  const seen = useRef({
    session: JSON.stringify(session.state),
    history: JSON.stringify(session.history),
    settings: JSON.stringify(shared(settings)),
  });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!wanted) return;
    let gone = false;
    let off: (() => void) | undefined;
    void getCloud().then((c) => {
      if (gone) return;
      cloud.current = c;
      off = c.onUser((u) => {
        setUser(u);
        setUserKnown(true);
      });
    });
    return () => {
      gone = true;
      off?.();
    };
  }, [wanted]);

  /** A write in flight: "Saving…" until the cloud has it. */
  const track = useCallback((write: Promise<unknown>) => {
    setPending((n) => n + 1);
    write
      .then(() => {
        setSyncedAt(Date.now());
        setFailure(null);
      })
      .catch((error) => setFailure(said(error)))
      .finally(() => setPending((n) => n - 1));
  }, []);

  const pushSession = useCallback(() => {
    const c = cloud.current;
    const uid = meta.current.uid;
    if (!c || !uid) return;
    if (!meta.current.sessionAt) meta.current.sessionAt = Date.now();
    track(c.write<Session>(uid, "session", { value: here.current.session, at: meta.current.sessionAt }));
  }, [track]);

  const pushSettings = useCallback(() => {
    const c = cloud.current;
    const uid = meta.current.uid;
    if (!c || !uid) return;
    if (!meta.current.settingsAt) meta.current.settingsAt = Date.now();
    track(c.write<Shared>(uid, "settings", { value: here.current.settings, at: meta.current.settingsAt }));
  }, [track]);

  /** History records added or deleted here go up; `known` follows only what the cloud has confirmed. */
  const pushHistory = useCallback((mine: SessionRecord[]) => {
    const c = cloud.current;
    const uid = meta.current.uid;
    if (!c || !uid) return;
    const ids = new Set(mine.map((r) => r.id));
    const known = new Set(meta.current.known);
    const up = mine.filter((r) => !known.has(r.id));
    const gone = meta.current.known.filter((id) => !ids.has(id));
    if (up.length) {
      track(
        c.putRecords(uid, up).then(() => {
          meta.current.known = [...new Set([...meta.current.known, ...up.map((r) => r.id)])];
          remember();
        }),
      );
    }
    if (gone.length) {
      const dropped = new Set(gone);
      track(
        c.dropRecords(uid, gone).then(() => {
          meta.current.known = meta.current.known.filter((id) => !dropped.has(id));
          remember();
        }),
      );
    }
  }, [track, remember]);

  // The cloud's side, for as long as someone is signed in.
  useEffect(() => {
    const c = cloud.current;
    if (!user || !c) return;
    const { uid } = user;
    const linking = meta.current.uid !== uid;
    if (linking) {
      meta.current = { ...meta.current, uid, known: [] };
      remember();
    }
    const first = { session: linking, settings: linking };
    lookedAt.current = new Set();
    setLooked(0);
    const fail = (error: Error) => setFailure(said(error));
    const arrived = (what: string) => {
      if (lookedAt.current.has(what)) return;
      lookedAt.current.add(what);
      setLooked(lookedAt.current.size);
      if (lookedAt.current.size === 3) setSyncedAt(Date.now());
    };

    function takeSession(value: Session, at: number) {
      here.current.session = value;
      seen.current.session = JSON.stringify(value);
      meta.current.sessionAt = at;
      remember();
      session.adopt(value);
    }

    function takeSettings(value: Shared, at: number) {
      const next = shared({ ...here.current.settings, ...value });
      here.current.settings = next;
      seen.current.settings = JSON.stringify(next);
      meta.current.settingsAt = at;
      remember();
      update(next);
    }

    const offSession = c.watch<Session>(
      uid,
      "session",
      (doc) => {
        const wasFirst = first.session;
        first.session = false;
        arrived("session");
        if (!doc) return pushSession();
        if (wasFirst) {
          const joined = joinSessions(here.current.session, doc.value);
          if (joined === doc.value) return takeSession(doc.value, doc.at);
          takeSession(joined, after(doc.at));
          return pushSession();
        }
        if (doc.at > meta.current.sessionAt) takeSession(doc.value, doc.at);
        else if (doc.at < meta.current.sessionAt) pushSession();
      },
      fail,
    );

    const offSettings = c.watch<Shared>(
      uid,
      "settings",
      (doc) => {
        const wasFirst = first.settings;
        first.settings = false;
        arrived("settings");
        if (!doc) return pushSettings();
        if (wasFirst || doc.at > meta.current.settingsAt) takeSettings(doc.value, doc.at);
        else if (doc.at < meta.current.settingsAt) pushSettings();
      },
      fail,
    );

    const offHistory = c.watchHistory(
      uid,
      (records, confirmed) => {
        arrived("history");
        const mine = here.current.history;
        const known = new Set(meta.current.known);
        const there = new Set(records.map((r) => r.id));
        const ids = new Set(mine.map((r) => r.id));
        // Missing on one side after both had it: deleted on that side.
        const keep = mine.filter((r) => there.has(r.id) || !known.has(r.id));
        const added = records.filter((r) => !ids.has(r.id) && !known.has(r.id));
        const next = [...keep, ...added].sort((a, b) => b.endedAt - a.endedAt);
        const nextIds = new Set(next.map((r) => r.id));
        // Known stays known while either side still has it, until the deletion is through.
        meta.current.known = [
          ...new Set([
            ...meta.current.known.filter((id) => nextIds.has(id) || there.has(id)),
            ...next.filter((r) => confirmed.has(r.id)).map((r) => r.id),
          ]),
        ];
        remember();
        const json = JSON.stringify(next);
        if (json !== JSON.stringify(mine)) {
          here.current.history = next;
          seen.current.history = json;
          session.adoptHistory(next);
        }
        // What only this device has goes up; what it deleted goes away.
        const deletedHere = records.some((r) => !nextIds.has(r.id));
        if (deletedHere || keep.some((r) => !there.has(r.id))) pushHistory(next);
      },
      fail,
    );

    return () => {
      offSession();
      offSettings();
      offHistory();
    };
  }, [user, remember, session.adopt, session.adoptHistory, update, pushSession, pushSettings, pushHistory]);

  // This device's own changes. Each waits for its first look at the cloud,
  // which settles anything changed before it.
  const settle = useRef<Record<string, number>>({});
  const later = useCallback((what: string, push: () => void) => {
    window.clearTimeout(settle.current[what]);
    settle.current[what] = window.setTimeout(() => {
      if (lookedAt.current.has(what)) push();
    }, SETTLE);
  }, []);

  useEffect(() => {
    const json = JSON.stringify(session.state);
    if (json === seen.current.session) return;
    seen.current.session = json;
    meta.current.sessionAt = after(meta.current.sessionAt);
    remember();
    later("session", pushSession);
  }, [session.state, remember, later, pushSession]);

  const mineShared = JSON.stringify(shared(settings));
  useEffect(() => {
    if (mineShared === seen.current.settings) return;
    seen.current.settings = mineShared;
    meta.current.settingsAt = after(meta.current.settingsAt);
    remember();
    later("settings", pushSettings);
  }, [mineShared, remember, later, pushSettings]);

  useEffect(() => {
    const json = JSON.stringify(session.history);
    if (json === seen.current.history) return;
    seen.current.history = json;
    if (lookedAt.current.has("history")) pushHistory(session.history);
  }, [session.history, pushHistory]);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      setWanted(true);
      const c = await getCloud();
      cloud.current = c;
      await c.signIn(email.trim(), password);
      setFailure(null);
      return null;
    } catch (error) {
      return said(error);
    }
  }, []);

  /** Signing out keeps everything on this device; signing in again joins it anew. */
  const signOut = useCallback(async () => {
    await cloud.current?.signOut();
    meta.current = { ...meta.current, uid: null, known: [] };
    remember();
  }, [remember]);

  let state: SyncState;
  if (!user) state = wanted && !userKnown ? { kind: "connecting" } : { kind: "off" };
  else if (failure) state = { kind: "failed", message: failure };
  else if (looked < 3 || pending > 0) state = online ? { kind: looked < 3 ? "connecting" : "saving" } : { kind: "offline" };
  else state = { kind: "synced", at: syncedAt };

  return { available: cloudSetUp, email: user?.email ?? null, state, signIn, signOut };
}
