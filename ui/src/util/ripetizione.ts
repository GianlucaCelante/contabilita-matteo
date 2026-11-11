// La frequenza di una ripetizione: ogni N giorni, settimane, mesi o anni (di base: ogni mese).
// I massimi sono quelli del servizio (UnitaRipetizione.java): se cambiano là, cambiano qui.

export type UnitaRipetizione = "GIORNI" | "SETTIMANE" | "MESI" | "ANNI";

export const MASSIMO_INTERVALLO: Record<UnitaRipetizione, number> = { GIORNI: 365, SETTIMANE: 104, MESI: 60, ANNI: 10 };

export const UNITA: { valore: UnitaRipetizione; singolare: string; plurale: string }[] = [
  { valore: "GIORNI", singolare: "giorno", plurale: "giorni" },
  { valore: "SETTIMANE", singolare: "settimana", plurale: "settimane" },
  { valore: "MESI", singolare: "mese", plurale: "mesi" },
  { valore: "ANNI", singolare: "anno", plurale: "anni" },
];

export function nomeUnita(unita: UnitaRipetizione, plurale: boolean): string {
  const u = UNITA.find((x) => x.valore === unita) ?? UNITA[2]!;
  return plurale ? u.plurale : u.singolare;
}

// Mesi e anni cadono sempre nello stesso giorno del mese (accorciato nei mesi piu' corti).
export function usaIlGiornoDelMese(unita: UnitaRipetizione): boolean {
  return unita === "MESI" || unita === "ANNI";
}

export interface Frequenza {
  unita: UnitaRipetizione;
  intervallo: number;
  giorno: number;
}

// «Ogni mese, il giorno 10», «Ogni 2 settimane», «Ogni 3 mesi, il giorno 31», «Ogni giorno».
export function descriviFrequenza({ unita, intervallo, giorno }: Frequenza): string {
  const base =
    intervallo === 1
      ? unita === "GIORNI"
        ? "Ogni giorno"
        : `Ogni ${nomeUnita(unita, false)}`
      : `Ogni ${intervallo} ${nomeUnita(unita, true)}`;
  return usaIlGiornoDelMese(unita) ? `${base}, il giorno ${giorno}` : base;
}

// L'avvertenza nel riquadro «Ripetizione» del dettaglio, per una parte di un movimento diviso fra sedi (`divisione`): le parti di ogni
// scadenza stanno insieme perche' cadono nello stesso giorno; cambiando giorno o frequenza di una sede sola, le sue scadenze cadono
// in altre date e nelle Ricevute diventano fatture a parte. Null se il movimento non e' diviso, non e' ripetuto o la ripetizione e'
// ferma (li' la frequenza non si cambia).
export function aiutoRipetizioneDivisa(m: { divisione: string | null; ricorrenza: { attiva: boolean } | null }): string | null {
  if (!m.divisione || !m.ricorrenza?.attiva) return null;
  return "È una parte di un movimento diviso: cambiando giorno o frequenza si separa dalle altre sedi.";
}
