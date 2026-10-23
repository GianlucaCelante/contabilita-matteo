import type { Tipo } from "../api/tipi";
import { dataValida, type TipoPeriodo } from "./formato";

// I filtri di periodo e di tipo si ricordano nel browser: passando da una pagina all'altra e anche dopo
// aver chiuso l'applicazione si riparte da dove si era. Chi non puo' scrivere nel magazzino del browser
// (modalita' privata, dati bloccati) non perde nulla: i filtri restano quelli dell'indirizzo.

export interface FiltriSalvati {
  p?: TipoPeriodo;
  r?: string;
  da?: string;
  a?: string;
  // «» = Tutti
  tipo?: Tipo | "";
}

interface Magazzino {
  getItem(chiave: string): string | null;
  setItem(chiave: string, valore: string): void;
}

const CHIAVE = "contabilita.filtri.v1";
const TIPI_PERIODO: TipoPeriodo[] = ["settimana", "mese", "anno", "periodo"];
const TIPI: (Tipo | "")[] = ["", "RICAVO", "COSTO_VARIABILE", "COSTO_FISSO"];

export function magazzinoBrowser(): Magazzino | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Ogni valore si controlla da solo: uno rovinato si scarta, gli altri restano.
export function leggiFiltri(magazzino: Magazzino | null = magazzinoBrowser()): FiltriSalvati {
  if (!magazzino) return {};
  let grezzo: unknown;
  try {
    const testo = magazzino.getItem(CHIAVE);
    if (!testo) return {};
    grezzo = JSON.parse(testo);
  } catch {
    return {};
  }
  if (typeof grezzo !== "object" || grezzo === null) return {};
  const o = grezzo as Record<string, unknown>;
  const filtri: FiltriSalvati = {};
  const p = TIPI_PERIODO.find((t) => t === o.p);
  if (p) filtri.p = p;
  for (const campo of ["r", "da", "a"] as const) {
    const valore = o[campo];
    if (typeof valore === "string" && dataValida(valore)) filtri[campo] = valore;
  }
  const tipo = TIPI.find((t) => t === o.tipo);
  if (tipo !== undefined) filtri.tipo = tipo;
  return filtri;
}

// I salvataggi si sommano: chi scrive il periodo non cancella il tipo e viceversa.
export function salvaFiltri(magazzino: Magazzino | null, nuovi: FiltriSalvati): void {
  if (!magazzino) return;
  try {
    magazzino.setItem(CHIAVE, JSON.stringify({ ...leggiFiltri(magazzino), ...nuovi }));
  } catch {
    // niente da fare: si ricomincia dai valori predefiniti
  }
}
