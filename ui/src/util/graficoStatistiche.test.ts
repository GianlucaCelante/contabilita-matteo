import { describe, expect, it } from "vitest";
import type { IntervalloSerie } from "../api/tipi";
import { aggiungiGiorni, euro } from "./formato";
import { barraIniziale, barreGrafico, MASSIMO_INTERVALLI, numeriPossibili, euroTondo, intervalloSerie, passoPredefinito, scalaDaZero } from "./graficoStatistiche";

const OGGI = "2026-11-10"; // martedì

const intervallo = (inizio: string, fine: string, o: Partial<IntervalloSerie> = {}): IntervalloSerie => ({
  inizio,
  fine,
  pizze: 0,
  ordini: 0,
  ricaviTotaliCent: 0,
  ricaviExtraCent: 0,
  ricaviConDatiCent: 0,
  scontrinoMedioCent: null,
  pizzePerOrdine: null,
  conDati: false,
  daTotaleSettimanale: false,
  ...o,
});

const giorniTra = (da: string, a: string) => Math.round((new Date(a).getTime() - new Date(da).getTime()) / 86_400_000) + 1;

describe("passo con cui si apre il grafico", () => {
  it("settimana e mese giorno per giorno, anno mese per mese, periodo libero secondo la lunghezza", () => {
    expect(passoPredefinito("settimana", { da: "2026-11-09", a: "2026-11-15" })).toBe("GIORNO");
    expect(passoPredefinito("mese", { da: "2026-11-01", a: "2026-11-30" })).toBe("GIORNO");
    expect(passoPredefinito("anno", { da: "2026-01-01", a: "2026-12-31" })).toBe("ANNO");
    expect(passoPredefinito("periodo", { da: "2026-10-01", a: "2026-10-20" })).toBe("GIORNO");
    expect(passoPredefinito("periodo", { da: "2026-06-01", a: "2026-10-20" })).toBe("SETTIMANA");
    expect(passoPredefinito("periodo", { da: "2024-01-01", a: "2026-10-20" })).toBe("MESE");
  });
});

describe("intervallo chiesto al servizio", () => {
  it("giorno: tutti i giorni del periodo, anche quelli che devono ancora venire", () => {
    expect(intervalloSerie("GIORNO", { da: "2026-11-09", a: "2026-11-15" }, OGGI)).toMatchObject({ da: "2026-11-09", a: "2026-11-15", passo: "GIORNO", titolo: "Giorno per giorno" });
    expect(intervalloSerie("GIORNO", { da: "2026-10-01", a: "2026-10-31" }, OGGI)).toMatchObject({ da: "2026-10-01", a: "2026-10-31" });
  });

  it("giorno su un periodo lungo: le ultime 5 settimane", () => {
    const r = intervalloSerie("GIORNO", { da: "2026-01-01", a: "2026-12-31" }, OGGI);
    expect(r).toMatchObject({ da: "2026-10-12", a: OGGI, passo: "GIORNO", titolo: "Ultime 5 settimane, giorno per giorno" });
    expect(giorniTra(r.da, r.a)).toBeLessThanOrEqual(35);
  });

  it("settimana su meno di 4 settimane: le ultime 12", () => {
    expect(intervalloSerie("SETTIMANA", { da: "2026-11-09", a: "2026-11-15" }, OGGI)).toMatchObject({ da: "2026-08-24", a: OGGI, passo: "SETTIMANA", titolo: "Ultime 12 settimane" });
    // un mese ha già 5 settimane: si guardano quelle
    expect(intervalloSerie("SETTIMANA", { da: "2026-10-01", a: "2026-10-31" }, OGGI)).toMatchObject({ da: "2026-10-01", a: "2026-10-31", titolo: "Settimana per settimana" });
    expect(intervalloSerie("SETTIMANA", { da: "2026-10-12", a: "2026-10-31" }, OGGI)).toMatchObject({ da: "2026-08-10", titolo: "Ultime 12 settimane" });
  });

  it("settimana su un anno: il periodo; su anni interi le ultime 52", () => {
    expect(intervalloSerie("SETTIMANA", { da: "2025-01-01", a: "2025-12-31" }, OGGI)).toMatchObject({ da: "2025-01-01", a: "2025-12-31", titolo: "Settimana per settimana" });
    const lungo = intervalloSerie("SETTIMANA", { da: "2020-01-01", a: "2026-10-31" }, OGGI);
    expect(lungo.titolo).toBe("Ultime 52 settimane");
    expect(lungo.da).toBe(aggiungiGiorni("2026-10-26", -7 * 51));
  });

  it("mese su un mese: gli ultimi 12 mesi; su tanti anni gli ultimi 36", () => {
    expect(intervalloSerie("MESE", { da: "2026-11-01", a: "2026-11-30" }, OGGI)).toMatchObject({ da: "2025-12-01", a: OGGI, passo: "MESE", titolo: "Ultimi 12 mesi" });
    expect(intervalloSerie("MESE", { da: "2026-03-01", a: "2026-08-31" }, OGGI)).toMatchObject({ da: "2026-03-01", a: "2026-08-31", titolo: "Mese per mese" });
    expect(intervalloSerie("MESE", { da: "2000-01-01", a: "2026-10-31" }, OGGI)).toMatchObject({ da: "2023-11-01", titolo: "Ultimi 36 mesi" });
  });

  it("anno: gennaio-dicembre dell'anno del periodo, mese per mese (12 intervalli)", () => {
    expect(intervalloSerie("ANNO", { da: "2026-11-09", a: "2026-11-15" }, OGGI)).toMatchObject({ da: "2026-01-01", a: "2026-12-31", passo: "MESE", titolo: "2026, mese per mese" });
    expect(intervalloSerie("ANNO", { da: "2025-01-01", a: "2025-12-31" }, OGGI)).toMatchObject({ da: "2025-01-01", a: "2025-12-31" });
  });

  it("mai oltre 400 intervalli, con qualunque periodo libero", () => {
    const periodo = { da: "1990-01-01", a: "2026-11-10" };
    expect(giorniTra(intervalloSerie("GIORNO", periodo, OGGI).da, OGGI)).toBeLessThanOrEqual(400);
    expect(giorniTra(intervalloSerie("SETTIMANA", periodo, OGGI).da, OGGI) / 7).toBeLessThanOrEqual(400);
  });

  it("un periodo in corso che va lontano nel futuro: si contano gli intervalli che si chiedono davvero", () => {
    const settimane = intervalloSerie("SETTIMANA", { da: "2026-11-01", a: "2040-12-31" }, OGGI);
    expect(settimane.titolo).toBe("Ultime 52 settimane");
    expect(settimane.a).toBe(OGGI);
    const mesi = intervalloSerie("MESE", { da: "2026-11-01", a: "2070-12-31" }, OGGI);
    expect(mesi.titolo).toBe("Ultimi 36 mesi");
    expect(mesi.a).toBe(OGGI);
  });

  it("le date effettive sotto il titolo", () => {
    expect(intervalloSerie("GIORNO", { da: "2026-11-09", a: "2026-11-15" }, OGGI).date).toBe("9 – 15 novembre 2026");
  });
});

describe("scala da zero", () => {
  it("numeri tondi sopra il massimo", () => {
    expect(scalaDaZero(312)).toEqual({ cima: 400, tacche: [0, 100, 200, 300, 400] });
    expect(scalaDaZero(7)).toEqual({ cima: 8, tacche: [0, 2, 4, 6, 8] });
    expect(scalaDaZero(1000)).toEqual({ cima: 1000, tacche: [0, 250, 500, 750, 1000] });
    expect(scalaDaZero(2)).toEqual({ cima: 2, tacche: [0, 1, 2] });
  });
  it("in centesimi con passo minimo di un euro", () => {
    expect(scalaDaZero(312345, 100).cima).toBe(400000);
    expect(scalaDaZero(150, 100)).toEqual({ cima: 200, tacche: [0, 100, 200] });
    expect(euroTondo(1250000)).toBe("€\u00a012.500");
  });
  it("mai tacche con i decimali: 2,5 solo se è un multiplo del passo minimo", () => {
    expect(scalaDaZero(10)).toEqual({ cima: 10, tacche: [0, 5, 10] });
    expect(scalaDaZero(900, 100)).toEqual({ cima: 1000, tacche: [0, 500, 1000] });
    expect(scalaDaZero(100)).toEqual({ cima: 100, tacche: [0, 25, 50, 75, 100] });
    for (const m of [3, 7, 10, 11, 23, 99, 101, 999]) expect(scalaDaZero(m).tacche.every((t) => Number.isInteger(t))).toBe(true);
  });
  it("senza valori una scala vuota ma valida", () => {
    expect(scalaDaZero(0).cima).toBeGreaterThan(0);
  });
});

describe("barre", () => {
  const settimana = [
    intervallo("2026-11-09", "2026-11-09", { pizze: 300, ordini: 100, ricaviTotaliCent: 250000, ricaviExtraCent: 50000, ricaviConDatiCent: 250000, scontrinoMedioCent: 2500, conDati: true }),
    intervallo("2026-11-10", "2026-11-10", { pizze: 0, ordini: 0, ricaviTotaliCent: 0, conDati: true }),
    intervallo("2026-11-11", "2026-11-11", { ricaviTotaliCent: 0 }),
  ];

  it("pizze: zero inserito, non inserito e futuro sono diversi", () => {
    const d = barreGrafico(
      [settimana[0]!, settimana[1]!, intervallo("2026-11-08", "2026-11-08", { ricaviTotaliCent: 9000 }), settimana[2]!].sort((x, y) => x.inizio.localeCompare(y.inizio)),
      "GIORNO",
      "pizze",
      OGGI,
    );
    expect(d.barre.map((b) => b.stato)).toEqual(["senzaDati", "dati", "dati", "futuro"]);
    expect(d.barre[1]).toMatchObject({ valore: 300, altezza: 1, testo: "300 pizze · 100 ordini · scontrino €\u00a025,00", nome: "Lunedì 9 novembre 2026", etichetta: "lun 9" });
    expect(d.barre[2]).toMatchObject({ valore: 0, testo: "0 pizze · 0 ordini" });
    expect(d.barre[0]!.testo).toBe("pizze e ordini non inseriti");
    expect(d.barre[3]!.testo).toBe("non ancora");
    expect(d.qualcosa).toBe(true);
  });

  it("ricavi: totale con la parte extra; senza pizze inserite i ricavi ci sono lo stesso", () => {
    const d = barreGrafico([intervallo("2026-11-08", "2026-11-08", { ricaviTotaliCent: 9000 }), ...settimana.slice(0, 2)], "GIORNO", "ricavi", OGGI);
    expect(d.scala.cima).toBe(300000);
    expect(d.barre[0]).toMatchObject({ stato: "dati", valore: 9000, extra: 0, testo: "€\u00a090,00" });
    expect(d.barre[1]).toMatchObject({ valore: 250000, extra: 50000, testo: "€\u00a02.500,00, di cui extra €\u00a0500,00" });
    expect(d.barre[1]!.altezzaExtra).toBeCloseTo(1 / 6);
  });

  it("ricavi negativi (note di credito) non scendono sotto zero e l'extra non supera il totale", () => {
    const d = barreGrafico([intervallo("2026-11-02", "2026-11-02", { ricaviTotaliCent: -5000, ricaviExtraCent: 2000 })], "GIORNO", "ricavi", OGGI);
    expect(d.barre[0]).toMatchObject({ valore: 0, extra: 0, altezza: 0 });
    expect(d.qualcosa).toBe(false);
  });

  it("etichette di settimane e mesi; poche etichette sotto tante barre, contate dall'ultima", () => {
    const sett = barreGrafico([intervallo("2026-03-04", "2026-03-08")], "SETTIMANA", "pizze", OGGI);
    expect(sett.barre[0]).toMatchObject({ etichetta: "S10", nome: "Settimana 10 (4 – 8 marzo 2026)" });
    const mesi = barreGrafico([intervallo("2025-12-01", "2025-12-31"), intervallo("2026-01-01", "2026-01-31")], "MESE", "pizze", OGGI);
    expect(mesi.barre.map((b) => b.etichetta)).toEqual(["dic", "gen 26"]);
    expect(mesi.barre[1]!.nome).toBe("Gennaio 2026");
    const trenta = barreGrafico(Array.from({ length: 30 }, (_, i) => intervallo(aggiungiGiorni("2026-10-01", i), aggiungiGiorni("2026-10-01", i))), "GIORNO", "pizze", OGGI);
    const telefono = trenta.barre.filter((b) => b.etichettaTelefono);
    expect(telefono.length).toBeLessThanOrEqual(7);
    expect(trenta.barre[29]!.etichettaTelefono).toBe(true);
    expect(trenta.barre.filter((b) => b.etichettaComputer).length).toBeLessThanOrEqual(15);
    expect(trenta.barre[0]!.etichetta).toBe("1");
  });

  it("la barra del dettaglio all'inizio è l'ultima non futura", () => {
    expect(barraIniziale(barreGrafico(settimana, "GIORNO", "pizze", OGGI).barre)).toBe(1);
  });
});

describe("totali della settimana nel grafico", () => {
  // Lunedi' 2 novembre con il totale della settimana (messo tutto sul lunedi'), martedi' 3 con i dati del giorno.
  const lunedi = intervallo("2026-11-02", "2026-11-02", { pizze: 700, ordini: 200, conDati: true, daTotaleSettimanale: true, ricaviTotaliCent: 50000 });
  const martedi = intervallo("2026-11-03", "2026-11-03", { pizze: 90, ordini: 30, conDati: true, ricaviTotaliCent: 30000 });

  it("con passo Giorno la barra delle pizze col totale settimanale è segnata, anche nel testo per lo screen reader", () => {
    const d = barreGrafico([lunedi, martedi], "GIORNO", "pizze", OGGI);
    expect(d.barre.map((b) => b.settimanale)).toEqual([true, false]);
    expect(d.barre[0]!.testo).toContain("totale della settimana, messo sul lunedì");
    expect(d.barre[1]!.testo).not.toContain("settimana");
    expect(d.settimanali).toBe(true);
  });

  it("negli altri passi e per i ricavi (che sono i movimenti del giorno) non si segna niente", () => {
    const settimana = barreGrafico([{ ...lunedi, fine: "2026-11-08" }], "SETTIMANA", "pizze", OGGI);
    expect(settimana.barre[0]!.settimanale).toBe(false);
    expect(settimana.settimanali).toBe(false);
    const ricavi = barreGrafico([lunedi, martedi], "GIORNO", "ricavi", OGGI);
    expect(ricavi.barre.some((b) => b.settimanale)).toBe(false);
    expect(ricavi.settimanali).toBe(false);
  });
});

describe("giorni dentro un totale della settimana", () => {
  it("con passo Giorno i giorni senza dati di una settimana col totale non sono «non inseriti»", () => {
    const lun = intervallo("2026-11-02", "2026-11-02", { pizze: 700, ordini: 200, conDati: true, daTotaleSettimanale: true });
    const mar = intervallo("2026-11-03", "2026-11-03");
    const mer = intervallo("2026-11-04", "2026-11-04", { pizze: 50, ordini: 20, conDati: true });
    const lunDopo = intervallo("2026-11-09", "2026-11-09");
    const d = barreGrafico([lun, mar, mer, lunDopo], "GIORNO", "pizze", OGGI);
    expect(d.barre.map((b) => b.stato)).toEqual(["dati", "nelTotale", "dati", "senzaDati"]);
    expect(d.barre[1]!.testo).toBe("nel totale della settimana, messo sul lunedì");
    expect(d.barre[1]!.valore).toBe(0);
  });

  it("nei ricavi e negli altri passi non cambia niente", () => {
    const lun = intervallo("2026-11-02", "2026-11-02", { pizze: 700, ordini: 200, conDati: true, daTotaleSettimanale: true });
    const mar = intervallo("2026-11-03", "2026-11-03");
    expect(barreGrafico([lun, mar], "GIORNO", "ricavi", OGGI).barre[1]!.stato).toBe("dati");
  });
});

describe("i numeri in cima su periodi lunghi", () => {
  it("si chiedono mese per mese finché i mesi stanno nei 400 intervalli del servizio", () => {
    expect(MASSIMO_INTERVALLI).toBe(400);
    expect(numeriPossibili({ da: "2026-11-01", a: "2026-11-30" })).toBe(true);
    expect(numeriPossibili({ da: "1993-08-01", a: "2026-11-30" })).toBe(true); // 400 mesi
    expect(numeriPossibili({ da: "1993-07-01", a: "2026-11-30" })).toBe(false); // 401
  });
});


describe("scontrino di un intervallo con ordini e nessun incasso", () => {
  it("non è «€ 0,00» ma «—», con l'avviso come in Pizze e ordini", () => {
    const giorno = intervallo("2026-11-03", "2026-11-03", { pizze: 90, ordini: 30, conDati: true, ricaviConDatiCent: 0, scontrinoMedioCent: 0 });
    const d = barreGrafico([giorno], "GIORNO", "pizze", OGGI);
    expect(d.barre[0]!.testo).toBe("90 pizze · 30 ordini · scontrino — · nessun incasso registrato in questo giorno");
    expect(d.barre[0]!.testo).not.toContain("0,00");
    const mese = barreGrafico([{ ...giorno, inizio: "2026-11-01", fine: "2026-11-30" }], "MESE", "pizze", OGGI);
    expect(mese.barre[0]!.testo).toBe("90 pizze · 30 ordini · scontrino — · nessun incasso registrato");
  });

  it("con incassi lo scontrino resta", () => {
    const giorno = intervallo("2026-11-03", "2026-11-03", { pizze: 90, ordini: 30, conDati: true, ricaviConDatiCent: 30000, scontrinoMedioCent: 1000 });
    expect(barreGrafico([giorno], "GIORNO", "pizze", OGGI).barre[0]!.testo).toBe(`90 pizze · 30 ordini · scontrino ${euro(1000)}`);
  });
});
