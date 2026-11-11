import type { Sede } from "../api/tipi";
import { conPiuSedi } from "./sedi";

// L'ultima sede usata per registrare un movimento su questo dispositivo (Nuovo movimento e Importa fatture): con piu' sedi e
// «Tutte le sedi» attivo il modulo non parte piu' senza sede, ma da quella. Si ricorda nel browser, come la scelta delle sedi.

interface Magazzino {
  getItem(chiave: string): string | null;
  setItem(chiave: string, valore: string): void;
}

// Formato: {"sede": id}.
export const CHIAVE_ULTIMA_SEDE = "contabilita.ultimaSede.v1";

export function magazzinoUltimaSede(): Magazzino | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Una sede su cui si puo' registrare senza pensarci: c'e', e' attiva e non e' personale.
function proponibile(sedi: readonly Sede[], id: number): boolean {
  const s = sedi.find((x) => x.id === id);
  return !!s && !s.archiviata && !s.personale;
}

// La sede da cui parte un movimento nuovo. `selezionate`: gli id delle sedi che si stanno guardando (il selettore).
//  - una sola sede selezionata: quella (se e' personale la sede si sceglie, senza ripieghi);
//  - piu' sedi selezionate («Tutte le sedi» o una vista mista): l'ultima usata su questo dispositivo, se c'e' ancora, e' attiva,
//    non e' personale ed e' fra quelle che si stanno guardando; altrimenti nessuna (la sede si chiede).
// Non propone mai una divisione fra sedi, e niente con una sola sede attiva (il servizio usa quella).
export function sedeDiPartenza(sedi: readonly Sede[], selezionate: readonly number[], ultima: number | null): number | null {
  if (!conPiuSedi(sedi)) return null;
  if (selezionate.length === 1) return proponibile(sedi, selezionate[0]!) ? selezionate[0]! : null;
  return ultima !== null && selezionate.includes(ultima) && proponibile(sedi, ultima) ? ultima : null;
}

// Un valore rovinato o assente vale «nessuna».
export function leggiUltimaSede(magazzino: Magazzino | null = magazzinoUltimaSede()): number | null {
  if (!magazzino) return null;
  try {
    const testo = magazzino.getItem(CHIAVE_ULTIMA_SEDE);
    if (!testo) return null;
    const grezzo: unknown = JSON.parse(testo);
    if (typeof grezzo !== "object" || grezzo === null) return null;
    const id = (grezzo as Record<string, unknown>).sede;
    return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

// Dopo un salvataggio su una sede sola. Una sede personale, archiviata o sconosciuta non si ricorda (resta quella di prima).
export function ricordaUltimaSede(magazzino: Magazzino | null, sedi: readonly Sede[], id: number): void {
  if (!magazzino || !proponibile(sedi, id)) return;
  try {
    magazzino.setItem(CHIAVE_ULTIMA_SEDE, JSON.stringify({ sede: id }));
  } catch {
    // niente da fare: la prossima volta la sede si sceglie
  }
}
