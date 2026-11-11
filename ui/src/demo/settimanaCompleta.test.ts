import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Settimana } from "../api/tipi";
import { rispondi } from "./backend";
import { modalitaVuota, ricomincia, stato } from "./stato";

// PUT /api/statistiche/settimana-completa nella demo (docs/api.md, «Salvare una settimana intera»): giorni e totali di più sedi in un solo
// salvataggio, tutto o niente; gli stessi casi dei test del servizio. Demo vuota; settimana: lunedì 2 marzo 2026.
const q = (t = "") => new URLSearchParams(t);
const salvaCompleta = (corpo: unknown) => rispondi("PUT", "/statistiche/settimana-completa", q(), corpo);
const ok = (corpo: unknown) => {
  const r = salvaCompleta(corpo);
  expect(r.stato, JSON.stringify(r.corpo)).toBe(200);
  return r.corpo as Settimana;
};
const errore = (corpo: unknown) => {
  const r = salvaCompleta(corpo);
  expect(r.stato).toBe(400);
  return (r.corpo as { errore: string }).errore;
};
const nuovaSede = (nome: string, extra: object = {}) => (rispondi("POST", "/sedi", q(), { nome, ...extra }).corpo as { id: number }).id;
const g = (sedeId: number, data: string, pizze: number | null, ordini: number | null) => ({ sedeId, data, pizze, ordini });
const t = (sedeId: number, pizze: number | null, ordini: number | null) => ({ sedeId, pizze, ordini });
const sedeDi = (s: Settimana, id: number) => s.sedi.find((r) => r.sede.id === id)!;
const conta = () => ({ giorni: stato().statisticheGiorni.length, totali: stato().statistiche.length });

let mare = 0;
let monti = 0;
beforeEach(() => {
  modalitaVuota(true);
  ricomincia();
  mare = nuovaSede("Mare");
  monti = nuovaSede("Monti");
});
afterEach(() => {
  modalitaVuota(false);
  ricomincia();
});

describe("demo: settimana completa, salvataggio", () => {
  it("salva giorni e totali di più sedi in una volta e risponde con la settimana", () => {
    const r = ok({ settimana: "2026-03-04", giorni: [g(1, "2026-03-02", 9, 4), g(1, "2026-03-03", 0, 0)], totali: [t(mare, 70, 30)] });
    expect(r.settimana).toBe("2026-03-02");
    expect(sedeDi(r, 1)).toMatchObject({ fonte: "GIORNI", giorniInseriti: 2, pizze: 9 });
    expect(sedeDi(r, mare)).toMatchObject({ fonte: "SETTIMANA", pizze: 70 });
    expect(sedeDi(r, monti).completa).toBe(false);
    expect(r).toEqual(rispondi("GET", "/statistiche/settimana", q("data=2026-03-02"), undefined).corpo);
  });

  it("un modo per sede: i numeri in un modo cancellano l'altro", () => {
    ok({ settimana: "2026-03-02", totali: [t(1, 50, 20)], giorni: [g(mare, "2026-03-05", 8, 3)] });
    const r = ok({ settimana: "2026-03-02", giorni: [g(1, "2026-03-06", 11, 5)], totali: [t(mare, 40, 16)] });
    expect(sedeDi(r, 1)).toMatchObject({ fonte: "GIORNI", pizze: 11 });
    expect(sedeDi(r, mare)).toMatchObject({ fonte: "SETTIMANA" });
    expect(conta()).toEqual({ giorni: 1, totali: 1 });
    const r2 = ok({ settimana: "2026-03-02", totali: [t(mare, null, null)], giorni: [g(mare, "2026-03-03", 4, 2), g(1, "2026-03-06", null, null)] });
    expect(sedeDi(r2, mare).fonte).toBe("GIORNI");
    expect(sedeDi(r2, 1).completa).toBe(false);
    expect(conta()).toEqual({ giorni: 1, totali: 0 });
  });
});

describe("demo: settimana completa, tutto o niente", () => {
  it("se la seconda sede non è valida non si salva niente per nessuna", () => {
    ok({ settimana: "2026-03-02", totali: [t(1, 50, 20)], giorni: [g(mare, "2026-03-05", 8, 3)] });
    expect(rispondi("PUT", `/sedi/${monti}`, q(), { archiviata: true }).stato).toBe(200);
    expect(errore({ settimana: "2026-03-02", giorni: [g(1, "2026-03-03", 9, 4)], totali: [t(mare, 70, 30), t(monti, 10, 5)] })).toBe("La sede «Monti» è archiviata.");
    expect(stato().statistiche).toEqual([{ settimana: "2026-03-02", sedeId: 1, pizze: 50, ordini: 20 }]);
    expect(stato().statisticheGiorni).toEqual([{ giorno: "2026-03-05", sedeId: mare, pizze: 8, ordini: 3 }]);
    expect(errore({ settimana: "2026-03-02", totali: [t(mare, 70, 30)], giorni: [g(1, "2026-03-03", 5, 0)] })).toBe(
      "Sede «Sede principale», 03/03/2026: con 0 ordini le pizze devono essere 0.",
    );
    expect(stato().statisticheGiorni).toEqual([{ giorno: "2026-03-05", sedeId: mare, pizze: 8, ordini: 3 }]);
  });

  it("una sede con i numeri sia nei giorni sia nei totali dà 400", () => {
    expect(errore({ settimana: "2026-03-02", giorni: [g(mare, "2026-03-03", 9, 4)], totali: [t(mare, 70, 30)] })).toBe(
      "Sede «Mare»: scegli un solo modo per la settimana, giorno per giorno o totale della settimana.",
    );
    expect(conta()).toEqual({ giorni: 0, totali: 0 });
  });

  it("errori con gli stessi messaggi di /giorni e /settimana", () => {
    expect(errore({ totali: [t(1, 1, 1)] })).toBe("Indica la settimana (un giorno qualsiasi, yyyy-MM-dd).");
    expect(errore({ settimana: "2026-13-01", totali: [t(1, 1, 1)] })).toBe("La settimana non è una data valida (yyyy-MM-dd): 2026-13-01");
    expect(errore({ settimana: "2026-03-02", giorni: [], totali: [] })).toBe("Indica almeno una voce.");
    expect(errore({ settimana: "2026-03-02" })).toBe("Indica almeno una voce.");
    expect(errore({ settimana: "2026-03-02", giorni: [g(1, "2026-03-09", 1, 1)] })).toBe("Tutti i giorni devono essere della stessa settimana (da lunedì a domenica).");
    expect(errore({ settimana: "2026-03-02", giorni: [g(1, "ieri", 1, 1)] })).toBe("Il giorno non è una data valida (yyyy-MM-dd): ieri");
    expect(errore({ settimana: "2026-03-02", giorni: [g(1, "2026-03-03", 1, 1), g(1, "2026-03-03", 2, 2)] })).toBe(
      "Sede «Sede principale», 03/03/2026: il giorno compare più volte.",
    );
    expect(errore({ settimana: "2026-03-02", giorni: [g(999, "2026-03-03", 1, 1)] })).toBe("Sede non trovata.");
    expect(errore({ settimana: "2026-03-02", totali: [t(mare, 1, 1), t(mare, 2, 2)] })).toBe(`La sede ${mare} compare più volte.`);
    expect(errore({ settimana: "2026-03-02", totali: [t(mare, -1, 1)] })).toBe("Sede «Mare»: pizze non può essere negativo.");
    expect(errore({ settimana: "2026-03-02", totali: [t(mare, 1, null)] })).toBe(
      "Sede «Mare»: indica sia le pizze sia gli ordini (o nessuno dei due per cancellare il dato).",
    );
    const casa = nuovaSede("Casa", { personale: true });
    expect(errore({ settimana: "2026-03-02", totali: [t(casa, 1, 1)] })).toBe("La sede «Casa» è personale: non ha pizze e ordini.");
    expect(conta()).toEqual({ giorni: 0, totali: 0 });
  });
});
