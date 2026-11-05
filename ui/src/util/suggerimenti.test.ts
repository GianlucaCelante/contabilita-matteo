import { describe, expect, it } from "vitest";
import { vociSuggerimenti } from "./suggerimenti";

const nomi = Array.from({ length: 12 }, (_, i) => `Voce ${i + 1}`);
const poche = ["Bel Fungo", "Belvedere", "Bella Napoli"];

describe("vociSuggerimenti", () => {
  it("non taglia le opzioni: le mostra tutte, anche piu' di 8", () => {
    const v = vociSuggerimenti(nomi, "");
    expect(v.map((x) => x.testo)).toEqual(nomi);
    expect(v.every((x) => !x.crea)).toBe(true);
  });

  it("lista lunga (oltre 6 voci): «Crea» in cima, cosi' si raggiunge sempre", () => {
    const v = vociSuggerimenti(nomi, "Nuova");
    expect(v[0]).toEqual({ testo: "Nuova", crea: true });
    expect(v.slice(1).map((x) => x.testo)).toEqual(nomi);
  });

  it("lista corta (fino a 6 voci): «Crea» DOPO le voci esistenti, che non vengono mai scavalcate", () => {
    const v = vociSuggerimenti(poche, "Bel");
    expect(v.map((x) => x.testo)).toEqual([...poche, "Bel"]);
    expect(v[0]!.crea).toBe(false);
    expect(v[v.length - 1]).toEqual({ testo: "Bel", crea: true });
    // il confine: 6 voci stanno ancora «dopo», 7 vanno «in cima»
    expect(vociSuggerimenti(nomi.slice(0, 6), "Zeta").at(-1)?.crea).toBe(true);
    expect(vociSuggerimenti(nomi.slice(0, 7), "Zeta")[0]?.crea).toBe(true);
  });

  it("niente «Crea» se il testo e' vuoto o coincide con un'opzione (senza badare alle maiuscole)", () => {
    expect(vociSuggerimenti(nomi, "   ").some((x) => x.crea)).toBe(false);
    expect(vociSuggerimenti(nomi, "voce 3").some((x) => x.crea)).toBe(false);
  });

  it("senza opzioni c'e' solo «Crea», se c'e' un testo", () => {
    expect(vociSuggerimenti([], "Abc")).toEqual([{ testo: "Abc", crea: true }]);
    expect(vociSuggerimenti([], "")).toEqual([]);
  });

});
