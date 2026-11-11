// Logica pura delle «Fatture da fare»: mesi (yyyy-MM), stati, conteggi e controllo dei campi.
import type { CasellaConMesi, MeseFattura, ScadenzaFattura, StatoFattura } from "../api/tipi";
import { leggiEuro, oggiIso } from "./formato";

export const MASSIMO_NOME_CASELLA = 120;
export const MASSIMO_NOTA_FATTURA = 200;
// Quanti mesi mostra la panoramica (l'ultimo e' quello scelto).
export const MESI_PANORAMICA = 6;

export const STATI: StatoFattura[] = ["DA_FARE", "EMESSA", "PAGATA"];

const NOMI_MESE = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export function meseValido(mese: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mese);
}

// "2026-11-04" -> "2026-11"
export const meseDi = (iso: string): string => iso.slice(0, 7);
export const meseCorrente = (): string => meseDi(oggiIso());

// "2026-11" + 2 -> "2027-01"
export function aggiungiMesiMese(mese: string, n: number): string {
  const [a, m] = mese.split("-").map(Number);
  const indice = (a ?? 1970) * 12 + ((m ?? 1) - 1) + n;
  return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}`;
}

// Quanti mesi vanno da «da» a «a», entrambi compresi (0 se «da» e' dopo «a»).
export function contaMesi(da: string, a: string): number {
  const indice = (x: string) => Number(x.slice(0, 4)) * 12 + Number(x.slice(5, 7));
  return Math.max(0, indice(a) - indice(da) + 1);
}

// I mesi da «da» a «a», in ordine.
export function elencoMesi(da: string, a: string): string[] {
  return Array.from({ length: contaMesi(da, a) }, (_, i) => aggiungiMesiMese(da, i));
}

// Gli ultimi `quanti` mesi che finiscono con «fine».
export function ultimiMesi(fine: string, quanti: number): string[] {
  return elencoMesi(aggiungiMesiMese(fine, -(quanti - 1)), fine);
}

// "2026-11" -> "Novembre 2026"
export function nomeMeseAnno(mese: string): string {
  return `${NOMI_MESE[Number(mese.slice(5, 7)) - 1] ?? ""} ${mese.slice(0, 4)}`;
}
// "2026-11" -> "nov"
export function meseBreve(mese: string): string {
  return (NOMI_MESE[Number(mese.slice(5, 7)) - 1] ?? "").slice(0, 3).toLowerCase();
}
// «Questo mese», «Mese scorso», «Mese prossimo» o l'anno.
export function nomeRelativoMese(mese: string, oggiMese = meseCorrente()): string {
  if (mese === oggiMese) return "Questo mese";
  if (mese === aggiungiMesiMese(oggiMese, -1)) return "Mese scorso";
  if (mese === aggiungiMesiMese(oggiMese, 1)) return "Mese prossimo";
  return mese.slice(0, 4);
}
// Si puo' guardare avanti solo di un mese: il promemoria serve per questo e per i mesi passati.
export const puoAndareAvantiMese = (mese: string, oggiMese = meseCorrente()): boolean => mese < aggiungiMesiMese(oggiMese, 1);

export const ETICHETTA_STATO: Record<StatoFattura, string> = { DA_FARE: "Da emettere", EMESSA: "Emessa", PAGATA: "Pagata" };

// Il passo successivo con un tocco: Da fare -> Emessa -> Pagata. Dopo «Pagata» non c'e' altro: si usa la finestra con le scelte.
export function passoSuccessivo(stato: StatoFattura): { stato: StatoFattura; azione: string; fatto: string } | null {
  if (stato === "DA_FARE") return { stato: "EMESSA", azione: "Segna come emessa", fatto: "emessa" };
  if (stato === "EMESSA") return { stato: "PAGATA", azione: "Segna come pagata", fatto: "pagata" };
  return null;
}

// Etichetta accessibile del badge-comando di una riga: stato attuale e cosa fa il tocco (da «Pagata» non si avanza).
export function etichettaComandoStato(nome: string, stato: StatoFattura): string {
  const passo = passoSuccessivo(stato);
  const dopo = passo ? passo.azione : "Per cambiarla usa «Importo, nota e stato»";
  return `${nome}: ${ETICHETTA_STATO[stato]}. ${dopo}`;
}

// Come si colora uno stato: un «Da fare» di un mese gia' passato e' in ritardo (rosso), non solo da fare (ambra).
export type TonoStato = "fare" | "ritardo" | "emessa" | "pagata";
export function tonoStato(stato: StatoFattura, mese: string, oggiMese = meseCorrente()): TonoStato {
  if (stato === "PAGATA") return "pagata";
  if (stato === "EMESSA") return "emessa";
  return mese < oggiMese ? "ritardo" : "fare";
}

// Il tono di un mese di una casella: come tonoStato, piu' «inattiva» per i mesi prima della creazione della casella (neutri: «—»).
export type TonoVoce = TonoStato | "inattiva";
export function tonoVoce(voce: MeseFattura, oggiMese = meseCorrente()): TonoVoce {
  if (!voce.attiva) return "inattiva";
  return tonoStato(voce.stato, voce.mese, oggiMese);
}

export interface ConteggioMese {
  daFare: number;
  emesse: number;
  pagate: number;
  // Somma degli importi delle fatture emesse e non ancora pagate / di quelle pagate (le senza importo contano 0).
  daIncassareCent: number;
  pagateCent: number;
}

export function meseDiCasella(casella: CasellaConMesi, mese: string): MeseFattura {
  return (
    casella.mesi.find((m) => m.mese === mese) ?? { mese, stato: "DA_FARE", importoCent: null, nota: null, attiva: mese >= casella.dalMese, scadenza: dataScadenza(mese, casella.giornoScadenza) }
  );
}

export function conteggioMese(caselle: CasellaConMesi[], mese: string): ConteggioMese {
  const r: ConteggioMese = { daFare: 0, emesse: 0, pagate: 0, daIncassareCent: 0, pagateCent: 0 };
  for (const c of caselle) {
    const m = meseDiCasella(c, mese);
    if (!m.attiva) continue;
    if (m.stato === "DA_FARE") r.daFare++;
    else if (m.stato === "EMESSA") {
      r.emesse++;
      r.daIncassareCent += m.importoCent ?? 0;
    } else {
      r.pagate++;
      r.pagateCent += m.importoCent ?? 0;
    }
  }
  return r;
}

export function erroreNomeCasella(nome: string): string | null {
  const n = nome.trim();
  if (!n) return "Scrivi il nome della casella.";
  if (n.length > MASSIMO_NOME_CASELLA) return `Il nome può avere al massimo ${MASSIMO_NOME_CASELLA} caratteri.`;
  return null;
}

// L'importo scritto in un campo: vuoto = nessun importo (null); zero e' ammesso; altro non valido = errore.
export function leggiImportoFattura(testo: string): { cent: number | null; errore: string | null } {
  if (!testo.trim()) return { cent: null, errore: null };
  const cent = leggiEuro(testo);
  if (cent === null) return { cent: null, errore: "Scrivi un importo valido, per esempio 1.250,00." };
  return { cent, errore: null };
}

export function erroreNotaFattura(nota: string): string | null {
  return nota.trim().length > MASSIMO_NOTA_FATTURA ? `La nota può avere al massimo ${MASSIMO_NOTA_FATTURA} caratteri.` : null;
}

// ---- scadenze: «entro il giorno N del mese» ----

// Quanti giorni ha il mese (yyyy-MM).
function giorniDelMese(mese: string): number {
  return new Date(Number(mese.slice(0, 4)), Number(mese.slice(5, 7)), 0).getDate();
}

// La data limite (yyyy-MM-dd) di un mese per il giorno scelto; nei mesi corti vale l'ultimo giorno. Senza giorno, null.
export function dataScadenza(mese: string, giorno: number | null): string | null {
  if (giorno === null) return null;
  return `${mese}-${String(Math.min(giorno, giorniDelMese(mese))).padStart(2, "0")}`;
}

// Scadenza - oggi, in giorni interi (negativo se scaduta).
export function giorniMancanti(scadenza: string, oggi = oggiIso()): number {
  const t = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((t(scadenza) - t(oggi)) / 86_400_000);
}

// Quanti giorni prima della scadenza il promemoria diventa «in evidenza».
export const GIORNI_PREAVVISO = 3;

const giorni = (n: number) => (n === 1 ? "1 giorno" : `${n} giorni`);

// «Scade il 28», «Scade tra 3 giorni», «Scade domani», «Scade oggi», «Scaduta ieri», «Scaduta da 2 giorni».
export function testoScadenza(scadenza: string, oggi = oggiIso()): string {
  const g = giorniMancanti(scadenza, oggi);
  if (g > GIORNI_PREAVVISO) return `Scade il ${Number(scadenza.slice(8, 10))}`;
  if (g > 1) return `Scade tra ${giorni(g)}`;
  if (g === 1) return "Scade domani";
  if (g === 0) return "Scade oggi";
  if (g === -1) return "Scaduta ieri";
  return `Scaduta da ${giorni(-g)}`;
}

// Come si colora la scadenza: ambra nei tre giorni (compreso oggi), rosso se scaduta, altrimenti nessun colore.
export type TonoScadenza = "neutro" | "vicina" | "scaduta";
export function tonoScadenza(scadenza: string, oggi = oggiIso()): TonoScadenza {
  const g = giorniMancanti(scadenza, oggi);
  return g < 0 ? "scaduta" : g <= GIORNI_PREAVVISO ? "vicina" : "neutro";
}

// La scheda del Riepilogo: la riga fissa e le (al massimo due) righe in evidenza, con «e altre N» per le altre.
export const testoDaEmettere = (n: number): string => `Fatture da emettere questo mese: ${n}`;
export const MASSIMO_RIGHE_PROMEMORIA = 2;
export function righePromemoria(inScadenza: ScadenzaFattura[]): { righe: string[]; altre: number } {
  const righe = inScadenza.slice(0, MASSIMO_RIGHE_PROMEMORIA).map((s) => {
    const t = testoScadenza(s.scadenza, aggiungiGiorniIso(s.scadenza, -s.giorniMancanti));
    return `${s.nome}: ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  });
  return { righe, altre: Math.max(0, inScadenza.length - MASSIMO_RIGHE_PROMEMORIA) };
}

// «Oggi» ricostruito dalla scadenza e dai giorni mancanti (cosi' il testo segue il servizio e non l'orologio del telefono).
function aggiungiGiorniIso(iso: string, n: number): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

// Il giorno di scadenza scritto in un campo: vuoto = nessuna scadenza (null); altrimenti un intero da 1 a 31.
export function leggiGiornoScadenza(testo: string): { giorno: number | null; errore: string | null } {
  const t = testo.trim();
  if (!t) return { giorno: null, errore: null };
  const n = /^\d{1,2}$/.test(t) ? Number(t) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 31) return { giorno: null, errore: "Il giorno va da 1 a 31, oppure lascia vuoto." };
  return { giorno: n, errore: null };
}
