// Logica pura della tastiera virtuale (usata da hooks/useTastieraVirtuale.ts):
// separata dal browser per poterla provare con i test.

// Differenza minima fra l'altezza «a riposo» e quella visibile perche' la si
// consideri una tastiera (e non la barra degli indirizzi che compare o sparisce).
export const SOGLIA_TASTIERA_PX = 120;

export interface IngressoTastiera {
  // Larghezza da telefono (max-width 767 px).
  telefono: boolean;
  // C'e' un campo di testo a fuoco.
  inModifica: boolean;
  // Altezza del visual viewport quando non c'era la tastiera.
  altezzaRiposo: number;
  // Altezza del visual viewport adesso.
  altezzaVisibile: number;
}

export interface StatoTastiera {
  aperta: boolean;
  altezzaTastiera: number;
}

// La tastiera e' aperta solo sul telefono, con un campo di testo a fuoco e il
// viewport visibile sensibilmente piu' basso di prima.
export function statoTastiera({ telefono, inModifica, altezzaRiposo, altezzaVisibile }: IngressoTastiera): StatoTastiera {
  const altezzaTastiera = Math.max(0, altezzaRiposo - altezzaVisibile);
  return { aperta: telefono && inModifica && altezzaTastiera > SOGLIA_TASTIERA_PX, altezzaTastiera };
}
