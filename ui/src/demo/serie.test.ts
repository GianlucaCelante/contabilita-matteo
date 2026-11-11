import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SerieStatistiche } from "../api/tipi";
import { rispondi } from "./backend";
import { modalitaVuota, ricomincia } from "./stato";

// GET /api/statistiche/serie nella demo: `daTotaleSettimanale` per intervallo e `perSede` sulle date esatte (docs/api.md, «Serie per il
// grafico»), gli stessi casi dei test del servizio. Demo vuota (solo «Sede principale», id 1). Settimane: lunedì 2 e 9 marzo 2026.
const q = (t = "") => new URLSearchParams(t);
const serie = (t: string) => {
  const r = rispondi("GET", "/statistiche/serie", q(t), undefined);
  expect(r.stato, JSON.stringify(r.corpo)).toBe(200);
  return r.corpo as SerieStatistiche;
};
const ok = (r: { stato: number; corpo?: unknown }) => expect(r.stato, JSON.stringify(r.corpo)).toBeLessThan(300);
const nuovaSede = (nome: string, personale = false) => (rispondi("POST", "/sedi", q(), { nome, personale }).corpo as { id: number }).id;
const ricavo = (data: string, sedeId: number, importoCent: number, documento = "RICAVO_FATTURATO") =>
  ok(rispondi("POST", "/movimenti", q(), { data, sedeId, tipo: "RICAVO", documento, importoCent }));
const riga = (r: SerieStatistiche, id: number) => r.perSede.find((s) => s.sedeId === id)!;
const SOMMABILI = ["pizze", "ordini", "ricaviTotaliCent", "ricaviExtraCent", "ricaviConDatiCent"] as const;
const sommaUgualeAlTotale = (r: SerieStatistiche) => {
  for (const campo of SOMMABILI) expect(r.perSede.reduce((s, x) => s + x[campo], 0), campo).toBe(r.totale[campo]);
};

let mare = 0;
let monti = 0;
beforeEach(() => {
  modalitaVuota(true);
  ricomincia();
  mare = nuovaSede("Mare");
  monti = nuovaSede("Monti");
  ok(rispondi("PUT", "/statistiche/settimana", q(), { settimana: "2026-03-04", voci: [{ sedeId: mare, pizze: 100, ordini: 40 }] }));
  ok(rispondi("PUT", "/statistiche/giorni", q(), { voci: [{ sedeId: 1, data: "2026-03-03", pizze: 10, ordini: 4 }] }));
  ok(rispondi("PUT", "/statistiche/giorni", q(), { voci: [{ sedeId: 1, data: "2026-03-10", pizze: 20, ordini: 8 }] }));
  ricavo("2026-03-03", 1, 10000);
  ricavo("2026-03-04", mare, 5000);
  ricavo("2026-03-05", mare, 1000, "RICAVO_EXTRA");
  ricavo("2026-03-11", 1, 3000);
});
afterEach(() => {
  modalitaVuota(false);
  ricomincia();
});

describe("demo: serie, daTotaleSettimanale", () => {
  it("ogni intervallo dice se contiene un totale settimanale", () => {
    const r = serie("da=2026-03-02&a=2026-03-15&passo=GIORNO");
    expect(r.intervalli).toHaveLength(14);
    expect(r.intervalli[0]).toMatchObject({ inizio: "2026-03-02", daTotaleSettimanale: true, pizze: 100 });
    expect(r.intervalli[1]!.daTotaleSettimanale).toBe(false);
    expect(r.intervalli[7]!.daTotaleSettimanale).toBe(false);
    expect(r.totale.daTotaleSettimanale).toBe(true);
    const settimane = serie("da=2026-03-02&a=2026-03-15&passo=SETTIMANA").intervalli;
    expect(settimane.map((s) => s.daTotaleSettimanale)).toEqual([true, false]);
    const dal3 = serie("da=2026-03-03&a=2026-03-08&passo=GIORNO");
    expect(dal3.totale).toMatchObject({ daTotaleSettimanale: false, pizze: 10 });
    expect(serie("da=2026-03-02&a=2026-03-15&passo=GIORNO&sedi=1").totale.daTotaleSettimanale).toBe(false);
  });
});

describe("demo: serie, perSede", () => {
  it("per sede sulle date esatte, con somma uguale al totale", () => {
    const r = serie("da=2026-03-02&a=2026-03-15&passo=SETTIMANA");
    expect(r.perSede.map((s) => s.sedeId)).toEqual([1, mare, monti]);
    expect(riga(r, 1)).toEqual({
      sedeId: 1, nome: "Sede principale", archiviata: false, inizio: "2026-03-02", fine: "2026-03-15", pizze: 30, ordini: 12,
      ricaviTotaliCent: 13000, ricaviExtraCent: 0, ricaviConDatiCent: 10000, scontrinoMedioCent: 833, pizzePerOrdine: 2.5,
      conDati: true, daTotaleSettimanale: false,
    });
    expect(riga(r, mare)).toMatchObject({ pizze: 100, ricaviTotaliCent: 6000, ricaviExtraCent: 1000, ricaviConDatiCent: 6000, daTotaleSettimanale: true });
    expect(riga(r, monti)).toMatchObject({ pizze: 0, ricaviTotaliCent: 0, conDati: false, scontrinoMedioCent: null });
    sommaUgualeAlTotale(r);
    const dal3 = serie("da=2026-03-03&a=2026-03-15&passo=GIORNO");
    expect(riga(dal3, mare)).toMatchObject({ pizze: 0, ricaviTotaliCent: 6000, conDati: false });
    sommaUgualeAlTotale(dal3);
    sommaUgualeAlTotale(serie("da=2026-03-01&a=2026-03-31&passo=MESE"));
  });

  it("rispetta il filtro, le archiviate e la sede personale", () => {
    const soloMare = serie(`da=2026-03-02&a=2026-03-15&passo=GIORNO&sedi=${mare}`);
    expect(soloMare.perSede.map((s) => s.sedeId)).toEqual([mare]);
    sommaUgualeAlTotale(soloMare);
    ok(rispondi("PUT", `/sedi/${monti}`, q(), { archiviata: true }));
    expect(serie("da=2026-03-02&a=2026-03-15&passo=GIORNO").perSede.map((s) => s.sedeId)).toEqual([1, mare]);
    ok(rispondi("PUT", `/sedi/${mare}`, q(), { archiviata: true }));
    const r = serie("da=2026-03-02&a=2026-03-15&passo=GIORNO");
    expect(r.perSede.map((s) => s.sedeId)).toEqual([1, mare]);
    expect(riga(r, mare).archiviata).toBe(true);
    expect(serie("da=2026-04-01&a=2026-04-30&passo=GIORNO").perSede.map((s) => s.sedeId)).toEqual([1]);
    const casa = nuovaSede("Casa", true);
    ricavo("2026-03-04", casa, 7000, "RICAVO_EXTRA");
    expect(serie("da=2026-03-02&a=2026-03-15&passo=GIORNO").perSede.map((s) => s.sedeId)).not.toContain(casa);
    const conCasa = serie(`da=2026-03-02&a=2026-03-15&passo=GIORNO&sedi=1,${casa}`);
    expect(conCasa.perSede.map((s) => s.sedeId)).toEqual([1]);
    sommaUgualeAlTotale(conCasa);
  });
});
