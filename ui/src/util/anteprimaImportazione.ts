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

export type Filtro = "tutte" | "daImportare" | "giaPresenti" | "noteDiCredito" | "escluse";

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
  if (r.note > 0) parti.push(`${r.note === 1 ? "1 nota di credito" : `${r.note} note di credito`} · ${euro(r.noteCent)}`);
  return parti.length > 0 ? parti.join(" · ") : "Niente da importare";
}
