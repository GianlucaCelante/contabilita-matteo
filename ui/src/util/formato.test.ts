import { describe, expect, it } from "vitest";
import { euro, euroConSegno } from "./formato";

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
