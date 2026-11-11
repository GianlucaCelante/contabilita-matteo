// Geometria delle barre fisse in basso (hooks/useBarreFisse.ts), senza DOM.

export interface Rettangolo {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Sul telefono la barra fissa «Annulla | Salva» di un modulo (Nuovo movimento, Dettaglio, Pizze e ordini) sta sopra la barra di
// navigazione finche' si compila. Le voci coperte non si vedono ma restavano nella pagina: chi le cercava (lettore di schermo, Tab,
// un tocco «su Riepilogo») trovava al loro posto «Annulla», che porta altrove (da Pizze e ordini: a Statistiche). Qui si dice se la
// barra di navigazione e' coperta: una barra fissa passa sopra il centro delle sue voci per almeno meta' della larghezza.
export function navigazioneCoperta(navigazione: Rettangolo | null, barre: readonly Rettangolo[]): boolean {
  if (!navigazione || navigazione.width <= 0 || navigazione.height <= 0) return false;
  const centro = navigazione.top + navigazione.height / 2;
  return barre.some((b) => {
    if (b.width <= 0 || b.height <= 0) return false;
    if (centro < b.top || centro > b.top + b.height) return false;
    const sovrapposta = Math.min(navigazione.left + navigazione.width, b.left + b.width) - Math.max(navigazione.left, b.left);
    return sovrapposta >= navigazione.width / 2;
  });
}
