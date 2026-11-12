import { beforeEach, describe, expect, it } from "vitest";
import { INTESTAZIONI_FILE, RIGHE_PRIMA_DELLE_VOCI, righeAnteprima, righeFoglioRiepilogo, righeTotaliRiepilogo } from "../api/esporta";
import type { Movimento, Riepilogo } from "../api/tipi";
import { rispondi } from "./backend";
import { ricomincia } from "./stato";
import { costruisciXlsx, serialeExcel } from "./xlsx";

// Il file della demo deve essere quello del servizio (EsportazioneService): stesse colonne nello stesso ordine e le stesse etichette
// in italiano per Tipo, Documento e Origine, mai i valori degli enum.
const P = "da=2031-05-01&a=2031-05-31&includi=RICAVO,COSTO_VARIABILE,COSTO_FISSO&sedi=1";
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const nuovo = (corpo: object) => rispondi("POST", "/movimenti", new URLSearchParams(), { data: "2031-05-10", sedeId: 1, ...corpo }).corpo as Movimento;
const csv = () =>
  (get("/esporta", `formato=csv&${P}`).testo!.contenuto as string)
    .slice(1) // il BOM
    .split("\r\n")
    .map((r) => r.split(";"));

beforeEach(() => {
  ricomincia();
  nuovo({ tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 5000, fornitore: "Imballaggi Rapidi", categoria: "Imballaggi", numeroDocumento: "NC-1", note: "reso", descrizione: "Storno" });
  nuovo({ tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 12345, fornitore: "Imballaggi Rapidi", categoria: "Imballaggi", numeroDocumento: "F-7" });
  nuovo({ tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 990, categoria: "Pulizia", descrizione: "Detersivo" });
  nuovo({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 80000, categoria: "Sala" });
  nuovo({ tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 2000, categoria: "Asporto" });
  nuovo({ tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_REGOLARE", importoCent: 30000, categoria: "Retribuzione", dipendente: "Anna Prova" });
  nuovo({ tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_EXTRA", importoCent: 4000, categoria: "Retribuzione", dipendente: "Anna Prova" });
  nuovo({ tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent: 70000, categoria: "Affitto" });
});

describe("demo: il CSV esportato è quello del servizio", () => {
  it("ha le colonne del servizio, nello stesso ordine", () => {
    expect(csv()[0]).toEqual(["Data", "Tipo", "Documento", "Categoria", "Fornitore", "Dipendente", "Descrizione", "N. documento", "Note", "Importo", "Origine", "Sede"]);
    expect(INTESTAZIONI_FILE).toEqual(csv()[0]);
  });

  it("scrive Documento e Origine con le etichette in italiano, non con i valori degli enum", () => {
    const righe = csv().slice(1);
    expect(righe).toHaveLength(8);
    expect(righe.map((r) => r[2])).toEqual(["Nota di credito", "Fattura", "Scontrino", "Fatturato", "Extra", "Retribuzione regolare", "Retribuzione extra", "-"]);
    expect(righe.map((r) => r[1])).toEqual(["Costo variabile", "Costo variabile", "Costo variabile", "Ricavo", "Ricavo", "Costo fisso", "Costo fisso", "Costo fisso"]);
    expect(righe.every((r) => r[10] === "A mano")).toBe(true);
    // la riga della nota di credito, colonna per colonna (importo positivo: riduce i costi)
    expect(righe[0]).toEqual(["2031-05-10", "Costo variabile", "Nota di credito", "Imballaggi", "Imballaggi Rapidi", "", "Storno", "NC-1", "reso", "50,00", "A mano", "Via Roma"]);
    expect(righe[1]![9]).toBe("-123,45");
    expect(righe[5]![5]).toBe("Anna Prova");
  });

  it("le fatture importate hanno origine «Fattura elettronica» (nel file non si legge «XML»)", () => {
    rispondi("POST", "/importa/anteprima", new URLSearchParams(), ["fatture.zip"]);
    rispondi("POST", "/importa/conferma", new URLSearchParams(), { importazioneId: "x", righe: [{ indice: 0, categoria: null }], sedeId: 3 });
    const testo = get("/esporta", "formato=csv&da=2020-01-01&a=2099-12-31&includi=RICAVO,COSTO_VARIABILE,COSTO_FISSO&sedi=3").testo!.contenuto as string;
    const righe = testo.split("\r\n").slice(1).map((r) => r.split(";"));
    const origini = new Set(righe.map((r) => r[r.length - 2]));
    expect(origini.has("Fattura elettronica")).toBe(true);
    expect([...origini].every((o) => ["A mano", "Fattura elettronica", "Ricorrenza"].includes(o!))).toBe(true);
    expect(testo).not.toContain("XML");
    const documenti = new Set(righe.map((r) => r[2]));
    expect([...documenti].every((d) => ["Fatturato", "Extra", "Fattura", "Nota di credito", "Scontrino", "Retribuzione regolare", "Retribuzione extra", "-"].includes(d!))).toBe(true);
  });

  it("un campo con un a capo (anche solo \\r) va tra virgolette, come nel servizio", () => {
    nuovo({ tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 100, categoria: "Pulizia", note: "riga uno\rriga due" });
    expect(get("/esporta", `formato=csv&${P}`).testo!.contenuto as string).toContain('"riga uno\rriga due"');
  });

  it("l'anteprima di Esporta mostra Tipo, Documento e Importo come li scrive il file", () => {
    const elenco = (get("/movimenti", "da=2031-05-01&a=2031-05-31&sedi=1").corpo as { elementi: Movimento[] }).elementi;
    const anteprima = righeAnteprima(elenco, ["RICAVO", "COSTO_VARIABILE", "COSTO_FISSO"], "csv").righe;
    const righe = csv().slice(1, 1 + anteprima.length);
    expect(anteprima.length).toBeGreaterThan(3);
    expect(anteprima.map((r) => r.documento)).toEqual(righe.map((r) => r[2]));
    expect(anteprima.map((r) => r.tipo)).toEqual(righe.map((r) => r[1]));
    expect(anteprima.map((r) => r.importo)).toEqual(righe.map((r) => r[9]));
  });

  it("anche l'anteprima dell'Excel mostra Tipo e Documento come li scrive il file (l'importo è scritto come lo mostra Excel)", () => {
    const elenco = (get("/movimenti", "da=2031-05-01&a=2031-05-31&sedi=1").corpo as { elementi: Movimento[] }).elementi;
    const anteprima = righeAnteprima(elenco, ["RICAVO", "COSTO_VARIABILE", "COSTO_FISSO"], "xlsx").righe;
    const righe = csv().slice(1, 1 + anteprima.length);
    expect(anteprima.map((r) => r.tipo)).toEqual(righe.map((r) => r[1]));
    expect(anteprima.map((r) => r.documento)).toEqual(righe.map((r) => r[2]));
    // stesso numero e stesso segno del file, scritto come lo mostra Excel in italiano col formato valuta del file: «-1.234,50 €»
    for (const r of anteprima) expect(r.importo).toMatch(/^-?\d{1,3}(\.\d{3})*,\d{2} €$/);
    expect(anteprima.some((r) => r.importo.startsWith("-"))).toBe(true);
    expect(anteprima.map((r) => r.importo.replace(/ €$/, "").replace(/\./g, ""))).toEqual(righe.map((r) => r[9]));
    // e la data come nel file (aaaa-mm-gg)
    expect(anteprima.map((r) => r.data)).toEqual(righe.map((r) => r[0]));
  });
});

describe("demo: il foglio Movimenti dell'Excel", () => {
  it("ha le stesse colonne e le stesse etichette del CSV", () => {
    const xlsx = new TextDecoder("utf-8").decode(get("/esporta", `formato=xlsx&${P}`).testo!.contenuto as Uint8Array);
    const foglio = xlsx.slice(xlsx.indexOf("<sheetData>"), xlsx.indexOf("</sheetData>"));
    const testi = [...foglio.matchAll(/<t>([^<]*)<\/t>/g)].map((m) => m[1]);
    expect(testi.slice(0, 12)).toEqual(INTESTAZIONI_FILE);
    for (const etichetta of ["Nota di credito", "Retribuzione regolare", "Retribuzione extra", "Fatturato", "A mano"]) expect(testi).toContain(etichetta);
    expect(foglio).not.toMatch(/NOTA_DI_CREDITO|RETRIBUZIONE_|RICAVO_|MANO|NESSUNO/);
  });
});

// Il foglio «Riepilogo» deve essere quello di EsportazioneService.scriviRiepilogo: titolo, riga vuota, intestazione «Voce | Importo» (o una
// colonna per sede e «Totale»), poi per sezione le categorie, il totale e le somme per documento. Gli importi hanno il segno di
// GET /api/riepilogo: i costi sono positivi, solo il Risultato può essere negativo.
describe("demo: il foglio Riepilogo dell'Excel è quello del servizio", () => {
  const foglioRiepilogo = (q: string): (string | number)[][] => {
    const xlsx = new TextDecoder("utf-8").decode(get("/esporta", `formato=xlsx&statistiche=false&${q}`).testo!.contenuto as Uint8Array);
    const secondo = xlsx.split("<sheetData>")[2]!.split("</sheetData>")[0]!;
    return [...secondo.matchAll(/<row r="\d+">(.*?)<\/row>/g)].map((r) =>
      [...r[1]!.matchAll(/<c [^>]*>(?:<v>([^<]*)<\/v>|<is><t>([^<]*)<\/t><\/is>)<\/c>/g)].map((c) => (c[1] !== undefined ? Number(c[1]) : c[2]!)),
    );
  };

  it("ha titolo, intestazione e righe del servizio, nello stesso ordine e con gli stessi segni", () => {
    expect(foglioRiepilogo(P)).toEqual([
      ["Riepilogo dal 2031-05-01 al 2031-05-31"],
      [],
      ["Voce", "Importo"],
      ["Sala", 800],
      ["Asporto", 20],
      ["Totale ricavi", 820],
      ["Ricavi fatturati", 800],
      ["Ricavi extra", 20],
      ["Imballaggi", 7345 / 100],
      ["Pulizia", 990 / 100],
      ["Totale costi variabili", 8335 / 100],
      ["Fatture", 7345 / 100],
      ["Scontrini", 990 / 100],
      ["Affitto", 700],
      ["Retribuzione", 340],
      ["Totale costi fissi", 1040],
      ["Retribuzione regolare", 300],
      ["Retribuzione extra", 40],
      ["Costi", 112335 / 100],
      ["Risultato", -30335 / 100],
    ]);
  });

  it("le righe per documento ci sono sempre, anche a zero, e senza movimenti restano i totali", () => {
    expect(foglioRiepilogo("da=2032-01-01&a=2032-01-31&includi=RICAVO&sedi=1").slice(2)).toEqual([
      ["Voce", "Importo"],
      ["Totale ricavi", 0],
      ["Ricavi fatturati", 0],
      ["Ricavi extra", 0],
      ["Totale costi variabili", 0],
      ["Fatture", 0],
      ["Scontrini", 0],
      ["Totale costi fissi", 0],
      ["Retribuzione regolare", 0],
      ["Retribuzione extra", 0],
      ["Costi", 0],
      ["Risultato", 0],
    ]);
  });

  it("il Riepilogo non dipende da «includi» (come nel servizio: è quello di /api/riepilogo)", () => {
    expect(foglioRiepilogo(P.replace("includi=RICAVO,COSTO_VARIABILE,COSTO_FISSO", "includi=RICAVO"))).toEqual(foglioRiepilogo(P));
  });

  it("«Senza categoria» è una riga come le altre, in fondo alla sua sezione", () => {
    nuovo({ tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 99900 });
    const nomi = foglioRiepilogo(P).map((r) => r[0]);
    expect(nomi.slice(8, 12)).toEqual(["Imballaggi", "Pulizia", "Senza categoria", "Totale costi variabili"]);
  });

  it("con colonnePerSede e più sedi: una colonna per sede e «Totale», zero dove la sede non ha la categoria", () => {
    nuovo({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 10000, categoria: "Eventi", sedeId: 2 });
    const righe = foglioRiepilogo(P.replace("&sedi=1", "") + "&colonnePerSede=true");
    expect(righe[0]).toEqual(["Riepilogo dal 2031-05-01 al 2031-05-31"]);
    expect(righe[2]).toEqual(["Voce", "Via Roma", "Lungomare", "Mercato", "Totale"]);
    expect(righe[3]).toEqual(["Sala", 800, 0, 0, 800]);
    expect(righe[4]).toEqual(["Eventi", 0, 100, 0, 100]);
    expect(righe[5]).toEqual(["Asporto", 20, 0, 0, 20]);
    expect(righe[6]).toEqual(["Totale ricavi", 820, 100, 0, 920]);
    expect(righe.at(-2)).toEqual(["Costi", 112335 / 100, 0, 0, 112335 / 100]);
    expect(righe.at(-1)).toEqual(["Risultato", -30335 / 100, 100, 0, -20335 / 100]);
    expect(righe.every((r, i) => i < 2 || r.length === 5)).toBe(true);
  });

  it("con colonnePerSede ma una sede sola resta la colonna «Importo» (il servizio vuole più di una sede)", () => {
    expect(foglioRiepilogo(P + "&colonnePerSede=true")).toEqual(foglioRiepilogo(P));
    expect(foglioRiepilogo(P + "&colonnePerSede=false")[2]).toEqual(["Voce", "Importo"]);
  });
});

// I formati di cella sono quelli di EsportazioneService: date come celle data («yyyy-mm-dd», a sinistra), importi con formato valuta,
// intestazioni in grassetto su fondo grigio e bloccate, totali del Riepilogo in grassetto, larghezze delle colonne.
describe("demo: i formati di cella dell'Excel sono quelli del servizio", () => {
  const FORMATO_DATA = "yyyy-mm-dd";
  const FORMATO_VALUTA = "#,##0.00 [$€-410]";
  const utf8 = new TextDecoder("utf-8");

  // Le parti del file, lette dalla directory centrale dello zip (non compresso).
  const parti = (b: Uint8Array): Map<string, string> => {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const fine = b.length - 22;
    expect(v.getUint32(fine, true)).toBe(0x06054b50);
    const out = new Map<string, string>();
    let o = v.getUint32(fine + 16, true);
    for (let i = 0; i < v.getUint16(fine + 10, true); i++) {
      expect(v.getUint32(o, true)).toBe(0x02014b50);
      const [dim, lungoNome, lungoExtra, lungoCommento, testa] = [v.getUint32(o + 24, true), v.getUint16(o + 28, true), v.getUint16(o + 30, true), v.getUint16(o + 32, true), v.getUint32(o + 42, true)];
      expect(v.getUint32(testa, true)).toBe(0x04034b50);
      const inizio = testa + 30 + v.getUint16(testa + 26, true) + v.getUint16(testa + 28, true);
      out.set(utf8.decode(b.subarray(o + 46, o + 46 + lungoNome)), utf8.decode(b.subarray(inizio, inizio + dim)));
      o += 46 + lungoNome + lungoExtra + lungoCommento;
    }
    return out;
  };
  const file = (q = P) => parti(get("/esporta", `formato=xlsx&${q}`).testo!.contenuto as Uint8Array);
  const attributo = (testo: string, nome: string) => new RegExp(`(?:^|\\s)${nome}="([^"]*)"`).exec(testo)?.[1];

  // Gli stili di styles.xml, risolti: per ogni indice di cellXfs il formato del numero, il carattere e lo sfondo.
  const stili = (xml: string) => {
    const blocco = (tag: string) => xml.split(`<${tag} `)[1]!.split(`</${tag}>`)[0]!;
    const conta = (tag: string) => Number(attributo(xml.split(`<${tag} `)[1]!.split(">")[0]!, "count"));
    const formati = new Map([...xml.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"\/>/g)].map((m) => [Number(m[1]), m[2]!]));
    const caratteri = [...blocco("fonts").matchAll(/<font>(.*?)<\/font>/g)].map((m) => m[1]!);
    const sfondi = [...blocco("fills").matchAll(/<fill>(.*?)<\/fill>/g)].map((m) => m[1]!);
    const xf = [...blocco("cellXfs").matchAll(/<xf ([^>]*?)(?:\/>|>(.*?)<\/xf>)/g)].map((m) => {
      const [numFmtId, fontId, fillId] = ["numFmtId", "fontId", "fillId"].map((n) => Number(attributo(m[1]!, n)));
      return {
        numFmtId: numFmtId!,
        fontId: fontId!,
        fillId: fillId!,
        formato: numFmtId === 0 ? "General" : formati.get(numFmtId!),
        grassetto: caratteri[fontId!]?.includes("<b/>") ?? false,
        corpo: Number(/<sz val="(\d+)"\/>/.exec(caratteri[fontId!] ?? "")?.[1]),
        sfondo: /<fgColor rgb="FF([0-9A-F]{6})"\/>/.exec(sfondi[fillId!] ?? "")?.[1] ?? null,
        allineamento: /<alignment horizontal="(\w+)"\/>/.exec(m[2] ?? "")?.[1] ?? null,
      };
    });
    return { xf, conta, caratteri, sfondi, formati };
  };
  // Una cella: il suo stile risolto, se è testo e il valore.
  const lettore = (f: Map<string, string>, foglio: string) => {
    const { xf } = stili(f.get("xl/styles.xml")!);
    const xml = f.get(foglio)!;
    return (rif: string) => {
      const m = new RegExp(`<c r="${rif}"([^>]*)>(?:<v>([^<]*)</v>|<is><t>([^<]*)</t></is>)</c>`).exec(xml);
      if (!m) return null;
      return { stile: xf[Number(attributo(m[1]!, "s") ?? 0)]!, testo: m[3] !== undefined, valore: m[3] ?? Number(m[2]) };
    };
  };
  const larghezze = (xml: string) => [...xml.matchAll(/<col min="(\d+)" max="(\d+)" width="([\d.]+)" customWidth="1"\/>/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  const BLOCCATA = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';

  it("le date diventano numeri seriali di Excel (sistema 1900), senza fusi orari", () => {
    expect(serialeExcel("1970-01-01")).toBe(25569);
    expect(serialeExcel("2000-01-01")).toBe(36526);
    expect(serialeExcel("2024-02-29")).toBe(45351);
    expect(serialeExcel("2031-05-10")).toBe(47978);
    expect(serialeExcel("1900-03-01")).toBe(61); // dopo il 29 febbraio 1900 che Excel si inventa
    // ora legale: il giorno dopo è sempre +1, mai una frazione
    expect(serialeExcel("2026-03-30")! - serialeExcel("2026-03-28")!).toBe(2);
    expect(serialeExcel("2026-10-26")! - serialeExcel("2026-10-24")!).toBe(2);
    for (const no of ["", "10/05/2031", "2031-02-30", "2031-13-01", "1900-01-15", "2031-05-10T00:00"]) expect(serialeExcel(no)).toBeNull();
  });

  it("il file ha styles.xml, dichiarato e collegato alla cartella di lavoro", () => {
    const f = file();
    expect([...f.keys()]).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]);
    expect(f.get("[Content_Types].xml")).toContain('<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>');
    const rel = f.get("xl/_rels/workbook.xml.rels")!;
    expect(rel).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>');
    // gli Id delle relazioni sono tutti diversi, e quelli dei fogli sono quelli che workbook.xml cita
    const id = [...rel.matchAll(/ Id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(id).size).toBe(id.length);
    expect([...f.get("xl/workbook.xml")!.matchAll(/r:id="([^"]+)"/g)].map((m) => m[1])).toEqual(["rId1", "rId2"]);
    expect(rel).toContain('<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>');
    expect(f.get("xl/workbook.xml")).toContain("<bookViews><workbookView/></bookViews><sheets>");
  });

  it("styles.xml è coerente: conteggi giusti, formati, caratteri e sfondi tutti definiti", () => {
    const f = file();
    const xml = f.get("xl/styles.xml")!;
    const s = stili(xml);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')).toBe(true);
    // l'ordine delle sezioni è quello dello schema
    const ordine = ["<numFmts ", "<fonts ", "<fills ", "<borders ", "<cellStyleXfs ", "<cellXfs ", "<cellStyles "].map((t) => xml.indexOf(t));
    expect(ordine.every((p, i) => p > 0 && (i === 0 || p > ordine[i - 1]!))).toBe(true);
    expect(s.conta("numFmts")).toBe(s.formati.size);
    expect(s.conta("fonts")).toBe(s.caratteri.length);
    expect(s.conta("fills")).toBe(s.sfondi.length);
    expect(s.conta("cellXfs")).toBe(s.xf.length);
    // i primi due sfondi sono quelli che Excel pretende (nessuno e gray125)
    expect(s.sfondi.slice(0, 2)).toEqual(['<patternFill patternType="none"/>', '<patternFill patternType="gray125"/>']);
    expect([...s.formati.keys()].every((n) => n >= 164)).toBe(true); // sotto 164 sono i formati predefiniti
    expect([...s.formati.values()].sort()).toEqual([FORMATO_VALUTA, FORMATO_DATA].sort());
    for (const x of s.xf) {
      expect(x.numFmtId === 0 || s.formati.has(x.numFmtId)).toBe(true);
      expect(x.fontId).toBeLessThan(s.caratteri.length);
      expect(x.fillId).toBeLessThan(s.sfondi.length);
    }
    expect(s.xf[0]).toMatchObject({ formato: "General", grassetto: false, sfondo: null, allineamento: null });
    // ogni cella di ogni foglio cita uno stile che esiste
    for (const [nome, foglio] of f) {
      if (!nome.startsWith("xl/worksheets/")) continue;
      for (const m of foglio.matchAll(/<c [^>]*\ss="(\d+)"/g)) expect(Number(m[1])).toBeLessThan(s.xf.length);
    }
  });

  it("Movimenti: intestazione in grassetto su grigio e bloccata, data come cella data, importo in valuta, larghezze", () => {
    const f = file();
    const xml = f.get("xl/worksheets/sheet1.xml")!;
    const c = lettore(f, "xl/worksheets/sheet1.xml");
    for (const col of "ABCDEFGHIJKL") expect(c(`${col}1`)).toMatchObject({ testo: true, stile: { grassetto: true, sfondo: "D9D9D9", formato: "General" } });
    expect(c("A1")!.valore).toBe("Data");
    // la prima riga è la nota di credito del 10 maggio 2031
    expect(c("A2")).toEqual({ testo: false, valore: 47978, stile: expect.objectContaining({ formato: FORMATO_DATA, allineamento: "left", grassetto: false, sfondo: null }) });
    expect(c("J2")).toEqual({ testo: false, valore: 50, stile: expect.objectContaining({ formato: FORMATO_VALUTA, grassetto: false, sfondo: null }) });
    expect(c("J3")).toMatchObject({ testo: false, valore: -123.45, stile: { formato: FORMATO_VALUTA } });
    for (const col of "BCDEFGHIKL") expect(c(`${col}2`)).toMatchObject({ testo: true, stile: { formato: "General", grassetto: false, sfondo: null } });
    // nessuna data resta scritta come testo
    expect(xml).not.toMatch(/<t>\d{4}-\d{2}-\d{2}<\/t>/);
    expect(larghezze(xml)).toEqual([12, 16, 22, 20, 28, 20, 36, 16, 36, 14, 20, 24].map((l, i) => [i + 1, i + 1, l]));
    expect(xml).toContain(BLOCCATA);
    // l'ordine degli elementi del foglio è quello dello schema: sheetViews, cols, sheetData
    expect(xml.indexOf("<sheetViews>")).toBeLessThan(xml.indexOf("<cols>"));
    expect(xml.indexOf("<cols>")).toBeLessThan(xml.indexOf("<sheetData>"));
  });

  it("Riepilogo: titolo in grassetto 12, intestazione grigia, totali in grassetto, importi in valuta, niente blocco", () => {
    nuovo({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 100, categoria: "Costi" }); // una categoria che si chiama come un totale
    const f = file();
    const xml = f.get("xl/worksheets/sheet2.xml")!;
    const c = lettore(f, "xl/worksheets/sheet2.xml");
    expect(c("A1")).toMatchObject({ valore: "Riepilogo dal 2031-05-01 al 2031-05-31", stile: { grassetto: true, corpo: 12, sfondo: null } });
    expect(c("A3")).toMatchObject({ valore: "Voce", stile: { grassetto: true, sfondo: "D9D9D9" } });
    expect(c("B3")).toMatchObject({ valore: "Importo", stile: { grassetto: true, sfondo: "D9D9D9" } });
    const nomi = [...xml.matchAll(/<c r="A(\d+)"[^>]*><is><t>([^<]*)<\/t><\/is><\/c>/g)].map((m) => [Number(m[1]), m[2]!] as const).filter(([riga]) => riga > 3);
    const totali = ["Totale ricavi", "Totale costi variabili", "Totale costi fissi", "Costi", "Risultato"];
    const ultimaCosti = Math.max(...nomi.filter(([, n]) => n === "Costi").map(([riga]) => riga));
    expect(nomi.filter(([, n]) => n === "Costi")).toHaveLength(2);
    for (const [riga, nome] of nomi) {
      // la categoria «Costi» non è un totale: lo è solo la riga fissa in fondo
      const totale = totali.includes(nome) && (nome !== "Costi" || riga === ultimaCosti);
      expect(c(`A${riga}`)!.stile, nome).toMatchObject({ grassetto: totale, formato: "General", sfondo: null });
      expect(c(`B${riga}`), nome).toMatchObject({ testo: false, stile: { grassetto: totale, formato: FORMATO_VALUTA, sfondo: null } });
    }
    expect(nomi.length).toBeGreaterThan(15);
    expect(larghezze(xml)).toEqual([[1, 1, 34], [2, 2, 16]]);
    expect(xml).not.toContain("<pane");
  });

  it("Riepilogo con una colonna per sede: stessi stili su tutte le colonne, larghe 16", () => {
    const f = file(P.replace("&sedi=1", "") + "&colonnePerSede=true&statistiche=false");
    const xml = f.get("xl/worksheets/sheet2.xml")!;
    const c = lettore(f, "xl/worksheets/sheet2.xml");
    for (const col of "ABCDE") expect(c(`${col}3`)!.stile).toMatchObject({ grassetto: true, sfondo: "D9D9D9" });
    const rigaTotale = Number(/<c r="A(\d+)"[^>]*><is><t>Totale ricavi</.exec(xml)![1]);
    for (const col of "BCDE") {
      expect(c(`${col}${rigaTotale}`)!.stile).toMatchObject({ grassetto: true, formato: FORMATO_VALUTA });
      expect(c(`${col}${rigaTotale - 1}`)!.stile).toMatchObject({ grassetto: false, formato: FORMATO_VALUTA });
    }
    expect(larghezze(xml)).toEqual([[1, 1, 34], [2, 2, 16], [3, 3, 16], [4, 4, 16], [5, 5, 16]]);
  });

  it("Statistiche e Pizze per giorno: data, numeri semplici, importi in valuta, scontrino senza cella se manca", () => {
    const voci = [
      { sedeId: 1, data: "2025-02-03", pizze: 9, ordini: 4 },
      { sedeId: 1, data: "2025-02-04", pizze: 6, ordini: 2 },
    ];
    expect(rispondi("PUT", "/statistiche/giorni", new URLSearchParams(), { voci }).stato).toBe(200);
    nuovo({ data: "2025-02-04", tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 4000, categoria: "Sala" });
    expect(rispondi("PUT", "/statistiche/settimana", new URLSearchParams(), { settimana: "2025-02-10", voci: [{ sedeId: 1, pizze: 0, ordini: 0 }] }).stato).toBe(200);
    const f = file("da=2025-02-03&a=2025-02-16&includi=RICAVO&sedi=1");
    expect([...f.keys()].slice(-4)).toEqual([1, 2, 3, 4].map((n) => `xl/worksheets/sheet${n}.xml`));
    expect(f.get("xl/workbook.xml")).toContain('<sheet name="Statistiche" sheetId="3" r:id="rId3"/><sheet name="Pizze per giorno" sheetId="4" r:id="rId4"/>');

    const xmlS = f.get("xl/worksheets/sheet3.xml")!;
    const s = lettore(f, "xl/worksheets/sheet3.xml");
    for (const col of "ABCDEFGHI") expect(s(`${col}1`)!.stile).toMatchObject({ grassetto: true, sfondo: "D9D9D9" });
    expect(s("A2")).toMatchObject({ testo: false, valore: 45691, stile: { formato: FORMATO_DATA, allineamento: "left" } });
    expect(s("C2")).toMatchObject({ testo: false, valore: 15, stile: { formato: "General" } });
    expect(s("D2")).toMatchObject({ testo: false, valore: 6, stile: { formato: "General" } });
    for (const col of "EFGH") expect(s(`${col}2`)).toMatchObject({ testo: false, stile: { formato: FORMATO_VALUTA } });
    expect(s("E2")!.valore).toBe(40);
    expect(s("I2")).toMatchObject({ testo: false, valore: 2, stile: { formato: "General" } });
    // la settimana dopo ha solo il totale, con 0 ordini: niente cella per lo scontrino medio
    expect(s("A3")!.valore).toBe(45698);
    expect(s("F3")).toBeNull();
    expect(xmlS).not.toContain('<c r="F3"');
    expect(s("I3")).toMatchObject({ testo: true, valore: "Totale settimanale" });
    expect(larghezze(xmlS)).toEqual([12, 24, 10, 10, 14, 16, 14, 24, 18].map((l, i) => [i + 1, i + 1, l]));
    expect(xmlS).toContain(BLOCCATA);

    const xmlG = f.get("xl/worksheets/sheet4.xml")!;
    const g = lettore(f, "xl/worksheets/sheet4.xml");
    for (const col of "ABCDEFG") expect(g(`${col}1`)!.stile).toMatchObject({ grassetto: true, sfondo: "D9D9D9" });
    expect(g("A2")).toMatchObject({ testo: false, valore: 45691, stile: { formato: FORMATO_DATA, allineamento: "left" } });
    expect(g("A3")!.valore).toBe(45692);
    expect(g("G2")).toBeNull(); // il 3 febbraio non ha incassi
    expect(g("G3")).toMatchObject({ testo: false, valore: 20, stile: { formato: FORMATO_VALUTA } });
    for (const col of "EF") expect(g(`${col}3`)).toMatchObject({ testo: false, stile: { formato: FORMATO_VALUTA } });
    expect(larghezze(xmlG)).toEqual([12, 24, 10, 10, 14, 14, 16].map((l, i) => [i + 1, i + 1, l]));
    expect(xmlG).toContain(BLOCCATA);
  });

  // Un controllo di buona forma dell'XML (vitest gira senza DOM, quindi niente DOMParser): solo caratteri ammessi dall'XML 1.0, «&»
  // solo nelle entità, «<» e «>» solo nei tag, attributi tra virgolette, tag aperti e chiusi nell'ordine giusto.
  const benFormato = (xml: string): string | null => {
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(xml)) return "carattere non ammesso";
    const corpo = xml.replace(/^<\?xml [^?]*\?>/, "");
    const aperti: string[] = [];
    let fin = 0;
    for (const m of corpo.matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g)) {
      const testo = corpo.slice(fin, m.index);
      if (/[<>]/.test(testo) || /&(?!(?:amp|lt|gt|quot|apos);)/.test(testo)) return `testo non valido: ${testo.slice(0, 40)}`;
      if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(m[3]!)) return `attributo non valido in <${m[2]}>`;
      fin = m.index + m[0].length;
      if (m[1]) {
        if (aperti.pop() !== m[2]) return `chiusura fuori posto: </${m[2]}>`;
      } else if (!m[4]) aperti.push(m[2]!);
    }
    if (corpo.slice(fin).trim() !== "") return "testo dopo l'ultimo tag";
    return aperti.length === 0 ? null : `tag non chiusi: ${aperti.join(",")}`;
  };

  it("il controllo di buona forma riconosce l'XML rotto", () => {
    expect(benFormato('<a><b x="1">t &amp; t</b><c/></a>')).toBeNull();
    for (const rotto of ["<a><b></a></b>", "<a>t & t</a>", "<a>1 < 2</a>", "<a>\u0001</a>", "<a><b></a>", '<a x="&"/>', "<a>x</a>y"]) expect(benFormato(rotto), rotto).not.toBeNull();
  });

  it("caratteri di controllo e caratteri speciali non rompono l'XML del foglio", () => {
    const descrizione = 'Reso\u0001 & <sconto> "10%" \u000B fine';
    nuovo({ tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 100, categoria: "Pulizia", descrizione, note: "a\u0000b\u001Fc" });
    const f = file();
    for (const [nome, xml] of f) expect(benFormato(xml), nome).toBeNull();
    const foglio = f.get("xl/worksheets/sheet1.xml")!;
    // i caratteri di controllo spariscono, gli altri diventano entità
    expect(foglio).toContain("<t>Reso &amp; &lt;sconto&gt; &quot;10%&quot;  fine</t>");
    expect(foglio).toContain("<t>abc</t>");
    // e anche scritti direttamente, compreso il nome del foglio (che è un attributo)
    const diretto = parti(costruisciXlsx([{ nome: 'A&B <"1">', righe: [["\u0001", "a\u0008&\u000C<\u000E>\"", { v: "x\uFFFEy\uFFFF", s: "testa" }]] }]));
    for (const [nome, xml] of diretto) expect(benFormato(xml), nome).toBeNull();
    expect(diretto.get("xl/workbook.xml")).toContain('<sheet name="A&amp;B &lt;&quot;1&quot;&gt;" sheetId="1" r:id="rId1"/>');
    expect(diretto.get("xl/worksheets/sheet1.xml")).toContain('<row r="1"><c r="A1" t="inlineStr"><is><t></t></is></c><c r="B1" t="inlineStr"><is><t>a&amp;&lt;&gt;&quot;</t></is></c><c r="C1" s="1" t="inlineStr"><is><t>xy</t></is></c></row>');
  });

  it("gli spazi in testa, in coda o da soli si conservano (xml:space=\"preserve\")", () => {
    const xml = parti(costruisciXlsx([{ nome: "Prova", righe: [[" davanti", "dietro ", "   ", "in mezzo", "", "\tscheda", "a capo\n", { v: " Totale", s: "totale" }]] }])).get("xl/worksheets/sheet1.xml")!;
    expect(benFormato(xml)).toBeNull();
    const celle = [...xml.matchAll(/<c r="([A-Z]+)1"[^>]*><is><t( xml:space="preserve")?>([^<]*)<\/t><\/is><\/c>/g)].map((m) => [m[1], m[3], m[2] !== undefined]);
    expect(celle).toEqual([
      ["A", " davanti", true],
      ["B", "dietro ", true],
      ["C", "   ", true],
      ["D", "in mezzo", false],
      ["E", "", false],
      ["F", "\tscheda", true],
      ["G", "a capo\n", true],
      ["H", " Totale", true],
    ]);
    expect(xml).toContain('<c r="H1" s="5" t="inlineStr"><is><t xml:space="preserve"> Totale</t></is></c>');
  });

  it("le righe prima delle voci del Riepilogo sono RIGHE_PRIMA_DELLE_VOCI, e i totali cadono sulle righe giuste", () => {
    nuovo({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 100, categoria: "Costi" });
    const r = get("/riepilogo", "da=2031-05-01&a=2031-05-31&sedi=1").corpo as Riepilogo;
    const righe = righeFoglioRiepilogo(r);
    const voci = r.ricavi.voci.length + r.costiVariabili.voci.length + r.costiFissi.voci.length + 11; // 11 righe fisse: totali, «di cui», Costi, Risultato
    expect(righe.length - voci).toBe(RIGHE_PRIMA_DELLE_VOCI);
    expect(righe[RIGHE_PRIMA_DELLE_VOCI - 1]).toEqual(["Voce", "Importo"]);
    expect(righe[RIGHE_PRIMA_DELLE_VOCI]![0]).toBe(r.ricavi.voci[0]!.categoria);
    expect(righeTotaliRiepilogo(r).map((i) => righe[i]![0])).toEqual(["Totale ricavi", "Totale costi variabili", "Totale costi fissi", "Costi", "Risultato"]);
    expect(righeTotaliRiepilogo(r).at(-1)).toBe(righe.length - 1);
    // con una colonna per sede il prefisso non cambia
    expect(righeFoglioRiepilogo(r, [{ nome: "Via Roma", riepilogo: r }]).length).toBe(righe.length);
  });
});

// s34: come EsportazioneService.tipiDa, «includi» assente o vuoto vuol dire tutti i tipi (per il CSV e per l'Excel).
describe("demo: «includi» assente o vuoto esporta tutti i tipi, come il servizio", () => {
  const SENZA = "da=2031-05-01&a=2031-05-31&sedi=1";
  const testoCsv = (q: string) => get("/esporta", `formato=csv&${q}`).testo!.contenuto as string;
  // lo zip non è compresso: il file intero, letto come testo, si confronta direttamente
  const movimentiXlsx = (q: string) => new TextDecoder("latin1").decode(get("/esporta", `formato=xlsx&${q}`).testo!.contenuto as Uint8Array);

  it("CSV: senza «includi» ci sono tutte le righe, non la sola intestazione", () => {
    expect(testoCsv(SENZA)).toBe(testoCsv(P));
    expect(testoCsv(SENZA).split("\r\n").filter(Boolean)).toHaveLength(9);
  });

  it("CSV: «includi=» vuoto o di soli spazi vale come assente", () => {
    expect(testoCsv(`${SENZA}&includi=`)).toBe(testoCsv(P));
    expect(testoCsv(`${SENZA}&includi=%20`)).toBe(testoCsv(P));
  });

  it("Excel: senza «includi» il foglio Movimenti è quello con tutti i tipi", () => {
    expect(movimentiXlsx(SENZA)).toBe(movimentiXlsx(P));
    expect(movimentiXlsx(SENZA)).not.toBe(movimentiXlsx(`${SENZA}&includi=RICAVO`));
  });

  it("gli spazi attorno ai valori si ignorano, e un solo tipo filtra ancora", () => {
    expect(testoCsv(`${SENZA}&includi=RICAVO%20,%20COSTO_FISSO`).split("\r\n").filter(Boolean)).toHaveLength(6);
    expect(testoCsv(`${SENZA}&includi=RICAVO`).split("\r\n").filter(Boolean)).toHaveLength(3);
  });

  // In Java ",".split(",") è un elenco vuoto: nessun tipo, quindi nessun 400 e la sola intestazione (per l'Excel il foglio senza righe).
  it("«includi» di sole virgole: nessun tipo, solo l'intestazione, senza 400", () => {
    for (const virgole of [",", ",,,"]) {
      const r = get("/esporta", `formato=csv&${SENZA}&includi=${virgole}`);
      expect(r.stato).toBe(200);
      expect((r.testo!.contenuto as string).split("\r\n").filter(Boolean)).toHaveLength(1);
      expect(get("/esporta", `formato=xlsx&${SENZA}&includi=${virgole}`).stato).toBe(200);
    }
    // un vuoto in testa o in mezzo resta un valore non valido, come nel servizio
    expect(get("/esporta", `formato=csv&${SENZA}&includi=,RICAVO`).stato).toBe(400);
  });

  it("un valore non valido dà 400 con il messaggio del servizio", () => {
    for (const formato of ["csv", "xlsx"]) {
      const r = get("/esporta", `formato=${formato}&${SENZA}&includi=RICAVO,BOH`);
      expect(r.stato).toBe(400);
      expect(r.corpo).toEqual({ errore: "includi: valore non valido: BOH" });
    }
    expect(get("/esporta", `formato=csv&${SENZA}&includi=RICAVO,,COSTO_FISSO`).corpo).toEqual({ errore: "includi: valore non valido: " });
  });
});

// s37: `GET /api/esporta` controlla i parametri come il servizio (EsportaController, EsportazioneService.prepara): stessi controlli,
// nello stesso ordine, con gli stessi testi e lo stesso 400. I testi sono quelli di EsportaApiTest.iControlliDeiParametriHannoUnOrdineEDeiTestiPrecisi.
describe("demo: i parametri di «esporta» si controllano come nel servizio", () => {
  const DATE = "&da=2031-05-01&a=2031-05-31";
  const messaggio = (q: string) => {
    const r = get("/esporta", q);
    expect(r.stato, q).toBe(400);
    return (r.corpo as { errore: string }).errore;
  };

  it("1. i valori che non si leggono (date, sì/no) vengono prima di tutto, nell'ordine da, a, statistiche, colonnePerSede", () => {
    expect(messaggio("formato=pdf&da=marzo&a=boh&sedi=abc")).toBe("da: valore non valido: marzo");
    expect(messaggio("formato=pdf&da=2031-05-01&a=boh&sedi=abc")).toBe("a: valore non valido: boh");
    expect(messaggio("formato=pdf&da=2031-02-30&a=2031-03-31")).toBe("da: valore non valido: 2031-02-30");
    expect(messaggio("formato=pdf&da=01/03/2031&a=2031-03-31")).toBe("da: valore non valido: 01/03/2031");
    expect(messaggio(`formato=pdf&sedi=abc&statistiche=forse&colonnePerSede=boh${DATE}`)).toBe("statistiche: valore non valido: forse");
    expect(messaggio(`formato=pdf&sedi=abc&colonnePerSede=boh${DATE}`)).toBe("colonnePerSede: valore non valido: boh");
  });

  it("2. poi le sedi", () => {
    expect(messaggio("formato=pdf&sedi=abc")).toBe("sedi: valore non valido: abc");
  });

  it("3. poi il formato: sconosciuto, assente, vuoto o in maiuscolo dà 400, anche se mancano le date", () => {
    expect(messaggio("formato=pdf")).toBe("formato: deve essere xlsx o csv");
    expect(messaggio("da=2031-05-01")).toBe("formato: deve essere xlsx o csv");
    expect(messaggio(`formato=${DATE}`)).toBe("formato: deve essere xlsx o csv");
    expect(messaggio(`formato=CSV${DATE}`)).toBe("formato: deve essere xlsx o csv");
  });

  it("4. poi le date: servono tutte e due (una data vuota vale come assente) e «da» non può essere dopo «a»", () => {
    expect(messaggio("formato=csv&a=2031-05-31&includi=BOH")).toBe("Servono entrambe le date: da e a.");
    expect(messaggio("formato=xlsx&da=2031-05-01")).toBe("Servono entrambe le date: da e a.");
    expect(messaggio("formato=csv&da=&a=2031-05-31")).toBe("Servono entrambe le date: da e a.");
    // una data di soli spazi vale come assente, come in Spring (non «da: valore non valido»)
    expect(messaggio("formato=csv&da=%20&a=2031-05-31")).toBe("Servono entrambe le date: da e a.");
    expect(messaggio("formato=csv&da=2031-05-01&a=%20%20")).toBe("Servono entrambe le date: da e a.");
    expect(messaggio("formato=csv")).toBe("Servono entrambe le date: da e a.");
    expect(messaggio("formato=csv&da=2031-06-01&a=2031-05-01&includi=BOH")).toBe("La data iniziale non può essere dopo quella finale.");
  });

  it("5. per ultimo «includi»", () => {
    expect(messaggio(`formato=csv&includi=BOH${DATE}`)).toBe("includi: valore non valido: BOH");
  });

  it("i sì/no si leggono come nel servizio: true/on/yes/1 e false/off/no/0, senza badare alle maiuscole; vuoto = valore predefinito", () => {
    const fogli = (q: string) => {
      const r = get("/esporta", `formato=xlsx&sedi=1,2&da=2025-02-01&a=2025-02-28&${q}`);
      expect(r.stato, q).toBe(200);
      const testo = new TextDecoder("latin1").decode(r.testo!.contenuto as Uint8Array);
      return { statistiche: testo.includes('name="Statistiche"'), perSede: testo.includes(">Totale<") };
    };
    // dati perché i due interruttori si vedano: pizze e ordini della settimana, e un movimento nella seconda sede
    expect(rispondi("PUT", "/statistiche/settimana", new URLSearchParams(), { settimana: "2025-02-10", voci: [{ sedeId: 1, pizze: 100, ordini: 50 }] }).stato).toBe(200);
    nuovo({ data: "2025-02-12", tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 1000, categoria: "Sala", sedeId: 1 });
    nuovo({ data: "2025-02-12", tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 1000, categoria: "Sala", sedeId: 2 });
    expect(fogli("")).toEqual({ statistiche: true, perSede: false }); // predefiniti: statistiche sì, colonne per sede no
    for (const si of ["true", "TRUE", "on", "yes", "1"]) expect(fogli(`statistiche=${si}&colonnePerSede=${si}`), si).toEqual({ statistiche: true, perSede: true });
    for (const no of ["false", "False", "off", "no", "0"]) expect(fogli(`statistiche=${no}&colonnePerSede=${no}`), no).toEqual({ statistiche: false, perSede: false });
    expect(fogli("statistiche=&colonnePerSede=")).toEqual({ statistiche: true, perSede: false });
  });

  it("con i parametri giusti il file esce come prima, anche per un giorno solo", () => {
    expect(get("/esporta", `formato=csv${DATE}`).stato).toBe(200);
    expect(get("/esporta", `formato=xlsx${DATE}`).stato).toBe(200);
    const unGiorno = get("/esporta", "formato=csv&da=2031-05-10&a=2031-05-10&sedi=1");
    expect(unGiorno.stato).toBe(200);
    expect(unGiorno.testo!.nomeFile).toBe("fuorigioco-2031-05-10_2031-05-10.csv");
    expect((unGiorno.testo!.contenuto as string).split("\r\n")).toHaveLength(9);
  });
});
