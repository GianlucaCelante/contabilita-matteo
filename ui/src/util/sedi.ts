import type { Sede } from "../api/tipi";
import { numeroCent } from "./formato";

// Logica pura delle sedi: colori e lettera di ogni sede, selezione (singola o mista), divisione di un importo.
// Regola chiave: con UNA sola sede attiva l'app e' quella di prima (nessun selettore, badge o scheda «Per sede»).

// ---- colori e lettera ----

export interface ColoreSede {
  sfondo: string;
  testo: string;
}

// Palette ciclica per ordine della sede: verde, ambra, blu, rosa. Ogni coppia ha un contrasto di almeno 4,5:1 (test in sedi.test.ts).
export const PALETTE_SEDI: readonly ColoreSede[] = [
  { sfondo: "#E3EAD1", testo: "#4B6313" },
  { sfondo: "#F7EBD3", testo: "#845A08" },
  { sfondo: "#DCE9F1", testo: "#2F5D7A" },
  { sfondo: "#F2DDE6", testo: "#8A3358" },
];

export function coloreDiPosizione(posizione: number): ColoreSede {
  const n = PALETTE_SEDI.length;
  return PALETTE_SEDI[((posizione % n) + n) % n]!;
}

// L'ordine «di casa» delle sedi: per `ordine`, poi `id`. Archiviate comprese, cosi' i colori non si spostano quando una sede si archivia.
export function ordinaPerOrdine(sedi: readonly Sede[]): Sede[] {
  return [...sedi].sort((x, y) => x.ordine - y.ordine || x.id - y.id);
}

export function posizioneSede(sedi: readonly Sede[], id: number): number {
  const i = ordinaPerOrdine(sedi).findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

export function coloreSede(sedi: readonly Sede[], id: number): ColoreSede {
  return coloreDiPosizione(posizioneSede(sedi, id));
}

// La lettera in riquadro: l'iniziale del nome, in maiuscolo («Via Roma» -> V).
export function letteraSede(nome: string): string {
  const pulito = nome.trim();
  return pulito ? Array.from(pulito)[0]!.toLocaleUpperCase("it") : "?";
}

// Le lettere di tutte le sedi, diverse fra loro: se due sedi hanno la stessa iniziale («Via Roma», «Via Milano»), la seconda prende
// anche l'iniziale della parola dopo («VM»), poi le prime due lettere del nome, poi un numero. Le prime in ordine tengono la lettera sola.
export function lettereSedi(sedi: readonly Sede[]): Map<number, string> {
  const usate = new Set<string>();
  const risultato = new Map<number, string>();
  for (const s of ordinaPerOrdine(sedi)) {
    const parole = s.nome.trim().split(/\s+/).filter(Boolean);
    const lettere = Array.from(s.nome.trim().replace(/\s+/g, ""));
    const candidate = [
      letteraSede(s.nome),
      parole.length > 1 ? letteraSede(parole[0]!) + letteraSede(parole[1]!) : "",
      lettere.length > 1 ? (lettere[0]! + lettere[1]!).toLocaleUpperCase("it") : "",
    ].filter(Boolean);
    let scelta = candidate.find((c) => !usate.has(c));
    for (let n = 2; scelta === undefined; n++) {
      const c = letteraSede(s.nome) + n;
      if (!usate.has(c)) scelta = c;
    }
    usate.add(scelta);
    risultato.set(s.id, scelta);
  }
  return risultato;
}

// ---- quali sedi ci sono ----

export function sediAttive(sedi: readonly Sede[]): Sede[] {
  return ordinaPerOrdine(sedi).filter((s) => !s.archiviata);
}

// Le novita' (selettore, badge, «Per sede», scelta della sede nei moduli) compaiono solo con almeno due sedi attive.
export function conPiuSedi(sedi: readonly Sede[]): boolean {
  return sediAttive(sedi).length >= 2;
}

// ---- selezione ----

// null = tutte le sedi attive (anche quelle che verranno aggiunte). Altrimenti l'elenco degli id scelti.
export type Scelta = number[] | null;

// Gli id davvero selezionati: quelli scelti che sono ancora attive; se non ne resta nessuna, tutte le attive.
export function idSelezionati(sedi: readonly Sede[], scelta: Scelta): number[] {
  const attive = sediAttive(sedi).map((s) => s.id);
  if (scelta === null) return attive;
  const validi = attive.filter((id) => scelta.includes(id));
  return validi.length > 0 ? validi : attive;
}

// Il valore da salvare: se sono selezionate tutte le attive diventa null («tutte»).
export function normalizzaScelta(sedi: readonly Sede[], ids: readonly number[]): Scelta {
  const attive = sediAttive(sedi).map((s) => s.id);
  const validi = attive.filter((id) => ids.includes(id));
  return validi.length === 0 || validi.length === attive.length ? null : validi;
}

// Accende o spegne una sede. L'ultima sede selezionata non si spegne.
export function alternaSede(sedi: readonly Sede[], scelta: Scelta, id: number): Scelta {
  const correnti = idSelezionati(sedi, scelta);
  if (correnti.includes(id)) {
    if (correnti.length === 1) return normalizzaScelta(sedi, correnti);
    return normalizzaScelta(sedi, correnti.filter((x) => x !== id));
  }
  return normalizzaScelta(sedi, [...correnti, id]);
}

export function soloSede(sedi: readonly Sede[], id: number): Scelta {
  return normalizzaScelta(sedi, [id]);
}

// Il filtro `sedi` da mandare al servizio: niente se sono tutte le attive (cosi' il servizio include anche le archiviate e i
// totali del passato restano completi), altrimenti «1,2».
export function parametroSedi(sedi: readonly Sede[], scelta: Scelta): string | undefined {
  if (!conPiuSedi(sedi)) return undefined;
  const ids = idSelezionati(sedi, scelta);
  return ids.length === sediAttive(sedi).length ? undefined : ids.join(",");
}

// «Tutte le sedi», «Via Roma», «Via Roma + Lungomare».
export function etichettaSedi(sedi: readonly Sede[], scelta: Scelta): string {
  const ids = idSelezionati(sedi, scelta);
  if (ids.length === sediAttive(sedi).length) return "Tutte le sedi";
  return ids.map((id) => sedi.find((s) => s.id === id)?.nome ?? "").join(" + ");
}

// Per i titoli: quali sedi sono incluse, o niente se sono tutte. Oltre tre nomi: «4 sedi su 5».
export function sediIncluse(sedi: readonly Sede[], scelta: Scelta): string | null {
  if (!conPiuSedi(sedi)) return null;
  const ids = idSelezionati(sedi, scelta);
  const tot = sediAttive(sedi).length;
  if (ids.length === tot) return null;
  return ids.length <= 3 ? etichettaSedi(sedi, scelta) : `${ids.length} sedi su ${tot}`;
}

// Preselezione di un movimento nuovo: la sede singola selezionata, altrimenti nessuna (si sceglie).
export function sedePreselezionata(sedi: readonly Sede[], scelta: Scelta): number | null {
  if (!conPiuSedi(sedi)) return null;
  const ids = idSelezionati(sedi, scelta);
  return ids.length === 1 ? ids[0]! : null;
}

// ---- persistenza ----

interface Magazzino {
  getItem(chiave: string): string | null;
  setItem(chiave: string, valore: string): void;
}

const CHIAVE = "contabilita.sedi.v1";

export function magazzinoSedi(): Magazzino | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Una scelta rovinata o assente vale «tutte».
export function leggiScelta(magazzino: Magazzino | null = magazzinoSedi()): Scelta {
  if (!magazzino) return null;
  try {
    const testo = magazzino.getItem(CHIAVE);
    if (!testo) return null;
    const grezzo: unknown = JSON.parse(testo);
    if (typeof grezzo !== "object" || grezzo === null) return null;
    const scelte = (grezzo as Record<string, unknown>).scelte;
    if (!Array.isArray(scelte)) return null;
    const ids = scelte.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0);
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

export function salvaScelta(magazzino: Magazzino | null, scelta: Scelta): void {
  if (!magazzino) return;
  try {
    magazzino.setItem(CHIAVE, JSON.stringify({ scelte: scelta }));
  } catch {
    // niente da fare: la scelta vale finche' l'app e' aperta
  }
}

// ---- divisione di un importo fra le sedi ----

// Parti uguali; i centesimi di resto vanno uno ciascuno alle prime sedi (1000 su 3 -> 334, 333, 333), come il servizio.
export function dividiImporto(importoCent: number, sedi: number): number[] {
  if (!Number.isInteger(importoCent) || importoCent < 0 || !Number.isInteger(sedi) || sedi < 1) return [];
  const base = Math.floor(importoCent / sedi);
  const resto = importoCent % sedi;
  return Array.from({ length: sedi }, (_, i) => base + (i < resto ? 1 : 0));
}

// La riga di anteprima del modulo: «334,00 / 333,00 / 333,00 €». Le sedi che resterebbero senza movimento (parte a zero) non si mostrano.
export function anteprimaDivisione(importoCent: number, sedi: number): string {
  const parti = dividiImporto(importoCent, sedi).filter((p) => p > 0);
  return parti.length === 0 ? "" : `${parti.map((p) => numeroCent(p)).join(" / ")} €`;
}

// ---- contrasto (per i test della palette) ----

function luminanza(esadecimale: string): number {
  const canali = [1, 3, 5].map((i) => parseInt(esadecimale.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canali.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function rapportoContrasto(a: string, b: string): number {
  const [chiaro, scuro] = [luminanza(a), luminanza(b)].sort((x, y) => y - x) as [number, number];
  return (chiaro + 0.05) / (scuro + 0.05);
}
