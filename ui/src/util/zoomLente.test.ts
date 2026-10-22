import { describe, expect, it } from "vitest";
import { ZOOM_ADATTA, ZOOM_MASSIMO, ZOOM_MINIMO, limitaZoom, passoMeno, passoPiu, zoomConRotella } from "./zoomLente";

describe("zoom della lente", () => {
  it("parte da «adatta» e non scende sotto il minimo", () => {
    expect(ZOOM_ADATTA).toBe(1);
    expect(ZOOM_MINIMO).toBe(1);
    expect(limitaZoom(0.2)).toBe(ZOOM_MINIMO);
  });
  it("non supera il massimo", () => {
    expect(limitaZoom(99)).toBe(ZOOM_MASSIMO);
  });
  it("un valore non numerico torna a «adatta»", () => {
    expect(limitaZoom(Number.NaN)).toBe(ZOOM_ADATTA);
  });
  it("«+» sale a scatti fino al massimo", () => {
    expect(passoPiu(1)).toBe(1.5);
    expect(passoPiu(1.5)).toBe(2);
    expect(passoPiu(1.7)).toBe(2);
    expect(passoPiu(ZOOM_MASSIMO)).toBe(ZOOM_MASSIMO);
  });
  it("«-» scende a scatti fino al minimo", () => {
    expect(passoMeno(2)).toBe(1.5);
    expect(passoMeno(1.7)).toBe(1.5);
    expect(passoMeno(1)).toBe(1);
  });
  it("la rotella con Ctrl ingrandisce (verso l'alto) e rimpicciolisce, sempre nei limiti", () => {
    expect(zoomConRotella(1, -100)).toBeGreaterThan(1);
    expect(zoomConRotella(2, 100)).toBeLessThan(2);
    expect(zoomConRotella(1, 100)).toBe(1);
    expect(zoomConRotella(ZOOM_MASSIMO, -500)).toBe(ZOOM_MASSIMO);
  });
});
