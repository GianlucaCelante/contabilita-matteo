import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rispondi } from "./backend";
import { modalitaVuota, ricomincia, stato } from "./stato";

// Pizze e ordini non si inseriscono per un giorno futuro (docs/api.md, «Statistiche», regola 5), come il servizio: 400 in /giorni e in
// /settimana-completa; il totale settimanale della settimana in corso resta permesso. Oggi: mercoledì 4 marzo 2026. Demo vuota.
const MESSAGGIO = "Non si possono inserire pizze e ordini per un giorno futuro.";
const q = () => new URLSearchParams();
const put = (percorso: string, corpo: unknown) => rispondi("PUT", percorso, q(), corpo);
const g = (data: string, pizze: number | null, ordini: number | null, sedeId = 1) => ({ sedeId, data, pizze, ordini });
const erroreDi = (r: { corpo?: unknown }) => (r.corpo as { errore: string }).errore;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-04T12:00:00"));
  modalitaVuota(true);
  ricomincia();
});
afterEach(() => {
  modalitaVuota(false);
  ricomincia();
  vi.useRealTimers();
});

describe("demo: niente pizze e ordini per un giorno futuro", () => {
  it("/giorni rifiuta i giorni futuri, tutto o niente; oggi e i giorni passati vanno bene; cancellare un giorno futuro sì", () => {
    const r = put("/statistiche/giorni", { voci: [g("2026-03-05", 5, 2)] });
    expect(r.stato).toBe(400);
    expect(erroreDi(r)).toBe(MESSAGGIO);
    expect(put("/statistiche/giorni", { voci: [g("2026-03-03", 5, 2), g("2026-03-04", 6, 3), g("2026-03-08", 1, 1)] }).stato).toBe(400);
    expect(stato().statisticheGiorni).toEqual([]);
    expect(put("/statistiche/giorni", { voci: [g("2026-03-03", 5, 2), g("2026-03-04", 6, 3)] }).stato).toBe(200);
    expect(stato().statisticheGiorni).toHaveLength(2);
    stato().statisticheGiorni.push({ giorno: "2026-03-06", sedeId: 1, pizze: 4, ordini: 2 });
    expect(put("/statistiche/giorni", { voci: [g("2026-03-06", null, null)] }).stato).toBe(200);
    expect(stato().statisticheGiorni).toHaveLength(2);
  });

  it("anche nella settimana completa; il totale della settimana in corso va bene", () => {
    const mare = (rispondi("POST", "/sedi", q(), { nome: "Mare" }).corpo as { id: number }).id;
    const totali = [{ sedeId: mare, pizze: 40, ordini: 15 }];
    const r = put("/statistiche/settimana-completa", { settimana: "2026-03-02", giorni: [g("2026-03-07", 3, 1)], totali });
    expect(r.stato).toBe(400);
    expect(erroreDi(r)).toBe(MESSAGGIO);
    expect(stato().statistiche).toEqual([]);
    expect(put("/statistiche/settimana-completa", { settimana: "2026-03-02", giorni: [g("2026-03-04", 3, 1)], totali }).stato).toBe(200);
    expect(stato().statistiche).toHaveLength(1);
    expect(put("/statistiche/settimana", { settimana: "2026-03-04", voci: [{ sedeId: mare, pizze: 50, ordini: 20 }] }).stato).toBe(200);
  });
});
