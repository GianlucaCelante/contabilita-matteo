/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Testi corretti dopo la verifica finale in Chrome: il sorgente letto dal disco, qui non c'e' un DOM per montare le schermate.
const leggi = (percorso: string) => readFileSync(new URL(percorso, import.meta.url), "utf8");

describe("testi delle schermate", () => {
  it("Importa fatture: «Vengono letti» (i file), non «lette»", () => {
    const s = leggi("./ImportaFatture.tsx");
    expect(s).toContain("Vengono letti su questo dispositivo, non inviati da nessuna parte.");
    expect(s).not.toContain("Vengono lette");
  });

  it("la scadenza di una casella: la schermata si chiama Riepilogo, non «Home»", () => {
    const s = leggi("../componenti/FinestreFatture.tsx");
    expect(s).not.toMatch(/la Home/);
    expect(s).toContain("Tre giorni prima il Riepilogo te lo ricorda.");
  });

  it("Dati e copie: nella demo i testi sono quelli di util/datiECopie", () => {
    const s = leggi("./Impostazioni.tsx");
    expect(s).toContain("doveSonoIDati(");
    expect(s).toContain("COPIE_NELLA_DEMO");
    expect(s).not.toContain('"Solo su questo computer, mai online"');
  });

  it("Dettaglio: il riquadro della fattura importata usa i testi di util/allegatoDemo", () => {
    const s = leggi("./DettaglioMovimento.tsx");
    expect(s).toContain("testiFatturaImportata(");
    expect(s).not.toContain("Fattura importata da XML");
    expect(s).not.toContain("il file resta allegato");
  });

  it("Importa fatture: dopo la conferma l'avviso e il periodo sono quelli di periodoDopoImportazione", () => {
    const s = leggi("./ImportaFatture.tsx");
    expect(s).toContain("periodoDopoImportazione(");
    expect(s).toContain("avvisoImportazione(");
  });
});
