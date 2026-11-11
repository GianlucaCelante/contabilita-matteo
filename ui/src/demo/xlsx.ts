// Un file .xlsx minimo costruito nel browser (la demo non ha il servizio): zip senza compressione con i fogli in XML e uno styles.xml
// con i soli formati che usa il servizio (EsportazioneService): data, valuta, intestazione grigia in grassetto, totali in grassetto.

// Gli stili di cella, come li applica il servizio:
// - `testa`: intestazione di una tabella, grassetto su fondo grigio D9D9D9;
// - `data`: cella data «yyyy-mm-dd» allineata a sinistra (il valore si passa come testo ISO e diventa il numero seriale di Excel);
// - `valuta`: numero in euro «#,##0.00 [$€-410]»; `valutaTotale` lo stesso in grassetto;
// - `totale`: testo in grassetto; `titolo`: grassetto, corpo 12.
export type Stile = "testa" | "data" | "valuta" | "valutaTotale" | "totale" | "titolo";
// Una cella: testo, numero, o niente (`null`: la cella non si scrive, come fa il servizio quando un valore manca).
export type Valore = string | number | null;
export type Cella = Valore | { v: Valore; s: Stile };

export interface Foglio {
  nome: string;
  righe: Cella[][];
  // Larghezza di ogni colonna, nell'unita' di Excel (caratteri), dalla prima.
  larghezze?: number[];
  // La prima riga resta ferma mentre si scorre (l'intestazione).
  intestazioneBloccata?: boolean;
}

// Per scrivere una riga intera con lo stesso stile: `riga.map(con("testa"))`.
export const con =
  (s: Stile) =>
  (v: Valore): Cella => ({ v, s });

export const FORMATO_DATA = "yyyy-mm-dd";
export const FORMATO_VALUTA = "#,##0.00 [$€-410]";
// I formati propri partono da 164: i numeri sotto sono quelli predefiniti di Excel.
const ID_FORMATO_DATA = 164;
const ID_FORMATO_VALUTA = 165;

// Il posto di ogni stile in <cellXfs> (0 e' la cella normale): l'attributo s="…" delle celle.
const INDICE_STILE: Record<Stile, number> = { testa: 1, data: 2, valuta: 3, valutaTotale: 4, totale: 5, titolo: 6 };

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SPAZIO_NOMI = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

// caratteri: 0 normale, 1 grassetto, 2 grassetto corpo 12. Sfondi: 0 e 1 sono quelli che Excel pretende, 2 il grigio dell'intestazione.
const STILI =
  `${XML}<styleSheet xmlns="${SPAZIO_NOMI}">` +
  `<numFmts count="2"><numFmt numFmtId="${ID_FORMATO_DATA}" formatCode="${FORMATO_DATA}"/><numFmt numFmtId="${ID_FORMATO_VALUTA}" formatCode="${FORMATO_VALUTA}"/></numFmts>` +
  '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  `<xf numFmtId="${ID_FORMATO_DATA}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>` +
  `<xf numFmtId="${ID_FORMATO_VALUTA}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="${ID_FORMATO_VALUTA}" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

const GIORNO_MS = 86_400_000;
// Il giorno 0 del sistema 1900 di Excel, contando anche il 29 febbraio 1900 che Excel si inventa: vale per le date dal 1° marzo 1900.
const GIORNO_ZERO = Date.UTC(1899, 11, 30);

// Il numero seriale di Excel (sistema 1900) di una data «aaaa-mm-gg»: giorni interi, contati in UTC, quindi senza fusi orari ne' ora
// legale. `null` se il testo non e' una data vera o e' prima del 1° marzo 1900 (li' il conto di Excel e' sfasato).
export function serialeExcel(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [anno, mese, giorno] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(anno, mese - 1, giorno);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== anno || d.getUTCMonth() !== mese - 1 || d.getUTCDate() !== giorno) return null;
  const seriale = Math.round((ms - GIORNO_ZERO) / GIORNO_MS);
  return seriale >= 61 ? seriale : null;
}

const TABELLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(dati: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of dati) c = TABELLA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const testo = new TextEncoder();
// I caratteri di controllo che l'XML non ammette si tolgono: con uno solo Excel dichiarerebbe il file danneggiato.
const esc = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function colonna(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function xmlCella(cella: Cella, rif: string): string {
  const conStile = typeof cella === "object" && cella !== null;
  let v = conStile ? cella.v : cella;
  let stile = conStile ? cella.s : null;
  if (v === null) return "";
  if (stile === "data") {
    // una data che non si riesce a contare resta un testo, senza formato
    const seriale = typeof v === "string" ? serialeExcel(v) : v;
    if (seriale === null) stile = null;
    else v = seriale;
  }
  const s = stile ? ` s="${INDICE_STILE[stile]}"` : "";
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${rif}"${s}><v>${v}</v></c>` : "";
  // senza xml:space="preserve" gli spazi in testa e in coda (o un testo di soli spazi) possono andare persi alla lettura
  const testoPulito = esc(v);
  const spazi = /^\s|\s$/.test(testoPulito) ? ' xml:space="preserve"' : "";
  return `<c r="${rif}"${s} t="inlineStr"><is><t${spazi}>${testoPulito}</t></is></c>`;
}

// L'ordine degli elementi e' quello dello schema: sheetViews, cols, sheetData.
function xmlFoglio({ righe, larghezze = [], intestazioneBloccata = false }: Foglio): string {
  const viste = intestazioneBloccata ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "";
  const colonne = larghezze.length > 0 ? `<cols>${larghezze.map((l, i) => `<col min="${i + 1}" max="${i + 1}" width="${l}" customWidth="1"/>`).join("")}</cols>` : "";
  const corpo = righe.map((riga, r) => `<row r="${r + 1}">${riga.map((cella, c) => xmlCella(cella, `${colonna(c)}${r + 1}`)).join("")}</row>`).join("");
  return `${XML}<worksheet xmlns="${SPAZIO_NOMI}">${viste}${colonne}<sheetData>${corpo}</sheetData></worksheet>`;
}

function zip(file: { nome: string; dati: Uint8Array }[]): Uint8Array {
  const pezzi: Uint8Array[] = [];
  const centrale: Uint8Array[] = [];
  let posizione = 0;
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of file) {
    const nome = testo.encode(f.nome);
    const crc = crc32(f.dati);
    const testa = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(f.dati.length), ...u32(f.dati.length), ...u16(nome.length), ...u16(0)]);
    pezzi.push(testa, nome, f.dati);
    centrale.push(
      Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(f.dati.length), ...u32(f.dati.length), ...u16(nome.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(posizione)]),
      nome,
    );
    posizione += testa.length + nome.length + f.dati.length;
  }
  const dimCentrale = centrale.reduce((s, p) => s + p.length, 0);
  const fine = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(file.length), ...u16(file.length), ...u32(dimCentrale), ...u32(posizione), ...u16(0)]);
  const tutto = [...pezzi, ...centrale, fine];
  const uscita = new Uint8Array(tutto.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of tutto) {
    uscita.set(p, o);
    o += p.length;
  }
  return uscita;
}

export function costruisciXlsx(fogli: Foglio[]): Uint8Array {
  const tipi =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    "</Types>";
  const radice = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const libro =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>` +
    fogli.map((f, i) => `<sheet name="${esc(f.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    "</sheets></workbook>";
  const relazioni =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    // gli stili dopo i fogli: rId1…rIdN restano quelli che workbook.xml cita
    `<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>";
  return zip([
    { nome: "[Content_Types].xml", dati: testo.encode(tipi) },
    { nome: "_rels/.rels", dati: testo.encode(radice) },
    { nome: "xl/workbook.xml", dati: testo.encode(libro) },
    { nome: "xl/_rels/workbook.xml.rels", dati: testo.encode(relazioni) },
    { nome: "xl/styles.xml", dati: testo.encode(STILI) },
    ...fogli.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dati: testo.encode(xmlFoglio(f)) })),
  ]);
}
