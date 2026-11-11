import { describe, expect, it } from "vitest";
import { ordinePiede } from "./piedeConferma";

describe("ordinePiede", () => {
  it("sul computer: Annulla per primo, poi le azioni nell'ordine dato (la principale a destra)", () => {
    expect(ordinePiede("annulla", ["solo", "tutti"], false)).toEqual(["annulla", "solo", "tutti"]);
  });
  it("sul telefono, in colonna: la principale in alto, Annulla in fondo", () => {
    expect(ordinePiede("annulla", ["solo", "tutti"], true)).toEqual(["tutti", "solo", "annulla"]);
  });
  it("non tocca l'elenco ricevuto", () => {
    const azioni = ["a", "b"];
    ordinePiede("x", azioni, true);
    expect(azioni).toEqual(["a", "b"]);
  });
});
