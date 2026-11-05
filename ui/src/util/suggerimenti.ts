export interface VoceSuggerimento {
  testo: string;
  crea: boolean;
}

// Fino a questo numero di voci esistenti il comando «Crea …» sta DOPO di loro; oltre, in cima (altrimenti andrebbe cercato in fondo).
export const VOCI_LISTA_CORTA = 6;

// Le voci della lista di un Combobox: TUTTE le opzioni (la lista scorre, non c'e' un tetto) e, se il testo scritto e' nuovo,
// il comando «Crea …». Con poche voci esistenti (testo prefisso di «Bel Fungo»…) «Crea» va in fondo, cosi' non si crea per
// sbaglio un doppione; con una lista lunga va in cima, cosi' resta raggiungibile senza scorrere.
export function vociSuggerimenti(opzioni: string[], testo: string): VoceSuggerimento[] {
  const t = testo.trim();
  const lista: VoceSuggerimento[] = opzioni.map((o) => ({ testo: o, crea: false }));
  const esatto = opzioni.some((o) => o.toLowerCase() === t.toLowerCase());
  if (t && !esatto) {
    const crea = { testo: t, crea: true };
    if (opzioni.length > VOCI_LISTA_CORTA) lista.unshift(crea);
    else lista.push(crea);
  }
  return lista;
}
