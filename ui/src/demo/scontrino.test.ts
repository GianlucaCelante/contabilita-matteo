import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SerieStatistiche, Settimana, Statistiche } from "../api/tipi";
import { rispondi } from "./backend";
import { modalitaVuota, ricomincia, stato } from "./stato";
import { righeEsportazione, scontrinoMedio } from "./statistiche";

// Regola 3 (docs/api.md, «Statistiche»): con ordini > 0 ma ricavi usati per lo scontrino = 0 lo scontrino medio e' null (non 0) in tutte
// le risposte e vuoto nei fogli Excel, come il servizio. Demo vuota; settimana: lunedi' 2 marzo 2026, nessun ricavo.
const q = (t = "") => new URLSearchParams(t);
const get = <T,>(percorso: string, t: string) => rispondi("GET", percorso, q(t), undefined).corpo as T;
const ok = (r: { stato: number; corpo?: unknown }) => expect(r.stato, JSON.stringify(r.corpo)).toBeLessThan(300);

beforeEach(() => {
  modalitaVuota(true);
  ricomincia();
});
afterEach(() => {
  modalitaVuota(false);
  ricomincia();
});

describe("demo: scontrino medio senza ricavi", () => {
  it("la funzione: null con 0 ricavi o 0 ordini", () => {
    expect(scontrinoMedio(0, 3)).toBeNull();
    expect(scontrinoMedio(100, 0)).toBeNull();
    expect(scontrinoMedio(600, 3)).toBe(200);
  });

  it("con ordini ma senza ricavi lo scontrino è null ovunque e vuoto nei fogli", () => {
    const mare = (rispondi("POST", "/sedi", q(), { nome: "Mare" }).corpo as { id: number }).id;
    ok(rispondi("PUT", "/statistiche/giorni", q(), { voci: [{ sedeId: 1, data: "2026-03-03", pizze: 9, ordini: 4 }] }));
    ok(rispondi("PUT", "/statistiche/settimana", q(), { settimana: "2026-03-02", voci: [{ sedeId: mare, pizze: 20, ordini: 8 }] }));

    const sett = get<Settimana>("/statistiche/settimana", "data=2026-03-02");
    expect(sett.sedi.map((s) => s.scontrinoMedioCent)).toEqual([null, null]);
    expect(sett.sedi[0]!.giorni[1]!.scontrinoMedioCent).toBeNull();

    const p = get<Statistiche>("/statistiche", "da=2026-03-02&a=2026-03-08");
    expect(p.totale.scontrinoMedioCent).toBeNull();
    expect(p.perSede.map((s) => s.scontrinoMedioCent)).toEqual([null, null]);
    expect(p.settimane[0]!.scontrinoMedioCent).toBeNull();

    const s = get<SerieStatistiche>("/statistiche/serie", "da=2026-03-02&a=2026-03-08&passo=GIORNO");
    expect(s.totale.scontrinoMedioCent).toBeNull();
    expect(s.intervalli.every((i) => i.scontrinoMedioCent === null)).toBe(true);
    expect(s.perSede.every((i) => i.scontrinoMedioCent === null)).toBe(true);

    // i fogli «Statistiche» e «Pizze per giorno»: scontrino null = cella vuota
    const righe = righeEsportazione(stato(), "2026-03-01", "2026-03-31", null);
    expect(righe.settimane.map((r) => r[5])).toEqual([null, null]);
    expect(righe.giorni.map((r) => r[6])).toEqual([null]);
  });
});
