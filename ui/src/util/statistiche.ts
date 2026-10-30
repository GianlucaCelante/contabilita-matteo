import type { Settimana, StatisticheSettimana, VoceSettimanaInput } from "../api/tipi";
import { aggiungiGiorni, dataValida, daIso, lunediDi, oggiIso } from "./formato";

// Logica pura di «Pizze e ordini» e delle statistiche: scontrino medio, settimana lunedi'-domenica, validazione dei campi,
// totali parziali e le ultime 8 settimane del grafico. Le regole di arrotondamento sono quelle del servizio (docs/api.md, «Statistiche»).

export const MASSIMO_CONTEGGIO = 1_000_000;
export const SETTIMANE_DEL_GRAFICO = 8;

// ---- medie ----

// Scontrino medio = ricavi / ordini, al centesimo, mezzo centesimo in su (10000 / 3 -> 3333). null se gli ordini sono 0.
export function scontrinoMedioCent(ricaviCent: number, ordini: number): number | null {
  if (!Number.isInteger(ricaviCent) || !Number.isInteger(ordini) || ordini <= 0) return null;
  return Math.floor((2 * ricaviCent + ordini) / (2 * ordini));
}

// Pizze per ordine = pizze / ordini con 2 decimali, mezzo in su (17 / 7 -> 2.43). null se gli ordini sono 0.
export function pizzePerOrdine(pizze: number, ordini: number): number | null {
  if (!Number.isInteger(pizze) || !Number.isInteger(ordini) || ordini <= 0) return null;
  return Math.floor((200 * pizze + ordini) / (2 * ordini)) / 100;
}

// Quanto incassa in media ogni pizza (ricavi / pizze), al centesimo. null se le pizze sono 0.
export function ricavoPerPizzaCent(ricaviCent: number, pizze: number): number | null {
  return scontrinoMedioCent(ricaviCent, pizze);
}

// 2.43 -> "2,4" (una cifra, come nelle schede); null -> "—".
export function testoPizzePerOrdine(valore: number | null): string {
  return valore === null ? "—" : valore.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// 1234 -> "1.234" (numeri interi con il punto delle migliaia, anche sotto i 10.000).
export function testoConteggio(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ---- settimana ----

// Il lunedi' della settimana che contiene il giorno (yyyy-MM-dd). Un testo che non e' una data valida vale «questa settimana».
export function lunediDellaSettimana(giorno: string | null | undefined, oggi: string = oggiIso()): string {
  return lunediDi(giorno && dataValida(giorno) ? giorno : oggi);
}

export function domenicaDi(lunedi: string): string {
  return aggiungiGiorni(lunedi, 6);
}

// Le frecce: avanti (+1) o indietro (-1) di una settimana, sempre da lunedi' a lunedi'.
export function spostaSettimana(lunedi: string, verso: 1 | -1): string {
  return aggiungiGiorni(lunediDi(lunedi), 7 * verso);
}

// Non si va oltre la settimana in corso: dopo non c'e' ancora niente da scrivere.
export function puoAndareAvanti(lunedi: string, oggi: string = oggiIso()): boolean {
  return lunediDi(lunedi) < lunediDi(oggi);
}

// «in corso», «scorsa» o niente: serve a chi guarda la schermata per capire dove si trova.
export function nomeRelativoSettimana(lunedi: string, oggi: string = oggiIso()): string | null {
  const corrente = lunediDi(oggi);
  if (lunedi === corrente) return "Settimana in corso";
  if (lunedi === aggiungiGiorni(corrente, -7)) return "Settimana scorsa";
  return null;
}

// Il numero della settimana dell'anno (ISO 8601) di un lunedi': il 29 dicembre 2025 e' la 1 del 2026.
export function numeroSettimanaIso(lunedi: string): number {
  const d = daIso(lunedi);
  // il giovedi' della stessa settimana decide l'anno
  const giovedi = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3);
  const primoGennaio = new Date(giovedi.getFullYear(), 0, 1);
  const giorniDallInizio = Math.round((giovedi.getTime() - primoGennaio.getTime()) / 86_400_000);
  return Math.floor(giorniDallInizio / 7) + 1;
}

const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

// «26 ott – 1 nov»; nello stesso mese «19 – 25 ott».
export function settimanaCorta(lunedi: string): string {
  const d = daIso(lunedi);
  const f = daIso(domenicaDi(lunedi));
  const mese = (x: Date) => MESI_BREVI[x.getMonth()]!;
  return d.getMonth() === f.getMonth() ? `${d.getDate()} – ${f.getDate()} ${mese(f)}` : `${d.getDate()} ${mese(d)} – ${f.getDate()} ${mese(f)}`;
}

// ---- campi di «Pizze e ordini» ----

export type LetturaConteggio = { tipo: "vuoto" } | { tipo: "numero"; valore: number } | { tipo: "errore"; messaggio: string };

// Quello che si scrive in un campo Pizze o Ordini: un numero intero >= 0. Accetta anche il punto delle migliaia («1.412»).
export function leggiConteggio(testo: string): LetturaConteggio {
  const t = testo.replace(/\s/g, "");
  if (t === "") return { tipo: "vuoto" };
  if (/^-\d/.test(t)) return { tipo: "errore", messaggio: "Il numero non può essere negativo." };
  const pulito = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  if (!/^\d+$/.test(pulito)) return { tipo: "errore", messaggio: "Scrivi un numero intero, senza virgole." };
  const valore = Number(pulito);
  if (valore > MASSIMO_CONTEGGIO) return { tipo: "errore", messaggio: `Il numero è troppo grande (massimo ${testoConteggio(MASSIMO_CONTEGGIO)}).` };
  return { tipo: "numero", valore };
}

export interface CampiRiga {
  pizze: string;
  ordini: string;
}

export interface EsitoRiga {
  // vuota = niente scritto (si cancella il dato, se c'era); completa = pizze e ordini validi; incompleta = ne manca uno o c'e' un errore.
  stato: "vuota" | "completa" | "incompleta";
  pizze: number | null;
  ordini: number | null;
  errorePizze: string | null;
  erroreOrdini: string | null;
}

// Controlla una riga. Le regole sono quelle del servizio: tutti e due i campi o nessuno, interi >= 0, con 0 ordini le pizze sono 0.
export function validaRiga(campi: CampiRiga): EsitoRiga {
  const p = leggiConteggio(campi.pizze);
  const o = leggiConteggio(campi.ordini);
  let errorePizze = p.tipo === "errore" ? p.messaggio : null;
  let erroreOrdini = o.tipo === "errore" ? o.messaggio : null;
  const pizze = p.tipo === "numero" ? p.valore : null;
  const ordini = o.tipo === "numero" ? o.valore : null;
  if (p.tipo === "vuoto" && o.tipo === "vuoto") return { stato: "vuota", pizze: null, ordini: null, errorePizze: null, erroreOrdini: null };
  if (p.tipo === "vuoto") errorePizze = "Scrivi anche le pizze, oppure svuota anche gli ordini.";
  if (o.tipo === "vuoto") erroreOrdini = "Scrivi anche gli ordini, oppure svuota anche le pizze.";
  if (pizze !== null && ordini === 0 && pizze > 0) erroreOrdini = "Con 0 ordini le pizze devono essere 0.";
  const completa = errorePizze === null && erroreOrdini === null;
  return { stato: completa ? "completa" : "incompleta", pizze: completa ? pizze : null, ordini: completa ? ordini : null, errorePizze, erroreOrdini };
}

// Lo scontrino che si vede mentre si scrive: ricavi della settimana / ordini scritti. null finche' la riga non e' valida o gli ordini sono 0.
export function scontrinoLive(ricaviCent: number, campi: CampiRiga): number | null {
  const esito = validaRiga(campi);
  return esito.stato === "completa" && esito.ordini !== null ? scontrinoMedioCent(ricaviCent, esito.ordini) : null;
}

// I campi con cui si apre una riga: quello che c'e' gia' nel servizio, oppure vuoto.
export function campiIniziali(riga: { pizze: number | null; ordini: number | null }): CampiRiga {
  return { pizze: riga.pizze === null ? "" : String(riga.pizze), ordini: riga.ordini === null ? "" : String(riga.ordini) };
}

export function rigaModificata(iniziale: CampiRiga, attuale: CampiRiga): boolean {
  const a = validaRiga(iniziale);
  const b = validaRiga(attuale);
  // due scritture dello stesso numero («0412» e «412») non sono una modifica
  if (a.stato === "completa" && b.stato === "completa") return a.pizze !== b.pizze || a.ordini !== b.ordini;
  return iniziale.pizze.trim() !== attuale.pizze.trim() || iniziale.ordini.trim() !== attuale.ordini.trim();
}

export interface SalvataggioSettimana {
  voci: VoceSettimanaInput[];
  // Il primo errore trovato, per sede (id) e campo: se non e' vuoto non si salva.
  errori: Map<number, EsitoRiga>;
}

// Le voci da mandare al servizio: solo le sedi cambiate rispetto a quanto c'e' gia'. Una riga svuota = cancella il dato.
export function preparaSalvataggio(iniziali: ReadonlyMap<number, CampiRiga>, attuali: ReadonlyMap<number, CampiRiga>): SalvataggioSettimana {
  const voci: VoceSettimanaInput[] = [];
  const errori = new Map<number, EsitoRiga>();
  for (const [sedeId, campi] of attuali) {
    const esito = validaRiga(campi);
    if (esito.stato === "incompleta") {
      errori.set(sedeId, esito);
      continue;
    }
    const prima = iniziali.get(sedeId) ?? { pizze: "", ordini: "" };
    if (!rigaModificata(prima, campi)) continue;
    voci.push({ sedeId, pizze: esito.pizze, ordini: esito.ordini });
  }
  return { voci, errori };
}

export interface TotaleParziale {
  // Le sedi con la riga completa e quante sono in tutto.
  sediComplete: number;
  sediTotali: number;
  pizze: number;
  ordini: number;
  ricaviCent: number;
  scontrinoMedioCent: number | null;
  pizzePerOrdine: number | null;
}

// «2 sedi su 3»: somma le righe complete. Come nel servizio, nello scontrino entrano solo le sedi con almeno un ordine.
export function totaleParziale(righe: readonly { ricaviCent: number; campi: CampiRiga }[]): TotaleParziale {
  let sediComplete = 0;
  let pizze = 0;
  let ordini = 0;
  let ricavi = 0;
  for (const r of righe) {
    const e = validaRiga(r.campi);
    if (e.stato !== "completa" || e.pizze === null || e.ordini === null) continue;
    sediComplete++;
    if (e.ordini === 0) continue;
    pizze += e.pizze;
    ordini += e.ordini;
    ricavi += r.ricaviCent;
  }
  return { sediComplete, sediTotali: righe.length, pizze, ordini, ricaviCent: ricavi, scontrinoMedioCent: scontrinoMedioCent(ricavi, ordini), pizzePerOrdine: pizzePerOrdine(pizze, ordini) };
}

// Le sedi che compaiono nel modulo: tutte quelle non archiviate (una archiviata non accetta piu' dati).
export function righeModificabili(settimana: Settimana, archiviata: (id: number) => boolean) {
  return settimana.sedi.filter((r) => !archiviata(r.sede.id));
}

// ---- le ultime settimane ----

export interface PuntoSettimana {
  settimana: string;
  // «S43»: il numero della settimana dell'anno.
  etichetta: string;
  scontrinoMedioCent: number | null;
  ordini: number;
  mancanti: number;
  // 0..1: l'altezza della barra (0 se non c'e' un valore).
  altezza: number;
  ultima: boolean;
}

// Il grafico dello scontrino: le ultime `quante` settimane in ordine cronologico (le piu' vecchie se ne sono di meno non si inventano).
// Le altezze vanno da `minimo` (la barra piu' bassa) a 1 (la piu' alta): la scala non parte da zero, cosi' si vedono le differenze;
// i valori sono scritti sulle barre.
export function ultimeSettimane(settimane: readonly StatisticheSettimana[], quante: number = SETTIMANE_DEL_GRAFICO, minimo = 0.25): PuntoSettimana[] {
  const ultime = settimane.slice(-quante);
  const valori = ultime.map((s) => s.scontrinoMedioCent).filter((v): v is number => v !== null);
  const basso = Math.min(...valori);
  const alto = Math.max(...valori);
  return ultime.map((s, i) => ({
    settimana: s.settimana,
    etichetta: `S${numeroSettimanaIso(s.settimana)}`,
    scontrinoMedioCent: s.scontrinoMedioCent,
    ordini: s.ordini,
    mancanti: s.sediMancanti.length,
    altezza: s.scontrinoMedioCent === null ? 0 : alto === basso ? 1 : minimo + ((s.scontrinoMedioCent - basso) / (alto - basso)) * (1 - minimo),
    ultima: i === ultime.length - 1,
  }));
}

// L'intervallo da chiedere al servizio per avere le ultime `quante` settimane che finiscono con quella di `oggi`.
export function intervalloUltimeSettimane(oggi: string = oggiIso(), quante: number = SETTIMANE_DEL_GRAFICO): { da: string; a: string } {
  const corrente = lunediDi(oggi);
  return { da: aggiungiGiorni(corrente, -7 * (quante - 1)), a: oggi };
}

// Il banner «Manca la settimana …» guarda le ultime quattro settimane (quella in corso e le tre prima): un buco piu' vecchio si vede
// nell'elenco «Settimane già inserite» e nel grafico, ma non richiama l'attenzione ogni volta.
export const SETTIMANE_DEL_BANNER = 4;

// La settimana piu' recente, fra le ultime `entro`, con delle sedi senza dati.
export function ultimaIncompleta(settimane: readonly StatisticheSettimana[], entro: number = SETTIMANE_DEL_BANNER): StatisticheSettimana | null {
  for (let i = settimane.length - 1; i >= Math.max(settimane.length - entro, 0); i--) {
    const s = settimane[i]!;
    if (s.sediMancanti.length > 0) return s;
  }
  return null;
}

// «Lungomare e Mercato», «Via Roma, Lungomare e Mercato».
export function elencoNomi(nomi: readonly string[]): string {
  if (nomi.length <= 1) return nomi[0] ?? "";
  return `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}

// Le settimane con almeno una sede inserita, dalla piu' recente: per l'elenco «Settimane già inserite».
export function settimaneInserite(settimane: readonly StatisticheSettimana[], sediAttive: number, quante: number = SETTIMANE_DEL_GRAFICO) {
  return settimane
    .map((s) => ({ ...s, inserite: Math.max(sediAttive - s.sediMancanti.length, 0) }))
    .filter((s) => s.inserite > 0)
    .reverse()
    .slice(0, quante);
}
