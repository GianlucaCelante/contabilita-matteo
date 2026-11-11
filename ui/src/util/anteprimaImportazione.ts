import type { ErroreFileImportato, FatturaLetta } from "../api/importa";
import { euro } from "./formato";

// Logica dell'anteprima dell'importazione (viste/ImportaFatture.tsx): con centinaia di fatture serve
// raggruppare gli scarti, filtrare l'elenco e riassumere quello che si sta per importare.

export interface GruppoErrori {
  messaggio: string;
  file: string[];
}

const PREFISSO_LOTTO = /^Fattura (.+?): /;

// I file con lo stesso motivo stanno insieme, dal gruppo piu' numeroso. Nei lotti (piu' fatture in un file)
// il messaggio comincia con «Fattura N: »: il prefisso si toglie dal motivo e il numero passa accanto al file.
// Il testo e' quello del servizio, gia' in italiano semplice (niente codici TD…, nomi di campi o numeri di riga): non si riscrive.
export function raggruppaErrori(errori: ErroreFileImportato[]): GruppoErrori[] {
  const gruppi = new Map<string, string[]>();
  for (const e of errori) {
    const m = PREFISSO_LOTTO.exec(e.messaggio);
    const messaggio = m ? e.messaggio.slice(m[0].length) : e.messaggio;
    const file = m ? `${e.nomeFile} (fattura ${m[1]})` : e.nomeFile;
    const lista = gruppi.get(messaggio);
    if (lista) lista.push(file);
    else gruppi.set(messaggio, [file]);
  }
  return [...gruppi.entries()].map(([messaggio, file]) => ({ messaggio, file })).sort((a, b) => b.file.length - a.file.length);
}

// Le etichette accanto al fornitore, per i documenti che non sono una fattura qualunque. La nota di credito e' in evidenza
// (riduce i costi); integrazione e nota di debito sono discrete: si importano come fatture, l'etichetta dice solo che cosa sono.
// La spiegazione e' una frase intera che la riga scrive sotto il fornitore (spiegazioniDocumento): non un `title`, che sul telefono
// non si puo' aprire e che i lettori di schermo leggono in modo incostante.
export interface EtichettaDocumento {
  testo: string;
  tono: "credito" | "discreto";
  spiegazione?: string;
}

export function etichetteDocumento(f: FatturaLetta): EtichettaDocumento[] {
  const etichette: EtichettaDocumento[] = [];
  if (f.notaDiCredito) etichette.push({ testo: "Nota di credito", tono: "credito" });
  if (f.integrazione) etichette.push({ testo: "Integrazione", tono: "discreto", spiegazione: "Autofattura per un acquisto dall'estero: conta come costo." });
  if (f.notaDiDebito) {
    etichette.push({ testo: "Nota di debito", tono: "discreto", spiegazione: "Il fornitore chiede un importo in più rispetto a una fattura già emessa: conta come costo." });
  }
  return etichette;
}

export function spiegazioniDocumento(f: FatturaLetta): string[] {
  return etichetteDocumento(f).flatMap((e) => (e.spiegazione ? [e.spiegazione] : []));
}

export type Filtro = "tutte" | "daImportare" | "giaPresenti" | "noteDiCredito" | "integrazioni" | "escluse";

export interface CriteriFiltro {
  testo: string;
  filtro: Filtro;
}

function inFiltro(f: FatturaLetta, filtro: Filtro, escluse: ReadonlySet<number>): boolean {
  switch (filtro) {
    case "tutte":
      return true;
    case "daImportare":
      return !f.duplicata && !escluse.has(f.indice);
    case "giaPresenti":
      return f.duplicata;
    case "noteDiCredito":
      return f.notaDiCredito;
    case "integrazioni":
      return f.integrazione;
    case "escluse":
      return !f.duplicata && escluse.has(f.indice);
  }
}

export function filtraFatture(fatture: FatturaLetta[], { testo, filtro }: CriteriFiltro, escluse: ReadonlySet<number>): FatturaLetta[] {
  const cerca = testo.trim().toLowerCase();
  return fatture.filter(
    (f) => inFiltro(f, filtro, escluse) && (!cerca || f.fornitore.nome.toLowerCase().includes(cerca) || f.numero.toLowerCase().includes(cerca)),
  );
}

export function conteggiFiltri(fatture: FatturaLetta[], escluse: ReadonlySet<number>): Record<Filtro, number> {
  const conta = (filtro: Filtro) => fatture.filter((f) => inFiltro(f, filtro, escluse)).length;
  return {
    tutte: fatture.length,
    daImportare: conta("daImportare"),
    giaPresenti: conta("giaPresenti"),
    noteDiCredito: conta("noteDiCredito"),
    integrazioni: conta("integrazioni"),
    escluse: conta("escluse"),
  };
}

export interface RiassuntoSelezione {
  fatture: number;
  fattureCent: number;
  note: number;
  noteCent: number;
}

export function riassuntoSelezione(selezionate: FatturaLetta[]): RiassuntoSelezione {
  const r: RiassuntoSelezione = { fatture: 0, fattureCent: 0, note: 0, noteCent: 0 };
  for (const f of selezionate) {
    if (f.notaDiCredito) {
      r.note++;
      r.noteCent += f.totaleCent;
    } else {
      r.fatture++;
      r.fattureCent += f.totaleCent;
    }
  }
  return r;
}

// «12 fatture · € 1.234,00 · 2 note di credito · € 80,00»
export function testoRiassunto(r: RiassuntoSelezione): string {
  const parti: string[] = [];
  if (r.fatture > 0) parti.push(`${r.fatture === 1 ? "1 fattura" : `${r.fatture} fatture`} · ${euro(r.fattureCent)}`);
  if (r.note > 0) parti.push(`${r.note === 1 ? "1 nota di credito" : `${r.note} note di credito`} · ${euro(-r.noteCent)}`);
  return parti.length > 0 ? parti.join(" · ") : "Niente da importare";
}

// Il totale di quello che si importa, in un numero solo: le fatture meno le note di credito (la barra in fondo sul telefono).
export function totaleNettoCent(r: RiassuntoSelezione): number {
  return r.fattureCent - r.noteCent;
}

// ---- categoria uguale per tutte le fatture di un fornitore ----

const chiaveNome = (nome: string) => nome.trim().replace(/\s+/g, " ").toLowerCase();

// Stesso fornitore: stessa partita IVA, oppure (se manca) lo stesso nome scritto in modo diverso.
export function stessoFornitore(a: FatturaLetta, b: FatturaLetta): boolean {
  const ivaA = a.fornitore.partitaIva?.trim();
  const ivaB = b.fornitore.partitaIva?.trim();
  if (ivaA && ivaB) return ivaA === ivaB;
  return chiaveNome(a.fornitore.nome) === chiaveNome(b.fornitore.nome);
}

// Le altre fatture da importare dello stesso fornitore che oggi hanno una categoria diversa da quella della riga.
export function altreDelFornitore(fatture: FatturaLetta[], riga: FatturaLetta, categorie: Readonly<Record<number, string>>): FatturaLetta[] {
  const categoria = (categorie[riga.indice] ?? "").trim();
  if (!categoria) return [];
  return fatture.filter((f) => f.indice !== riga.indice && !f.duplicata && stessoFornitore(f, riga) && (categorie[f.indice] ?? "").trim() !== categoria);
}

// Copia delle categorie con quella della riga applicata a tutte le altre del fornitore.
export function applicaCategoriaAlFornitore(fatture: FatturaLetta[], riga: FatturaLetta, categorie: Readonly<Record<number, string>>): Record<number, string> {
  const dopo = { ...categorie };
  const categoria = (categorie[riga.indice] ?? "").trim();
  for (const f of altreDelFornitore(fatture, riga, categorie)) dopo[f.indice] = categoria;
  return dopo;
}

// Il titolo del riquadro di caricamento: il trascinamento esiste solo con mouse e tastiera, sul telefono si sceglie dall'elenco dei file.
export function titoloCaricamento(soloTocco: boolean): string {
  return soloTocco ? "Scegli le fatture elettroniche o lo ZIP" : "Trascina qui le fatture elettroniche o lo ZIP";
}
