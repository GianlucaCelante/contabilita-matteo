// Logica pura delle «Fatture ricevute»: le fatture dei fornitori di un mese, raggruppate per fornitore, con quanto e' pagato e quanto resta da pagare.
import type { Movimento, VoceStatistica } from "../api/tipi";
import { euro } from "./formato";

// Una fattura (o nota di credito) com'e' sulla carta. Di solito e' un movimento solo; una fattura divisa fra piu' sedi («Tutte,
// dividi») e' fatta di piu' movimenti, uno per sede, con lo stesso `divisione`: qui tornano una cosa sola, con il totale.
export interface FatturaRicevuta {
  // L'id del primo movimento: identifica la riga.
  id: number;
  // I movimenti che la compongono, uno per sede (uno solo se non e' divisa).
  parti: Movimento[];
  nota: boolean;
  numeroDocumento: string | null;
  data: string;
  // La somma delle parti.
  importoCent: number;
  // Pagata solo se lo sono tutte le parti (una nota di credito non ha stato: sempre false).
  pagata: boolean;
  // Alcune parti pagate e altre no (segnate una per una dal dettaglio): conta fra quelle da pagare.
  pagataInParte: boolean;
}

export interface GruppoFornitore {
  // null = fatture senza fornitore (in fondo).
  id: number | null;
  nome: string;
  // I movimenti (fatture e note di credito) del mese, dal piu' vecchio: una fattura divisa fra sedi qui ha un movimento per sede.
  voci: Movimento[];
  // Le stesse, una riga per fattura: le parti di una fattura divisa fra sedi stanno insieme. E' quello che si mostra e si conta.
  fatture: FatturaRicevuta[];
  // Fatture meno note di credito.
  totaleCent: number;
  // La parte del totale gia' pagata (le note di credito non hanno stato); quanto resta e' totale - pagata.
  pagataCent: number;
  daPagareCent: number;
  // Quante fatture (non movimenti): una fattura divisa fra sedi conta una volta, ed e' pagata solo se lo sono tutte le sue parti.
  nDaPagare: number;
  nPagate: number;
}

export const NOME_SENZA_FORNITORE = "Senza fornitore";

// Una fattura ricevuta e' una FATTURA o una NOTA_DI_CREDITO dei costi variabili.
export const eFatturaRicevuta = (m: Movimento): boolean => m.tipo === "COSTO_VARIABILE" && (m.documento === "FATTURA" || m.documento === "NOTA_DI_CREDITO");

function perData(x: Movimento, y: Movimento): number {
  return x.data < y.data ? -1 : x.data > y.data ? 1 : x.id - y.id;
}

// Le parti della stessa fattura. «Dividi» (POST /api/movimenti/dividi) da' a tutte le parti lo stesso `divisione`: le parti con lo
// stesso id (e lo stesso documento) sono una fattura sola, senza guardare altro (numero, data, sede, origine). Se il filtro delle sedi
// ne lascia una parte sola, la fattura c'e' lo stesso, con il solo importo di quella sede.
// I movimenti SENZA id sono quelli registrati prima che l'id esistesse (la migrazione non lo puo' ricostruire: resta null). Per loro
// vale ancora l'euristica di prima, cosi' chi aveva gia' diviso delle fatture non se le ritrova contate due o tre volte: stesso
// fornitore, stesso numero, stessa data, stesso documento, ogni parte in una sede diversa. Restano righe separate, per prudenza: le
// fatture senza numero o senza fornitore, quelle con lo stesso numero due volte nella stessa sede (li' e' un doppione, non una
// divisione) e quelle in cui una parte arriva dall'importazione (origine XML): una fattura importata non nasce mai divisa, quindi la
// stessa fattura importata in una sede e registrata a mano in un'altra e' un doppione, e unirla darebbe un totale doppio.
// Un movimento con l'id non si unisce mai per euristica: le sue parti sono solo quelle con il suo id.
function unisciParti(voci: Movimento[], conFornitore: boolean): FatturaRicevuta[] {
  const gruppi = new Map<string, { parti: Movimento[]; perId: boolean }>();
  for (const m of voci) {
    const numero = m.numeroDocumento?.trim();
    const perId = !!m.divisione;
    const chiave = perId ? `id\n${m.documento}\n${m.divisione}` : conFornitore && numero ? `${m.documento}\n${m.data}\n${numero}` : `\n${m.id}`;
    const g = gruppi.get(chiave) ?? { parti: [], perId };
    g.parti.push(m);
    gruppi.set(chiave, g);
  }
  const fatture: FatturaRicevuta[] = [];
  for (const { parti, perId } of gruppi.values()) {
    const sediDiverse = new Set(parti.map((p) => p.sede.id)).size === parti.length;
    const divisa = perId || (sediDiverse && parti.every((p) => p.origine !== "XML"));
    for (const insieme of divisa ? [parti] : parti.map((p) => [p])) {
      const primo = insieme[0]!;
      const nota = primo.documento === "NOTA_DI_CREDITO";
      const pagate = insieme.filter((p) => p.pagata).length;
      fatture.push({
        id: primo.id,
        parti: insieme,
        nota,
        numeroDocumento: primo.numeroDocumento,
        data: primo.data,
        importoCent: insieme.reduce((s, p) => s + p.importoCent, 0),
        pagata: !nota && pagate === insieme.length,
        pagataInParte: !nota && pagate > 0 && pagate < insieme.length,
      });
    }
  }
  return fatture.sort((x, y) => perData(x.parti[0]!, y.parti[0]!));
}

// «divisa fra Via Roma e Lungomare» per una fattura divisa fra sedi; null se e' di una sede sola (anche quando il filtro delle sedi
// ne mostra una parte sola).
export function testoDivisa(f: FatturaRicevuta): string | null {
  // Le sedi, una volta sola: due parti finite nella stessa sede (una spostata con la modifica) non sono «divise fra» sedi.
  const nomi = [...new Map(f.parti.map((p) => [p.sede.id, p.sede.nome])).values()];
  if (nomi.length < 2) return null;
  return `divisa fra ${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}

export function raggruppaPerFornitore(movimenti: Movimento[]): GruppoFornitore[] {
  const mappa = new Map<number | null, GruppoFornitore>();
  for (const m of movimenti) {
    if (!eFatturaRicevuta(m)) continue;
    const chiave = m.fornitore?.id ?? null;
    let g = mappa.get(chiave);
    if (!g) {
      g = { id: chiave, nome: m.fornitore?.nome ?? NOME_SENZA_FORNITORE, voci: [], fatture: [], totaleCent: 0, pagataCent: 0, daPagareCent: 0, nDaPagare: 0, nPagate: 0 };
      mappa.set(chiave, g);
    }
    g.voci.push(m);
    if (m.documento === "NOTA_DI_CREDITO") {
      g.totaleCent -= m.importoCent;
    } else {
      g.totaleCent += m.importoCent;
      if (m.pagata) g.pagataCent += m.importoCent;
    }
  }
  for (const g of mappa.values()) {
    g.voci.sort(perData);
    g.daPagareCent = g.totaleCent - g.pagataCent;
    g.fatture = unisciParti(g.voci, g.id !== null);
    for (const f of g.fatture) {
      if (f.nota) continue;
      if (f.pagata) g.nPagate++;
      else g.nDaPagare++;
    }
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

// Il «Da pagare» del mese somma solo i fornitori a cui si deve qualcosa: il credito verso un fornitore (note di credito oltre le
// fatture) non riduce quanto si deve agli altri. Per questo, con un credito, da pagare + pagate non fa il totale.
export function riepilogoRicevute(gruppi: GruppoFornitore[]): RiepilogoRicevute {
  const r: RiepilogoRicevute = { daPagareCent: 0, nDaPagare: 0, pagateCent: 0, nPagate: 0, totaleCent: 0 };
  for (const g of gruppi) {
    r.daPagareCent += Math.max(0, g.daPagareCent);
    r.nDaPagare += g.nDaPagare;
    r.pagateCent += g.pagataCent;
    r.nPagate += g.nPagate;
    r.totaleCent += g.totaleCent;
  }
  return r;
}

// «Solo da pagare»: i fornitori con almeno una fattura da pagare, con le sole fatture da pagare (e le note di credito, che le riducono).
// I totali del fornitore restano quelli veri. Una fattura divisa fra sedi e pagata solo in parte resta intera, con tutte le sue parti.
export function filtraDaPagare(gruppi: GruppoFornitore[]): GruppoFornitore[] {
  return gruppi
    .filter((g) => g.nDaPagare > 0)
    .map((g) => {
      const fatture = g.fatture.filter((f) => f.nota || !f.pagata);
      return { ...g, fatture, voci: fatture.flatMap((f) => f.parti) };
    });
}

export function testoNumeroFatture(n: number): string {
  return n === 0 ? "nessuna fattura" : n === 1 ? "1 fattura" : `${n} fatture`;
}

// I movimenti da segnare pagati per «Segna tutte pagate»: tutte le parti ancora da pagare, anche quelle di una fattura divisa fra sedi.
export const fattureDaPagare = (g: GruppoFornitore): Movimento[] => g.voci.filter((v) => v.documento === "FATTURA" && !v.pagata);

// Il tocco sul badge di una fattura: lo stato a cui passa (pagata se non lo e' tutta, altrimenti da pagare) e i movimenti da cambiare,
// cioe' le sole parti che non sono gia' in quello stato (di una fattura pagata in parte si chiama solo la parte che manca).
export function partiDaSegnare(f: FatturaRicevuta): { pagata: boolean; parti: Movimento[] } {
  const pagata = !f.pagata;
  return { pagata, parti: f.parti.filter((p) => p.pagata !== pagata) };
}

// Segnare una fattura divisa fra sedi (o tutte quelle di un fornitore) vuol dire piu' chiamate, una per movimento, in fila. Se una
// fallisce dopo che altre sono riuscite, lo stato e' cambiato solo in parte: l'errore diventa SegnataInParte, cosi' l'avviso lo dice
// («Segnata solo in parte: riprova.») invece del messaggio generico. Se fallisce la prima non e' cambiato niente: resta il suo errore.
export class SegnataInParte extends Error {}

export async function segnaInSerie<T>(parti: readonly T[], segna: (parte: T) => Promise<unknown>): Promise<void> {
  let riuscite = 0;
  for (const p of parti) {
    try {
      await segna(p);
    } catch (e) {
      if (riuscite > 0) throw new SegnataInParte();
      throw e;
    }
    riuscite++;
  }
}

// L'avviso per un salvataggio riuscito solo in parte (`piu`: piu' fatture, «Segna tutte pagate»); null per ogni altro errore.
export function avvisoErroreSegna(errore: unknown, piu: boolean): string | null {
  if (!(errore instanceof SegnataInParte)) return null;
  return piu ? "Segnate solo in parte: riprova." : "Segnata solo in parte: riprova.";
}

// Il testo della conferma di «Segna tutte pagate». «In tutto» e' la somma delle fatture che si stanno per segnare; se il fornitore ha
// anche note di credito lo si dice a parte, con quanto resta da dare: prima c'era un solo importo gia' ridotto dalla nota, che non
// tornava con le fatture elencate.
export function testoConfermaTutte(g: GruppoFornitore, nomeMese: string): string {
  const fattureCent = fattureDaPagare(g).reduce((s, m) => s + m.importoCent, 0);
  const note = g.fatture.filter((f) => f.nota);
  const noteCent = note.reduce((s, f) => s + f.importoCent, 0);
  const resto = fattureCent - noteCent;
  const quali = note.length === 1 ? `la nota di credito di ${euro(noteCent)}` : `le note di credito (${euro(noteCent)})`;
  const conNote = note.length === 0 ? "" : ` ${note.length === 1 ? "Tolta" : "Tolte"} ${quali}, al fornitore ${resto > 0 ? `restano da dare ${euro(resto)}` : "non resta niente da dare"}.`;
  return `${testoNumeroFatture(g.nDaPagare)} da pagare, ${euro(fattureCent)} in tutto, a ${nomeMese}.${conNote} Puoi ripensarci fattura per fattura.`;
}

// «Da pagare» negativo (nota di credito) = un credito verso il fornitore, mostrato in positivo. Null se zero.
export function voceDaPagare(daPagareCent: number): { etichetta: string; importoCent: number; credito: boolean } | null {
  if (daPagareCent === 0) return null;
  if (daPagareCent < 0) return { etichetta: "Credito verso il fornitore", importoCent: -daPagareCent, credito: true };
  return { etichetta: "Da pagare", importoCent: daPagareCent, credito: false };
}

// «Pagato € …» si mostra solo se qualcosa e' stato pagato: «Pagato € 0,00» accanto a «Da pagare» non dice niente.
export function mostraPagato(pagatoCent: number): boolean {
  return pagatoCent !== 0;
}

// La riga sotto l'interruttore «Già pagata» / «Fattura pagata» del modulo. In Nuovo movimento dice dove si segna pagata piu' avanti;
// nel dettaglio l'interruttore e' gia' quello, quindi basta lo stato.
export function aiutoPagata(modifica: boolean, pagata: boolean): string {
  if (pagata) return "Segnata come pagata.";
  return modifica ? "Da pagare." : "Da pagare: la segni pagata quando paghi, da Statistiche › Fatture › Ricevute.";
}

export interface Pagamento {
  pagatoCent: number;
  daPagareCent: number;
}

// «Pagato / Da pagare» di un fornitore nelle statistiche per voce: fatture meno note di credito, meno le fatture pagate (gli scontrini
// non si pagano dopo, quindi non contano). `indiceMese`: la posizione di un mese solo; senza, il periodo intero. Null se la voce non e'
// un fornitore (campi null) o non ha fatture.
export function pagatoDaPagare(voce: Pick<VoceStatistica, "fattureCent" | "pagataCent" | "fatturePerMese" | "pagataPerMese">, indiceMese?: number): Pagamento | null {
  const fatture = indiceMese === undefined ? voce.fattureCent : voce.fatturePerMese?.[indiceMese];
  const pagato = indiceMese === undefined ? voce.pagataCent : voce.pagataPerMese?.[indiceMese];
  if (fatture === null || fatture === undefined || pagato === null || pagato === undefined) return null;
  if (fatture === 0 && pagato === 0) return null;
  return { pagatoCent: pagato, daPagareCent: fatture - pagato };
}

// Lo stesso conto da un elenco di movimenti (il dettaglio di un fornitore): fatture - note di credito - fatture pagate. Null senza fatture.
export function pagatoDaPagareDeiMovimenti(movimenti: Movimento[]): Pagamento | null {
  let fatture = 0;
  let pagato = 0;
  let quante = 0;
  for (const m of movimenti) {
    if (!eFatturaRicevuta(m)) continue;
    quante++;
    if (m.documento === "NOTA_DI_CREDITO") fatture -= m.importoCent;
    else {
      fatture += m.importoCent;
      if (m.pagata) pagato += m.importoCent;
    }
  }
  if (quante === 0 || (fatture === 0 && pagato === 0)) return null;
  return { pagatoCent: pagato, daPagareCent: fatture - pagato };
}
