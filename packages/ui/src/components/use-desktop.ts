// Tells a component whether the wide layout is showing, for the few choices CSS cannot make.
import { useSyncExternalStore } from "react";

import { env } from "../tokens/env";

// The query of the wide layout, without the "@media" that a style rule needs.
const DESKTOP = env.desktop.replace("@media ", "");

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(DESKTOP);

  query.addEventListener("change", onChange);

  return () => {
    query.removeEventListener("change", onChange);
  };
};

const isDesktop = () => window.matchMedia(DESKTOP).matches;

// The prerendered shell has no window; it is drawn as a phone and corrected in the browser.
const isDesktopOnServer = () => false;

/** True on the wide layout (sidebar, large type). */
export const useDesktop = (): boolean =>
  useSyncExternalStore(subscribe, isDesktop, isDesktopOnServer);
