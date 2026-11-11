import { describe, expect, it } from "vitest";
import { leggiFiltri, periodoDopoImportazione, periodoDopoSalvataggio, salvaFiltri } from "./filtriSalvati";

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

  it("tipo COSTI (solo dell'indirizzo di Movimenti) non vale come filtro salvato: si scarta", () => {
    expect(leggiFiltri(finto({ [CHIAVE]: JSON.stringify({ tipo: "COSTI", p: "mese" }) }))).toEqual({ p: "mese" });
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

describe("periodoDopoSalvataggio: l'elenco segue il movimento appena salvato", () => {
  const oggi = "2026-11-04";
  it("data dentro il periodo mostrato: niente da cambiare", () => {
    expect(periodoDopoSalvataggio("2026-11-20", { p: "mese", r: "2026-11-04" }, oggi)).toBeNull();
    expect(periodoDopoSalvataggio("2026-03-01", { p: "anno", r: "2026-11-04" }, oggi)).toBeNull();
    expect(periodoDopoSalvataggio("2026-10-05", { p: "periodo", da: "2026-10-01", a: "2026-10-31" }, oggi)).toBeNull();
  });
  it("senza periodo salvato vale il mese corrente", () => {
    expect(periodoDopoSalvataggio("2026-11-30", {}, oggi)).toBeNull();
    expect(periodoDopoSalvataggio("2026-09-10", {}, oggi)).toEqual({ p: "mese", r: "2026-09-10" });
  });
  it("data fuori dal periodo mostrato: si passa al mese del movimento", () => {
    expect(periodoDopoSalvataggio("2026-09-10", { p: "mese", r: "2026-11-04" }, oggi)).toEqual({ p: "mese", r: "2026-09-10" });
    expect(periodoDopoSalvataggio("2026-11-30", { p: "settimana", r: "2026-11-04" }, oggi)).toEqual({ p: "mese", r: "2026-11-30" });
    expect(periodoDopoSalvataggio("2025-12-31", { p: "anno", r: "2026-01-01" }, oggi)).toEqual({ p: "mese", r: "2025-12-31" });
    expect(periodoDopoSalvataggio("2026-11-02", { p: "periodo", da: "2026-10-01", a: "2026-10-31" }, oggi)).toEqual({ p: "mese", r: "2026-11-02" });
  });
});

import { scartaIdInesistenti } from "./filtriSalvati";
describe("scartaIdInesistenti", () => {
  it("scarta gli id che non esistono piu', tiene gli altri", () => {
    expect(scartaIdInesistenti([1, 2, 9], [{ id: 1 }, { id: 2 }, { id: 3 }])).toEqual([1, 2]);
    expect(scartaIdInesistenti([9], [{ id: 1 }])).toEqual([]);
  });
  it("senza elenco non scarta niente", () => {
    expect(scartaIdInesistenti([1, 9], undefined)).toEqual([1, 9]);
  });
});

describe("periodoDopoImportazione: il Riepilogo segue le fatture appena importate", () => {
  const oggi = "2026-11-11";
  it("niente date o tutte già nel periodo mostrato: non cambia niente", () => {
    expect(periodoDopoImportazione([], { p: "settimana", r: oggi }, oggi)).toBeNull();
    expect(periodoDopoImportazione(["2026-11-03", "2026-11-08"], { p: "mese", r: oggi }, oggi)).toBeNull();
    expect(periodoDopoImportazione(["2026-10-31", "2026-11-08"], { p: "anno", r: oggi }, oggi)).toBeNull();
    expect(periodoDopoImportazione(["2026-10-31", "2026-11-08"], { p: "periodo", da: "2026-10-01", a: "2026-11-30" }, oggi)).toBeNull();
  });
  it("tutte in un mese solo, fuori dal periodo mostrato: quel mese", () => {
    expect(periodoDopoImportazione(["2026-11-03", "2026-11-08"], { p: "settimana", r: oggi }, oggi)).toEqual({ filtri: { p: "mese", r: "2026-11-08" }, etichetta: "novembre 2026" });
  });
  it("anche una sola fuori dal periodo basta per spostarlo", () => {
    expect(periodoDopoImportazione(["2026-11-10", "2026-11-03"], { p: "settimana", r: oggi }, oggi)?.filtri).toEqual({ p: "mese", r: "2026-11-10" });
  });
  it("su più mesi: un periodo di mesi interi che le comprende tutte", () => {
    expect(periodoDopoImportazione(["2026-11-08", "2026-10-31", "2026-11-03"], { p: "settimana", r: oggi }, oggi)).toEqual({
      filtri: { p: "periodo", da: "2026-10-01", a: "2026-11-30" },
      etichetta: "da ottobre a novembre 2026",
    });
    expect(periodoDopoImportazione(["2025-12-20", "2026-02-02"], { p: "mese", r: oggi }, oggi)).toEqual({
      filtri: { p: "periodo", da: "2025-12-01", a: "2026-02-28" },
      etichetta: "da dicembre 2025 a febbraio 2026",
    });
  });
  it("senza periodo salvato vale il mese corrente", () => {
    expect(periodoDopoImportazione(["2026-11-03"], {}, oggi)).toBeNull();
    expect(periodoDopoImportazione(["2026-10-03"], {}, oggi)?.etichetta).toBe("ottobre 2026");
  });
});
