import { describe, expect, it } from "vitest";
import { leggiFiltri, salvaFiltri } from "./filtriSalvati";
import { etichettaIntervallo, intervalloDi, spostaRiferimento } from "./formato";

// Il filtro «Oggi» è un periodo di un giorno solo.
describe("periodo «giorno» (Oggi)", () => {
  it("l'intervallo è il giorno stesso, da e a uguali", () => {
    expect(intervalloDi("giorno", "2026-10-23")).toEqual({ da: "2026-10-23", a: "2026-10-23" });
  });

  it("le frecce spostano di un giorno, anche a cavallo di mese e di anno", () => {
    expect(spostaRiferimento("giorno", "2026-10-23", 1)).toBe("2026-10-24");
    expect(spostaRiferimento("giorno", "2026-10-23", -1)).toBe("2026-10-22");
    expect(spostaRiferimento("giorno", "2026-10-31", 1)).toBe("2026-11-01");
    expect(spostaRiferimento("giorno", "2026-01-01", -1)).toBe("2025-12-31");
  });

  it("l'etichetta dice il giorno della settimana, la data e l'anno", () => {
    expect(etichettaIntervallo("giorno", intervalloDi("giorno", "2026-10-23"))).toBe("Venerdì 23 ottobre 2026");
    expect(etichettaIntervallo("giorno", intervalloDi("giorno", "2026-03-01"))).toBe("Domenica 1 marzo 2026");
  });

  it("si ricorda come gli altri periodi", () => {
    const dati: Record<string, string> = {};
    const m = { getItem: (k: string) => dati[k] ?? null, setItem: (k: string, v: string) => void (dati[k] = v) };
    salvaFiltri(m, { p: "giorno", r: "2026-10-23" });
    expect(leggiFiltri(m)).toEqual({ p: "giorno", r: "2026-10-23" });
  });
});
