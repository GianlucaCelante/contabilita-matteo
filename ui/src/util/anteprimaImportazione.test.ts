import { describe, expect, it } from "vitest";
import type { ErroreFileImportato, FatturaLetta } from "../api/importa";
import { altreDelFornitore, applicaCategoriaAlFornitore, conteggiFiltri, etichetteDocumento, filtraFatture, spiegazioniDocumento, titoloCaricamento, raggruppaErrori, riassuntoSelezione, stessoFornitore, testoRiassunto, totaleNettoCent } from "./anteprimaImportazione";

const err = (nomeFile: string, messaggio: string): ErroreFileImportato => ({ nomeFile, messaggio });

describe("raggruppaErrori", () => {
  it("raggruppa i file con lo stesso motivo, dal gruppo più numeroso", () => {
    const g = raggruppaErrori([
      err("a.zip › 1.xml", "Tipo di documento non gestito (cessione di beni ammortizzabili): non importato."),
      err("a.zip › 2.xml", "Importo zero: non c'è nessun costo da registrare."),
      err("a.zip › 3.xml", "Tipo di documento non gestito (cessione di beni ammortizzabili): non importato."),
    ]);
    expect(g.map((x) => [x.messaggio, x.file.length])).toEqual([
      ["Tipo di documento non gestito (cessione di beni ammortizzabili): non importato.", 2],
      ["Importo zero: non c'è nessun costo da registrare.", 1],
    ]);
    expect(g[0]?.file).toEqual(["a.zip › 1.xml", "a.zip › 3.xml"]);
  });
  // s35: il servizio parla già in italiano semplice (niente codici TD…): il messaggio si mostra com'è, senza riscriverlo.
  it("il messaggio del servizio si mostra com'è, anche dentro un lotto", () => {
    const g = raggruppaErrori([
      err("a.xml", "Autofattura di integrazione: non importata, la fattura originale del fornitore è già una fattura a parte."),
      err("lotto.xml", "Fattura 7: Tipo di documento non gestito (autofattura): non importato."),
    ]);
    expect(g.map((x) => [x.messaggio, x.file])).toEqual([
      ["Autofattura di integrazione: non importata, la fattura originale del fornitore è già una fattura a parte.", ["a.xml"]],
      ["Tipo di documento non gestito (autofattura): non importato.", ["lotto.xml (fattura 7)"]],
    ]);
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
  integrazione: false,
  tipoDocumento: "TD01",
  notaDiDebito: false,
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
    expect(conteggiFiltri(tutte, escluse)).toEqual({ tutte: 4, daImportare: 2, giaPresenti: 1, noteDiCredito: 1, integrazioni: 0, escluse: 1 });
  });
});

describe("integrazioni", () => {
  it("si filtrano a parte (autofatture per acquisti dall'estero)", () => {
    const f = [fatt(0, "Meta Platforms Ireland", "S1", { integrazione: true }), fatt(1, "Forno Rossi Srl", "FT-1")];
    expect(filtraFatture(f, { testo: "", filtro: "integrazioni" }, new Set()).map((x) => x.indice)).toEqual([0]);
    expect(conteggiFiltri(f, new Set()).integrazioni).toBe(1);
  });
});

// s47: accanto al fornitore l'anteprima dice che documento e', quando non e' una fattura qualunque.
describe("etichetteDocumento", () => {
  it("una fattura qualunque non ha etichette", () => {
    expect(etichetteDocumento(fatt(0, "Forno Rossi Srl", "FT-1"))).toEqual([]);
  });
  it("la nota di credito è in evidenza; integrazione e nota di debito sono discrete e spiegano che contano come costo", () => {
    expect(etichetteDocumento(fatt(0, "A", "NC-1", { notaDiCredito: true, tipoDocumento: "TD04" }))).toEqual([{ testo: "Nota di credito", tono: "credito" }]);
    expect(etichetteDocumento(fatt(0, "A", "S1", { integrazione: true, tipoDocumento: "TD17" }))).toEqual([
      { testo: "Integrazione", tono: "discreto", spiegazione: "Autofattura per un acquisto dall'estero: conta come costo." },
    ]);
    expect(etichetteDocumento(fatt(0, "A", "ND-1", { notaDiDebito: true, tipoDocumento: "TD05" }))).toEqual([
      { testo: "Nota di debito", tono: "discreto", spiegazione: "Il fornitore chiede un importo in più rispetto a una fattura già emessa: conta come costo." },
    ]);
  });
  it("una nota di debito conta fra le fatture nel riassunto (è un costo in più), non fra le note di credito", () => {
    const r = riassuntoSelezione([fatt(0, "A", "1", { totaleCent: 100000 }), fatt(1, "A", "ND", { totaleCent: 5000, notaDiDebito: true, tipoDocumento: "TD05" })]);
    expect(r).toEqual({ fatture: 2, fattureCent: 105000, note: 0, noteCent: 0 });
  });
  it("le spiegazioni sono frasi intere, da scrivere sotto il fornitore (non un suggerimento al passaggio del mouse)", () => {
    const tutte = etichetteDocumento(fatt(0, "A", "1", { notaDiCredito: true, integrazione: true, notaDiDebito: true }));
    expect(spiegazioniDocumento(fatt(0, "A", "1", { notaDiCredito: true, integrazione: true, notaDiDebito: true }))).toEqual(tutte.flatMap((e) => (e.spiegazione ? [e.spiegazione] : [])));
    expect(spiegazioniDocumento(fatt(0, "A", "ND", { notaDiDebito: true }))).toEqual(["Il fornitore chiede un importo in più rispetto a una fattura già emessa: conta come costo."]);
    expect(spiegazioniDocumento(fatt(0, "A", "NC", { notaDiCredito: true }))).toEqual([]);
    expect(spiegazioniDocumento(fatt(0, "A", "1"))).toEqual([]);
  });
  it("un servizio più vecchio, senza il campo, non fa comparire etichette in più", () => {
    const vecchia = fatt(0, "A", "1") as Partial<FatturaLetta>;
    delete vecchia.notaDiDebito;
    delete vecchia.tipoDocumento;
    expect(etichetteDocumento(vecchia as FatturaLetta)).toEqual([]);
  });
});

describe("testoRiassunto", () => {
  it("le note di credito si mostrano in meno, perché riducono i costi", () => {
    const r = riassuntoSelezione([fatt(0, "A", "1", { totaleCent: 100000 }), fatt(1, "A", "NC", { totaleCent: 5000, notaDiCredito: true })]);
    expect(testoRiassunto(r)).toBe("1 fattura · € 1.000,00 · 1 nota di credito · −€ 50,00");
  });
});

describe("totaleNettoCent", () => {
  it("le fatture meno le note di credito: il numero solo della barra sul telefono", () => {
    const r = riassuntoSelezione([fatt(0, "A", "1", { totaleCent: 100000 }), fatt(1, "A", "NC", { totaleCent: 5000, notaDiCredito: true })]);
    expect(totaleNettoCent(r)).toBe(95000);
  });
  it("niente selezionato: zero", () => {
    expect(totaleNettoCent(riassuntoSelezione([]))).toBe(0);
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

describe("stessoFornitore / altreDelFornitore / applicaCategoriaAlFornitore", () => {
  const forno = (indice: number, extra: Partial<FatturaLetta> = {}) => fatt(indice, "Forno Rossi Srl", `FT-${indice}`, extra);
  const tutte = [
    forno(0),
    forno(1),
    forno(2, { duplicata: true }),
    fatt(3, "Cartiera Verdi", "FT-9"),
    fatt(4, "FORNO  rossi srl", "FT-10"), // stesso nome scritto in modo diverso, senza partita IVA
    fatt(5, "Altro Nome", "FT-11", { fornitore: { nome: "Altro Nome", partitaIva: "01234567890" } }),
    fatt(6, "Nome Diverso", "FT-12", { fornitore: { nome: "Nome Diverso", partitaIva: "01234567890" } }), // stessa P.IVA di 5
  ];

  it("stesso fornitore: stessa partita IVA, altrimenti stesso nome senza badare a maiuscole e spazi", () => {
    expect(stessoFornitore(tutte[0]!, tutte[4]!)).toBe(true);
    expect(stessoFornitore(tutte[0]!, tutte[3]!)).toBe(false);
    expect(stessoFornitore(tutte[5]!, tutte[6]!)).toBe(true);
  });

  it("le altre da aggiornare: stesso fornitore, non già registrate, non la riga stessa, con categoria diversa", () => {
    const categorie = { 0: "Farine", 1: "Farine", 2: "", 3: "", 4: "Altro" };
    expect(altreDelFornitore(tutte, tutte[0]!, categorie).map((f) => f.indice)).toEqual([4]);
  });

  it("applica la categoria a tutte le altre del fornitore e lascia stare il resto", () => {
    const categorie = { 0: "Farine", 1: "", 2: "", 3: "Carta", 4: "Altro", 5: "", 6: "" };
    const dopo = applicaCategoriaAlFornitore(tutte, tutte[0]!, categorie);
    expect(dopo).toEqual({ 0: "Farine", 1: "Farine", 2: "", 3: "Carta", 4: "Farine", 5: "", 6: "" });
    expect(categorie[1]).toBe(""); // l'originale non cambia
  });

  it("senza categoria sulla riga non si applica nulla", () => {
    const categorie = { 0: "  ", 1: "X" };
    expect(altreDelFornitore(tutte, tutte[0]!, categorie)).toEqual([]);
    expect(applicaCategoriaAlFornitore(tutte, tutte[0]!, categorie)).toEqual(categorie);
  });
});

describe("titoloCaricamento", () => {
  it("su touch si sceglie, sul computer si trascina", () => {
    expect(titoloCaricamento(true)).toBe("Scegli le fatture elettroniche o lo ZIP");
    expect(titoloCaricamento(false)).toBe("Trascina qui le fatture elettroniche o lo ZIP");
  });
});
