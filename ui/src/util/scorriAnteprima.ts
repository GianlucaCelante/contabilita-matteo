// Dove scorrere quando compare l'anteprima dell'importazione (viste/ImportaFatture.tsx). Misure in px rispetto alla finestra, come
// getBoundingClientRect; `alto` e `basso` sono i bordi della parte che si vede davvero (sopra la barra fissa «Annulla | Importa»).
//  - l'anteprima va in cima (con un po' d'aria): si vedono i file scartati e la scelta della sede;
//  - se cosi' la prima fattura finisce sotto la barra, si scorre quel tanto in piu' che serve a vederla tutta;
//  - ma mai oltre il titolo «N fatture lette»: resta in alto anche su uno schermo dove la prima fattura non ci sta intera.
// Rende di quanto scorrere il contenitore (positivo = in giu').

const ARIA = 12;

export interface MisureAnteprima {
  // Il bordo alto dell'anteprima.
  inizio: number;
  // Il bordo alto della scheda «N fatture lette» e il bordo basso della prima fattura; null se non ci sono fatture.
  titolo: number | null;
  primaBasso: number | null;
  alto: number;
  basso: number;
}

export function scorrimentoAnteprima({ inizio, titolo, primaBasso, alto, basso }: MisureAnteprima): number {
  const inCima = inizio - alto - ARIA;
  if (titolo === null || primaBasso === null) return inCima;
  const perLaPrima = primaBasso - basso + ARIA;
  const finoAlTitolo = titolo - alto - ARIA;
  return Math.max(inCima, Math.min(perLaPrima, finoAlTitolo));
}
