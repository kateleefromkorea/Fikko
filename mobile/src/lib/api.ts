import { Capacitor } from "@capacitor/core";

/**
 * The shared code calls the server functions at relative paths ("/api/coach").
 * In the browser the dev server proxies those; inside the iOS and Android apps
 * the page is served from the device itself, so they are sent to the deployed
 * web app instead. Done here, rather than in src/lib, so the web app is untouched.
 */
export function routeApiCalls() {
  if (!Capacitor.isNativePlatform()) return;
  const origin = import.meta.env.VITE_API_ORIGIN || "https://fikko-eta.vercel.app";
  const toServer = (url: string) => (url.startsWith("/api/") ? origin + url : url);

  const fetch = window.fetch.bind(window);
  window.fetch = (input, init) => fetch(typeof input === "string" ? toServer(input) : input, init);

  const sendBeacon = navigator.sendBeacon?.bind(navigator);
  if (sendBeacon) navigator.sendBeacon = (url, data) => sendBeacon(toServer(String(url)), data);
}
