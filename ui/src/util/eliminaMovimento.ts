import type { Ambito } from "../api/tipi";

// Eliminare un movimento che fa parte di una ripetizione attiva: due strade esplicite, niente scelta «per i prossimi» da
// ricordare. Fermare la ripetizione senza cancellare nulla resta il link «Ferma la ripetizione».

export interface SceltaElimina {
  ambito: Ambito;
  etichetta: string;
  pericoloso: boolean;
}

export function sceltePerEliminare(ripetizioneAttiva: boolean): SceltaElimina[] {
  if (!ripetizioneAttiva) return [{ ambito: "SOLO_QUESTO", etichetta: "Sì, elimina", pericoloso: true }];
  return [
    { ambito: "SOLO_QUESTO", etichetta: "Elimina solo questo", pericoloso: false },
    { ambito: "QUESTO_E_PROSSIMI", etichetta: "Elimina e ferma la ripetizione", pericoloso: true },
  ];
}

// Con la ripetizione attiva i due pulsanti si spiegano da soli: nessun sottotesto.
export function sottotitoloElimina(ripetizioneAttiva: boolean): string {
  return ripetizioneAttiva ? "" : "Non si può annullare.";
}
