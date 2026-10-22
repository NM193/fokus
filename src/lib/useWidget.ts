import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { EVENTS, isDesktop, on } from "./desktop";
import type { Palette } from "./settings";

const SIZE = { width: 340, height: 132 };

export type WidgetApi = {
  supported: boolean;
  open: boolean;
  /** The browser's floating window, to portal the widget into. Null in the Mac app. */
  window: Window | null;
  toggle: () => void;
};

/**
 * The page's styles, carried into the widget's empty document by cloning the
 * <style> and <link> elements themselves. Not via `cssRules`: Chrome
 * serialises a `font` shorthand that holds a var() as empty longhands, and the
 * widget's type would silently fall back to the body's.
 * The <base> makes relative URLs (fonts, built stylesheets) resolve against the app.
 */
function copyStyles(target: Document) {
  const base = target.createElement("base");
  base.href = document.baseURI;
  target.head.append(base);

  document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    target.head.append(target.importNode(node, true));
  });
}

/**
 * In a browser: Chrome's Document Picture-in-Picture, an always-on-top window
 * holding ordinary HTML. It floats over every other app and closes when the
 * app's tab does. The app portals the widget into it, so there is one state.
 */
function useBrowserWidget(palette: Palette): WidgetApi {
  const [win, setWin] = useState<Window | null>(null);
  const supported = typeof window !== "undefined" && "documentPictureInPicture" in window;

  const toggle = useCallback(async () => {
    const api = window.documentPictureInPicture;
    if (!api) return;
    if (api.window) {
      api.window.close();
      return;
    }
    try {
      const pip = await api.requestWindow(SIZE);
      copyStyles(pip.document);
      pip.document.title = "Fokus";
      pip.addEventListener("pagehide", () => setWin(null), { once: true });
      setWin(pip);
    } catch {
      // Refused (no user gesture, or blocked): the button simply does nothing.
    }
  }, []);

  useEffect(() => {
    if (win) win.document.documentElement.dataset.palette = palette;
  }, [win, palette]);

  return { supported, open: win !== null, window: win, toggle: () => void toggle() };
}

/**
 * In the Mac app: a real window of its own (src-tauri/src/widget.rs), which
 * talks to this one through events. The app says when it opens and closes,
 * whichever of the button, the menu bar or the widget's own × did it.
 */
function useDesktopWidget(): WidgetApi {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void invoke<boolean>("widget_open").then(setOpen);
    return on<boolean>(EVENTS.widget, setOpen);
  }, []);

  const toggle = useCallback(() => void invoke("toggle_widget"), []);
  return { supported: true, open, window: null, toggle };
}

/** The mini timer: a small always-on-top window with the time in it. */
export const useWidget: (palette: Palette) => WidgetApi = isDesktop
  ? useDesktopWidget
  : useBrowserWidget;
