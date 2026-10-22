/**
 * Everything the app remembers lives in localStorage, one key per concern.
 * Keys are versioned; a shape change bumps the key rather than migrating.
 */

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked store only costs remembering; never the session.
  }
}
