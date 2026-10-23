import { describe, expect, it } from "vitest";
import { leggiFiltri, salvaFiltri } from "./filtriSalvati";

// Un magazzino finto, come localStorage.
function finto(iniziale: Record<string, string> = {}) {
  const dati = { ...iniziale };
  return {
    dati,
    getItem: (k: string) => dati[k] ?? null,
    setItem: (k: string, v: string) => {
      dati[k] = v;
    },
  };
}
const CHIAVE = "contabilita.filtri.v1";

describe("filtri salvati", () => {
  it("senza niente di salvato non c'è nessun filtro", () => {
    expect(leggiFiltri(finto())).toEqual({});
    expect(leggiFiltri(null)).toEqual({});
  });

  it("quello che si salva si ritrova, e i salvataggi si sommano", () => {
    const m = finto();
    salvaFiltri(m, { p: "mese", r: "2026-10-21" });
    salvaFiltri(m, { tipo: "COSTO_VARIABILE" });
    expect(leggiFiltri(m)).toEqual({ p: "mese", r: "2026-10-21", tipo: "COSTO_VARIABILE" });
    salvaFiltri(m, { p: "anno", r: "2026-01-01" });
    expect(leggiFiltri(m)).toEqual({ p: "anno", r: "2026-01-01", tipo: "COSTO_VARIABILE" });
  });

  it("«Tutti» (tipo vuoto) è una scelta e si ricorda", () => {
    const m = finto();
    salvaFiltri(m, { tipo: "RICAVO" });
    salvaFiltri(m, { tipo: "" });
    expect(leggiFiltri(m).tipo).toBe("");
  });

  it("un periodo libero ricorda le due date", () => {
    const m = finto();
    salvaFiltri(m, { p: "periodo", da: "2026-03-01", a: "2026-03-31" });
    expect(leggiFiltri(m)).toEqual({ p: "periodo", da: "2026-03-01", a: "2026-03-31" });
  });

  it("i valori non validi si scartano uno per uno, senza rompere il resto", () => {
    const m = finto({ [CHIAVE]: JSON.stringify({ p: "secolo", r: "ieri", da: "2026-02-30", a: "2026-03-31", tipo: "BOH" }) });
    expect(leggiFiltri(m)).toEqual({ a: "2026-03-31" });
  });

  it("dati rovinati o non JSON: nessun filtro, nessun errore", () => {
    expect(leggiFiltri(finto({ [CHIAVE]: "{non json" }))).toEqual({});
    expect(leggiFiltri(finto({ [CHIAVE]: "42" }))).toEqual({});
    expect(leggiFiltri(finto({ [CHIAVE]: "null" }))).toEqual({});
  });

  it("se il browser non lascia scrivere (modalità privata) non succede niente", () => {
    const rotto = {
      getItem: () => {
        throw new Error("bloccato");
      },
      setItem: () => {
        throw new Error("bloccato");
      },
    };
    expect(leggiFiltri(rotto)).toEqual({});
    expect(() => salvaFiltri(rotto, { p: "mese" })).not.toThrow();
  });
});
