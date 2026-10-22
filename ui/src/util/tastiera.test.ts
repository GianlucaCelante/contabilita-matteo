import { describe, expect, it } from "vitest";
import { SOGLIA_TASTIERA_PX, statoTastiera } from "./tastiera";

describe("statoTastiera", () => {
  it("con il campo a fuoco e il viewport molto piu' basso la tastiera e' aperta", () => {
    const s = statoTastiera({ telefono: true, inModifica: true, altezzaRiposo: 800, altezzaVisibile: 480 });
    expect(s.aperta).toBe(true);
    expect(s.altezzaTastiera).toBe(320);
  });
  it("senza campo di testo a fuoco non e' mai aperta", () => {
    expect(statoTastiera({ telefono: true, inModifica: false, altezzaRiposo: 800, altezzaVisibile: 480 }).aperta).toBe(false);
  });
  it("sul computer non e' mai aperta", () => {
    expect(statoTastiera({ telefono: false, inModifica: true, altezzaRiposo: 800, altezzaVisibile: 480 }).aperta).toBe(false);
  });
  it("una differenza piccola (barra degli indirizzi) non e' la tastiera", () => {
    const s = statoTastiera({ telefono: true, inModifica: true, altezzaRiposo: 800, altezzaVisibile: 800 - SOGLIA_TASTIERA_PX });
    expect(s.aperta).toBe(false);
  });
  it("appena oltre la soglia e' aperta", () => {
    expect(statoTastiera({ telefono: true, inModifica: true, altezzaRiposo: 800, altezzaVisibile: 800 - SOGLIA_TASTIERA_PX - 1 }).aperta).toBe(true);
  });
  it("l'altezza della tastiera non e' mai negativa", () => {
    expect(statoTastiera({ telefono: true, inModifica: true, altezzaRiposo: 500, altezzaVisibile: 600 }).altezzaTastiera).toBe(0);
  });
});
