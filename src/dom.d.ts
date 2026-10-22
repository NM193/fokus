import "react";

declare module "react" {
  interface HTMLAttributes<T> {
    /**
     * `inert` is in every browser this app runs in, but not yet in React 18's
     * types. React 18 drops a boolean `true` on an attribute it does not know,
     * so it is written as an empty string, which the browser reads as on.
     */
    inert?: "";
  }
}

declare global {
  /**
   * Document Picture-in-Picture: an always-on-top window that holds ordinary
   * HTML. Chrome and Edge only, and not yet in TypeScript's DOM types.
   */
  interface DocumentPictureInPicture extends EventTarget {
    readonly window: Window | null;
    requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  }

  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}
