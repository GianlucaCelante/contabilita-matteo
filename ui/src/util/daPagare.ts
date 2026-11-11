import type { FiltroMovimenti, Movimento } from "../api/tipi";
import { dataScadenza, meseDi, nomeMeseAnno } from "./fatture";
import { raggruppaPerFornitore, testoNumeroFatture } from "./fattureRicevute";
import { euro } from "./formato";

// Logica pura della riga «Da pagare ai fornitori» del Riepilogo: quanto si deve ancora ai fornitori, in tutto.
// Guarda le fatture e le note di credito dei costi variabili fino alla fine del mese corrente (non solo del periodo mostrato): una
// fattura di due mesi fa ancora da pagare e' proprio quella da non dimenticare. Il conto e' quello delle Ricevute, MESE PER MESE
// (`raggruppaPerFornitore` sui movimenti di ogni mese): una nota di credito riduce il dovuto del suo fornitore in quel mese, non
// sconta le fatture di altri mesi e non riduce quanto si deve agli altri fornitori. Cosi' la somma e' quella dei «Da pagare» che le
// Ricevute mostrano mese per mese. `n` sono le fatture da pagare dei fornitori a cui, nel mese, si deve qualcosa.

export interface RiassuntoDaPagare {
  importoCent: number;
  n: number;
  // Il mese (yyyy-MM) da aprire nelle Ricevute: quello corrente se ha fatture da pagare, altrimenti l'ultimo che ne ha,
  // cosi' la schermata che si apre mostra sempre almeno una delle fatture contate.
  mese: string;
  // Quanto si deve mese per mese (solo i mesi con qualcosa da pagare), dal piu' vecchio: la somma e' `importoCent`.
  mesi: MeseDaPagare[];
}

export interface MeseDaPagare {
  mese: string;
  importoCent: number;
  n: number;
}

// La richiesta a GET /api/movimenti: i costi variabili senza `da`, fino all'ultimo giorno del mese corrente (come le Ricevute, che
// mostrano il mese intero: una fattura datata piu' avanti nel mese c'e'), delle sedi scelte (assente = tutte). Senza `pagata`: quel
// filtro terrebbe le sole fatture, e qui servono anche le note di credito. Costo: scarica tutti i costi variabili dall'inizio.
export function filtroDaPagare(oggiMese: string, sedi: string | undefined): FiltroMovimenti {
  return { a: dataScadenza(oggiMese, 31)!, tipo: "COSTO_VARIABILE", ...(sedi ? { sedi } : {}) };
}

export function riassuntoDaPagare(movimenti: Movimento[], oggiMese: string): RiassuntoDaPagare | null {
  const perMese = new Map<string, Movimento[]>();
  for (const m of movimenti) {
    const mese = meseDi(m.data);
    perMese.set(mese, [...(perMese.get(mese) ?? []), m]);
  }
  const mesi: MeseDaPagare[] = [];
  for (const [mese, delMese] of perMese) {
    const dovuti = raggruppaPerFornitore(delMese).filter((g) => g.daPagareCent > 0 && g.nDaPagare > 0);
    if (dovuti.length === 0) continue;
    mesi.push({ mese, importoCent: dovuti.reduce((s, g) => s + g.daPagareCent, 0), n: dovuti.reduce((s, g) => s + g.nDaPagare, 0) });
  }
  if (mesi.length === 0) return null;
  mesi.sort((x, y) => (x.mese < y.mese ? -1 : 1));
  return {
    importoCent: mesi.reduce((s, x) => s + x.importoCent, 0),
    n: mesi.reduce((s, x) => s + x.n, 0),
    mese: mesi.some((x) => x.mese === oggiMese) ? oggiMese : mesi[mesi.length - 1]!.mese,
    mesi,
  };
}

export function testoDaPagare(r: Pick<RiassuntoDaPagare, "importoCent" | "n">): string {
  return `Da pagare ai fornitori: ${euro(r.importoCent)} · ${testoNumeroFatture(r.n)}`;
}

// Statistiche › Fatture › Ricevute di un mese, con «Solo da pagare» acceso (il mese corrente non si scrive: e' il predefinito
// della schermata).
export function indirizzoDaPagare(mese: string, oggiMese: string): string {
  return "/statistiche/fatture?scheda=ricevute" + (mese === oggiMese ? "" : `&mese=${mese}`) + "&solo=1";
}

export interface RigaDaPagare {
  mese: string;
  // «Ottobre 2026 · € 2.500,00 · 1 fattura»
  testo: string;
  indirizzo: string;
}

// Le righe sotto il totale quando i mesi con qualcosa da pagare sono piu' d'uno: il totale copre tutti i mesi, le Ricevute ne
// mostrano uno alla volta, e senza le righe i numeri sembrano non tornare. Una riga per mese dal piu' vecchio, al massimo `massimo`;
// `altri` sono i mesi che restano fuori («e altri N mesi»). Con un mese solo nessuna riga: basta il totale.
export function righeDaPagare(r: RiassuntoDaPagare, oggiMese: string, massimo = 4): { righe: RigaDaPagare[]; altri: number } {
  if (r.mesi.length <= 1) return { righe: [], altri: 0 };
  const righe = r.mesi.slice(0, massimo).map((x) => ({
    mese: x.mese,
    testo: `${nomeMeseAnno(x.mese)} · ${euro(x.importoCent)} · ${testoNumeroFatture(x.n)}`,
    indirizzo: indirizzoDaPagare(x.mese, oggiMese),
  }));
  return { righe, altri: r.mesi.length - righe.length };
}
