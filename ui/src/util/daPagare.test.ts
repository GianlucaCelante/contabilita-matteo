import { describe, expect, it } from "vitest";
import type { Movimento } from "../api/tipi";
import { filtroDaPagare, indirizzoDaPagare, riassuntoDaPagare, righeDaPagare, testoDaPagare, type RiassuntoDaPagare } from "./daPagare";

let n = 0;
function m(data: string, importoCent: number, extra: Partial<Movimento> = {}): Movimento {
  n++;
  return {
    id: n,
    data,
    tipo: "COSTO_VARIABILE",
    documento: "FATTURA",
    importoCent,
    categoria: null,
    fornitore: { id: 1, nome: "Molino Rossi" },
    dipendente: null,
    sede: { id: 1, nome: "Via Roma" },
    descrizione: null,
    numeroDocumento: `FT-${n}`,
    note: null,
    origine: "XML",
    pagata: false,
    ricorrenza: null,
    allegatoNome: null,
    creatoIl: "2026-10-01T09:00:00",
    modificatoIl: null,
    divisione: null,
    ...extra,
  };
}

describe("riassuntoDaPagare", () => {
  it("senza fatture da pagare non c'e' niente da mostrare", () => {
    expect(riassuntoDaPagare([], "2026-11")).toBeNull();
    expect(riassuntoDaPagare([m("2026-11-03", 10000, { pagata: true })], "2026-11")).toBeNull();
  });

  it("somma le fatture da pagare e le conta, anche di mesi diversi", () => {
    const r = riassuntoDaPagare([m("2026-11-03", 76500), m("2026-10-20", 12345), m("2026-09-02", 5000)], "2026-11");
    expect(r).toMatchObject({ importoCent: 93845, n: 3, mese: "2026-11" });
  });

  it("una nota di credito riduce il dovuto dello stesso fornitore (come nelle Ricevute)", () => {
    const r = riassuntoDaPagare([m("2026-11-03", 10000), m("2026-11-05", 3000, { documento: "NOTA_DI_CREDITO" })], "2026-11");
    expect(r).toMatchObject({ importoCent: 7000, n: 1, mese: "2026-11" });
  });

  it("il credito verso un fornitore non riduce quanto si deve agli altri", () => {
    const altro = { fornitore: { id: 2, nome: "Bel Fungo" } };
    const r = riassuntoDaPagare(
      [m("2026-11-03", 10000), m("2026-10-05", 2000, { ...altro, pagata: true }), m("2026-11-06", 5000, { ...altro, documento: "NOTA_DI_CREDITO" })],
      "2026-11",
    );
    expect(r).toMatchObject({ importoCent: 10000, n: 1, mese: "2026-11" });
  });

  it("non contano scontrini, fatture pagate e altri tipi", () => {
    const r = riassuntoDaPagare(
      [m("2026-11-03", 10000), m("2026-11-04", 2000, { documento: "SCONTRINO" }), m("2026-11-06", 4000, { pagata: true }), m("2026-11-07", 5000, { tipo: "COSTO_FISSO" })],
      "2026-11",
    );
    expect(r).toMatchObject({ importoCent: 10000, n: 1, mese: "2026-11" });
  });

  it("si conta mese per mese, come le Ricevute: una nota di credito vecchia non sconta le fatture nuove", () => {
    const r = riassuntoDaPagare(
      [m("2025-03-10", 100000, { pagata: true }), m("2025-03-20", 20000, { documento: "NOTA_DI_CREDITO" }), m("2026-11-05", 15000)],
      "2026-11",
    );
    expect(r).toMatchObject({ importoCent: 15000, n: 1, mese: "2026-11" });
  });

  it("un mese in cui le note di credito coprono le fatture non conta (ne' importo ne' fatture)", () => {
    expect(riassuntoDaPagare([m("2026-10-03", 10000), m("2026-10-05", 10000, { documento: "NOTA_DI_CREDITO" })], "2026-11")).toBeNull();
    const r = riassuntoDaPagare([m("2026-10-03", 10000), m("2026-10-05", 12000, { documento: "NOTA_DI_CREDITO" }), m("2026-09-07", 4000)], "2026-11");
    expect(r).toMatchObject({ importoCent: 4000, n: 1, mese: "2026-09" });
  });

  it("il mese da aprire: quello corrente se ha fatture da pagare, altrimenti l'ultimo che ne ha", () => {
    expect(riassuntoDaPagare([m("2026-09-02", 5000), m("2026-10-20", 12345)], "2026-11")?.mese).toBe("2026-10");
    expect(riassuntoDaPagare([m("2026-09-02", 5000), m("2026-11-01", 100), m("2026-10-20", 12345)], "2026-11")?.mese).toBe("2026-11");
  });
});

describe("testoDaPagare", () => {
  it("dice l'importo e quante fatture", () => {
    // Fra «€» e la cifra c'e' lo spazio che non va a capo (util/formato.ts).
    expect(testoDaPagare({ importoCent: 93845, n: 3 })).toBe("Da pagare ai fornitori: € 938,45 · 3 fatture");
    expect(testoDaPagare({ importoCent: 76500, n: 1 })).toBe("Da pagare ai fornitori: € 765,00 · 1 fattura");
  });
});

describe("indirizzoDaPagare", () => {
  it("apre le Ricevute con «Solo da pagare» acceso; il mese sta nell'indirizzo solo se non e' quello corrente", () => {
    expect(indirizzoDaPagare("2026-11", "2026-11")).toBe("/statistiche/fatture?scheda=ricevute&solo=1");
    expect(indirizzoDaPagare("2026-10", "2026-11")).toBe("/statistiche/fatture?scheda=ricevute&mese=2026-10&solo=1");
  });
});

describe("riassuntoDaPagare: i mesi", () => {
  it("un elemento per mese con qualcosa da pagare, dal piu' vecchio", () => {
    const r = riassuntoDaPagare([m("2026-11-03", 90356), m("2026-10-20", 250000), m("2026-11-09", 100000), m("2026-09-01", 500, { pagata: true })], "2026-11");
    expect(r?.mesi).toEqual([
      { mese: "2026-10", importoCent: 250000, n: 1 },
      { mese: "2026-11", importoCent: 190356, n: 2 },
    ]);
    expect(r).toMatchObject({ importoCent: 440356, n: 3 });
  });
});

describe("righeDaPagare", () => {
  const r = (mesi: RiassuntoDaPagare["mesi"]): RiassuntoDaPagare => ({ importoCent: mesi.reduce((s, x) => s + x.importoCent, 0), n: mesi.reduce((s, x) => s + x.n, 0), mese: mesi[mesi.length - 1]!.mese, mesi });

  it("con un solo mese nessuna riga: resta la scheda con il totale", () => {
    expect(righeDaPagare(r([{ mese: "2026-11", importoCent: 190356, n: 2 }]), "2026-11")).toEqual({ righe: [], altri: 0 });
  });

  it("con piu' mesi una riga per mese, dal piu' vecchio, ognuna verso le Ricevute di quel mese", () => {
    const righe = righeDaPagare(r([{ mese: "2026-10", importoCent: 250000, n: 1 }, { mese: "2026-11", importoCent: 190356, n: 2 }]), "2026-11");
    expect(righe).toEqual({
      righe: [
        { mese: "2026-10", testo: "Ottobre 2026 · €\u00a02.500,00 · 1 fattura", indirizzo: "/statistiche/fatture?scheda=ricevute&mese=2026-10&solo=1" },
        { mese: "2026-11", testo: "Novembre 2026 · €\u00a01.903,56 · 2 fatture", indirizzo: "/statistiche/fatture?scheda=ricevute&solo=1" },
      ],
      altri: 0,
    });
  });

  it("al massimo quattro righe, le piu' vecchie, piu' quanti mesi restano", () => {
    const mesi = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((mese) => ({ mese, importoCent: 1000, n: 1 }));
    const righe = righeDaPagare(r(mesi), "2026-11");
    expect(righe.righe.map((x) => x.mese)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(righe.altri).toBe(2);
  });
});

describe("filtroDaPagare", () => {
  it("i costi variabili fino alla fine del mese corrente (come le Ricevute), delle sedi scelte", () => {
    // Senza `pagata`: servono anche le note di credito (e le fatture pagate, da cui si tolgono i crediti).
    expect(filtroDaPagare("2026-11", undefined)).toEqual({ a: "2026-11-30", tipo: "COSTO_VARIABILE" });
    expect(filtroDaPagare("2028-02", "1,2")).toEqual({ a: "2028-02-29", tipo: "COSTO_VARIABILE", sedi: "1,2" });
  });
});

describe("riassuntoDaPagare: una fattura divisa fra sedi conta una volta", () => {
  it("n = 1 e l'importo è la somma delle parti", () => {
    const parte = (sede: { id: number; nome: string }) => m("2026-11-05", 15000, { numeroDocumento: "MAN-1", origine: "MANO", sede });
    const r = riassuntoDaPagare([parte({ id: 1, nome: "Via Roma" }), parte({ id: 2, nome: "Lungomare" })], "2026-11");
    expect(r).toMatchObject({ n: 1, importoCent: 30000, mese: "2026-11" });
    expect(r!.mesi).toEqual([{ mese: "2026-11", importoCent: 30000, n: 1 }]);
    expect(testoDaPagare(r!)).toContain("1 fattura");
  });
  it("pagata in parte: conta ancora 1, con la sola parte che resta", () => {
    const a = m("2026-11-05", 15000, { numeroDocumento: "MAN-2", origine: "MANO", sede: { id: 1, nome: "Via Roma" }, pagata: true });
    const b = m("2026-11-05", 15000, { numeroDocumento: "MAN-2", origine: "MANO", sede: { id: 2, nome: "Lungomare" } });
    expect(riassuntoDaPagare([a, b], "2026-11")).toMatchObject({ n: 1, importoCent: 15000 });
  });
});
