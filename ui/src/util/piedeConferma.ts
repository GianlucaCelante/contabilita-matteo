// L'ordine dei pulsanti in fondo a una conferma con piu' scelte (componenti/Conferma.tsx). Sul computer stanno in riga:
// Annulla per primo e l'azione principale a destra. Sul telefono stanno in colonna a tutta larghezza: la principale in alto e
// Annulla in fondo. L'ordine e' quello del documento, cosi' il Tab e lo screen reader seguono quello che si vede.
export function ordinePiede<T>(annulla: T, azioni: readonly T[], inColonna: boolean): T[] {
  return inColonna ? [...azioni].reverse().concat([annulla]) : [annulla, ...azioni];
}
