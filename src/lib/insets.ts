/**
 * Where the phone's own bars end, for the one-column layout's top line and
 * bottom bar (`--safe-top`, `--safe-bottom` in styles.css). A browser says it
 * with env(safe-area-inset-*), and that is the default; Android's web view
 * leaves out the gesture bar, so the Android app hands both over itself
 * (MainActivity.kt) and says when they change.
 */
type Bridge = { get(): string };

export function followInsets() {
  const bridge = (window as unknown as { FokusInsets?: Bridge }).FokusInsets;
  if (!bridge) return;
  const apply = () => {
    const [top, , bottom] = bridge.get().split(" ").map(Number);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
    const root = document.documentElement.style;
    root.setProperty("--safe-top", `${top}px`);
    root.setProperty("--safe-bottom", `${bottom}px`);
  };
  apply();
  addEventListener("fokus-insets", apply);
}
