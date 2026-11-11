import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ORIGINE_FILE } from "../api/esporta";
import { NOME_ORIGINE } from "./etichette";

// «XML» e' gergo: nei testi che il cliente legge si dice «fattura elettronica». Resta solo dove serve davvero, cioe' l'estensione dei
// file accettati («.xml», «.xml.p7m»), e nel codice (il valore `"XML"` dell'origine, i commenti).

const src = join(dirname(fileURLToPath(import.meta.url)), "..");

function sorgenti(cartella: string): string[] {
  return readdirSync(cartella, { withFileTypes: true }).flatMap((v) => {
    const percorso = join(cartella, v.name);
    if (v.isDirectory()) return sorgenti(percorso);
    return /\.(ts|tsx)$/.test(v.name) && !/\.test\.tsx?$/.test(v.name) ? [percorso] : [];
  });
}

// Le righe con «XML» che non sono commenti ne' il valore dell'enum: quello che resta e' testo che finisce a schermo.
function righeConXml(file: string): string[] {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((riga) => riga.replace(/\{\/\*.*?\*\/\}/g, "").replace(/\/\/.*$/, ""))
    .map((riga) => riga.replace(/"XML"/g, "").replace(/\bXML:/g, ""))
    .filter((riga) => /XML/.test(riga));
}

describe("testi visibili: niente «XML»", () => {
  it("schermate, componenti e testi di util non mostrano «XML»", () => {
    const trovate: string[] = [];
    for (const cartella of ["viste", "componenti", "util"]) {
      for (const file of sorgenti(join(src, cartella))) {
        for (const riga of righeConXml(file)) trovate.push(`${file.slice(src.length + 1)}: ${riga.trim()}`);
      }
    }
    expect(trovate).toEqual([]);
  });

  it("l'origine di una fattura importata: «Importata» nell'app, «Fattura elettronica» nel file esportato", () => {
    expect(NOME_ORIGINE).toEqual({ MANO: "A mano", XML: "Importata", RICORRENZA: "Ricorrente" });
    expect(ORIGINE_FILE).toEqual({ MANO: "A mano", XML: "Fattura elettronica", RICORRENZA: "Ricorrenza" });
  });

  it("i formati accettati si dicono ancora con l'estensione", () => {
    const importa = readFileSync(join(src, "viste", "ImportaFatture.tsx"), "utf8");
    expect(importa).toContain(".xml");
    expect(importa).toContain(".p7m");
    expect(importa).toContain(".zip");
  });
});
