import { euro, percentuale } from "./formato";

// Logica pura del Riepilogo.

export interface ProporzioniRiepilogo {
  // Vero: i tre valori sono percentuali sui ricavi (sommano 100%). Falso: sono importi.
  conPercentuali: boolean;
  variabili: string;
  fissi: string;
  risultato: string;
  // Il testo della barra per chi usa lo screen reader.
  descrizione: string;
}

// La legenda della barra delle proporzioni: le percentuali sui ricavi finche' hanno senso. Con i costi sopra i ricavi (risultato
// negativo) o senza ricavi le percentuali sarebbero assurde («Costi variabili 591,5% · Risultato −538,6%») o vuote: si mostrano gli importi.
export function proporzioniRiepilogo({ ricaviCent, variabiliCent, fissiCent, risultatoCent }: { ricaviCent: number; variabiliCent: number; fissiCent: number; risultatoCent: number }): ProporzioniRiepilogo {
  const conPercentuali = ricaviCent > 0 && risultatoCent >= 0;
  const testo = (cent: number) => (conPercentuali ? percentuale(cent, ricaviCent) : euro(cent));
  const variabili = testo(variabiliCent);
  const fissi = testo(fissiCent);
  const risultato = testo(risultatoCent);
  return {
    conPercentuali,
    variabili,
    fissi,
    risultato,
    descrizione: `Costi variabili ${variabili}, costi fissi ${fissi}, risultato ${risultato}` + (conPercentuali ? " dei ricavi" : ""),
  };
}
