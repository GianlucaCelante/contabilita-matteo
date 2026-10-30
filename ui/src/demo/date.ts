// Date senza fuso (yyyy-MM-dd) per la demo: stesse regole del servizio per le ripetizioni.
import type { UnitaRipetizione } from "../util/ripetizione";

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daIso(s: string): Date {
  const [a, m, g] = s.split("-").map(Number);
  return new Date(a ?? 1970, (m ?? 1) - 1, g ?? 1);
}

export function oggiIso(): string {
  return iso(new Date());
}

export function aggiungiGiorni(s: string, n: number): string {
  const d = daIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

// Il lunedi' della settimana che contiene il giorno.
export function lunediDi(s: string): string {
  return aggiungiGiorni(s, -((daIso(s).getDay() + 6) % 7));
}

function giorniDelMese(anno: number, mese0: number): number {
  return new Date(anno, mese0 + 1, 0).getDate();
}

// La scadenza dopo «da»: mesi e anni tengono il giorno scelto (nei mesi corti, l'ultimo del mese).
export function successiva(da: string, unita: UnitaRipetizione, intervallo: number, giorno: number): string {
  const d = daIso(da);
  if (unita === "GIORNI") return aggiungiGiorni(da, intervallo);
  if (unita === "SETTIMANE") return aggiungiGiorni(da, 7 * intervallo);
  const mesi = unita === "MESI" ? intervallo : 12 * intervallo;
  const indice = d.getFullYear() * 12 + d.getMonth() + mesi;
  const anno = Math.floor(indice / 12);
  const mese0 = indice % 12;
  return iso(new Date(anno, mese0, Math.min(giorno, giorniDelMese(anno, mese0))));
}
