import { describe, expect, it } from "vitest";
import type { StatisticheSettimana } from "../api/tipi";
import { aggiungiGiorni } from "./formato";
import {
  campiIniziali,
  elencoNomi,
  intervalloUltimeSettimane,
  leggiConteggio,
  lunediDellaSettimana,
  nomeRelativoSettimana,
  numeroSettimanaIso,
  pizzePerOrdine,
  preparaSalvataggio,
  puoAndareAvanti,
  scontrinoLive,
  scontrinoMedioCent,
  settimaneInserite,
  settimanaCorta,
  spostaSettimana,
  totaleParziale,
  ultimaIncompleta,
  ultimeSettimane,
  validaRiga,
  type CampiRiga,
} from "./statistiche";

const sett = (settimana: string, scontrino: number | null, mancanti: number[] = [], ordini = 100): StatisticheSettimana => ({
  settimana,
  pizze: ordini * 3,
  ordini,
  ricaviCent: scontrino === null ? 0 : scontrino * ordini,
  scontrinoMedioCent: scontrino,
  sediMancanti: mancanti.map((id) => ({ id, nome: `Sede ${id}` })),
});

describe("scontrino medio e pizze per ordine (stessi arrotondamenti del servizio)", () => {
  it("arrotonda al centesimo, mezzo centesimo in su", () => {
    expect(scontrinoMedioCent(10000, 3)).toBe(3333);
    expect(scontrinoMedioCent(15000, 7)).toBe(2143);
    expect(scontrinoMedioCent(5000, 4)).toBe(1250);
    expect(scontrinoMedioCent(5, 2)).toBe(3); // 2,5 -> 3
    expect(scontrinoMedioCent(7, 2)).toBe(4); // 3,5 -> 4
    expect(scontrinoMedioCent(1, 3)).toBe(0);
    expect(scontrinoMedioCent(2, 3)).toBe(1); // 0,67 -> 1
  });

  it("senza ordini non c'è scontrino", () => {
    expect(scontrinoMedioCent(10000, 0)).toBeNull();
    expect(scontrinoMedioCent(10000, -1)).toBeNull();
    expect(scontrinoMedioCent(0, 5)).toBe(0);
  });

  it("pizze per ordine con due decimali", () => {
    expect(pizzePerOrdine(17, 7)).toBe(2.43);
    expect(pizzePerOrdine(7, 3)).toBe(2.33);
    expect(pizzePerOrdine(10, 4)).toBe(2.5);
    expect(pizzePerOrdine(1, 8)).toBe(0.13); // 0,125 -> 0,13
    expect(pizzePerOrdine(5, 0)).toBeNull();
  });
});

describe("settimana lunedì-domenica", () => {
  it("trova il lunedì di un giorno qualsiasi", () => {
    expect(lunediDellaSettimana("2026-03-04")).toBe("2026-03-02");
    expect(lunediDellaSettimana("2026-03-08")).toBe("2026-03-02");
    expect(lunediDellaSettimana("2026-03-02")).toBe("2026-03-02");
    expect(lunediDellaSettimana("2026-03-09")).toBe("2026-03-09");
  });

  it("un testo che non è una data vale la settimana di oggi", () => {
    expect(lunediDellaSettimana(null, "2026-10-29")).toBe("2026-10-26");
    expect(lunediDellaSettimana("ieri", "2026-10-29")).toBe("2026-10-26");
    expect(lunediDellaSettimana("2026-02-30", "2026-10-29")).toBe("2026-10-26");
  });

  it("le frecce vanno di sette giorni, anche a cavallo di mese e di anno", () => {
    expect(spostaSettimana("2026-10-26", -1)).toBe("2026-10-19");
    expect(spostaSettimana("2026-10-26", 1)).toBe("2026-11-02");
    expect(spostaSettimana("2025-12-29", 1)).toBe("2026-01-05");
    expect(spostaSettimana("2026-01-05", -1)).toBe("2025-12-29");
    // un giorno a metà settimana viene riportato al lunedì
    expect(spostaSettimana("2026-10-29", -1)).toBe("2026-10-19");
  });

  it("non si va oltre la settimana in corso", () => {
    expect(puoAndareAvanti("2026-10-19", "2026-10-29")).toBe(true);
    expect(puoAndareAvanti("2026-10-26", "2026-10-29")).toBe(false);
    expect(puoAndareAvanti("2026-10-26", "2026-11-01")).toBe(false);
    expect(puoAndareAvanti("2026-10-26", "2026-11-02")).toBe(true);
  });

  it("dice se è la settimana in corso o la scorsa", () => {
    expect(nomeRelativoSettimana("2026-10-26", "2026-10-29")).toBe("Settimana in corso");
    expect(nomeRelativoSettimana("2026-10-19", "2026-10-29")).toBe("Settimana scorsa");
    expect(nomeRelativoSettimana("2026-10-12", "2026-10-29")).toBeNull();
  });

  it("numero della settimana ISO e etichetta corta", () => {
    expect(numeroSettimanaIso("2026-10-19")).toBe(43);
    expect(numeroSettimanaIso("2026-10-26")).toBe(44);
    expect(numeroSettimanaIso("2025-12-29")).toBe(1);
    expect(numeroSettimanaIso("2026-01-05")).toBe(2);
    expect(settimanaCorta("2026-10-19")).toBe("19 – 25 ott");
    expect(settimanaCorta("2026-10-26")).toBe("26 ott – 1 nov");
  });
});

describe("campi Pizze e Ordini", () => {
  it("legge interi, anche col punto delle migliaia, e riconosce il vuoto", () => {
    expect(leggiConteggio("")).toEqual({ tipo: "vuoto" });
    expect(leggiConteggio("   ")).toEqual({ tipo: "vuoto" });
    expect(leggiConteggio("486")).toEqual({ tipo: "numero", valore: 486 });
    expect(leggiConteggio("0")).toEqual({ tipo: "numero", valore: 0 });
    expect(leggiConteggio("1.412")).toEqual({ tipo: "numero", valore: 1412 });
  });

  it("rifiuta decimali, negativi, lettere e numeri enormi con messaggi in italiano", () => {
    expect(leggiConteggio("2,5")).toEqual({ tipo: "errore", messaggio: "Scrivi un numero intero, senza virgole." });
    expect(leggiConteggio("2.5")).toEqual({ tipo: "errore", messaggio: "Scrivi un numero intero, senza virgole." });
    expect(leggiConteggio("abc")).toMatchObject({ tipo: "errore" });
    expect(leggiConteggio("-3")).toEqual({ tipo: "errore", messaggio: "Il numero non può essere negativo." });
    expect(leggiConteggio("1000000")).toEqual({ tipo: "numero", valore: 1_000_000 });
    expect(leggiConteggio("1000001")).toEqual({ tipo: "errore", messaggio: "Il numero è troppo grande (massimo 1.000.000)." });
  });

  it("una riga è vuota, completa o incompleta", () => {
    expect(validaRiga({ pizze: "", ordini: "" }).stato).toBe("vuota");
    expect(validaRiga({ pizze: "211", ordini: "74" })).toMatchObject({ stato: "completa", pizze: 211, ordini: 74 });
    expect(validaRiga({ pizze: "0", ordini: "0" })).toMatchObject({ stato: "completa", pizze: 0, ordini: 0 });
    expect(validaRiga({ pizze: "211", ordini: "" })).toMatchObject({ stato: "incompleta", erroreOrdini: "Scrivi anche gli ordini, oppure svuota anche le pizze." });
    expect(validaRiga({ pizze: "", ordini: "74" })).toMatchObject({ stato: "incompleta", errorePizze: "Scrivi anche le pizze, oppure svuota anche gli ordini." });
  });

  it("con 0 ordini le pizze devono essere 0", () => {
    expect(validaRiga({ pizze: "5", ordini: "0" })).toMatchObject({ stato: "incompleta", erroreOrdini: "Con 0 ordini le pizze devono essere 0." });
    expect(validaRiga({ pizze: "0", ordini: "0" }).stato).toBe("completa");
  });

  it("un errore di lettura resta sul suo campo", () => {
    const e = validaRiga({ pizze: "2,5", ordini: "10" });
    expect(e.stato).toBe("incompleta");
    expect(e.errorePizze).toBe("Scrivi un numero intero, senza virgole.");
    expect(e.erroreOrdini).toBeNull();
  });
});

describe("scontrino medio mentre si scrive", () => {
  it("ricavi / ordini, arrotondato come il servizio", () => {
    expect(scontrinoLive(984000, { pizze: "1412", ordini: "486" })).toBe(2025);
    expect(scontrinoLive(10000, { pizze: "7", ordini: "3" })).toBe(3333);
  });
  it("niente finché la riga non è valida o gli ordini sono 0", () => {
    expect(scontrinoLive(10000, { pizze: "", ordini: "" })).toBeNull();
    expect(scontrinoLive(10000, { pizze: "7", ordini: "" })).toBeNull();
    expect(scontrinoLive(10000, { pizze: "0", ordini: "0" })).toBeNull();
    expect(scontrinoLive(10000, { pizze: "x", ordini: "3" })).toBeNull();
  });
});

describe("salvataggio della settimana", () => {
  const ini = (o: Record<number, CampiRiga>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));
  const vuoto: CampiRiga = { pizze: "", ordini: "" };

  it("manda solo le sedi cambiate", () => {
    const iniziali = ini({ 1: { pizze: "100", ordini: "40" }, 2: vuoto, 3: vuoto });
    const attuali = ini({ 1: { pizze: "100", ordini: "40" }, 2: { pizze: "50", ordini: "20" }, 3: vuoto });
    const r = preparaSalvataggio(iniziali, attuali);
    expect(r.errori.size).toBe(0);
    expect(r.voci).toEqual([{ sedeId: 2, pizze: 50, ordini: 20 }]);
  });

  it("una riga svuotata cancella il dato (pizze e ordini null)", () => {
    const r = preparaSalvataggio(ini({ 1: { pizze: "100", ordini: "40" } }), ini({ 1: vuoto }));
    expect(r.voci).toEqual([{ sedeId: 1, pizze: null, ordini: null }]);
  });

  it("scrivere lo stesso numero in altro modo non è una modifica", () => {
    const r = preparaSalvataggio(ini({ 1: { pizze: "100", ordini: "40" } }), ini({ 1: { pizze: "0100", ordini: "40" } }));
    expect(r.voci).toEqual([]);
  });

  it("una riga sbagliata blocca tutto e dice quale", () => {
    const r = preparaSalvataggio(ini({ 1: vuoto, 2: vuoto }), ini({ 1: { pizze: "5", ordini: "0" }, 2: { pizze: "9", ordini: "3" } }));
    expect([...r.errori.keys()]).toEqual([1]);
    expect(r.voci).toEqual([{ sedeId: 2, pizze: 9, ordini: 3 }]);
  });

  it("i campi iniziali vengono dal dato del servizio", () => {
    expect(campiIniziali({ pizze: 12, ordini: 5 })).toEqual({ pizze: "12", ordini: "5" });
    expect(campiIniziali({ pizze: null, ordini: null })).toEqual(vuoto);
    expect(campiIniziali({ pizze: 0, ordini: 0 })).toEqual({ pizze: "0", ordini: "0" });
  });
});

describe("totale parziale della settimana", () => {
  it("somma solo le sedi complete e dice «n su m»", () => {
    const t = totaleParziale([
      { ricaviCent: 984000, campi: { pizze: "1412", ordini: "486" } },
      { ricaviCent: 726000, campi: { pizze: "1038", ordini: "301" } },
      { ricaviCent: 412000, campi: { pizze: "", ordini: "" } },
    ]);
    expect(t).toMatchObject({ sediComplete: 2, sediTotali: 3, pizze: 2450, ordini: 787, ricaviCent: 1710000 });
    expect(t.scontrinoMedioCent).toBe(2173);
    expect(t.pizzePerOrdine).toBe(3.11);
  });

  it("una sede con 0 ordini è completa ma non entra nelle medie", () => {
    const t = totaleParziale([
      { ricaviCent: 5000, campi: { pizze: "0", ordini: "0" } },
      { ricaviCent: 10000, campi: { pizze: "7", ordini: "3" } },
    ]);
    expect(t.sediComplete).toBe(2);
    expect(t.ricaviCent).toBe(10000);
    expect(t.scontrinoMedioCent).toBe(3333);
  });

  it("senza righe complete non ci sono medie", () => {
    const t = totaleParziale([{ ricaviCent: 5000, campi: { pizze: "", ordini: "" } }]);
    expect(t).toMatchObject({ sediComplete: 0, sediTotali: 1, scontrinoMedioCent: null, pizzePerOrdine: null });
  });
});

describe("le ultime 8 settimane", () => {
  // dodici lunedì di fila con lo scontrino che sale di 10 centesimi alla volta
  const dodici = Array.from({ length: 12 }, (_, i) => sett(aggiungiGiorni("2026-08-03", 7 * i), 2000 + i * 10));

  it("prende le ultime otto in ordine cronologico", () => {
    const punti = ultimeSettimane(dodici);
    expect(punti).toHaveLength(8);
    expect(punti[0]!.scontrinoMedioCent).toBe(2040);
    expect(punti[7]!.scontrinoMedioCent).toBe(2110);
    expect(punti.map((p) => p.ultima)).toEqual([false, false, false, false, false, false, false, true]);
  });

  it("la barra più bassa ha l'altezza minima, la più alta 1", () => {
    const punti = ultimeSettimane([sett("2026-10-05", 1900), sett("2026-10-12", 2100), sett("2026-10-19", 2000)]);
    expect(punti.map((p) => p.altezza)).toEqual([0.25, 1, 0.625]);
  });

  it("una settimana senza dati ha la barra a zero, e se i valori sono tutti uguali sono tutte piene", () => {
    const punti = ultimeSettimane([sett("2026-10-05", null, [1, 2]), sett("2026-10-12", 2000), sett("2026-10-19", 2000)]);
    expect(punti[0]).toMatchObject({ altezza: 0, scontrinoMedioCent: null, mancanti: 2 });
    expect(punti[1]!.altezza).toBe(1);
    expect(punti[2]!.altezza).toBe(1);
  });

  it("con meno di otto settimane o nessuna non inventa niente", () => {
    expect(ultimeSettimane([sett("2026-10-05", 2000)])).toHaveLength(1);
    expect(ultimeSettimane([])).toEqual([]);
    expect(ultimeSettimane([sett("2026-10-05", null, [1])])[0]!.altezza).toBe(0);
  });

  it("etichetta con il numero della settimana", () => {
    expect(ultimeSettimane([sett("2026-10-19", 2000)])[0]!.etichetta).toBe("S43");
  });

  it("l'intervallo da chiedere copre otto lunedì che finiscono con la settimana in corso", () => {
    expect(intervalloUltimeSettimane("2026-10-29")).toEqual({ da: "2026-09-07", a: "2026-10-29" });
    expect(intervalloUltimeSettimane("2026-10-26")).toEqual({ da: "2026-09-07", a: "2026-10-26" });
  });
});

describe("banner e elenco delle settimane", () => {
  const serie = [sett("2026-10-12", 2000), sett("2026-10-19", 2100, [3]), sett("2026-10-26", 2050, [2, 3])];

  it("la settimana incompleta più recente", () => {
    expect(ultimaIncompleta(serie)?.settimana).toBe("2026-10-26");
    expect(ultimaIncompleta([sett("2026-10-12", 2000), sett("2026-10-19", 2100)])).toBeNull();
    expect(ultimaIncompleta([sett("2026-10-12", 2000, [1]), sett("2026-10-19", 2100)])?.settimana).toBe("2026-10-12");
    expect(ultimaIncompleta([])).toBeNull();
  });

  it("il banner guarda solo le ultime quattro settimane: un buco più vecchio non lo accende", () => {
    const vecchio = [sett("2026-09-28", 2000, [2]), sett("2026-10-05", 2000), sett("2026-10-12", 2000), sett("2026-10-19", 2000), sett("2026-10-26", 2000)];
    expect(ultimaIncompleta(vecchio)).toBeNull();
    expect(ultimaIncompleta(vecchio, 5)?.settimana).toBe("2026-09-28");
    const recente = [sett("2026-10-05", 2000, [2]), sett("2026-10-12", 2000), sett("2026-10-19", 2000), sett("2026-10-26", 2000)];
    expect(ultimaIncompleta(recente)?.settimana).toBe("2026-10-05");
  });

  it("nomi in elenco", () => {
    expect(elencoNomi([])).toBe("");
    expect(elencoNomi(["Mercato"])).toBe("Mercato");
    expect(elencoNomi(["Lungomare", "Mercato"])).toBe("Lungomare e Mercato");
    expect(elencoNomi(["Via Roma", "Lungomare", "Mercato"])).toBe("Via Roma, Lungomare e Mercato");
  });

  it("le settimane già inserite: dalla più recente, senza quelle vuote, con «n su m»", () => {
    const righe = settimaneInserite([sett("2026-10-05", null, [1, 2, 3]), ...serie], 3);
    expect(righe.map((r) => [r.settimana, r.inserite])).toEqual([
      ["2026-10-26", 1],
      ["2026-10-19", 2],
      ["2026-10-12", 3],
    ]);
  });
});
