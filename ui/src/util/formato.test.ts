import { describe, expect, it } from "vitest";
import { etichettaDate, euro, euroConSegno } from "./formato";

// Il «€» e la cifra non vanno mai a capo separati (a 320 px «€ 58.866,00» si spezzava): lo spazio e' non separabile.
const NBSP = " ";

describe("importi: € e cifra restano insieme", () => {
  it("euro usa lo spazio non separabile", () => {
    expect(euro(5886600)).toBe(`€${NBSP}58.866,00`);
    expect(euro(-5000)).toBe(`−€${NBSP}50,00`);
    expect(euro(0)).toBe(`€${NBSP}0,00`);
  });
  it("con il segno esplicito il segno e il € non si separano dalla cifra", () => {
    expect(euroConSegno(1000, true)).toBe(`+${NBSP}€${NBSP}10,00`);
    expect(euroConSegno(1000, false)).toBe(`−${NBSP}€${NBSP}10,00`);
  });
  it("nessuno spazio normale dentro un importo", () => {
    expect(euro(123456)).not.toContain(" ");
    expect(euroConSegno(123456, false)).not.toContain(" ");
  });
});

describe("etichetta di un periodo dalle sole date (dettaglio di una voce)", () => {
  it("anno, mese, settimana e giorno interi si chiamano come nel selettore del periodo", () => {
    expect(etichettaDate({ da: "2026-01-01", a: "2026-12-31" })).toBe("2026");
    expect(etichettaDate({ da: "2026-11-01", a: "2026-11-30" })).toBe("Novembre 2026");
    expect(etichettaDate({ da: "2024-02-01", a: "2024-02-29" })).toBe("Febbraio 2024");
    expect(etichettaDate({ da: "2026-11-09", a: "2026-11-15" })).toBe("9 – 15 novembre 2026");
    expect(etichettaDate({ da: "2026-10-23", a: "2026-10-23" })).toBe("Venerdì 23 ottobre 2026");
  });

  it("un periodo che non è intero resta con le due date", () => {
    // comincia il primo ma non finisce l'ultimo del mese
    expect(etichettaDate({ da: "2026-11-01", a: "2026-11-15" })).toBe("01/11/2026 – 15/11/2026");
    // sette giorni che non cominciano di lunedì
    expect(etichettaDate({ da: "2026-11-10", a: "2026-11-16" })).toBe("10/11/2026 – 16/11/2026");
    // due anni interi
    expect(etichettaDate({ da: "2025-01-01", a: "2026-12-31" })).toBe("01/01/2025 – 31/12/2026");
    // due mesi interi
    expect(etichettaDate({ da: "2026-10-01", a: "2026-11-30" })).toBe("01/10/2026 – 30/11/2026");
  });
});
