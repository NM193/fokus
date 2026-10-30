import type { SessionRecord } from "./useSession";

/**
 * Fokus's account in the cloud (Firebase): who is signed in, and the data
 * under `users/{uid}`, which Firestore's rules keep to that user alone. The
 * values below name the project; they are meant to ship with the app.
 *
 * Firebase is loaded the first time it is needed, so the Mac's other windows
 * (the mini timer, the card) never carry it.
 */
const PROJECT = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
};

/**
 * `VITE_FOKUS_EMULATOR=1 npm run dev` talks to Firebase's local emulators
 * instead (auth on 9099, Firestore on 8080, a "demo-" project that needs no
 * account): sync can be tried with any number of browser windows as devices.
 */
const EMULATOR = import.meta.env.DEV && Boolean(import.meta.env.VITE_FOKUS_EMULATOR);
const CONFIG = EMULATOR ? { apiKey: "demo", authDomain: "", projectId: "demo-fokus", appId: "" } : PROJECT;

/** Whether this build knows its Firebase project; without one, Settings has no Sync section. */
export const cloudSetUp = CONFIG.apiKey !== "";

export type CloudUser = { uid: string; email: string };

/** One document under `users/{uid}/state`: a value and when it last changed. */
export type Stamped<T> = { value: T; at: number };

export type Cloud = Awaited<ReturnType<typeof open>>;

let cloud: Promise<Cloud> | null = null;

export function getCloud(): Promise<Cloud> {
  return (cloud ??= open());
}

/** Firestore takes at most 500 writes in one batch. */
const BATCH = 400;

async function open() {
  const [{ initializeApp }, auth, store] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]);
  const app = initializeApp(CONFIG);
  // No popup or redirect sign-in: those need a web page's origin, and the
  // apps have tauri:// ones. Email and password need neither.
  const account = auth.initializeAuth(app, {
    persistence: [auth.indexedDBLocalPersistence, auth.browserLocalPersistence],
  });
  const db = store.initializeFirestore(app, {});
  if (EMULATOR) {
    auth.connectAuthEmulator(account, "http://127.0.0.1:9099", { disableWarnings: true });
    store.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  const state = (uid: string, name: string) => store.doc(db, "users", uid, "state", name);
  const history = (uid: string) => store.collection(db, "users", uid, "history");

  async function inBatches<T>(items: T[], each: (batch: ReturnType<typeof store.writeBatch>, item: T) => void) {
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = store.writeBatch(db);
      items.slice(i, i + BATCH).forEach((item) => each(batch, item));
      await batch.commit();
    }
  }

  return {
    onUser(handler: (user: CloudUser | null) => void) {
      return auth.onAuthStateChanged(account, (u) => handler(u ? { uid: u.uid, email: u.email ?? "" } : null));
    },
    signIn: (email: string, password: string) =>
      auth.signInWithEmailAndPassword(account, email, password).then(() => undefined),
    signOut: () => auth.signOut(account),

    /** A state document as it changes; null while there is none. */
    watch<T>(uid: string, name: string, handler: (doc: Stamped<T> | null) => void, fail: (error: Error) => void) {
      return store.onSnapshot(
        state(uid, name),
        (snap) => handler(snap.exists() ? (snap.data() as Stamped<T>) : null),
        fail,
      );
    },
    /** Resolves once the cloud has it, which offline means later. */
    write<T>(uid: string, name: string, doc: Stamped<T>) {
      return store.setDoc(state(uid, name), doc);
    },

    /**
     * Every History record in the cloud, each time any of them changes, and
     * which of them the cloud has confirmed: a record just written shows at
     * once, before it has actually arrived.
     */
    watchHistory(
      uid: string,
      handler: (records: SessionRecord[], confirmed: Set<string>) => void,
      fail: (error: Error) => void,
    ) {
      return store.onSnapshot(
        history(uid),
        { includeMetadataChanges: true },
        (snap) =>
          handler(
            snap.docs.map((d) => d.data() as SessionRecord),
            new Set(snap.docs.filter((d) => !d.metadata.hasPendingWrites).map((d) => d.id)),
          ),
        fail,
      );
    },
    putRecords: (uid: string, records: SessionRecord[]) =>
      inBatches(records, (batch, record) => batch.set(store.doc(history(uid), record.id), record)),
    dropRecords: (uid: string, ids: string[]) =>
      inBatches(ids, (batch, id) => batch.delete(store.doc(history(uid), id))),
  };
}
