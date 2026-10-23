// Un file .xlsx minimo costruito nel browser (la demo non ha il servizio): zip senza compressione con i fogli in XML.
export interface Foglio {
  nome: string;
  righe: (string | number)[][];
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
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colonna(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function xmlFoglio(righe: (string | number)[][]): string {
  const corpo = righe
    .map(
      (riga, r) =>
        `<row r="${r + 1}">` +
        riga.map((v, c) => (typeof v === "number" ? `<c r="${colonna(c)}${r + 1}"><v>${v}</v></c>` : `<c r="${colonna(c)}${r + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`)).join("") +
        "</row>",
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${corpo}</sheetData></worksheet>`;
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
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    "</Types>";
  const radice = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const libro =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    fogli.map((f, i) => `<sheet name="${esc(f.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    "</sheets></workbook>";
  const relazioni =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    "</Relationships>";
  return zip([
    { nome: "[Content_Types].xml", dati: testo.encode(tipi) },
    { nome: "_rels/.rels", dati: testo.encode(radice) },
    { nome: "xl/workbook.xml", dati: testo.encode(libro) },
    { nome: "xl/_rels/workbook.xml.rels", dati: testo.encode(relazioni) },
    ...fogli.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dati: testo.encode(xmlFoglio(f.righe)) })),
  ]);
}
