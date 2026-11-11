import { describe, expect, it } from "vitest";
import type { Movimento } from "../api/tipi";
import { riassuntoDaPagare } from "./daPagare";
import { filtraDaPagare, raggruppaPerFornitore, riepilogoRicevute, testoDivisa } from "./fattureRicevute";
import { contaMovimenti } from "./voci";

// Le parti di un movimento diviso fra sedi hanno lo stesso `divisione` (docs/api.md, «Movimenti»): le Ricevute e i conteggi le
// uniscono per quell'id. L'euristica di prima (stesso fornitore, numero, data e documento in sedi diverse) resta solo per i movimenti
// senza id, cioe' quelli registrati prima che l'id esistesse.

const roma = { id: 1, nome: "Via Roma" };
const mare = { id: 2, nome: "Lungomare" };
const mercato = { id: 3, nome: "Mercato" };

let n = 0;
function m(fornitore: string | null, importoCent: number, extra: Partial<Movimento> = {}): Movimento {
  n++;
  return {
    id: n,
    data: "2026-11-05",
    tipo: "COSTO_VARIABILE",
    documento: "FATTURA",
    importoCent,
    categoria: null,
    fornitore: fornitore ? { id: fornitore.length, nome: fornitore } : null,
    dipendente: null,
    sede: roma,
    descrizione: null,
    numeroDocumento: null,
    note: null,
    origine: "MANO",
    pagata: false,
    ricorrenza: null,
    allegatoNome: null,
    creatoIl: "2026-11-05T09:00:00",
    modificatoIl: null,
    divisione: null,
    ...extra,
  };
}

describe("fatture ricevute: le parti si uniscono per id comune", () => {
  it("stesso id: una fattura sola, anche senza numero, con date diverse o importata", () => {
    const parti = [
      m("Forno", 334, { divisione: "d1", sede: roma }),
      m("Forno", 333, { divisione: "d1", sede: mare, data: "2026-11-07" }),
      m("Forno", 333, { divisione: "d1", sede: mercato, origine: "XML", numeroDocumento: "F/9" }),
    ];
    const [g] = raggruppaPerFornitore(parti);
    expect(g!.fatture).toHaveLength(1);
    const f = g!.fatture[0]!;
    expect(f.parti.map((p) => p.sede.nome)).toEqual(["Via Roma", "Mercato", "Lungomare"]);
    expect(f.importoCent).toBe(1000);
    expect(testoDivisa(f)).toBe("divisa fra Via Roma, Mercato e Lungomare");
    expect(g!.nDaPagare).toBe(1);
    expect(g!.totaleCent).toBe(1000);
  });

  it("id diversi: due fatture, anche con lo stesso numero e la stessa data", () => {
    const [g] = raggruppaPerFornitore([
      m("Forno", 500, { divisione: "d1", sede: roma, numeroDocumento: "F/1" }),
      m("Forno", 500, { divisione: "d1", sede: mare, numeroDocumento: "F/1" }),
      m("Forno", 400, { divisione: "d2", sede: roma, numeroDocumento: "F/1" }),
      m("Forno", 400, { divisione: "d2", sede: mare, numeroDocumento: "F/1" }),
    ]);
    expect(g!.fatture.map((f) => [f.parti.length, f.importoCent])).toEqual([
      [2, 1000],
      [2, 800],
    ]);
    expect(g!.nDaPagare).toBe(2);
  });

  it("un movimento con l'id non si unisce a uno senza, nemmeno con lo stesso numero", () => {
    const [g] = raggruppaPerFornitore([
      m("Forno", 500, { divisione: "d1", sede: roma, numeroDocumento: "F/1" }),
      m("Forno", 500, { divisione: "d1", sede: mare, numeroDocumento: "F/1" }),
      m("Forno", 500, { sede: mercato, numeroDocumento: "F/1" }),
    ]);
    expect(g!.fatture.map((f) => f.parti.length)).toEqual([2, 1]);
  });

  it("anche senza fornitore le parti con lo stesso id stanno insieme", () => {
    const [g] = raggruppaPerFornitore([m(null, 500, { divisione: "d1", sede: roma }), m(null, 500, { divisione: "d1", sede: mare })]);
    expect(g!.id).toBeNull();
    expect(g!.fatture).toHaveLength(1);
    expect(g!.nDaPagare).toBe(1);
  });

  it("il filtro di sede ne lascia una parte sola: conta 1, con il solo importo di quella sede", () => {
    const [g] = raggruppaPerFornitore([m("Forno", 333, { divisione: "d1", sede: mercato })]);
    expect(g!.fatture).toHaveLength(1);
    expect(g!.fatture[0]!.importoCent).toBe(333);
    expect(testoDivisa(g!.fatture[0]!)).toBeNull();
    expect(riepilogoRicevute([g!])).toMatchObject({ nDaPagare: 1, daPagareCent: 333 });
  });

  it("pagata solo se lo sono tutte le parti; in parte resta fra quelle da pagare, intera", () => {
    const gruppi = raggruppaPerFornitore([
      m("Forno", 500, { divisione: "d1", sede: roma, pagata: true }),
      m("Forno", 500, { divisione: "d1", sede: mare }),
      m("Forno", 200, { divisione: "d2", sede: roma, pagata: true }),
      m("Forno", 200, { divisione: "d2", sede: mare, pagata: true }),
    ]);
    const g = gruppi[0]!;
    expect(g.fatture.map((f) => [f.pagata, f.pagataInParte])).toEqual([
      [false, true],
      [true, false],
    ]);
    expect([g.nDaPagare, g.nPagate]).toEqual([1, 1]);
    expect(filtraDaPagare(gruppi)[0]!.fatture.map((f) => f.parti.length)).toEqual([2]);
  });

  it("una nota di credito divisa è una nota sola", () => {
    const [g] = raggruppaPerFornitore([
      m("Forno", 100, { divisione: "d1", sede: roma, documento: "NOTA_DI_CREDITO" }),
      m("Forno", 100, { divisione: "d1", sede: mare, documento: "NOTA_DI_CREDITO" }),
    ]);
    expect(g!.fatture).toHaveLength(1);
    expect(g!.fatture[0]!.nota).toBe(true);
    expect(g!.totaleCent).toBe(-200);
  });

  it("due parti finite nella stessa sede: una fattura sola, senza «divisa fra» una sede e se stessa", () => {
    const [g] = raggruppaPerFornitore([m("Forno", 500, { divisione: "d1", sede: roma }), m("Forno", 500, { divisione: "d1", sede: roma })]);
    expect(g!.fatture).toHaveLength(1);
    expect(g!.fatture[0]!.importoCent).toBe(1000);
    expect(testoDivisa(g!.fatture[0]!)).toBeNull();
  });
});

describe("fatture ricevute: i movimenti senza id (registrati prima) usano ancora l'euristica", () => {
  it("stesso fornitore, numero, data e documento in sedi diverse: una fattura sola", () => {
    const [g] = raggruppaPerFornitore([m("Forno", 500, { sede: roma, numeroDocumento: "F/1" }), m("Forno", 500, { sede: mare, numeroDocumento: "F/1" })]);
    expect(g!.fatture).toHaveLength(1);
    expect(g!.nDaPagare).toBe(1);
  });
  it("senza numero, o con una parte importata, restano separate", () => {
    const [senzaNumero] = raggruppaPerFornitore([m("Forno", 500, { sede: roma }), m("Forno", 500, { sede: mare })]);
    expect(senzaNumero!.fatture).toHaveLength(2);
    const [importata] = raggruppaPerFornitore([
      m("Forno", 500, { sede: roma, numeroDocumento: "F/1", origine: "XML" }),
      m("Forno", 500, { sede: mare, numeroDocumento: "F/1" }),
    ]);
    expect(importata!.fatture).toHaveLength(2);
  });
});

describe("«Da pagare ai fornitori»: una fattura divisa vale 1", () => {
  it("tre parti senza numero: 1 fattura, con la somma delle parti", () => {
    const r = riassuntoDaPagare(
      [m("Forno", 334, { divisione: "d1", sede: roma }), m("Forno", 333, { divisione: "d1", sede: mare }), m("Forno", 333, { divisione: "d1", sede: mercato })],
      "2026-11",
    );
    expect(r).toMatchObject({ importoCent: 1000, n: 1 });
  });
  it("con il filtro di sede (una parte sola): 1 fattura, con l'importo di quella sede", () => {
    expect(riassuntoDaPagare([m("Forno", 333, { divisione: "d1", sede: mare })], "2026-11")).toMatchObject({ importoCent: 333, n: 1 });
  });
});

describe("contaMovimenti: le parti di una divisione valgono un movimento", () => {
  it("conta una volta le parti con lo stesso id nello stesso mese; i movimenti senza id uno per uno", () => {
    expect(contaMovimenti([])).toBe(0);
    expect(contaMovimenti([m("Forno", 1), m("Forno", 1)])).toBe(2);
    expect(contaMovimenti([m("Forno", 1, { divisione: "d1" }), m("Forno", 1, { divisione: "d1", sede: mare }), m("Forno", 1)])).toBe(2);
    expect(contaMovimenti([m("Forno", 1, { divisione: "d1" }), m("Forno", 1, { divisione: "d2" })])).toBe(2);
  });
  it("in mesi diversi contano una volta per mese, come nelle statistiche per voce", () => {
    expect(contaMovimenti([m("Forno", 1, { divisione: "d1" }), m("Forno", 1, { divisione: "d1", data: "2026-12-01" })])).toBe(2);
  });
});

describe("testoMovimentiElenco: il numero e le righe tornano", () => {
  it("senza divisioni: solo il numero", async () => {
    const { testoMovimentiElenco } = await import("./voci");
    expect(testoMovimentiElenco([m("Forno", 1), m("Forno", 1)])).toBe("2 movimenti");
    expect(testoMovimentiElenco([m("Forno", 1)])).toBe("1 movimento");
  });
  it("con un movimento diviso: dice anche quante righe ha l'elenco", async () => {
    const { testoMovimentiElenco } = await import("./voci");
    const elenco = [m("Forno", 1, { divisione: "d1" }), m("Forno", 1, { divisione: "d1", sede: mare }), m("Forno", 1)];
    expect(testoMovimentiElenco(elenco)).toBe("2 movimenti (3 righe: quelli divisi ne hanno una per sede)");
  });
});
