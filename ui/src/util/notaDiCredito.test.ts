import { describe, expect, it } from "vitest";
import type { Movimento } from "../api/tipi";
import { aumentaIlSaldo, NOME_DOCUMENTO } from "./etichette";
import { aiutoDocumento, campiPerUnAltro, campiVuoti, chiedeDescrizione, chiedeFornitore, daMovimento, DOCUMENTI_VARIABILI, documentoDi, effettoSulTotale, etichettaNumero, preparaInput, ripetibile, spostaDescrizioneNelleNote } from "./modelloMovimento";

const nota = {
  id: 7,
  data: "2026-10-09",
  tipo: "COSTO_VARIABILE",
  documento: "NOTA_DI_CREDITO",
  importoCent: 2440,
  categoria: { id: 1, nome: "Farine" },
  fornitore: { id: 1, nome: "Forno Rossi Srl" },
  dipendente: null,
  descrizione: null,
  numeroDocumento: "NC-1",
  note: null,
  origine: "XML",
  ricorrenza: null,
  allegatoNome: "nc.xml",
} as unknown as Movimento;

describe("nota di credito nell'interfaccia", () => {
  it("fa salire il saldo come un ricavo, anche se è un costo variabile", () => {
    expect(aumentaIlSaldo(nota)).toBe(true);
    expect(aumentaIlSaldo({ ...nota, documento: "FATTURA" })).toBe(false);
    expect(aumentaIlSaldo({ ...nota, tipo: "RICAVO", documento: "RICAVO_EXTRA" })).toBe(true);
  });
  it("modificando una nota di credito il documento resta quello (non diventa una fattura)", () => {
    const campi = daMovimento(nota);
    expect(campi.documentoVariabile).toBe("NOTA_DI_CREDITO");
    const { errori, input } = preparaInput(campi, false);
    expect(errori).toEqual({});
    expect(input?.documento).toBe("NOTA_DI_CREDITO");
    expect(input?.numeroDocumento).toBe("NC-1");
    expect(input?.fornitore).toBe("Forno Rossi Srl");
    expect(input?.importoCent).toBe(2440);
  });
  it("come per una fattura, il fornitore è obbligatorio", () => {
    expect(chiedeFornitore({ ...campiVuoti(), tipo: "COSTO_VARIABILE", documentoVariabile: "NOTA_DI_CREDITO" })).toBe("si");
    const r = preparaInput({ ...campiVuoti(), tipo: "COSTO_VARIABILE", documentoVariabile: "NOTA_DI_CREDITO", importo: "10", fornitore: "" }, false);
    expect(r.errori.fornitore).toBeTruthy();
  });
});

// La nota di credito di carta: si registra a mano da «Nuovo movimento», come costo variabile (l'unico tipo che il servizio ammette).
describe("nota di credito a mano", () => {
  const aMano = { ...campiVuoti(), tipo: "COSTO_VARIABILE" as const, documentoVariabile: "NOTA_DI_CREDITO" as const, data: "2026-11-10", importo: "24,40", fornitore: "Forno Rossi Srl", categoria: "Farine" };

  it("ogni scelta del campo Documento ha il nome che il documento ha nel resto dell'app, e scegliendola è quello il documento inviato", () => {
    for (const o of DOCUMENTI_VARIABILI) {
      expect(o.etichetta).toBe(NOME_DOCUMENTO[o.valore]);
      expect(documentoDi({ ...aMano, documentoVariabile: o.valore })).toBe(o.valore);
    }
    // la nota di credito è l'ultima: fattura e scontrino, i più usati, restano dove erano
    expect(DOCUMENTI_VARIABILI.at(-1)?.valore).toBe("NOTA_DI_CREDITO");
    expect(new Set(DOCUMENTI_VARIABILI.map((o) => o.valore)).size).toBe(3);
  });
  it("si salva con importo positivo, fornitore, categoria e numero; senza «pagata»", () => {
    const { errori, input } = preparaInput({ ...aMano, numeroDocumento: " NC-7 ", pagata: true }, true);
    expect(errori).toEqual({});
    expect(input).toEqual({ data: "2026-11-10", tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 2440, fornitore: "Forno Rossi Srl", categoria: "Farine", numeroDocumento: "NC-7" });
  });
  it("come la fattura non ha la descrizione: quella già scritta (per uno scontrino) passa nelle Note, e si salva", () => {
    expect(chiedeDescrizione(aMano)).toBe(false);
    expect(chiedeDescrizione({ ...aMano, documentoVariabile: "FATTURA" })).toBe(false);
    const scontrino = { ...aMano, documentoVariabile: "SCONTRINO" as const, descrizione: " Reso cartoni " };
    // finché il documento ha la descrizione non si tocca niente (stesso oggetto)
    expect(spostaDescrizioneNelleNote(scontrino)).toBe(scontrino);
    for (const documentoVariabile of ["NOTA_DI_CREDITO", "FATTURA"] as const) {
      const dopo = spostaDescrizioneNelleNote({ ...scontrino, documentoVariabile });
      expect(dopo).toMatchObject({ descrizione: "", note: "Reso cartoni" });
      const { input } = preparaInput(dopo, true);
      expect(input?.note).toBe("Reso cartoni");
      expect(input).not.toHaveProperty("descrizione");
    }
    // se le note ci sono già la descrizione si accoda; senza descrizione non cambia niente
    expect(spostaDescrizioneNelleNote({ ...scontrino, documentoVariabile: "FATTURA", note: "da verificare" }).note).toBe("da verificare · Reso cartoni");
    const vuota = { ...aMano, descrizione: "  ", note: "x" };
    expect(spostaDescrizioneNelleNote(vuota)).toBe(vuota);
    // vale anche cambiando tipo: la descrizione di un ricavo che diventa una fattura
    expect(spostaDescrizioneNelleNote({ ...aMano, documentoVariabile: "FATTURA", descrizione: "Catering" }).note).toBe("Catering");
    expect(spostaDescrizioneNelleNote({ ...aMano, tipo: "RICAVO", descrizione: "Catering" }).descrizione).toBe("Catering");
  });
  it("«Salva e aggiungine un altro» dopo una nota di credito riparte da Fattura; dopo uno scontrino resta Scontrino", () => {
    const dopoNota = campiPerUnAltro({ ...aMano, numeroDocumento: "NC-7", note: "x", descrizione: "Reso", sedeId: 2 });
    expect(dopoNota).toMatchObject({ tipo: "COSTO_VARIABILE", documentoVariabile: "FATTURA", data: "2026-11-10", sedeId: 2, importo: "", fornitore: "", categoria: "", numeroDocumento: "", note: "", descrizione: "", pagata: false });
    expect(campiPerUnAltro({ ...aMano, documentoVariabile: "SCONTRINO" }).documentoVariabile).toBe("SCONTRINO");
    expect(campiPerUnAltro({ ...aMano, documentoVariabile: "FATTURA" }).documentoVariabile).toBe("FATTURA");
    // il resto come prima: un costo fisso tiene la voce e il tipo di retribuzione, un ricavo il suo tipo
    expect(campiPerUnAltro({ ...campiVuoti(), tipo: "COSTO_FISSO", categoria: "Stipendi", eRetribuzione: true, retribuzione: "EXTRA", importo: "10" })).toMatchObject({ tipo: "COSTO_FISSO", categoria: "Stipendi", eRetribuzione: true, retribuzione: "EXTRA", importo: "" });
    expect(campiPerUnAltro({ ...campiVuoti(), tipo: "RICAVO", tipoRicavo: "RICAVO_EXTRA", categoria: "Sala", dividi: true, sediDivise: [1, 2] })).toMatchObject({ tipo: "RICAVO", tipoRicavo: "RICAVO_EXTRA", categoria: "", dividi: true, sediDivise: [1, 2] });
  });
  it("la categoria è obbligatoria come per la fattura, e l'importo non si scrive col meno", () => {
    expect(preparaInput({ ...aMano, categoria: "" }, true).errori.categoria).toBeTruthy();
    expect(preparaInput({ ...aMano, importo: "-24,40" }, true).errori.importo).toBeTruthy();
  });
  it("non si ripete: anche con «Ripeti» acceso la ricorrenza non parte", () => {
    expect(ripetibile(aMano)).toBe(false);
    expect(preparaInput({ ...aMano, ripeti: true, giorno: "10" }, true).input?.ricorrenza).toBeUndefined();
  });
  it("il campo del numero prende il nome del documento", () => {
    expect(etichettaNumero(aMano)).toBe("N. nota di credito");
    expect(etichettaNumero({ ...aMano, documentoVariabile: "FATTURA" })).toBe("N. fattura");
    // sul telefono il campo sta in mezza riga accanto alla Foto: l'etichetta corta sta su una riga con «(facoltativo)»
    expect(etichettaNumero(aMano, true)).toBe("N. nota");
    expect(etichettaNumero({ ...aMano, documentoVariabile: "FATTURA" }, true)).toBe("N. fattura");
  });
  it("sotto la scelta c'è un aiuto breve, solo per la nota di credito", () => {
    expect(aiutoDocumento(aMano)).toMatch(/riduce i costi/i);
    expect(aiutoDocumento(aMano)).toMatch(/fornitore/i);
    expect(aiutoDocumento({ ...aMano, documentoVariabile: "FATTURA" })).toBeNull();
    expect(aiutoDocumento({ ...aMano, documentoVariabile: "SCONTRINO" })).toBeNull();
    expect(aiutoDocumento({ ...aMano, tipo: "RICAVO" })).toBeNull();
  });
  it("«Con questo movimento» del riquadro Dove finisce: la nota toglie, gli altri aggiungono", () => {
    expect(effettoSulTotale(aMano, 2440)).toBe(-2440);
    expect(effettoSulTotale({ ...aMano, documentoVariabile: "FATTURA" }, 2440)).toBe(2440);
    expect(effettoSulTotale({ ...aMano, documentoVariabile: "SCONTRINO" }, 2440)).toBe(2440);
    // il documento dei costi variabili non conta per gli altri tipi
    expect(effettoSulTotale({ ...aMano, tipo: "RICAVO" }, 2440)).toBe(2440);
    expect(effettoSulTotale({ ...aMano, tipo: "COSTO_FISSO" }, 2440)).toBe(2440);
  });
  it("passando da fattura pagata a nota di credito «pagata» non si manda più", () => {
    const fattura = { ...aMano, documentoVariabile: "FATTURA" as const, pagata: true };
    expect(preparaInput(fattura, false).input?.pagata).toBe(true);
    expect(preparaInput({ ...fattura, documentoVariabile: "NOTA_DI_CREDITO" }, false).input).not.toHaveProperty("pagata");
  });
});
