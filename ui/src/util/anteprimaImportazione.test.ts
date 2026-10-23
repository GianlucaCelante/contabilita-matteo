import { describe, expect, it } from "vitest";
import type { ErroreFileImportato, FatturaLetta } from "../api/importa";
import { conteggiFiltri, filtraFatture, raggruppaErrori, riassuntoSelezione } from "./anteprimaImportazione";

const err = (nomeFile: string, messaggio: string): ErroreFileImportato => ({ nomeFile, messaggio });

describe("raggruppaErrori", () => {
  it("raggruppa i file con lo stesso motivo, dal gruppo più numeroso", () => {
    const g = raggruppaErrori([
      err("a.zip › 1.xml", "Tipo di documento TD17 non ammesso: fattura non importata."),
      err("a.zip › 2.xml", "Importo zero: non c'è nessun costo da registrare."),
      err("a.zip › 3.xml", "Tipo di documento TD17 non ammesso: fattura non importata."),
    ]);
    expect(g.map((x) => [x.messaggio, x.file.length])).toEqual([
      ["Tipo di documento TD17 non ammesso: fattura non importata.", 2],
      ["Importo zero: non c'è nessun costo da registrare.", 1],
    ]);
    expect(g[0]?.file).toEqual(["a.zip › 1.xml", "a.zip › 3.xml"]);
  });
  it("il prefisso «Fattura N: » dei lotti non separa i gruppi e il numero resta accanto al file", () => {
    const g = raggruppaErrori([
      err("lotto.xml", "Fattura 12: Importo zero: non c'è nessun costo da registrare."),
      err("lotto.xml", "Fattura 13: Importo zero: non c'è nessun costo da registrare."),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]?.file).toEqual(["lotto.xml (fattura 12)", "lotto.xml (fattura 13)"]);
  });
  it("nessun errore: nessun gruppo", () => {
    expect(raggruppaErrori([])).toEqual([]);
  });
});

const fatt = (indice: number, fornitore: string, numero: string, extra: Partial<FatturaLetta> = {}): FatturaLetta => ({
  indice,
  nomeFile: `${indice}.xml`,
  fornitore: { nome: fornitore, partitaIva: null },
  numero,
  data: "2026-10-01",
  imponibileCent: 1000,
  ivaCent: 220,
  totaleCent: 1220,
  categoriaSuggerita: null,
  duplicata: false,
  motivo: null,
  notaDiCredito: false,
  ...extra,
});

describe("filtraFatture", () => {
  const tutte = [
    fatt(0, "Forno Rossi Srl", "FT-1"),
    fatt(1, "Molino Quaglia", "7", { duplicata: true, motivo: "Già registrata il 01/10" }),
    fatt(2, "Forno Rossi Srl", "NC-1", { notaDiCredito: true }),
    fatt(3, "Cartiera Verdi", "FT-2"),
  ];
  const escluse = new Set<number>([3]);

  it("senza filtri restano tutte, nell'ordine di lettura", () => {
    expect(filtraFatture(tutte, { testo: "", filtro: "tutte" }, escluse).map((f) => f.indice)).toEqual([0, 1, 2, 3]);
  });
  it("il testo cerca nel fornitore e nel numero, senza badare alle maiuscole", () => {
    expect(filtraFatture(tutte, { testo: "ROSSI", filtro: "tutte" }, escluse).map((f) => f.indice)).toEqual([0, 2]);
    expect(filtraFatture(tutte, { testo: "ft-2", filtro: "tutte" }, escluse).map((f) => f.indice)).toEqual([3]);
  });
  it("i filtri: da importare, già presenti, note di credito, escluse", () => {
    expect(filtraFatture(tutte, { testo: "", filtro: "daImportare" }, escluse).map((f) => f.indice)).toEqual([0, 2]);
    expect(filtraFatture(tutte, { testo: "", filtro: "giaPresenti" }, escluse).map((f) => f.indice)).toEqual([1]);
    expect(filtraFatture(tutte, { testo: "", filtro: "noteDiCredito" }, escluse).map((f) => f.indice)).toEqual([2]);
    expect(filtraFatture(tutte, { testo: "", filtro: "escluse" }, escluse).map((f) => f.indice)).toEqual([3]);
  });
  it("i conteggi dei filtri non dipendono dal testo", () => {
    expect(conteggiFiltri(tutte, escluse)).toEqual({ tutte: 4, daImportare: 2, giaPresenti: 1, noteDiCredito: 1, escluse: 1 });
  });
});

describe("riassuntoSelezione", () => {
  it("separa fatture e note di credito, con i loro totali", () => {
    const sel = [fatt(0, "A", "1", { totaleCent: 1000 }), fatt(1, "B", "2", { totaleCent: 500 }), fatt(2, "A", "NC", { totaleCent: 200, notaDiCredito: true })];
    expect(riassuntoSelezione(sel)).toEqual({ fatture: 2, fattureCent: 1500, note: 1, noteCent: 200 });
  });
  it("niente selezionato: tutto a zero", () => {
    expect(riassuntoSelezione([])).toEqual({ fatture: 0, fattureCent: 0, note: 0, noteCent: 0 });
  });
});
