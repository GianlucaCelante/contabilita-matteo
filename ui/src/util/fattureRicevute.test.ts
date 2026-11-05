import { describe, expect, it } from "vitest";
import type { Movimento } from "../api/tipi";
import { filtraDaPagare, pagatoDaPagare, raggruppaPerFornitore, riepilogoRicevute, testoNumeroFatture } from "./fattureRicevute";

let n = 0;
function m(fornitore: string | null, importoCent: number, extra: Partial<Movimento> = {}): Movimento {
  n++;
  return {
    id: n,
    data: `2026-10-${String(10 + (n % 15)).padStart(2, "0")}`,
    tipo: "COSTO_VARIABILE",
    documento: "FATTURA",
    importoCent,
    categoria: null,
    fornitore: fornitore ? { id: fornitore.length, nome: fornitore } : null,
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
    ...extra,
  };
}

const dati: Movimento[] = [
  m("Bel Fungo", 10000, { pagata: true }),
  m("Bel Fungo", 5000),
  m("Bel Fungo", 2000, { documento: "NOTA_DI_CREDITO" }),
  m("Euro Service", 30000),
  m("Euro Service", 1000, { documento: "SCONTRINO" }), // non e' una fattura ricevuta
  m(null, 700, { pagata: true }),
  m("Ricavo", 9999, { tipo: "RICAVO", documento: "RICAVO_FATTURATO" }),
];

describe("fatture ricevute: raggruppa per fornitore", () => {
  const gruppi = raggruppaPerFornitore(dati);
  it("tiene solo fatture e note di credito dei costi variabili; senza fornitore in fondo", () => {
    expect(gruppi.map((g) => g.nome)).toEqual(["Euro Service", "Bel Fungo", "Senza fornitore"]);
    expect(gruppi.flatMap((g) => g.voci).every((v) => v.documento === "FATTURA" || v.documento === "NOTA_DI_CREDITO")).toBe(true);
  });
  it("totale = fatture - note di credito; pagato + da pagare = totale", () => {
    const bel = gruppi.find((g) => g.nome === "Bel Fungo")!;
    expect(bel.totaleCent).toBe(13000);
    expect(bel.pagataCent).toBe(10000);
    expect(bel.daPagareCent).toBe(3000);
    for (const g of gruppi) expect(g.pagataCent + g.daPagareCent).toBe(g.totaleCent);
  });
  it("conta le fatture da pagare e quelle pagate (le note di credito non hanno stato)", () => {
    const bel = gruppi.find((g) => g.nome === "Bel Fungo")!;
    expect(bel.nDaPagare).toBe(1);
    expect(bel.nPagate).toBe(1);
    expect(bel.voci).toHaveLength(3);
  });
  it("l'elenco di un fornitore e' per data, dalla piu' vecchia", () => {
    for (const g of gruppi) expect(g.voci.map((v) => v.data)).toEqual([...g.voci.map((v) => v.data)].sort());
  });
});

describe("fatture ricevute: riepilogo e filtro", () => {
  it("il riepilogo somma i fornitori: da pagare + pagate = totale", () => {
    const gruppi = raggruppaPerFornitore(dati);
    const r = riepilogoRicevute(gruppi);
    expect(r).toEqual({ daPagareCent: 3000 + 30000, nDaPagare: 2, pagateCent: 10000 + 700, nPagate: 2, totaleCent: 13000 + 30000 + 700 });
    expect(r.daPagareCent + r.pagateCent).toBe(r.totaleCent);
  });
  it("«Solo da pagare» toglie i fornitori a posto e le fatture pagate; le note restano con chi ha ancora da pagare", () => {
    const f = filtraDaPagare(raggruppaPerFornitore(dati));
    expect(f.map((g) => g.nome)).toEqual(["Euro Service", "Bel Fungo"]);
    const bel = f.find((g) => g.nome === "Bel Fungo")!;
    expect(bel.voci.map((v) => v.documento).sort()).toEqual(["FATTURA", "NOTA_DI_CREDITO"]);
    expect(bel.voci.some((v) => v.pagata)).toBe(false);
    // i totali del fornitore restano quelli veri
    expect(bel.totaleCent).toBe(13000);
  });
  it("il testo per il numero di fatture", () => {
    expect(testoNumeroFatture(0)).toBe("nessuna fattura");
    expect(testoNumeroFatture(1)).toBe("1 fattura");
    expect(testoNumeroFatture(4)).toBe("4 fatture");
  });
});

describe("fatture ricevute: pagato e da pagare nelle statistiche per voce", () => {
  it("da pagare = totale - pagato", () => {
    expect(pagatoDaPagare({ totaleCent: 80000, pagataCent: 50000 })).toEqual({ pagatoCent: 50000, daPagareCent: 30000 });
    expect(pagatoDaPagare({ totaleCent: 1000, pagataCent: 1000 })).toEqual({ pagatoCent: 1000, daPagareCent: 0 });
  });
  it("niente per le voci che non sono fornitori o senza importo", () => {
    expect(pagatoDaPagare({ totaleCent: 80000, pagataCent: null })).toBeNull();
    expect(pagatoDaPagare({ totaleCent: 0, pagataCent: 0 })).toBeNull();
  });
});

describe("voceDaPagare", () => {
  it("positivo: Da pagare; negativo: credito verso il fornitore in positivo; zero: niente", async () => {
    const { voceDaPagare } = await import("./fattureRicevute");
    expect(voceDaPagare(3000)).toEqual({ etichetta: "Da pagare", importoCent: 3000, credito: false });
    expect(voceDaPagare(-1693)).toEqual({ etichetta: "Credito verso il fornitore", importoCent: 1693, credito: true });
    expect(voceDaPagare(0)).toBeNull();
  });
});
