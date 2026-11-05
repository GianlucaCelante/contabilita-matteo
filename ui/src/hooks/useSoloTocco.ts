import { useSyncExternalStore } from "react";

// Vero su un dispositivo che si usa solo col dito (telefono, tablet): nessun puntatore preciso, quindi niente trascinamento di file.
const QUERY = "(pointer: coarse) and (hover: none)";

function iscrivi(avvisa: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", avvisa);
  return () => m.removeEventListener("change", avvisa);
}
function leggi(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

export function useSoloTocco(): boolean {
  return useSyncExternalStore(iscrivi, leggi, () => false);
}
