import { describe, expect, it } from "vitest";
import { nomiFrecce, sceltePeriodo } from "./sceltePeriodo";

describe("sceltePeriodo", () => {
  it("tutte le scelte, nell'ordine dei segmenti", () => {
    expect(sceltePeriodo().map((s) => s.tipo)).toEqual(["giorno", "settimana", "mese", "anno", "periodo"]);
    expect(sceltePeriodo().map((s) => s.etichetta)).toEqual(["Oggi", "Settimana", "Mese", "Anno", "Periodo"]);
  });

  it("senza «Oggi» dove i dati sono settimanali", () => {
    expect(sceltePeriodo({ senzaGiorno: true }).map((s) => s.tipo)).toEqual(["settimana", "mese", "anno", "periodo"]);
  });

  it("senza il periodo libero dove non serve", () => {
    expect(sceltePeriodo({ conPeriodoLibero: false }).map((s) => s.tipo)).toEqual(["giorno", "settimana", "mese", "anno"]);
  });

  it("ogni scelta spiega che cosa mostra (per il foglio del telefono)", () => {
    expect(sceltePeriodo().every((s) => s.aiuto.length > 0)).toBe(true);
  });
});

describe("nomiFrecce", () => {
  it("giorno precedente e successivo per «Oggi», periodo per gli altri", () => {
    expect(nomiFrecce("giorno")).toEqual({ prima: "Giorno precedente", dopo: "Giorno successivo" });
    expect(nomiFrecce("mese")).toEqual({ prima: "Periodo precedente", dopo: "Periodo successivo" });
  });
});
