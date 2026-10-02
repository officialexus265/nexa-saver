import { useEffect } from "react";

/** Registers the offline/asset-caching service worker in production builds only. */
export function PwaRegister() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[pwa] sw registration failed", err));
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
