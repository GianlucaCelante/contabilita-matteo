/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { campiVuoti, noteInNuovoSulTelefono, spostaDescrizioneNelleNote } from "../util/modelloMovimento";

// Il sorgente letto dal disco: qui non c'e' un DOM per montare il componente.
const sorgente = readFileSync(new URL("./FormMovimento.tsx", import.meta.url), "utf8");
// Il ramo del telefono, dal campo Descrizione in giu' (sopra c'e' quello del computer).
const telefono = sorgente.slice(sorgente.indexOf("{chiedeDescrizione(campi)"), sorgente.indexOf("Già pagata"));

// «Nuovo movimento» sul telefono non ha il campo Note. Ma se le Note hanno del testo (la descrizione di uno scontrino passata li'
// cambiando documento, o un modello che le porta) si devono vedere: prima si salvavano senza che si potessero leggere ne' correggere.
describe("Nuovo movimento sul telefono: le Note compaiono quando hanno del testo", () => {
  const scontrino = { ...campiVuoti(), tipo: "COSTO_VARIABILE" as const, documentoVariabile: "SCONTRINO" as const, descrizione: "Reso cartoni" };

  it("senza testo il modulo resta com'è: niente campo Note", () => {
    expect(noteInNuovoSulTelefono(scontrino, false)).toBe(false);
    expect(noteInNuovoSulTelefono({ ...scontrino, note: "   " }, false)).toBe(false);
  });

  it("la descrizione passata nelle Note cambiando documento le fa comparire", () => {
    for (const documentoVariabile of ["FATTURA", "NOTA_DI_CREDITO"] as const) {
      const dopo = spostaDescrizioneNelleNote({ ...scontrino, documentoVariabile });
      expect(dopo.note).toBe("Reso cartoni");
      expect(noteInNuovoSulTelefono(dopo, false)).toBe(true);
    }
  });

  it("una volta comparso il campo resta, anche se lo si svuota (non sparisce sotto le dita)", () => {
    expect(noteInNuovoSulTelefono({ ...scontrino, note: "" }, true)).toBe(true);
  });

  it("il modulo lo usa: sul telefono le Note ci sono in modifica oppure quando hanno del testo", () => {
    expect(telefono.length).toBeGreaterThan(0);
    expect(sorgente).toMatch(/noteInNuovoSulTelefono\(campi, /);
    expect(telefono).toMatch(/\{noteSulTelefono && campoNote\}/);
    // non c'e' piu' un ramo del telefono che mostra le Note solo in modifica
    expect(telefono).not.toMatch(/\{modifica && campoNote\}/);
  });
});
