// Logica pura delle «Fatture ricevute»: le fatture dei fornitori di un mese, raggruppate per fornitore, con quanto e' pagato e quanto resta da pagare.
import type { Movimento } from "../api/tipi";

export interface GruppoFornitore {
  // null = fatture senza fornitore (in fondo).
  id: number | null;
  nome: string;
  // Fatture e note di credito del mese, dalla piu' vecchia.
  voci: Movimento[];
  // Fatture meno note di credito.
  totaleCent: number;
  // La parte del totale gia' pagata (le note di credito non hanno stato); quanto resta e' totale - pagata.
  pagataCent: number;
  daPagareCent: number;
  nDaPagare: number;
  nPagate: number;
}

export const NOME_SENZA_FORNITORE = "Senza fornitore";

// Una fattura ricevuta e' una FATTURA o una NOTA_DI_CREDITO dei costi variabili.
export const eFatturaRicevuta = (m: Movimento): boolean => m.tipo === "COSTO_VARIABILE" && (m.documento === "FATTURA" || m.documento === "NOTA_DI_CREDITO");

function perData(x: Movimento, y: Movimento): number {
  return x.data < y.data ? -1 : x.data > y.data ? 1 : x.id - y.id;
}

export function raggruppaPerFornitore(movimenti: Movimento[]): GruppoFornitore[] {
  const mappa = new Map<number | null, GruppoFornitore>();
  for (const m of movimenti) {
    if (!eFatturaRicevuta(m)) continue;
    const chiave = m.fornitore?.id ?? null;
    let g = mappa.get(chiave);
    if (!g) {
      g = { id: chiave, nome: m.fornitore?.nome ?? NOME_SENZA_FORNITORE, voci: [], totaleCent: 0, pagataCent: 0, daPagareCent: 0, nDaPagare: 0, nPagate: 0 };
      mappa.set(chiave, g);
    }
    g.voci.push(m);
    if (m.documento === "NOTA_DI_CREDITO") {
      g.totaleCent -= m.importoCent;
    } else {
      g.totaleCent += m.importoCent;
      if (m.pagata) {
        g.pagataCent += m.importoCent;
        g.nPagate++;
      } else {
        g.nDaPagare++;
      }
    }
  }
  for (const g of mappa.values()) {
    g.voci.sort(perData);
    g.daPagareCent = g.totaleCent - g.pagataCent;
  }
  return [...mappa.values()].sort((x, y) => Number(x.id === null) - Number(y.id === null) || y.totaleCent - x.totaleCent || x.nome.localeCompare(y.nome, "it"));
}

export interface RiepilogoRicevute {
  daPagareCent: number;
  nDaPagare: number;
  pagateCent: number;
  nPagate: number;
  totaleCent: number;
}

export function riepilogoRicevute(gruppi: GruppoFornitore[]): RiepilogoRicevute {
  const r: RiepilogoRicevute = { daPagareCent: 0, nDaPagare: 0, pagateCent: 0, nPagate: 0, totaleCent: 0 };
  for (const g of gruppi) {
    r.daPagareCent += g.daPagareCent;
    r.nDaPagare += g.nDaPagare;
    r.pagateCent += g.pagataCent;
    r.nPagate += g.nPagate;
    r.totaleCent += g.totaleCent;
  }
  return r;
}

// «Solo da pagare»: i fornitori con almeno una fattura da pagare, con le sole fatture da pagare (e le note di credito, che le riducono).
// I totali del fornitore restano quelli veri.
export function filtraDaPagare(gruppi: GruppoFornitore[]): GruppoFornitore[] {
  return gruppi.filter((g) => g.nDaPagare > 0).map((g) => ({ ...g, voci: g.voci.filter((v) => v.documento === "NOTA_DI_CREDITO" || !v.pagata) }));
}

export function testoNumeroFatture(n: number): string {
  return n === 0 ? "nessuna fattura" : n === 1 ? "1 fattura" : `${n} fatture`;
}

// Le fatture da pagare di un fornitore (per «Segna tutte pagate»).
export const fattureDaPagare = (g: GruppoFornitore): Movimento[] => g.voci.filter((v) => v.documento === "FATTURA" && !v.pagata);

// «Da pagare» negativo (nota di credito) = un credito verso il fornitore, mostrato in positivo. Null se zero.
export function voceDaPagare(daPagareCent: number): { etichetta: string; importoCent: number; credito: boolean } | null {
  if (daPagareCent === 0) return null;
  if (daPagareCent < 0) return { etichetta: "Credito verso il fornitore", importoCent: -daPagareCent, credito: true };
  return { etichetta: "Da pagare", importoCent: daPagareCent, credito: false };
}

// «Pagato / Da pagare» di un fornitore nelle statistiche per voce (`pagataCent` esiste solo per i fornitori). Null se non c'e' niente da dire.
export function pagatoDaPagare(voce: { totaleCent: number; pagataCent: number | null }): { pagatoCent: number; daPagareCent: number } | null {
  if (voce.pagataCent === null || voce.totaleCent === 0) return null;
  return { pagatoCent: voce.pagataCent, daPagareCent: voce.totaleCent - voce.pagataCent };
}
