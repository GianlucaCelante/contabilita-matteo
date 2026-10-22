import { describe, expect, it } from "vitest";
import { ZOOM_ADATTA, ZOOM_MASSIMO, ZOOM_MINIMO, dimensioniAdatte, limitaZoom, passoMeno, passoPiu, zoomConRotella } from "./zoomLente";

describe("dimensioniAdatte", () => {
  it("una foto larga sta intera nella larghezza dell'area", () => {
    const d = dimensioniAdatte({ areaL: 400, areaA: 800, fotoL: 2400, fotoA: 1600, zoom: 1 });
    expect(d).toEqual({ larghezza: 400, altezza: Math.round((400 * 1600) / 2400) });
  });
  it("una foto alta sta intera nell'altezza dell'area", () => {
    const d = dimensioniAdatte({ areaL: 800, areaA: 400, fotoL: 1000, fotoA: 2000, zoom: 1 });
    expect(d).toEqual({ larghezza: 200, altezza: 400 });
  });
  it("lo zoom moltiplica la misura adattata", () => {
    const d = dimensioniAdatte({ areaL: 400, areaA: 800, fotoL: 2400, fotoA: 1600, zoom: 2 });
    expect(d.larghezza).toBe(800);
  });
  it("una foto piccola non si ingrandisce oltre la sua misura a zoom 1", () => {
    const d = dimensioniAdatte({ areaL: 1000, areaA: 1000, fotoL: 100, fotoA: 50, zoom: 1 });
    expect(d).toEqual({ larghezza: 100, altezza: 50 });
  });
  it("misure nulle non rompono niente", () => {
    expect(dimensioniAdatte({ areaL: 0, areaA: 0, fotoL: 0, fotoA: 0, zoom: 1 })).toEqual({ larghezza: 0, altezza: 0 });
  });
});

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
