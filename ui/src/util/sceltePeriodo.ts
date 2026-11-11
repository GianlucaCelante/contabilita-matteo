import type { TipoPeriodo } from "./formato";

// Le scelte del selettore del periodo (componenti/SelettorePeriodo.tsx): i segmenti del computer e le righe del foglio del telefono.

export interface SceltaPeriodo {
  tipo: TipoPeriodo;
  etichetta: string;
  // Che cosa mostra, in poche parole: sta sotto il nome nel foglio del telefono.
  aiuto: string;
}

const SCELTE: SceltaPeriodo[] = [
  { tipo: "giorno", etichetta: "Oggi", aiuto: "Un giorno alla volta, a partire da oggi" },
  { tipo: "settimana", etichetta: "Settimana", aiuto: "Da lunedì a domenica" },
  { tipo: "mese", etichetta: "Mese", aiuto: "Un mese intero" },
  { tipo: "anno", etichetta: "Anno", aiuto: "Da gennaio a dicembre" },
  { tipo: "periodo", etichetta: "Periodo", aiuto: "Dal giorno al giorno che scegli tu" },
];

// `conPeriodoLibero: false` toglie «Periodo», `senzaGiorno` toglie «Oggi» (dati settimanali).
export function sceltePeriodo({ conPeriodoLibero = true, senzaGiorno = false }: { conPeriodoLibero?: boolean; senzaGiorno?: boolean } = {}): SceltaPeriodo[] {
  return SCELTE.filter((s) => !(s.tipo === "periodo" && !conPeriodoLibero) && !(s.tipo === "giorno" && senzaGiorno));
}

// I nomi delle due frecce per chi usa lo screen reader.
export function nomiFrecce(tipo: TipoPeriodo): { prima: string; dopo: string } {
  return tipo === "giorno" ? { prima: "Giorno precedente", dopo: "Giorno successivo" } : { prima: "Periodo precedente", dopo: "Periodo successivo" };
}
