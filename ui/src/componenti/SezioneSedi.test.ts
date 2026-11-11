/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Il sorgente letto dal disco: qui non c'e' un DOM per montare il componente.
const sorgente = readFileSync(new URL("./SezioneSedi.tsx", import.meta.url), "utf8");
const inizioElenco = sorgente.indexOf("export default function SezioneSedi");
const finestraModifica = sorgente.slice(sorgente.indexOf("function Modifica("), sorgente.indexOf("function ConfermaArchivia("));
const elenco = sorgente.slice(inizioElenco);

// «Aggiungi sede» crea sempre una sede del locale: personale lo diventa dopo, dalla matita.
describe("Impostazioni › Sedi: una sede nasce del locale", () => {
  it("le parti del sorgente si trovano", () => {
    expect(inizioElenco).toBeGreaterThan(0);
    expect(finestraModifica).toContain("<Finestra");
    expect(elenco).toContain("Aggiungi sede");
  });

  it("il modulo «Nuova sede» non ha l'interruttore «Sede personale»", () => {
    expect(elenco).not.toContain("<Interruttore");
    expect(elenco).not.toMatch(/nuovaPersonale|TITOLO_PERSONALE|SPIEGA_PERSONALE/);
  });

  it("la creazione non manda «personale» e l'avviso non parla di sede personale", () => {
    expect(elenco).toMatch(/api\.creaSede\(nome\)/);
    expect(elenco).not.toContain("Sede personale «");
  });

  it("l'interruttore resta nella finestra della matita", () => {
    expect(finestraModifica).toMatch(/<Interruttore[\s\S]*titolo=\{TITOLO_PERSONALE\}[\s\S]*sotto=\{SPIEGA_PERSONALE\}/);
  });

  it("una riga dice come si fa una sede personale", () => {
    expect(elenco).toContain("Per le spese dei titolari crea una sede e rendila personale con la matita.");
  });
});
