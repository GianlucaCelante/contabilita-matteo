import { describe, expect, it } from "vitest";
import type { CasellaConMesi } from "../api/tipi";
import {
  aggiungiMesiMese,
  conteggioMese,
  contaMesi,
  dataScadenza,
  elencoMesi,
  erroreNomeCasella,
  etichettaComandoStato,
  giorniMancanti,
  leggiGiornoScadenza,
  leggiImportoFattura,
  meseBreve,
  nomeMeseAnno,
  nomeRelativoMese,
  passoSuccessivo,
  puoAndareAvantiMese,
  righePromemoria,
  testoDaEmettere,
  testoScadenza,
  tonoScadenza,
  tonoVoce,
  tonoStato,
  ultimiMesi,
} from "./fatture";

describe("fatture: mesi", () => {
  it("somma e sottrae mesi anche a cavallo dell'anno", () => {
    expect(aggiungiMesiMese("2026-11", 2)).toBe("2027-01");
    expect(aggiungiMesiMese("2026-01", -1)).toBe("2025-12");
    expect(aggiungiMesiMese("2026-05", 0)).toBe("2026-05");
  });
  it("elenca i mesi di un intervallo, compresi gli estremi", () => {
    expect(contaMesi("2026-10", "2026-12")).toBe(3);
    expect(contaMesi("2026-12", "2026-10")).toBe(0);
    expect(elencoMesi("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(ultimiMesi("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
  it("scrive i nomi in italiano", () => {
    expect(nomeMeseAnno("2026-11")).toBe("Novembre 2026");
    expect(meseBreve("2026-03")).toBe("mar");
    expect(nomeRelativoMese("2026-11", "2026-11")).toBe("Questo mese");
    expect(nomeRelativoMese("2026-10", "2026-11")).toBe("Mese scorso");
    expect(nomeRelativoMese("2026-12", "2026-11")).toBe("Mese prossimo");
    expect(nomeRelativoMese("2026-03", "2026-11")).toBe("2026");
  });
  it("si puo' guardare avanti solo di un mese", () => {
    expect(puoAndareAvantiMese("2026-11", "2026-11")).toBe(true);
    expect(puoAndareAvantiMese("2026-12", "2026-11")).toBe(false);
  });
});

describe("fatture: stati", () => {
  it("il passo successivo va da Da fare a Emessa a Pagata, poi si ferma", () => {
    expect(passoSuccessivo("DA_FARE")?.stato).toBe("EMESSA");
    expect(passoSuccessivo("EMESSA")?.stato).toBe("PAGATA");
    expect(passoSuccessivo("PAGATA")).toBeNull();
  });
  it("l'etichetta del badge dice lo stato e cosa succede al tocco; da Pagata non si avanza", () => {
    expect(etichettaComandoStato("Fatture eventi", "DA_FARE")).toBe("Fatture eventi: Da fare. Segna come emessa");
    expect(etichettaComandoStato("Fatture eventi", "EMESSA")).toBe("Fatture eventi: Emessa. Segna come pagata");
    expect(etichettaComandoStato("Fatture eventi", "PAGATA")).toBe("Fatture eventi: Pagata. Per cambiarla usa «Importo, nota e stato»");
  });
  it("un Da fare di un mese passato e' in ritardo", () => {
    expect(tonoStato("DA_FARE", "2026-10", "2026-11")).toBe("ritardo");
    expect(tonoStato("DA_FARE", "2026-11", "2026-11")).toBe("fare");
    expect(tonoStato("EMESSA", "2026-01", "2026-11")).toBe("emessa");
    expect(tonoStato("PAGATA", "2026-01", "2026-11")).toBe("pagata");
  });
  it("conta gli stati del mese e somma gli importi; i mesi mancanti sono Da fare", () => {
    const caselle: CasellaConMesi[] = [
      { id: 1, nome: "A", dalMese: "2026-01", giornoScadenza: null, mesi: [{ mese: "2026-11", stato: "EMESSA", importoCent: 10000, nota: null, attiva: true, scadenza: null }] },
      { id: 2, nome: "B", dalMese: "2026-01", giornoScadenza: null, mesi: [{ mese: "2026-11", stato: "PAGATA", importoCent: 2500, nota: null, attiva: true, scadenza: null }] },
      { id: 3, nome: "C", dalMese: "2026-01", giornoScadenza: null, mesi: [] },
      { id: 4, nome: "D", dalMese: "2026-01", giornoScadenza: null, mesi: [{ mese: "2026-11", stato: "EMESSA", importoCent: null, nota: "n", attiva: true, scadenza: null }] },
      // una casella creata a dicembre: novembre non conta (niente arretrati)
      { id: 5, nome: "E", dalMese: "2026-12", giornoScadenza: null, mesi: [{ mese: "2026-11", stato: "DA_FARE", importoCent: null, nota: null, attiva: false, scadenza: null }] },
    ];
    expect(conteggioMese(caselle, "2026-11")).toEqual({ daFare: 1, emesse: 2, pagate: 1, daIncassareCent: 10000, pagateCent: 2500 });
  });
});

describe("fatture: campi", () => {
  it("il nome non puo' essere vuoto ne' troppo lungo", () => {
    expect(erroreNomeCasella("  ")).not.toBeNull();
    expect(erroreNomeCasella("x".repeat(121))).not.toBeNull();
    expect(erroreNomeCasella("Euro Service")).toBeNull();
  });
  it("l'importo vuoto e' nessun importo, zero e' ammesso, il resto va letto", () => {
    expect(leggiImportoFattura("")).toEqual({ cent: null, errore: null });
    expect(leggiImportoFattura("0")).toEqual({ cent: 0, errore: null });
    expect(leggiImportoFattura("1.250,50")).toEqual({ cent: 125050, errore: null });
    expect(leggiImportoFattura("abc").errore).not.toBeNull();
  });
});

describe("fatture: scadenze", () => {
  it("la data limite del mese: nei mesi corti vale l'ultimo giorno", () => {
    expect(dataScadenza("2026-11", 28)).toBe("2026-11-28");
    expect(dataScadenza("2026-02", 31)).toBe("2026-02-28");
    expect(dataScadenza("2028-02", 30)).toBe("2028-02-29");
    expect(dataScadenza("2026-04", 31)).toBe("2026-04-30");
    expect(dataScadenza("2026-04", 5)).toBe("2026-04-05");
    expect(dataScadenza("2026-04", null)).toBeNull();
  });
  it("giorni mancanti = scadenza - oggi, negativo se scaduta (anche a cavallo del mese)", () => {
    expect(giorniMancanti("2026-11-07", "2026-11-04")).toBe(3);
    expect(giorniMancanti("2026-11-04", "2026-11-04")).toBe(0);
    expect(giorniMancanti("2026-11-02", "2026-11-04")).toBe(-2);
    expect(giorniMancanti("2026-12-01", "2026-11-30")).toBe(1);
  });
  it("il testo dice quando scade: la data se manca piu' di tre giorni, poi i giorni", () => {
    expect(testoScadenza("2026-11-28", "2026-11-04")).toBe("Scade il 28");
    expect(testoScadenza("2026-11-08", "2026-11-04")).toBe("Scade il 8");
    expect(testoScadenza("2026-11-07", "2026-11-04")).toBe("Scade tra 3 giorni");
    expect(testoScadenza("2026-11-05", "2026-11-04")).toBe("Scade domani");
    expect(testoScadenza("2026-11-04", "2026-11-04")).toBe("Scade oggi");
    expect(testoScadenza("2026-11-03", "2026-11-04")).toBe("Scaduta ieri");
    expect(testoScadenza("2026-11-02", "2026-11-04")).toBe("Scaduta da 2 giorni");
  });
  it("il tono: ambra nei tre giorni, rosso se scaduta, neutro altrimenti", () => {
    expect(tonoScadenza("2026-11-28", "2026-11-04")).toBe("neutro");
    expect(tonoScadenza("2026-11-07", "2026-11-04")).toBe("vicina");
    expect(tonoScadenza("2026-11-04", "2026-11-04")).toBe("vicina");
    expect(tonoScadenza("2026-11-03", "2026-11-04")).toBe("scaduta");
  });
  it("un mese non attivo e' neutro, non in ritardo", () => {
    const voce = { mese: "2026-09", stato: "DA_FARE" as const, importoCent: null, nota: null, attiva: false, scadenza: null };
    expect(tonoVoce(voce, "2026-11")).toBe("inattiva");
    expect(tonoVoce({ ...voce, attiva: true }, "2026-11")).toBe("ritardo");
    expect(tonoVoce({ ...voce, mese: "2026-11", attiva: true }, "2026-11")).toBe("fare");
    expect(tonoVoce({ ...voce, stato: "PAGATA", attiva: true }, "2026-11")).toBe("pagata");
  });
  it("il testo della Home", () => {
    expect(testoDaEmettere(3)).toBe("Fatture da emettere questo mese: 3");
    expect(testoDaEmettere(1)).toBe("Fatture da emettere questo mese: 1");
  });
  it("le righe in evidenza della Home: al massimo due, poi «e altre N»", () => {
    const s = (nome: string, giorni: number) => ({ casellaId: 1, nome, mese: "2026-11", scadenza: "2026-11-07", giorniMancanti: giorni });
    expect(righePromemoria([])).toEqual({ righe: [], altre: 0 });
    expect(righePromemoria([s("Fattura a Rossi", 3)])).toEqual({ righe: ["Fattura a Rossi: scade tra 3 giorni"], altre: 0 });
    const r = righePromemoria([s("A", -2), s("B", 0), s("C", 1), s("D", 3)]);
    expect(r.righe).toEqual(["A: scaduta da 2 giorni", "B: scade oggi"]);
    expect(r.altre).toBe(2);
  });
  it("il giorno di scadenza scritto: vuoto = nessuna, da 1 a 31 intero", () => {
    expect(leggiGiornoScadenza("")).toEqual({ giorno: null, errore: null });
    expect(leggiGiornoScadenza("  ")).toEqual({ giorno: null, errore: null });
    expect(leggiGiornoScadenza("28")).toEqual({ giorno: 28, errore: null });
    expect(leggiGiornoScadenza("31").giorno).toBe(31);
    for (const x of ["0", "32", "2,5", "abc", "-1"]) expect(leggiGiornoScadenza(x).errore).not.toBeNull();
  });
});
