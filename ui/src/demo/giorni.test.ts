import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SerieStatistiche, Settimana, Statistiche } from "../api/tipi";
import { rispondi } from "./backend";
import { aggiungiGiorni, lunediDi } from "./date";
import { righeEsportazione } from "./statistiche";
import { migraStato, modalitaVuota, ricomincia, stato } from "./stato";

// Pizze e ordini giorno per giorno nella demo: stesse regole del servizio (docs/api.md, «Statistiche»). Si parte dalla demo vuota
// (una sola «Sede principale», id 1), cosi' i conti si fanno a mano. Le settimane: lunedi' 2 marzo 2026, 9, 16, 23, 30 marzo.
const q = (t = "") => new URLSearchParams(t);
const get = (percorso: string, t = "") => rispondi("GET", percorso, q(t), undefined);
const putGiorni = (...voci: unknown[]) => rispondi("PUT", "/statistiche/giorni", q(), { voci });
const salvaGiorni = (...voci: unknown[]) => {
  const r = putGiorni(...voci);
  expect(r.stato, JSON.stringify(r.corpo)).toBe(200);
  return r.corpo as Settimana;
};
const putSettimana = (settimana: string, sedeId: number, pizze: number | null, ordini: number | null) =>
  rispondi("PUT", "/statistiche/settimana", q(), { settimana, voci: [{ sedeId, pizze, ordini }] });
const settimana = (data: string) => get("/statistiche/settimana", `data=${data}`).corpo as Settimana;
const periodo = (t: string) => get("/statistiche", t).corpo as Statistiche;
const serie = (t: string) => get("/statistiche/serie", t);
const g = (sedeId: number, data: string, pizze: number | null, ordini: number | null) => ({ sedeId, data, pizze, ordini });
const erroreDi = (r: { corpo?: unknown }) => (r.corpo as { errore: string }).errore;
const ricavo = (data: string, sedeId: number, importoCent: number, documento = "RICAVO_FATTURATO") =>
  expect(rispondi("POST", "/movimenti", q(), { data, sedeId, tipo: "RICAVO", documento, importoCent }).stato).toBe(201);
const nuovaSede = (nome: string) => (rispondi("POST", "/sedi", q(), { nome }).corpo as { id: number }).id;
const sedeDi = (s: Settimana, id: number) => s.sedi.find((r) => r.sede.id === id)!;

beforeEach(() => {
  modalitaVuota(true);
  ricomincia();
});
afterEach(() => {
  modalitaVuota(false);
  ricomincia();
});

describe("demo: pizze e ordini giorno per giorno", () => {
  it("i giorni si salvano, si aggiornano e si cancellano; la settimana è la somma", () => {
    const r = salvaGiorni(g(1, "2026-03-02", 10, 4), g(1, "2026-03-04", 6, 2));
    expect(r.settimana).toBe("2026-03-02");
    const s = sedeDi(r, 1);
    expect(s).toMatchObject({ pizze: 16, ordini: 6, completa: true, fonte: "GIORNI", giorniInseriti: 2 });
    expect(s).not.toHaveProperty("settimanale");
    expect(s.giorni.map((x) => x.data)).toEqual(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"]);
    expect(s.giorni[1]).toMatchObject({ pizze: null, ordini: null, scontrinoMedioCent: null });
    expect(sedeDi(salvaGiorni(g(1, "2026-03-02", 12, 5)), 1).pizze).toBe(18);
    expect(stato().statisticheGiorni).toHaveLength(2);
    salvaGiorni(g(1, "2026-03-04", null, null), g(1, "2026-03-05", null, null));
    expect(sedeDi(settimana("2026-03-07"), 1)).toMatchObject({ giorniInseriti: 1, ordini: 5 });
    expect(sedeDi(salvaGiorni(g(1, "2026-03-02", null, null)), 1)).toMatchObject({ completa: false, fonte: null, pizze: null, giorniInseriti: 0 });
    expect(stato().statisticheGiorni).toHaveLength(0);
  });

  it("gli errori sono quelli del servizio e non si salva niente", () => {
    const mare = nuovaSede("Sede Mare");
    expect(erroreDi(putGiorni())).toBe("Indica almeno una voce.");
    expect(erroreDi(rispondi("PUT", "/statistiche/giorni", q(), {}))).toBe("Indica almeno una voce.");
    expect(erroreDi(putGiorni({ data: "2026-03-02", pizze: 1, ordini: 1 }))).toBe("Ogni voce deve avere la sede.");
    expect(erroreDi(putGiorni({ sedeId: 1, pizze: 1, ordini: 1 }))).toBe("Ogni voce deve avere il giorno (yyyy-MM-dd).");
    expect(erroreDi(putGiorni(g(1, "2026-02-30", 1, 1)))).toBe("Il giorno non è una data valida (yyyy-MM-dd): 2026-02-30");
    expect(erroreDi(putGiorni(g(1, "2026-03-08", 1, 1), g(1, "2026-03-09", 1, 1)))).toBe("Tutti i giorni devono essere della stessa settimana (da lunedì a domenica).");
    expect(erroreDi(putGiorni(g(9, "2026-03-02", 1, 1)))).toBe("Sede non trovata.");
    expect(erroreDi(putGiorni(g(1, "2026-03-02", 1, 1), g(1, "2026-03-02", 2, 2)))).toBe("Sede «Sede principale», 02/03/2026: il giorno compare più volte.");
    expect(erroreDi(putGiorni(g(1, "2026-03-02", 2.5, 1)))).toBe("Sede «Sede principale», 02/03/2026: pizze deve essere un numero intero.");
    expect(erroreDi(putGiorni(g(1, "2026-03-02", 5, -1)))).toBe("Sede «Sede principale», 02/03/2026: ordini non può essere negativo.");
    expect(erroreDi(putGiorni(g(1, "2026-03-02", 5000000, 1)))).toBe("Sede «Sede principale», 02/03/2026: pizze è troppo grande (massimo 1000000).");
    expect(erroreDi(putGiorni(g(1, "2026-03-02", 5, null)))).toBe("Sede «Sede principale», 02/03/2026: indica sia le pizze sia gli ordini (o nessuno dei due per cancellare il dato).");
    expect(erroreDi(putGiorni(g(1, "2026-03-02", 5, 0)))).toBe("Sede «Sede principale», 02/03/2026: con 0 ordini le pizze devono essere 0.");
    expect(putGiorni(g(1, "2026-03-02", 5, 5), g(mare, "2026-03-03", -1, 5)).stato).toBe(400);
    rispondi("PUT", `/sedi/${mare}`, q(), { archiviata: true });
    expect(erroreDi(putGiorni(g(mare, "2026-03-02", 1, 1)))).toBe("La sede «Sede Mare» è archiviata.");
    expect(stato().statisticheGiorni).toEqual([]);
  });

  it("lo scontrino usa solo i ricavi dei giorni con dati e ordini; i ricavi totali ed extra sono a parte", () => {
    ricavo("2026-03-02", 1, 6000);
    ricavo("2026-03-02", 1, 2000, "RICAVO_EXTRA");
    ricavo("2026-03-03", 1, 4000);
    ricavo("2026-03-04", 1, 9000);
    ricavo("2026-03-08", 1, 1000, "RICAVO_EXTRA");
    salvaGiorni(g(1, "2026-03-02", 9, 4), g(1, "2026-03-03", 0, 0));
    const s = sedeDi(settimana("2026-03-02"), 1);
    expect(s).toMatchObject({ ricaviCent: 22000, ricaviTotaliCent: 22000, ricaviExtraCent: 3000, ricaviConDatiCent: 8000, scontrinoMedioCent: 2000, pizzePerOrdine: 2.25 });
    expect(s.giorni[0]).toMatchObject({ ricaviTotaliCent: 8000, ricaviExtraCent: 2000, scontrinoMedioCent: 2000 });
    expect(s.giorni[2]).toMatchObject({ ricaviTotaliCent: 9000, scontrinoMedioCent: null });
    const p = periodo("da=2026-03-02&a=2026-03-08");
    expect(p.totale).toMatchObject({ ordini: 4, ricaviCent: 8000, ricaviConDatiCent: 8000, ricaviTotaliCent: 22000, ricaviExtraCent: 3000, scontrinoMedioCent: 2000 });
    expect(p.settimane[0]).toMatchObject({ ricaviTotaliCent: 22000, ricaviConDatiCent: 8000 });
    expect(p.perSede[0]).toMatchObject({ ricaviTotaliCent: 22000, ricaviExtraCent: 3000, ricaviCent: 8000 });
  });

  it("per sede e settimana vale un solo modo: salvare i giorni cancella il totale e viceversa", () => {
    const mare = nuovaSede("Sede Mare");
    ricavo("2026-03-02", 1, 6000);
    ricavo("2026-03-05", 1, 4000);
    ricavo("2026-03-02", mare, 2000);
    ricavo("2026-03-06", mare, 3000);
    expect(putSettimana("2026-03-02", 1, 100, 40).stato).toBe(200);
    expect(putSettimana("2026-03-02", mare, 10, 4).stato).toBe(200);
    expect(putSettimana("2026-03-09", 1, 50, 20).stato).toBe(200);
    const totali = () => stato().statistiche.map((x) => `${x.sedeId}|${x.settimana}`).sort();
    const giorni = () => stato().statisticheGiorni.map((x) => `${x.sedeId}|${x.giorno}`).sort();

    // i giorni della sede 1 cancellano il suo totale di quella settimana, non quello di Mare ne' dell'altra settimana
    const r = salvaGiorni(g(1, "2026-03-02", 7, 3));
    expect(sedeDi(r, 1)).toMatchObject({ fonte: "GIORNI", pizze: 7, ordini: 3, ricaviConDatiCent: 6000, scontrinoMedioCent: 2000 });
    expect(sedeDi(r, 1)).not.toHaveProperty("settimanale");
    expect(totali()).toEqual([`1|2026-03-09`, `${mare}|2026-03-02`]);
    expect(sedeDi(r, mare)).toMatchObject({ fonte: "SETTIMANA", pizze: 10, ricaviConDatiCent: 5000, scontrinoMedioCent: 1250, giorniInseriti: 0 });
    expect(sedeDi(r, mare).giorni[0]!.pizze).toBeNull();
    expect(periodo("da=2026-03-02&a=2026-03-08").totale).toMatchObject({ pizze: 17, ordini: 7, ricaviCent: 11000, scontrinoMedioCent: 1571, ricaviTotaliCent: 15000 });

    // cancellare i giorni non fa riapparire nessun totale nascosto
    expect(sedeDi(salvaGiorni(g(1, "2026-03-02", null, null)), 1)).toMatchObject({ fonte: null, completa: false });

    // il totale settimanale cancella i giorni di quella sede e settimana
    salvaGiorni(g(1, "2026-03-03", 5, 2), g(1, "2026-03-04", 6, 2), g(mare, "2026-03-03", 1, 1));
    salvaGiorni(g(1, "2026-03-10", 2, 1));
    const sett = putSettimana("2026-03-04", 1, 30, 12).corpo as Settimana;
    expect(sedeDi(sett, 1)).toMatchObject({ fonte: "SETTIMANA", pizze: 30, giorniInseriti: 0 });
    expect(sedeDi(sett, mare).fonte).toBe("GIORNI");
    expect(giorni()).toEqual(["1|2026-03-10", `${mare}|2026-03-03`]);

    // cancellare un giorno assente non tocca il totale; cancellare il totale non tocca i giorni
    salvaGiorni(g(1, "2026-03-05", null, null));
    expect(sedeDi(settimana("2026-03-02"), 1).pizze).toBe(30);
    expect(putSettimana("2026-03-11", 1, null, null).stato).toBe(200);
    expect(giorni()).toContain("1|2026-03-10");

    // tutto o niente: con una voce sbagliata non si cancella niente
    expect(putGiorni(g(1, "2026-03-02", 1, 1), g(1, "2026-03-03", 5, 0)).stato).toBe(400);
    expect(rispondi("PUT", "/statistiche/settimana", q(), { settimana: "2026-03-02", voci: [{ sedeId: mare, pizze: 1, ordini: 1 }, { sedeId: 1, pizze: 5, ordini: 0 }] }).stato).toBe(400);
    expect(sedeDi(settimana("2026-03-02"), 1).fonte).toBe("SETTIMANA");
    expect(sedeDi(settimana("2026-03-02"), mare).fonte).toBe("GIORNI");
  });

  it("una settimana è mancante solo senza nessun giorno né totale; una sede normale senza dati lo è sempre", () => {
    const mare = nuovaSede("Sede Mare");
    const monti = nuovaSede("Sede Monti");
    salvaGiorni(g(1, "2026-03-03", 5, 2), g(1, "2026-03-07", 0, 0));
    putSettimana("2026-03-02", mare, 10, 4);
    salvaGiorni(g(monti, "2026-03-15", 8, 3));
    const p = periodo("da=2026-03-02&a=2026-03-09");
    expect(p.settimane[0]!.sediMancanti.map((x) => x.id)).toEqual([monti]);
    expect(p.settimane[1]!.sediMancanti.map((x) => x.id)).toEqual([1, mare]);
    expect(p.totale.settimaneConDati).toBe(2);
    expect(p.perSede[0]).toMatchObject({ settimaneConDati: 1, pizze: 5 });

    // una sede normale (non personale) senza dati e' mancante ogni settimana; le personali non lo sono mai (personale.test.ts)
    const vuota = nuovaSede("Sede senza dati");
    const conVuota = periodo("da=2026-03-02&a=2026-03-09");
    expect(conVuota.settimane.every((w) => w.sediMancanti.some((x) => x.id === vuota))).toBe(true);
    salvaGiorni(g(vuota, "2026-03-09", 0, 0));
    expect(periodo("da=2026-03-09&a=2026-03-09").settimane[0]!.sediMancanti.map((x) => x.id)).not.toContain(vuota);
  });
});

describe("demo: serie per il grafico", () => {
  let mare = 0;
  beforeEach(() => {
    mare = nuovaSede("Sede Mare");
    ricavo("2026-03-02", 1, 6000);
    ricavo("2026-03-02", 1, 1000, "RICAVO_EXTRA");
    ricavo("2026-03-03", 1, 4000);
    ricavo("2026-03-10", 1, 9000);
    ricavo("2026-03-31", 1, 3000);
    ricavo("2026-04-02", 1, 5000);
    ricavo("2026-03-30", mare, 2000);
    ricavo("2026-04-01", mare, 2000);
    salvaGiorni(g(1, "2026-03-02", 8, 3));
    salvaGiorni(g(1, "2026-03-10", 10, 4));
    salvaGiorni(g(1, "2026-03-31", 4, 2), g(1, "2026-04-02", 6, 2));
    expect(putSettimana("2026-04-01", mare, 9, 4).stato).toBe(200);
  });

  it("giorno per giorno, con il vecchio totale nel suo lunedì", () => {
    const r = serie("da=2026-03-30&a=2026-04-02&passo=GIORNO").corpo as SerieStatistiche;
    expect(r.passo).toBe("GIORNO");
    expect(r.intervalli).toHaveLength(4);
    expect(r.intervalli[0]).toEqual({ inizio: "2026-03-30", fine: "2026-03-30", pizze: 9, ordini: 4, ricaviTotaliCent: 2000, ricaviExtraCent: 0, ricaviConDatiCent: 4000, scontrinoMedioCent: 1000, pizzePerOrdine: 2.25, conDati: true, daTotaleSettimanale: true });
    expect(r.intervalli[2]).toMatchObject({ pizze: 0, ricaviTotaliCent: 2000, scontrinoMedioCent: null, conDati: false });
    expect(r.totale).toMatchObject({ inizio: "2026-03-30", fine: "2026-04-02", pizze: 19, ordini: 8, ricaviTotaliCent: 12000, ricaviConDatiCent: 12000, scontrinoMedioCent: 1500, pizzePerOrdine: 2.38 });
  });

  it("settimane e mesi tagliati al periodo; un anno ha 12 mesi", () => {
    const s = (serie("da=2026-03-04&a=2026-04-02&passo=SETTIMANA").corpo as SerieStatistiche).intervalli;
    expect(s.map((x) => [x.inizio, x.fine])).toEqual([
      ["2026-03-04", "2026-03-08"],
      ["2026-03-09", "2026-03-15"],
      ["2026-03-16", "2026-03-22"],
      ["2026-03-23", "2026-03-29"],
      ["2026-03-30", "2026-04-02"],
    ]);
    expect(s[0]).toMatchObject({ pizze: 0, conDati: false });
    expect(s[1]).toMatchObject({ pizze: 10, scontrinoMedioCent: 2250 });
    expect(s[4]!.pizze).toBe(19);
    const m = serie("da=2026-03-01&a=2026-04-30&passo=MESE").corpo as SerieStatistiche;
    expect(m.intervalli.map((x) => [x.inizio, x.fine])).toEqual([
      ["2026-03-01", "2026-03-31"],
      ["2026-04-01", "2026-04-30"],
    ]);
    expect(m.intervalli[0]).toMatchObject({ pizze: 31, ordini: 13, ricaviTotaliCent: 25000, ricaviExtraCent: 1000, ricaviConDatiCent: 23000 });
    expect(m.intervalli[1]).toMatchObject({ pizze: 6, ricaviTotaliCent: 7000 });
    expect(m.totale).toMatchObject({ pizze: 37, ricaviTotaliCent: 32000 });
    expect((serie(`da=2026-03-01&a=2026-04-30&passo=MESE&sedi=${mare}`).corpo as SerieStatistiche).totale).toMatchObject({ pizze: 9, ricaviTotaliCent: 4000 });
    const anno = (serie("da=2026-01-01&a=2026-12-31&passo=MESE").corpo as SerieStatistiche).intervalli;
    expect(anno).toHaveLength(12);
    expect(anno[1]!.fine).toBe("2026-02-28");
  });

  it("al massimo 400 intervalli e parametri controllati", () => {
    expect((serie("da=2026-01-01&a=2027-02-04&passo=GIORNO").corpo as SerieStatistiche).intervalli).toHaveLength(400);
    expect(serie("da=2026-01-01&a=2027-02-05&passo=GIORNO")).toMatchObject({
      stato: 400,
      corpo: { errore: "Troppi intervalli (401): al massimo 400. Scegli un passo più lungo o un periodo più breve." },
    });
    expect(erroreDi(serie("da=2026-01-01&a=2026-02-01"))).toBe("Indica il passo: GIORNO, SETTIMANA o MESE.");
    expect(erroreDi(serie("da=2026-01-01&a=2026-02-01&passo=ANNO"))).toBe("passo: valore non valido: ANNO (GIORNO, SETTIMANA o MESE).");
    expect(erroreDi(serie("a=2026-02-01&passo=MESE"))).toBe("Servono entrambe le date: da e a.");
    expect(erroreDi(serie("da=2026-03-01&a=2026-02-01&passo=MESE"))).toBe("La data iniziale non può essere dopo quella finale.");
    expect(serie("da=2026-01-01&a=2026-02-01&passo=MESE&sedi=uno").stato).toBe(400);
  });

  it("l'Excel ha i totali dei giorni e il foglio «Pizze per giorno»", () => {
    const xlsx = (t: string) => new TextDecoder("utf-8").decode(get("/esporta", `formato=xlsx&${t}`).testo!.contenuto as Uint8Array);
    const con = xlsx("da=2026-03-01&a=2026-03-31");
    expect(con).toContain("Pizze per giorno");
    expect(con).toContain("Ricavi dei giorni con dati");
    expect(con).toContain("Totale settimanale"); // il vecchio totale di Mare
    expect(xlsx("da=2026-03-01&a=2026-03-31&statistiche=false")).not.toContain("Pizze per giorno");
  });

  it("nel foglio «Pizze per giorno» un giorno con ordini ma senza incassi ha lo scontrino vuoto", () => {
    // una settimana passata, lontana dai dati degli altri test (lunedi' 3 febbraio 2025)
    ricavo("2025-02-04", 1, 4000);
    salvaGiorni(g(1, "2025-02-03", 9, 4), g(1, "2025-02-04", 6, 2));
    const giorni = righeEsportazione(stato(), "2025-02-03", "2025-02-09", null).giorni;
    expect(giorni.map(([data, , , , ricavi, , scontrino]) => [data, ricavi, scontrino])).toEqual([
      ["2025-02-03", 0, null], // cella vuota, come «—» nell'interfaccia (non 0)
      ["2025-02-04", 4000, 2000],
    ]);
  });
});

describe("demo: dati salvati dalla versione prima", () => {
  it("migraStato aggiunge i giorni vuoti e lascia i vecchi totali settimanali come sono", () => {
    const vecchio = JSON.parse(JSON.stringify(stato())) as Record<string, unknown>;
    delete vecchio.statisticheGiorni;
    vecchio.statistiche = [{ settimana: "2026-03-02", sedeId: 1, pizze: 120, ordini: 45 }];
    const migrato = migraStato(vecchio);
    expect(migrato.statisticheGiorni).toEqual([]);
    expect(migrato.statistiche).toEqual([{ settimana: "2026-03-02", sedeId: 1, pizze: 120, ordini: 45 }]);
    expect(migraStato(JSON.parse(JSON.stringify(migrato)))).toEqual(migrato);
  });

  it("la memoria v8 si legge e si porta alla v9", () => {
    const vecchio = JSON.parse(JSON.stringify(stato())) as Record<string, unknown>;
    delete vecchio.statisticheGiorni;
    vecchio.statistiche = [{ settimana: "2026-03-02", sedeId: 1, pizze: 120, ordini: 45 }];
    // un localStorage finto (i test girano senza browser)
    const dati: Record<string, string> = { "contabilita-demo-v8-vuoto": JSON.stringify(vecchio) };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => dati[k] ?? null,
      setItem: (k: string, v: string) => {
        dati[k] = v;
      },
      removeItem: (k: string) => {
        delete dati[k];
      },
    });
    try {
      modalitaVuota(false);
      modalitaVuota(true); // dimentica lo stato in memoria: si rilegge dal localStorage
      expect(sedeDi(settimana("2026-03-04"), 1)).toMatchObject({ fonte: "SETTIMANA", pizze: 120 });
      expect(stato().statisticheGiorni).toEqual([]);
      // al primo salvataggio si scrive la memoria nuova
      salvaGiorni(g(1, "2026-03-03", 5, 2));
      expect(JSON.parse(dati["contabilita-demo-v9-vuoto"]!).statisticheGiorni).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("demo: dati di prova giorno per giorno", () => {
  it("le ultime settimane sono giorno per giorno con i giorni di chiusura vuoti, le più vecchie col totale settimanale", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-29T12:00:00"));
      modalitaVuota(false);
      ricomincia();
      const scorsa = settimana("2026-10-19");
      for (const r of scorsa.sedi) {
        expect(r.fonte).toBe("GIORNI");
        expect(r.giorniInseriti).toBe(6); // un giorno di chiusura a settimana
        expect(r.giorni.filter((x) => x.pizze === null).every((x) => x.ricaviTotaliCent === 0)).toBe(true);
        expect(r.ricaviConDatiCent).toBe(r.ricaviTotaliCent);
      }
      const vecchia = settimana(aggiungiGiorni(lunediDi("2026-10-29"), -42));
      expect(vecchia.sedi.filter((r) => r.completa).every((r) => r.fonte === "SETTIMANA")).toBe(true);
      // nessuna sede mancante per i giorni di chiusura: la settimana scorsa e' completa
      expect(periodo("da=2026-10-19&a=2026-10-19").settimane[0]!.sediMancanti).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
