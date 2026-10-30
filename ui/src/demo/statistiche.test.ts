import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Riepilogo, Settimana, Statistiche } from "../api/tipi";
import { rispondi } from "./backend";
import { aggiungiGiorni, lunediDi } from "./date";
import { ricomincia } from "./stato";

// Il servizio finto della demo deve rispettare il contratto delle statistiche di docs/api.md («Pizze e ordini»),
// e i dati di partenza devono mostrare risultati positivi e realistici.
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const OGGI = "2026-10-29"; // un giovedi': la settimana in corso va dal 26 ottobre al 1 novembre
const put = (corpo: unknown) => rispondi("PUT", "/statistiche/settimana", new URLSearchParams(), corpo);
const settimana = (data?: string) => get("/statistiche/settimana", data ? `data=${data}` : "").corpo as Settimana;
const periodo = (q: string) => get("/statistiche", q);

describe("demo: statistiche (pizze e ordini)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${OGGI}T12:00:00`));
    ricomincia();
  });
  afterEach(() => vi.useRealTimers());

  it("parte con alcune settimane inserite e l'ultima incompleta: manca una sede", () => {
    const corrente = settimana();
    expect(corrente.settimana).toBe("2026-10-26");
    expect(corrente.fine).toBe("2026-11-01");
    expect(corrente.sedi.map((r) => [r.sede.nome, r.completa])).toEqual([
      ["Via Roma", true],
      ["Lungomare", true],
      ["Mercato", false],
    ]);
    const mercato = corrente.sedi[2]!;
    expect(mercato).toMatchObject({ pizze: null, ordini: null, scontrinoMedioCent: null, pizzePerOrdine: null });
    expect(mercato.ricaviCent).toBeGreaterThan(0);
    const scorsa = settimana("2026-10-21");
    expect(scorsa.settimana).toBe("2026-10-19");
    expect(scorsa.sedi.every((r) => r.completa && r.ordini! > 0)).toBe(true);
  });

  it("la data è un giorno qualsiasi della settimana e si riporta al lunedì", () => {
    expect(settimana("2026-10-25").settimana).toBe("2026-10-19");
    expect(settimana("2026-10-26").settimana).toBe("2026-10-26");
    expect(get("/statistiche/settimana", "data=ieri")).toMatchObject({ stato: 400 });
  });

  it("scontrino e pizze per ordine sono ricavi/ordini e pizze/ordini arrotondati", () => {
    const sedi = settimana("2026-10-19").sedi;
    for (const r of sedi) {
      expect(r.scontrinoMedioCent).toBe(Math.round(r.ricaviCent / r.ordini!));
      expect(r.pizzePerOrdine).toBe(Math.round((r.pizze! / r.ordini!) * 100) / 100);
    }
    // gli scontrini di prova sono quelli tipici di ogni sede (con un po' di variazione)
    const [via, mare, mercato] = sedi.map((r) => r.scontrinoMedioCent! / 100);
    expect(via!).toBeGreaterThan(18);
    expect(mare!).toBeGreaterThan(via!);
    expect(mercato!).toBeLessThan(via!);
  });

  it("salva una sede: la settimana si completa e il periodo non la segna più come mancante", () => {
    const prima = periodo("da=2026-10-26&a=2026-11-01").corpo as Statistiche;
    expect(prima.settimane[0]!.sediMancanti.map((s) => s.nome)).toEqual(["Mercato"]);
    const r = put({ settimana: "2026-10-28", voci: [{ sedeId: 3, pizze: 17, ordini: 7 }] });
    expect(r.stato).toBe(200);
    const salvata = r.corpo as Settimana;
    expect(salvata.settimana).toBe("2026-10-26");
    const mercato = salvata.sedi[2]!;
    expect(mercato).toMatchObject({ pizze: 17, ordini: 7, completa: true });
    expect(mercato.scontrinoMedioCent).toBe(Math.round(mercato.ricaviCent / 7));
    expect(mercato.pizzePerOrdine).toBe(2.43);
    const dopo = periodo("da=2026-10-26&a=2026-11-01").corpo as Statistiche;
    expect(dopo.settimane[0]!.sediMancanti).toEqual([]);
    expect(dopo.totale.settimaneConDati).toBe(1);
  });

  it("una voce con pizze e ordini null cancella il dato (e cancellare ciò che non c'è non è un errore)", () => {
    expect(put({ settimana: "2026-10-19", voci: [{ sedeId: 1, pizze: null, ordini: null }] }).stato).toBe(200);
    expect(settimana("2026-10-19").sedi[0]).toMatchObject({ completa: false, pizze: null, ordini: null, scontrinoMedioCent: null });
    expect(put({ settimana: "2026-10-19", voci: [{ sedeId: 1, pizze: null, ordini: null }] }).stato).toBe(200);
  });

  it("gli errori sono quelli del servizio e non si salva niente (tutto o niente)", () => {
    const errore = (voci: unknown[], giorno = OGGI) => (put({ settimana: giorno, voci }).corpo as { errore: string }).errore;
    const prima = JSON.stringify(settimana());
    expect(put({ voci: [] }).corpo).toEqual({ errore: "Indica la settimana (un giorno qualsiasi, yyyy-MM-dd)." });
    expect(errore([], "31/10/2026")).toBe("La settimana non è una data valida (yyyy-MM-dd): 31/10/2026");
    expect(errore([])).toBe("Indica almeno una voce.");
    expect(errore([{ pizze: 1, ordini: 1 }])).toBe("Ogni voce deve avere la sede.");
    expect(
      errore([
        { sedeId: 1, pizze: 1, ordini: 1 },
        { sedeId: 1, pizze: 2, ordini: 2 },
      ]),
    ).toBe("La sede 1 compare più volte.");
    expect(errore([{ sedeId: 9, pizze: 1, ordini: 1 }])).toBe("Sede non trovata.");
    expect(errore([{ sedeId: 3, pizze: 2.5, ordini: 1 }])).toBe("Sede «Mercato»: pizze deve essere un numero intero.");
    expect(errore([{ sedeId: 3, pizze: 5, ordini: -1 }])).toBe("Sede «Mercato»: ordini non può essere negativo.");
    expect(errore([{ sedeId: 3, pizze: 5000000, ordini: 1 }])).toBe("Sede «Mercato»: pizze è troppo grande (massimo 1000000).");
    expect(errore([{ sedeId: 3, pizze: 5, ordini: null }])).toBe("Sede «Mercato»: indica sia le pizze sia gli ordini (o nessuno dei due per cancellare il dato).");
    expect(errore([{ sedeId: 3, pizze: 5, ordini: 0 }])).toBe("Sede «Mercato»: con 0 ordini le pizze devono essere 0.");
    // la prima voce è buona, la seconda no: non si salva neanche la prima
    expect(
      errore([
        { sedeId: 3, pizze: 17, ordini: 7 },
        { sedeId: 2, pizze: 5, ordini: 0 },
      ]),
    ).toBe("Sede «Lungomare»: con 0 ordini le pizze devono essere 0.");
    expect(JSON.stringify(settimana())).toBe(prima);
  });

  it("una sede archiviata non accetta dati e compare solo se ha dati o ricavi", () => {
    rispondi("PUT", "/sedi/3", new URLSearchParams(), { archiviata: true });
    expect(put({ settimana: OGGI, voci: [{ sedeId: 3, pizze: 1, ordini: 1 }] }).corpo).toEqual({ errore: "La sede «Mercato» è archiviata." });
    // il Mercato ha ricavi in questa settimana: compare ancora; in una settimana senza niente no
    expect(settimana().sedi.map((r) => r.sede.nome)).toEqual(["Via Roma", "Lungomare", "Mercato"]);
    expect(settimana("2020-01-06").sedi.map((r) => r.sede.nome)).toEqual(["Via Roma", "Lungomare"]);
  });

  it("nel periodo contano solo le coppie sede-settimana con dati e ordini > 0", () => {
    // Mercato 0/0 nella settimana in corso: completa, ma senza ricavi né ordini nelle somme
    put({ settimana: OGGI, voci: [{ sedeId: 3, pizze: 0, ordini: 0 }] });
    const d = periodo("da=2026-10-26&a=2026-11-01").corpo as Statistiche;
    const [via, mare, mercato] = d.perSede;
    expect(mercato).toMatchObject({ pizze: 0, ordini: 0, ricaviCent: 0, scontrinoMedioCent: null, pizzePerOrdine: null, settimaneConDati: 1 });
    const s = settimana();
    expect(d.totale.ricaviCent).toBe(s.sedi[0]!.ricaviCent + s.sedi[1]!.ricaviCent);
    expect(d.totale.ordini).toBe(via!.ordini + mare!.ordini);
    expect(d.totale.scontrinoMedioCent).toBe(Math.round(d.totale.ricaviCent / d.totale.ordini));
    expect(d.settimane[0]!.sediMancanti).toEqual([]);
  });

  it("il periodo conta le settimane il cui lunedì cade in [da, a], in ordine, tutte anche se vuote", () => {
    const d = periodo("da=2026-10-01&a=2026-10-31").corpo as Statistiche;
    expect(d.settimane.map((x) => x.settimana)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(d.totale.settimaneTotali).toBe(4);
    const nessuno = periodo("da=2026-10-27&a=2026-11-01").corpo as Statistiche;
    expect(nessuno.settimane).toEqual([]);
    expect(nessuno.totale).toMatchObject({ settimaneTotali: 0, settimaneConDati: 0, scontrinoMedioCent: null });
    const vuote = periodo("da=2020-01-01&a=2020-01-31").corpo as Statistiche;
    expect(vuote.totale).toMatchObject({ pizze: 0, ordini: 0, scontrinoMedioCent: null, settimaneConDati: 0 });
    expect(vuote.settimane.length).toBe(4);
    expect(vuote.settimane[0]!.sediMancanti.map((x) => x.nome)).toEqual(["Via Roma", "Lungomare", "Mercato"]);
  });

  it("l'Excel ha il foglio Statistiche solo se nel periodo c'è almeno un dato", () => {
    const xlsx = (q: string) => new TextDecoder("latin1").decode(get("/esporta", `formato=xlsx&includi=RICAVO&${q}`).testo!.contenuto as Uint8Array);
    const con = xlsx("da=2026-10-01&a=2026-10-31");
    expect(con).toContain("Statistiche");
    expect(con).toContain("Scontrino medio");
    expect(xlsx("da=2020-01-01&a=2020-01-31")).not.toContain("Statistiche");
  });

  it("il filtro per sedi e gli errori di data come nel servizio", () => {
    const due = periodo("da=2026-10-19&a=2026-10-26&sedi=1,3").corpo as Statistiche;
    expect(due.perSede.map((x) => x.sede.id)).toEqual([1, 3]);
    expect(due.settimane[1]!.sediMancanti.map((x) => x.nome)).toEqual(["Mercato"]);
    expect(periodo("da=2026-10-19")).toMatchObject({ stato: 400, corpo: { errore: "Servono entrambe le date: da e a." } });
    expect(periodo("da=2026-10-26&a=2026-10-19")).toMatchObject({ stato: 400, corpo: { errore: "La data iniziale non può essere dopo quella finale." } });
    expect(periodo("da=2026-10-19&a=2026-10-26&sedi=x")).toMatchObject({ stato: 400 });
  });
});

describe("demo: i dati di partenza danno risultati positivi", () => {
  afterEach(() => vi.useRealTimers());

  // La settimana in corso, la settimana scorsa e il mese, per ogni sede e in tutto, in ogni giorno della settimana e del mese.
  it("settimana in corso, settimana scorsa e mese sono in positivo per ogni sede", () => {
    vi.useFakeTimers();
    const fallite: string[] = [];
    for (let i = 0; i < 62; i++) {
      const oggi = aggiungiGiorni("2026-08-15", i);
      vi.setSystemTime(new Date(`${oggi}T12:00:00`));
      ricomincia();
      const lunedi = lunediDi(oggi);
      const riepilogo = (da: string, a: string) => get("/riepilogo", `da=${da}&a=${a}`).corpo as Riepilogo;
      const periodi: [string, Riepilogo][] = [
        ["settimana", riepilogo(lunedi, oggi)],
        ["settimana scorsa", riepilogo(aggiungiGiorni(lunedi, -7), aggiungiGiorni(lunedi, -1))],
      ];
      // nei primissimi giorni del mese basta una fattura per andare in rosso: il mese si controlla dall'8
      if (Number(oggi.slice(8)) >= 8) periodi.push(["mese", riepilogo(`${oggi.slice(0, 8)}01`, oggi)]);
      for (const [nome, r] of periodi) {
        if (r.risultatoCent <= 0 || r.perSede!.some((x) => x.risultatoCent <= 0)) fallite.push(`${oggi} ${nome}: ${r.perSede!.map((x) => x.risultatoCent).join("/")}`);
      }
    }
    expect(fallite).toEqual([]);
  });

  it("il mese è un risultato realistico: né in rosso né oltre il 60% dei ricavi", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00"));
    ricomincia();
    const r = get("/riepilogo", "da=2026-10-01&a=2026-10-29").corpo as Riepilogo;
    expect(r.risultatoCent / r.ricavi.totaleCent).toBeGreaterThan(0.05);
    expect(r.risultatoCent / r.ricavi.totaleCent).toBeLessThan(0.6);
  });
});
