import { describe, expect, it } from "vitest";
import type { FonteStatistica, RigaSettimana } from "../api/tipi";
import { aggiungiGiorni } from "./formato";
import {
  badgeSede,
  cambiaModo,
  giornoFuturo,
  corpoSettimanaCompleta,
  nomeGiorno,
  preparaPiano,
  riassuntoSede,
  scontrinoGiorno,
  modificheNellAltroModo,
  sedeDaSalvare,
  sedeModificata,
  statoIniziale,
  testoSovrascrittura,
  type StatoSede,
} from "./pizzeOrdini";

const LUNEDI = "2026-03-02";

// Una sede in una settimana come la manda GET /statistiche/settimana: `giorni` = [pizze, ordini] o null, 100 € di ricavi al giorno.
function riga(id: number, nome: string, fonte: FonteStatistica | null, giorni: ([number, number] | null)[] = [], totale: [number, number] | null = null): RigaSettimana {
  const sette = Array.from({ length: 7 }, (_, i) => giorni[i] ?? null);
  const inseriti = sette.filter((g) => g !== null) as [number, number][];
  const pizze = fonte === "SETTIMANA" ? totale![0] : fonte === "GIORNI" ? inseriti.reduce((s, g) => s + g[0], 0) : null;
  const ordini = fonte === "SETTIMANA" ? totale![1] : fonte === "GIORNI" ? inseriti.reduce((s, g) => s + g[1], 0) : null;
  return {
    sede: { id, nome },
    pizze,
    ordini,
    ricaviCent: 70000,
    scontrinoMedioCent: null,
    pizzePerOrdine: null,
    completa: fonte !== null,
    ricaviTotaliCent: 70000,
    ricaviExtraCent: 0,
    ricaviConDatiCent: 0,
    fonte,
    giorniInseriti: fonte === "GIORNI" ? inseriti.length : 0,
    giorni: sette.map((g, i) => ({
      data: aggiungiGiorni(LUNEDI, i),
      pizze: g ? g[0] : null,
      ordini: g ? g[1] : null,
      ricaviTotaliCent: 10000,
      ricaviExtraCent: 0,
      scontrinoMedioCent: null,
      pizzePerOrdine: null,
    })),
  };
}

const mappa = (righe: RigaSettimana[], cambia: (id: number, s: StatoSede) => StatoSede = (_, s) => s) =>
  new Map(righe.map((r) => [r.sede.id, cambia(r.sede.id, statoIniziale(r))]));

describe("come si apre una sede", () => {
  it("nel modo salvato; senza dati giorno per giorno", () => {
    expect(statoIniziale(riga(1, "A", null)).modo).toBe("GIORNI");
    expect(statoIniziale(riga(1, "A", "SETTIMANA", [], [70, 30])).modo).toBe("SETTIMANA");
    expect(statoIniziale(riga(1, "A", "GIORNI", [[9, 4]])).modo).toBe("GIORNI");
  });

  it("i giorni dal servizio; il totale vuoto se la sede usa i giorni (la somma non è un totale salvato)", () => {
    const g = statoIniziale(riga(1, "A", "GIORNI", [[9, 4], null, [0, 0]]));
    expect(g.giorni).toHaveLength(7);
    expect(g.giorni[0]).toEqual({ pizze: "9", ordini: "4" });
    expect(g.giorni[1]).toEqual({ pizze: "", ordini: "" });
    expect(g.giorni[2]).toEqual({ pizze: "0", ordini: "0" });
    expect(g.settimana).toEqual({ pizze: "", ordini: "" });
    expect(statoIniziale(riga(1, "A", "SETTIMANA", [], [70, 30])).settimana).toEqual({ pizze: "70", ordini: "30" });
  });
});

describe("riassunto e scontrino di una sede", () => {
  it("giorno per giorno: ricavi dei soli giorni con dati e ordini", () => {
    const r = riga(1, "A", "GIORNI", [[9, 4], [0, 0]]);
    expect(riassuntoSede(r, statoIniziale(r))).toMatchObject({ stato: "completa", inserite: 2, pizze: 9, ordini: 4, ricaviConDatiCent: 10000, scontrinoMedioCent: 2500 });
  });

  it("totale della settimana: ricavi di tutta la settimana", () => {
    const r = riga(1, "A", "SETTIMANA", [], [70, 28]);
    expect(riassuntoSede(r, statoIniziale(r))).toMatchObject({ stato: "completa", ordini: 28, ricaviConDatiCent: 70000, scontrinoMedioCent: 2500 });
  });
});

describe("cambio di modo", () => {
  it("passando a «Totale della settimana» i campi partono dalla somma dei giorni inseriti", () => {
    const r = riga(1, "A", "GIORNI", [[90, 30], [50, 20], null, [10, 5]]);
    const dopo = cambiaModo(statoIniziale(r), "SETTIMANA");
    expect(dopo.modo).toBe("SETTIMANA");
    expect(dopo.settimana).toEqual({ pizze: "150", ordini: "55" });
    expect(dopo.giorni).toEqual(statoIniziale(r).giorni);
  });
  it("conta anche i giorni appena scritti (non salvati)", () => {
    const ini = statoIniziale(riga(1, "A", null));
    const giorni = ini.giorni.map((c, i) => (i === 0 ? { pizze: "12", ordini: "4" } : i === 1 ? { pizze: "7", ordini: "3" } : c));
    expect(cambiaModo({ ...ini, giorni }, "SETTIMANA").settimana).toEqual({ pizze: "19", ordini: "7" });
  });
  it("con un giorno incompleto o non valido non si precompila: il totale resta vuoto", () => {
    const ini = statoIniziale(riga(1, "A", null));
    const incompleto = ini.giorni.map((c, i) => (i === 0 ? { pizze: "12", ordini: "4" } : i === 1 ? { pizze: "7", ordini: "" } : c));
    expect(cambiaModo({ ...ini, giorni: incompleto }, "SETTIMANA").settimana).toEqual({ pizze: "", ordini: "" });
    const sbagliato = ini.giorni.map((c, i) => (i === 0 ? { pizze: "12", ordini: "4" } : i === 1 ? { pizze: "abc", ordini: "3" } : c));
    expect(cambiaModo({ ...ini, giorni: sbagliato }, "SETTIMANA").settimana).toEqual({ pizze: "", ordini: "" });
  });
  it("lo stesso modo di adesso non cambia niente", () => {
    const ini = statoIniziale(riga(1, "A", "GIORNI", [[90, 30]]));
    const conTotale = { ...ini, settimana: { pizze: "", ordini: "" } };
    expect(cambiaModo(conTotale, "GIORNI")).toBe(conTotale);
    const inTotale = cambiaModo(ini, "SETTIMANA");
    expect(cambiaModo(inTotale, "SETTIMANA")).toBe(inTotale);
  });
  it("senza giorni i campi restano vuoti; un totale già scritto non si tocca", () => {
    const ini = statoIniziale(riga(1, "A", null));
    expect(cambiaModo(ini, "SETTIMANA").settimana).toEqual({ pizze: "", ordini: "" });
    const scritto = { ...ini, settimana: { pizze: "300", ordini: "100" }, giorni: ini.giorni.map((c, i) => (i === 0 ? { pizze: "1", ordini: "1" } : c)) };
    expect(cambiaModo(scritto, "SETTIMANA").settimana).toEqual({ pizze: "300", ordini: "100" });
  });
  it("da totale a giorni: i giorni partono vuoti", () => {
    const r = riga(1, "A", "SETTIMANA", [], [70, 30]);
    const dopo = cambiaModo(statoIniziale(r), "GIORNI");
    expect(dopo.giorni.every((c) => c.pizze === "" && c.ordini === "")).toBe(true);
  });
  it("passare al totale precompilato con i giorni salvati, senza scrivere, non è una modifica per l'uscita", () => {
    const r = riga(1, "A", "GIORNI", [[90, 30], [50, 20]]);
    const ini = statoIniziale(r);
    const dopo = cambiaModo(ini, "SETTIMANA");
    expect(sedeModificata(ini, dopo)).toBe(false);
    // e salvando (anche per un'altra sede) non si manda: i giorni restano. Si salva solo un totale toccato a mano.
    const altra = riga(2, "B", null);
    const iniAltra = statoIniziale(altra);
    const scrittaAltra = { ...iniAltra, giorni: iniAltra.giorni.map((c, i) => (i === 0 ? { pizze: "5", ordini: "2" } : c)) };
    const p = preparaPiano([r, altra], new Map([[1, ini], [2, iniAltra]]), new Map([[1, dopo], [2, scrittaAltra]]));
    expect(p.settimana).toEqual([]);
    expect(p.sovrascritture).toEqual([]);
    expect(p.giorni).toEqual([{ sedeId: 2, data: LUNEDI, pizze: 5, ordini: 2 }]);
    // toccato a mano, si manda (con la conferma: sostituisce i giorni)
    const toccato = preparaPiano([r], new Map([[1, ini]]), new Map([[1, { ...dopo, settimana: { pizze: "141", ordini: "50" } }]]));
    expect(toccato.settimana).toEqual([{ sedeId: 1, pizze: 141, ordini: 50 }]);
    expect(toccato.sovrascritture).toHaveLength(1);
    // svuotare un totale salvato e' una modifica
    const conTotale = statoIniziale(riga(2, "B", "SETTIMANA", [], [70, 30]));
    expect(sedeModificata(conTotale, { ...conTotale, settimana: { pizze: "", ordini: "" } })).toBe(true);
    // cambiando il totale lo e'
    expect(sedeModificata(ini, { ...dopo, settimana: { pizze: "141", ordini: "50" } })).toBe(true);
  });
});

describe("modifiche", () => {
  it("cambiare solo il modo non è una modifica", () => {
    const r = riga(1, "A", "GIORNI", [[9, 4]]);
    const ini = statoIniziale(r);
    expect(sedeModificata(ini, { ...ini, modo: "SETTIMANA" })).toBe(false);
  });
  it("per l'uscita conta quello scritto in uno qualsiasi dei due modi (passare all'altro modo non lo perde)", () => {
    const ini = statoIniziale(riga(1, "A", null));
    const giorni = ini.giorni.map((c, i) => (i === 3 ? { pizze: "5", ordini: "2" } : c));
    expect(sedeModificata(ini, { ...ini, giorni })).toBe(true);
    expect(sedeModificata(ini, { ...ini, giorni, modo: "SETTIMANA" })).toBe(true);
    expect(sedeModificata(ini, { ...ini, modo: "SETTIMANA", settimana: { pizze: "1", ordini: "1" } })).toBe(true);
    expect(sedeModificata(ini, { ...ini, modo: "GIORNI", settimana: { pizze: "1", ordini: "1" } })).toBe(true);
  });
  it("da salvare conta solo il modo scelto; l'altro modo si segnala a parte", () => {
    const ini = statoIniziale(riga(1, "A", null));
    const giorni = ini.giorni.map((c, i) => (i === 3 ? { pizze: "5", ordini: "2" } : c));
    expect(sedeDaSalvare(ini, { ...ini, giorni, modo: "SETTIMANA" })).toBe(false);
    expect(modificheNellAltroModo(ini, { ...ini, giorni, modo: "SETTIMANA" })).toBe(true);
    expect(sedeDaSalvare(ini, { ...ini, giorni })).toBe(true);
    expect(modificheNellAltroModo(ini, { ...ini, giorni })).toBe(false);
  });
});

describe("piano di salvataggio", () => {
  it("giorno per giorno manda solo i giorni cambiati; un giorno svuotato si cancella", () => {
    const righe = [riga(1, "Via Roma", "GIORNI", [[9, 4], [5, 2]]), riga(2, "Mare", null)];
    const attuali = mappa(righe, (id, s) =>
      id === 1 ? { ...s, giorni: s.giorni.map((c, i) => (i === 1 ? { pizze: "", ordini: "" } : i === 2 ? { pizze: "7", ordini: "3" } : c)) } : s,
    );
    const p = preparaPiano(righe, mappa(righe), attuali);
    expect(p.errori).toEqual([]);
    expect(p.settimana).toEqual([]);
    expect(p.sovrascritture).toEqual([]);
    expect(p.giorni).toEqual([
      { sedeId: 1, data: "2026-03-03", pizze: null, ordini: null },
      { sedeId: 1, data: "2026-03-04", pizze: 7, ordini: 3 },
    ]);
  });

  it("passare al totale con i giorni salvati chiede conferma e manda il totale", () => {
    const righe = [riga(1, "Via Roma", "GIORNI", [[9, 4], [5, 2], [1, 1], [2, 1], [3, 1]])];
    // un totale diverso dalla somma dei giorni (20 / 9): uguale sarebbe il precompilato, che da solo non si manda
    const attuali = mappa(righe, (_, s) => ({ ...s, modo: "SETTIMANA", settimana: { pizze: "22", ordini: "9" } }));
    const p = preparaPiano(righe, mappa(righe), attuali);
    expect(p.settimana).toEqual([{ sedeId: 1, pizze: 22, ordini: 9 }]);
    expect(p.giorni).toEqual([]);
    expect(p.sovrascritture).toEqual([{ sedeId: 1, nome: "Via Roma", salva: "SETTIMANA", giorni: 5 }]);
    expect(testoSovrascrittura(p.sovrascritture[0]!)).toBe("Salvando il totale della settimana si cancellano i 5 giorni inseriti per Via Roma.");
  });

  it("passare ai giorni con il totale salvato chiede conferma", () => {
    const righe = [riga(1, "Via Roma", "SETTIMANA", [], [70, 30])];
    const attuali = mappa(righe, (_, s) => ({ ...s, modo: "GIORNI", giorni: s.giorni.map((c, i) => (i === 0 ? { pizze: "9", ordini: "4" } : c)) }));
    const p = preparaPiano(righe, mappa(righe), attuali);
    expect(p.giorni).toEqual([{ sedeId: 1, data: LUNEDI, pizze: 9, ordini: 4 }]);
    expect(p.sovrascritture.map(testoSovrascrittura)).toEqual(["Salvando i giorni si cancella il totale della settimana inserito per Via Roma."]);
  });

  it("niente conferma se non si mandano numeri nell'altro modo", () => {
    const righe = [riga(1, "A", "GIORNI", [[9, 4]]), riga(2, "B", "SETTIMANA", [], [10, 4])];
    // A passa al totale ma lo lascia vuoto; B svuota il suo totale
    const attuali = mappa(righe, (id, s) => (id === 1 ? { ...s, modo: "SETTIMANA" } : { ...s, settimana: { pizze: "", ordini: "" } }));
    const p = preparaPiano(righe, mappa(righe), attuali);
    expect(p.settimana).toEqual([{ sedeId: 2, pizze: null, ordini: null }]);
    expect(p.sovrascritture).toEqual([]);
    // un giorno che si cancella non tocca il totale
    const righe2 = [riga(3, "C", "SETTIMANA", [], [10, 4])];
    expect(preparaPiano(righe2, mappa(righe2), mappa(righe2, (_, s) => ({ ...s, modo: "GIORNI" }))).sovrascritture).toEqual([]);
  });

  it("un giorno con un solo campo è un errore e indica la riga", () => {
    const righe = [riga(1, "A", null), riga(2, "B", null)];
    const attuali = mappa(righe, (id, s) =>
      id === 1 ? { ...s, giorni: s.giorni.map((c, i) => (i === 4 ? { pizze: "5", ordini: "" } : c)) } : { ...s, modo: "SETTIMANA", settimana: { pizze: "3", ordini: "0" } },
    );
    const p = preparaPiano(righe, mappa(righe), attuali);
    expect(p.errori).toEqual([
      { sedeId: 1, riga: 4 },
      { sedeId: 2, riga: -1 },
    ]);
  });

  it("un solo giorno da cancellare: la frase al singolare", () => {
    expect(testoSovrascrittura({ sedeId: 1, nome: "Mare", salva: "SETTIMANA", giorni: 1 })).toBe("Salvando il totale della settimana si cancella l'unico giorno inserito per Mare.");
  });
});

describe("scontrino di un giorno", () => {
  it("ricavi del giorno / ordini del giorno", () => {
    expect(scontrinoGiorno(10000, { pizze: "9", ordini: "4" })).toEqual({ valoreCent: 2500, senzaIncassi: false });
  });
  it("ordini ma nessun incasso registrato quel giorno: «—» con l'avviso, non 0,00", () => {
    expect(scontrinoGiorno(0, { pizze: "9", ordini: "4" })).toEqual({ valoreCent: null, senzaIncassi: true });
  });
  it("ricavi negativi (una nota di credito sul giorno): lo scontrino negativo, come il servizio, senza l'avviso", () => {
    expect(scontrinoGiorno(-5, { pizze: "3", ordini: "2" })).toEqual({ valoreCent: -3, senzaIncassi: false });
    expect(scontrinoGiorno(-10000, { pizze: "9", ordini: "4" })).toEqual({ valoreCent: -2500, senzaIncassi: false });
  });
  it("giorno vuoto, sbagliato o con 0 ordini: «—» senza avviso", () => {
    expect(scontrinoGiorno(0, { pizze: "", ordini: "" })).toEqual({ valoreCent: null, senzaIncassi: false });
    expect(scontrinoGiorno(5000, { pizze: "0", ordini: "0" })).toEqual({ valoreCent: null, senzaIncassi: false });
    expect(scontrinoGiorno(0, { pizze: "3", ordini: "" })).toEqual({ valoreCent: null, senzaIncassi: false });
  });
});

describe("nomi dei giorni", () => {
  it("giorno della settimana e numero", () => {
    expect(nomeGiorno(0, "2026-03-02")).toBe("Lunedì 2");
    expect(nomeGiorno(6, "2026-03-08")).toBe("Domenica 8");
  });
});

describe("un solo salvataggio per la settimana (PUT /statistiche/settimana-completa)", () => {
  it("giorni e totali di sedi diverse vanno nella stessa richiesta, anche vuoti", () => {
    const piano = {
      giorni: [{ sedeId: 1, data: "2026-03-03", pizze: 7, ordini: 3 }],
      settimana: [{ sedeId: 2, pizze: 70, ordini: 30 }],
      errori: [],
      sovrascritture: [],
    };
    expect(corpoSettimanaCompleta("2026-03-02", piano)).toEqual({
      settimana: "2026-03-02",
      giorni: [{ sedeId: 1, data: "2026-03-03", pizze: 7, ordini: 3 }],
      totali: [{ sedeId: 2, pizze: 70, ordini: 30 }],
    });
    expect(corpoSettimanaCompleta("2026-03-02", { ...piano, giorni: [] })).toEqual({ settimana: "2026-03-02", giorni: [], totali: [{ sedeId: 2, pizze: 70, ordini: 30 }] });
  });
});

describe("giorni futuri", () => {
  it("un giorno dopo oggi non si compila; oggi e i giorni prima si'", () => {
    expect(giornoFuturo("2026-11-11", "2026-11-10")).toBe(true);
    expect(giornoFuturo("2026-11-10", "2026-11-10")).toBe(false);
    expect(giornoFuturo("2026-11-09", "2026-11-10")).toBe(false);
  });
});


// Il badge accanto al nome della sede dice lo stato SALVATO finche' il modo scelto nel modulo non e' quello salvato.
describe("badge di stato della sede", () => {
  it("due giorni salvati, si passa a «Totale della settimana»: resta «2 giorni su 7»", () => {
    const r = riga(1, "A", "GIORNI", [[9, 4], [5, 2]]);
    const dopo = cambiaModo(statoIniziale(r), "SETTIMANA");
    // il totale e' precompilato con la somma dei giorni, ma non e' un totale salvato
    expect(dopo.settimana).toEqual({ pizze: "14", ordini: "6" });
    expect(badgeSede(r, dopo)).toEqual({ testo: "2 giorni su 7", inserito: true });
    // anche svuotando i campi o scrivendo un altro totale: finche' non si salva, lo stato e' quello dei giorni
    expect(badgeSede(r, { ...dopo, settimana: { pizze: "", ordini: "" } })).toEqual({ testo: "2 giorni su 7", inserito: true });
    expect(badgeSede(r, { ...dopo, settimana: { pizze: "80", ordini: "30" } })).toEqual({ testo: "2 giorni su 7", inserito: true });
  });
  it("totale salvato, si passa a «Giorno per giorno»: resta «Totale inserito»", () => {
    const r = riga(1, "A", "SETTIMANA", [], [70, 28]);
    expect(badgeSede(r, cambiaModo(statoIniziale(r), "GIORNI"))).toEqual({ testo: "Totale inserito", inserito: true });
  });
  it("nel modo salvato (o senza niente di salvato) segue quello che c'è nei campi", () => {
    const giorni = riga(1, "A", "GIORNI", [[9, 4], [5, 2]]);
    expect(badgeSede(giorni, statoIniziale(giorni))).toEqual({ testo: "2 giorni su 7", inserito: true });
    const totale = riga(1, "A", "SETTIMANA", [], [70, 28]);
    expect(badgeSede(totale, statoIniziale(totale))).toEqual({ testo: "Totale inserito", inserito: true });
    const vuota = riga(1, "A", null);
    expect(badgeSede(vuota, statoIniziale(vuota))).toEqual({ testo: "Da inserire", inserito: false });
    expect(badgeSede(vuota, { ...cambiaModo(statoIniziale(vuota), "SETTIMANA"), settimana: { pizze: "70", ordini: "28" } })).toEqual({ testo: "Totale inserito", inserito: true });
  });
});
