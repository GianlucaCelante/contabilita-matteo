import { useCallback, useSyncExternalStore } from "react";

// Vero quando la finestra e' larga almeno `px` pixel. Come useSchermoGrande, ma con una soglia a scelta:
// serve dove una tabella non entra sotto una certa larghezza e meglio una scheda per riga.
export function useLarghezzaMinima(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const iscrivi = useCallback(
    (avvisa: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
      const m = window.matchMedia(query);
      m.addEventListener("change", avvisa);
      return () => m.removeEventListener("change", avvisa);
    },
    [query],
  );
  const leggi = useCallback(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(iscrivi, leggi, () => true);
}
