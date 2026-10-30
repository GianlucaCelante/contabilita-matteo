import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

function iscrivi(avvisa: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", avvisa);
  return () => m.removeEventListener("change", avvisa);
}
function leggi(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

// Vero dal breakpoint "md" (1024 px) in su: serve dove l'ORDINE dei campi cambia fra
// computer e telefono (il solo CSS non basta senza duplicare i campi).
export function useSchermoGrande(): boolean {
  return useSyncExternalStore(iscrivi, leggi, () => true);
}
