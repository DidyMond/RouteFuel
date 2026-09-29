/**
 * Deep-link per aprire la navigazione esterna verso una stazione.
 * iOS → Apple Maps, Android → Google Maps, altrove → menu con Google Maps, Apple Maps e Waze.
 * Solo link web universali (https): funzionano anche senza l'app installata.
 */
export type Platform = "ios" | "android" | "other";

export type NavigationApp = "apple" | "google" | "waze";

export interface NavigationTarget {
  name: string;
  lat: number;
  lon: number;
}

export interface NavigationLink {
  app: NavigationApp;
  label: string;
  url: string;
}

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS 13+ si presenta come Mac: lo distingue il multitouch.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

const coords = (t: NavigationTarget) => `${t.lat.toFixed(6)},${t.lon.toFixed(6)}`;

const BUILDERS: Record<NavigationApp, { label: string; url: (t: NavigationTarget) => string }> = {
  apple: {
    label: "Apple Maps",
    url: (t) => `https://maps.apple.com/?daddr=${coords(t)}&dirflg=d&q=${encodeURIComponent(t.name)}`,
  },
  google: {
    label: "Google Maps",
    url: (t) => `https://www.google.com/maps/dir/?api=1&destination=${coords(t)}&travelmode=driving`,
  },
  waze: {
    label: "Waze",
    url: (t) => `https://waze.com/ul?ll=${coords(t)}&navigate=yes`,
  },
};

export function navigationLink(app: NavigationApp, target: NavigationTarget): NavigationLink {
  return { app, label: BUILDERS[app].label, url: BUILDERS[app].url(target) };
}

/** Tutte le app, per il menu di scelta. */
export function navigationLinks(target: NavigationTarget): NavigationLink[] {
  return (["google", "apple", "waze"] as const).map((app) => navigationLink(app, target));
}

/** Il link da aprire direttamente per la piattaforma, o null se serve il menu di scelta. */
export function primaryNavigationLink(platform: Platform, target: NavigationTarget): NavigationLink | null {
  if (platform === "ios") return navigationLink("apple", target);
  if (platform === "android") return navigationLink("google", target);
  return null;
}
