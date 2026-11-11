import { describe, expect, it } from "vitest";
import { scorrimentoAnteprima } from "./scorriAnteprima";

// Misure in px rispetto alla finestra, come getBoundingClientRect: `alto` e `basso` sono la parte libera (sopra la barra fissa).
describe("dove scorrere quando l'anteprima dell'importazione compare", () => {
  it("se la prima fattura sta già tutta sopra la barra, l'anteprima va in cima e basta", () => {
    expect(scorrimentoAnteprima({ inizio: 300, titolo: 420, primaBasso: 760, alto: 0, basso: 672 })).toBe(288);
  });

  it("se la prima fattura finirebbe sotto la barra, scorre quel tanto in più che serve", () => {
    // in cima: prima fattura fino a 781 - 0... con inizio a 12 lo scarto è 0; servono altri 109 + il margine
    expect(scorrimentoAnteprima({ inizio: 12, titolo: 313, primaBasso: 781, alto: 0, basso: 672 })).toBe(121);
  });

  it("ma non oltre il titolo «N fatture lette»: resta in alto anche se la prima fattura non ci sta tutta", () => {
    expect(scorrimentoAnteprima({ inizio: 12, titolo: 140, primaBasso: 640, alto: 0, basso: 396 })).toBe(128);
  });

  it("senza fatture (niente da importare) vale solo l'inizio", () => {
    expect(scorrimentoAnteprima({ inizio: 300, titolo: null, primaBasso: null, alto: 0, basso: 672 })).toBe(288);
  });

  it("conta dove comincia la parte libera (la testata, la tastiera)", () => {
    expect(scorrimentoAnteprima({ inizio: 400, titolo: 500, primaBasso: 700, alto: 100, basso: 800 })).toBe(288);
  });
});
