import { describe, expect, it } from "vitest";
import { scontrinoMedio } from "./statistiche";

// Lo scontrino medio come il servizio (BigDecimal, HALF_UP): il mezzo centesimo si arrotonda lontano da zero, anche con ricavi negativi
// (per esempio una settimana con piu' storni che incassi).
describe("demo: arrotondamento dello scontrino medio", () => {
  it("positivi: mezzo centesimo in su", () => {
    expect(scontrinoMedio(5, 2)).toBe(3);
    expect(scontrinoMedio(10000, 3)).toBe(3333);
    expect(scontrinoMedio(7, 2)).toBe(4);
  });

  it("negativi: si arrotonda il valore assoluto e si rimette il segno (−2,5 → −3)", () => {
    expect(scontrinoMedio(-5, 2)).toBe(-3);
    expect(scontrinoMedio(-7, 2)).toBe(-4);
    expect(scontrinoMedio(-10000, 3)).toBe(-3333);
    expect(scontrinoMedio(-4, 3)).toBe(-1);
  });

  it("zero e senza ordini", () => {
    expect(scontrinoMedio(0, 3)).toBeNull(); // senza ricavi niente scontrino (regola 3)
    expect(scontrinoMedio(100, 0)).toBeNull();
  });
});
