import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { nomeFileEsportazione } from "../api/esporta";
import { NOME_PROGRAMMA, PREFISSO_FILE } from "./nomeProgramma";
import { titoloDocumento } from "./titoloPagina";

// Il programma si chiama «Fuorigioco» (come nel calcio, in linea con la schermata della password). Il nome sta in una costante sola; qui si controlla
// che i posti che non la possono importare (index.html, il manifest) dicano lo stesso nome, e che il vecchio nome «Contabilità» non
// torni nei testi a schermo. I nomi tecnici restano com'erano e non si guardano: le chiavi `contabilita.*` e `contabilita-demo-*`
// del browser, il package, la cartella dei dati. La parola comune «contabilità», minuscola, resta libera.

const src = join(dirname(fileURLToPath(import.meta.url)), "..");
const ui = join(src, "..");

function sorgenti(cartella: string): string[] {
  return readdirSync(cartella, { withFileTypes: true }).flatMap((v) => {
    const percorso = join(cartella, v.name);
    if (v.isDirectory()) return sorgenti(percorso);
    return /\.(ts|tsx)$/.test(v.name) && !/\.test\.tsx?$/.test(v.name) ? [percorso] : [];
  });
}

// Testi di dominio che contengono la parola con la maiuscola e non sono il nome del programma.
const DI_DOMINIO = ["Contabilità e dichiarazioni"];

// Le righe con il vecchio nome, tolti i commenti e i testi di dominio: quello che resta finisce a schermo.
function righeColVecchioNome(file: string): string[] {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((riga) => riga.replace(/\{\/\*.*?\*\/\}/g, "").replace(/\/\/.*$/, ""))
    .map((riga) => DI_DOMINIO.reduce((r, testo) => r.replaceAll(testo, ""), riga))
    .filter((riga) => /Contabilit[àa](?![A-Za-z])/.test(riga));
}

describe("nome del programma", () => {
  it("sta in una costante sola", () => {
    expect(NOME_PROGRAMMA).toBe("Fuorigioco");
    expect(PREFISSO_FILE).toBe("fuorigioco");
  });

  it("la scheda del browser: «<vista> · Fuorigioco», e solo «Fuorigioco» senza vista", () => {
    expect(titoloDocumento("Riepilogo")).toBe(`Riepilogo · ${NOME_PROGRAMMA}`);
    expect(titoloDocumento("")).toBe(NOME_PROGRAMMA);
  });

  it("index.html: il titolo e il nome dell'app sul telefono", () => {
    const pagina = readFileSync(join(ui, "index.html"), "utf8");
    expect(pagina).toContain(`<title>${NOME_PROGRAMMA}</title>`);
    expect(pagina).toContain(`<meta name="apple-mobile-web-app-title" content="${NOME_PROGRAMMA}" />`);
    expect(pagina).not.toMatch(/Contabilit/);
  });

  it("il manifest dell'app installata sul telefono", () => {
    const manifest = JSON.parse(readFileSync(join(ui, "public", "manifest.webmanifest"), "utf8")) as { name: string; short_name: string };
    expect(manifest.name).toBe(NOME_PROGRAMMA);
    expect(manifest.short_name).toBe(NOME_PROGRAMMA);
  });

  it("i file esportati cominciano col nome nuovo", () => {
    expect(nomeFileEsportazione({ formato: "xlsx", da: "2026-01-01", a: "2026-01-31" })).toBe("fuorigioco-2026-01-01_2026-01-31.xlsx");
    expect(nomeFileEsportazione({ formato: "csv", da: "2026-01-01", a: "2026-01-31" })).toBe(`${PREFISSO_FILE}-2026-01-01_2026-01-31.csv`);
  });

  it("nessun testo dell'interfaccia dice più «Contabilità»", () => {
    const trovate: string[] = [];
    for (const file of sorgenti(src)) {
      for (const riga of righeColVecchioNome(file)) trovate.push(`${file.slice(src.length + 1)}: ${riga.trim()}`);
    }
    expect(trovate).toEqual([]);
  });

  it("i file scaricati non si chiamano più «contabilita-…» (le chiavi del browser sì, e restano)", () => {
    const trovate: string[] = [];
    for (const file of sorgenti(src)) {
      const righe = readFileSync(file, "utf8").split(/\r?\n/);
      for (const riga of righe) if (/contabilita-\$\{/.test(riga)) trovate.push(`${file.slice(src.length + 1)}: ${riga.trim().slice(0, 120)}`);
    }
    expect(trovate).toEqual([]);
  });
});
