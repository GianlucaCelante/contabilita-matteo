import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COPIE_NELLA_DEMO, doveSonoIDati, ETICHETTA_PROGRAMMA, programmaEVersione } from "./datiECopie";
import { NOME_PROGRAMMA } from "./nomeProgramma";
import { TITOLO_PRIMA_DELL_ACCESSO } from "./titoloPagina";

const src = join(dirname(fileURLToPath(import.meta.url)), "..");
const sorgente = (percorso: string) => readFileSync(join(src, percorso), "utf8");

describe("Impostazioni › Dati e copie: testi veri anche nella demo", () => {
  it("l'app vera non cambia", () => {
    expect(doveSonoIDati(false)).toBe("Solo su questo computer, mai online");
  });
  it("la demo parla di «dispositivo» (si apre anche dal telefono), non di computer", () => {
    expect(doveSonoIDati(true)).toBe("Solo su questo dispositivo, mai online");
  });
  it("la demo non promette copie notturne: dice che lì non si fanno", () => {
    expect(COPIE_NELLA_DEMO).toMatch(/^Nella demo non si fanno\./);
    expect(COPIE_NELLA_DEMO).toContain("Nell'app vera se ne fa una ogni notte alle 03:00");
    expect(COPIE_NELLA_DEMO).not.toMatch(/predefinit/);
  });
});

// Il nome del programma dentro l'app: una riga sola, in fondo a «Dati e copie», quindi solo dopo l'accesso. Prima c'era
// «Versione del programma» e il nome non compariva da nessuna parte (solo scheda del browser, app installata, file esportati).
describe("Impostazioni › Dati e copie: la riga «Programma»", () => {
  it("l'app vera: nome e versione del servizio", () => {
    expect(ETICHETTA_PROGRAMMA).toBe("Programma");
    expect(programmaEVersione("0.1.0", false)).toBe(`${NOME_PROGRAMMA} · versione 0.1.0`);
  });
  it("la demo non ha una versione: «Fuorigioco · demo», qualunque cosa risponda il servizio finto", () => {
    expect(programmaEVersione("demo", true)).toBe(`${NOME_PROGRAMMA} · demo`);
    expect(programmaEVersione("0.1.0", true)).toBe(`${NOME_PROGRAMMA} · demo`);
  });
  it("senza versione (risposta vuota) resta il solo nome, senza «versione» appesa", () => {
    expect(programmaEVersione("", false)).toBe(NOME_PROGRAMMA);
    expect(programmaEVersione("  ", false)).toBe(NOME_PROGRAMMA);
    expect(programmaEVersione(undefined, false)).toBe(NOME_PROGRAMMA);
  });
  it("Impostazioni usa la riga nuova, nella demo e nell'app, e non scrive il nome a mano", () => {
    const vista = sorgente("viste/Impostazioni.tsx");
    expect(vista).not.toContain("Versione del programma");
    expect(vista.match(/<Dato nome=\{ETICHETTA_PROGRAMMA\} valore=\{programmaEVersione\(/g)).toHaveLength(2);
    expect(vista).not.toContain(NOME_PROGRAMMA);
    expect(sorgente("util/datiECopie.ts")).not.toMatch(new RegExp(`["'\`][^"'\`\\n]*${NOME_PROGRAMMA}`));
  });
  it("la schermata d'accesso non dice il nome: resta «Area soci · Calcio»", () => {
    const accesso = sorgente("componenti/SchermataAccesso.tsx");
    expect(accesso).not.toMatch(/nomeProgramma|NOME_PROGRAMMA/);
    expect(accesso).not.toContain(NOME_PROGRAMMA);
    expect(accesso).toContain("titoloPagina = TITOLO_PRIMA_DELL_ACCESSO");
    expect(TITOLO_PRIMA_DELL_ACCESSO).not.toContain(NOME_PROGRAMMA);
  });
});
