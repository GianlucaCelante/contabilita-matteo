import { describe, expect, it } from "vitest";
import { proporzioniRiepilogo } from "./riepilogo";

const NBSP = " ";

describe("Riepilogo: legenda della barra delle proporzioni", () => {
  it("con un risultato positivo: percentuali sui ricavi", () => {
    const p = proporzioniRiepilogo({ ricaviCent: 100000, variabiliCent: 30000, fissiCent: 20000, risultatoCent: 50000 });
    expect(p.conPercentuali).toBe(true);
    expect([p.variabili, p.fissi, p.risultato]).toEqual(["30,0%", "20,0%", "50,0%"]);
    expect(p.descrizione).toBe("Costi variabili 30,0%, costi fissi 20,0%, risultato 50,0% dei ricavi");
  });

  it("risultato a zero: ancora percentuali (sommano 100%)", () => {
    const p = proporzioniRiepilogo({ ricaviCent: 100000, variabiliCent: 60000, fissiCent: 40000, risultatoCent: 0 });
    expect(p.conPercentuali).toBe(true);
    expect(p.risultato).toBe("0,0%");
  });

  it("costi sopra i ricavi: importi, niente «591,5%» né percentuali negative", () => {
    const p = proporzioniRiepilogo({ ricaviCent: 10960, variabiliCent: 64830, fissiCent: 5160, risultatoCent: -59030 });
    expect(p.conPercentuali).toBe(false);
    expect([p.variabili, p.fissi, p.risultato]).toEqual([`€${NBSP}648,30`, `€${NBSP}51,60`, `−€${NBSP}590,30`]);
    expect(p.descrizione).toBe(`Costi variabili €${NBSP}648,30, costi fissi €${NBSP}51,60, risultato −€${NBSP}590,30`);
    expect(p.descrizione).not.toContain("%");
  });

  it("senza ricavi: importi (non «–»)", () => {
    const p = proporzioniRiepilogo({ ricaviCent: 0, variabiliCent: 5000, fissiCent: 0, risultatoCent: -5000 });
    expect(p.conPercentuali).toBe(false);
    expect([p.variabili, p.fissi, p.risultato]).toEqual([`€${NBSP}50,00`, `€${NBSP}0,00`, `−€${NBSP}50,00`]);
    const vuoto = proporzioniRiepilogo({ ricaviCent: 0, variabiliCent: 0, fissiCent: 0, risultatoCent: 0 });
    expect(vuoto.conPercentuali).toBe(false);
    expect(vuoto.descrizione).not.toContain("%");
  });
});
