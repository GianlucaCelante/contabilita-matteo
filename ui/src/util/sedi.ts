import type { Sede } from "../api/tipi";
import { numeroCent } from "./formato";

// Logica pura delle sedi: colori e lettera di ogni sede, selezione (singola o mista), divisione di un importo.
// Regola chiave: con UNA sola sede attiva l'app e' quella di prima (nessun selettore, badge o scheda «Per sede»). Una sede vera
// piu' una personale sono due sedi attive: il selettore c'e' (per vedere la personale), «Per sede» e pizze per sede no.

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

// Le sedi del locale: le attive non personali. Una sede personale (spese dei titolari) non ha pizze e ordini e resta fuori dai
// totali finche' non la si sceglie. Il servizio garantisce che ce ne sia sempre almeno una; se mancasse valgono tutte le attive.
export function sediDelLocale(sedi: readonly Sede[]): Sede[] {
  const attive = sediAttive(sedi);
  const locale = attive.filter((s) => !s.personale);
  return locale.length > 0 ? locale : attive;
}

// Le novita' (selettore, badge, scelta della sede nei moduli) compaiono con almeno due sedi attive, personali comprese: con una sede
// vera e una personale serve il selettore per vedere la personale, e un movimento nuovo chiede la sede.
export function conPiuSedi(sedi: readonly Sede[]): boolean {
  return sediAttive(sedi).length >= 2;
}

// Per le scelte (selettore, pillole dei moduli): prima le sedi del locale, poi le personali, ognuna nel suo ordine.
export function localePoiPersonali<T extends Pick<Sede, "personale">>(sedi: readonly T[]): T[] {
  return [...sedi.filter((s) => !s.personale), ...sedi.filter((s) => s.personale)];
}

// Le sedi che il selettore lascia scegliere: le attive (prima il locale, poi le personali) e in fondo le personali archiviate che hanno
// movimenti (le spese passate dei titolari restano raggiungibili; le archiviate del locale entrano gia' in «Tutte le sedi»).
export function sediSelezionabili(sedi: readonly Sede[]): Sede[] {
  const archiviatePersonali = ordinaPerOrdine(sedi).filter((s) => s.archiviata && s.personale && s.movimenti > 0);
  return [...localePoiPersonali(sediAttive(sedi)), ...archiviatePersonali];
}

// Il selettore compare con almeno due sedi da scegliere (anche una sola attiva piu' una personale archiviata con movimenti).
export function conSelettore(sedi: readonly Sede[]): boolean {
  return sediSelezionabili(sedi).length >= 2;
}

// Una sede appena diventata personale esce da una scelta salvata (altrimenti resterebbe accesa senza che nessuno l'abbia scelta come
// personale). Se non resta niente si torna a «tutte».
export function senzaSede(scelta: Scelta, id: number): Scelta {
  if (scelta === null) return null;
  const resto = scelta.filter((x) => x !== id);
  return resto.length > 0 ? resto : null;
}

// Pizze e ordini per sede, «Per sede» e «Tutte, dividi»: solo con almeno due sedi del locale.
export function conPiuSediDelLocale(sedi: readonly Sede[]): boolean {
  return sediAttive(sedi).filter((s) => !s.personale).length >= 2;
}

// ---- selezione ----

// null = tutte le sedi del locale (anche quelle che verranno aggiunte), senza le personali. Altrimenti l'elenco degli id scelti,
// personali comprese.
export type Scelta = number[] | null;

const stesseSedi = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id) => b.includes(id));

// Gli id davvero selezionati, nell'ordine del selettore: quelli scelti che si possono ancora scegliere (sediSelezionabili); se non ne
// resta nessuno, il locale.
export function idSelezionati(sedi: readonly Sede[], scelta: Scelta): number[] {
  const locale = sediDelLocale(sedi).map((s) => s.id);
  if (scelta === null) return locale;
  const validi = sediSelezionabili(sedi)
    .map((s) => s.id)
    .filter((id) => scelta.includes(id));
  return validi.length > 0 ? validi : locale;
}

// Vero se la selezione e' esattamente il locale («Tutte le sedi»).
export function tutteDelLocale(sedi: readonly Sede[], scelta: Scelta): boolean {
  return stesseSedi(
    idSelezionati(sedi, scelta),
    sediDelLocale(sedi).map((s) => s.id),
  );
}

// Il valore da salvare: se la selezione e' esattamente il locale diventa null («tutte»).
export function normalizzaScelta(sedi: readonly Sede[], ids: readonly number[]): Scelta {
  const validi = sediSelezionabili(sedi)
    .map((s) => s.id)
    .filter((id) => ids.includes(id));
  return validi.length === 0 ||
    stesseSedi(
      validi,
      sediDelLocale(sedi).map((s) => s.id),
    )
    ? null
    : validi;
}

// Accende o spegne una sede. L'ultima sede selezionata non si spegne.
export function alternaSede(sedi: readonly Sede[], scelta: Scelta, id: number): Scelta {
  const correnti = idSelezionati(sedi, scelta);
  if (correnti.includes(id)) {
    if (correnti.length === 1) return normalizzaScelta(sedi, correnti);
    return normalizzaScelta(
      sedi,
      correnti.filter((x) => x !== id),
    );
  }
  return normalizzaScelta(sedi, [...correnti, id]);
}

export function soloSede(sedi: readonly Sede[], id: number): Scelta {
  return normalizzaScelta(sedi, [id]);
}

// Il filtro `sedi` da mandare al servizio. Niente se la selezione e' il locale: il servizio fa lo stesso (tutte le non personali)
// e include anche le archiviate, cosi' i totali del passato restano completi. Con una personale il filtro e' esplicito; se la
// selezione comprende tutto il locale si aggiungono le sedi archiviate non personali, per la stessa ragione; se comprende tutte le
// personali attive (almeno una) si aggiungono le personali archiviate.
export function parametroSedi(sedi: readonly Sede[], scelta: Scelta): string | undefined {
  if (!conSelettore(sedi) || tutteDelLocale(sedi, scelta)) return undefined;
  const ids = idSelezionati(sedi, scelta);
  const archiviate = ordinaPerOrdine(sedi).filter((s) => s.archiviata && !ids.includes(s.id));
  const conTuttoIlLocale = sediDelLocale(sedi).every((s) => ids.includes(s.id));
  const personaliAttive = sediAttive(sedi).filter((s) => s.personale);
  const conTutteLePersonali = personaliAttive.length > 0 && personaliAttive.every((s) => ids.includes(s.id));
  const delLocale = conTuttoIlLocale ? archiviate.filter((s) => !s.personale).map((s) => s.id) : [];
  const personali = conTutteLePersonali ? archiviate.filter((s) => s.personale).map((s) => s.id) : [];
  return [...ids, ...delLocale, ...personali].join(",");
}

// «Tutte le sedi», «Via Roma», «Via Roma + Lungomare», «Tutte le sedi + Casa» (tutto il locale piu' una personale).
export function etichettaSedi(sedi: readonly Sede[], scelta: Scelta): string {
  if (tutteDelLocale(sedi, scelta)) return "Tutte le sedi";
  const ids = idSelezionati(sedi, scelta);
  const nome = (id: number) => sedi.find((s) => s.id === id)?.nome ?? "";
  const locale = sediDelLocale(sedi).map((s) => s.id);
  if (locale.length >= 2 && locale.every((id) => ids.includes(id))) {
    return ["Tutte le sedi", ...ids.filter((id) => !locale.includes(id)).map(nome)].join(" + ");
  }
  return ids.map(nome).join(" + ");
}

// Per i titoli: quali sedi sono incluse, o niente se e' il locale. Oltre tre nomi: «4 sedi su 5» (sulle attive).
export function sediIncluse(sedi: readonly Sede[], scelta: Scelta): string | null {
  if (!conSelettore(sedi) || tutteDelLocale(sedi, scelta)) return null;
  const etichetta = etichettaSedi(sedi, scelta);
  const ids = idSelezionati(sedi, scelta);
  if (ids.length <= 3 || etichetta.startsWith("Tutte le sedi")) return etichetta;
  return `${ids.length} sedi su ${sediAttive(sedi).length}`;
}

// La sede singola selezionata, se non e' personale. I moduli partono da `sedeDiPartenza` (util/ultimaSede.ts), che aggiunge l'ultima
// sede usata: questa resta come regola di base, con i suoi test.
export function sedePreselezionata(sedi: readonly Sede[], scelta: Scelta): number | null {
  if (!conPiuSedi(sedi)) return null;
  const ids = idSelezionati(sedi, scelta);
  if (ids.length !== 1) return null;
  return sedi.find((s) => s.id === ids[0])?.personale ? null : ids[0]!;
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
