import type { Anagrafica, RaggruppaVoci, StatisticheVoci, TipoVoci, VoceStatistica } from "../api/tipi";
import { percentuale } from "./formato";

// Logica pura della vista «Costi e ricavi per voce» (docs/api.md, «Statistiche per voce»).

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export const RAGGRUPPAMENTI: { valore: RaggruppaVoci; etichetta: string }[] = [
  { valore: "FORNITORE", etichetta: "Fornitori" },
  { valore: "DIPENDENTE", etichetta: "Dipendenti" },
  { valore: "CATEGORIA", etichetta: "Categorie" },
];

// L'anagrafica (elenco di voci) che corrisponde a ogni raggruppamento.
export const ANAGRAFICA_DI: Record<RaggruppaVoci, Anagrafica> = { FORNITORE: "fornitori", DIPENDENTE: "dipendenti", CATEGORIA: "categorie" };

// Per i fornitori il tipo e' scontato (costi variabili); per i dipendenti non c'e' tipo (contano solo le retribuzioni); la
// scelta compare solo per le categorie.
export const TIPO_PREDEFINITO: Record<RaggruppaVoci, TipoVoci | undefined> = {
  FORNITORE: "COSTO_VARIABILE",
  DIPENDENTE: undefined,
  CATEGORIA: "COSTI",
};

export const OPZIONI_TIPO_CATEGORIA: { valore: TipoVoci | "TUTTI"; etichetta: string }[] = [
  { valore: "COSTI", etichetta: "Costi" },
  { valore: "RICAVO", etichetta: "Ricavi" },
  { valore: "TUTTI", etichetta: "Tutti" },
];

// «Costi variabili» e «Costi fissi» non sono chip fisse: ciascuna compare solo se e' il tipo scelto (si arriva dal blocco del Riepilogo);
// intanto «Costi» resta spenta.
const ETICHETTA_SOLO_COSTI = { COSTO_VARIABILE: "Costi variabili", COSTO_FISSO: "Costi fissi" } as const;

export function opzioniTipoCategoria(scelto: TipoVoci | "TUTTI"): { valore: TipoVoci | "TUTTI"; etichetta: string }[] {
  if (scelto !== "COSTO_VARIABILE" && scelto !== "COSTO_FISSO") return OPZIONI_TIPO_CATEGORIA;
  const [costi, ...altre] = OPZIONI_TIPO_CATEGORIA;
  return [costi!, { valore: scelto, etichetta: ETICHETTA_SOLO_COSTI[scelto] }, ...altre];
}

// Il tipo delle categorie dall'indirizzo: le chip e, in piu', COSTO_VARIABILE e COSTO_FISSO; altrimenti «Costi».
export function tipoCategoriaDa(grezzo: string | null): TipoVoci | "TUTTI" {
  if (grezzo === "COSTO_VARIABILE" || grezzo === "COSTO_FISSO") return grezzo;
  return OPZIONI_TIPO_CATEGORIA.find((o) => o.valore === grezzo)?.valore ?? "COSTI";
}

// «Costi», «Retribuzioni», «Ricavi», «Ricavi e costi»: che cosa sta sommando il totale della lista e del dettaglio di una voce.
export function cosaSomma(raggruppa: RaggruppaVoci, tipo: TipoVoci | "TUTTI"): string {
  if (raggruppa === "DIPENDENTE") return "Retribuzioni";
  if (raggruppa === "FORNITORE") return "Costi";
  if (tipo === "COSTO_VARIABILE" || tipo === "COSTO_FISSO") return ETICHETTA_SOLO_COSTI[tipo];
  return tipo === "RICAVO" ? "Ricavi" : tipo === "TUTTI" ? "Ricavi e costi" : "Costi";
}

export type BloccoRiepilogo = "ricavi" | "variabili" | "fissi";

const TIPO_DEL_BLOCCO: Record<BloccoRiepilogo, TipoVoci> = { ricavi: "RICAVO", variabili: "COSTO_VARIABILE", fissi: "COSTO_FISSO" };

// Dal blocco del Riepilogo alle categorie di quel tipo nella lista «per voce» dello stesso periodo (tipo + riferimento, oppure da/a per
// il periodo libero): le righe sono le stesse categorie del blocco.
export function indirizzoStatisticheDelBlocco(blocco: BloccoRiepilogo, periodo: { tipo: string; da: string; a: string }): string {
  const p = new URLSearchParams({ v: "CATEGORIA", t: TIPO_DEL_BLOCCO[blocco] });
  p.set("p", periodo.tipo);
  if (periodo.tipo === "periodo") {
    p.set("da", periodo.da);
    p.set("a", periodo.a);
  } else p.set("r", periodo.da);
  return `/statistiche/voci?${p.toString()}`;
}

// Il tipo da mandare al servizio: per le categorie «Tutti» e' l'assenza del parametro; per i dipendenti non si manda
// (il servizio considera solo le retribuzioni e ignora il tipo).
export function tipoPerServizio(raggruppa: RaggruppaVoci, scelta: TipoVoci | "TUTTI"): TipoVoci | undefined {
  if (raggruppa !== "CATEGORIA") return TIPO_PREDEFINITO[raggruppa];
  return scelta === "TUTTI" ? undefined : scelta;
}

// «2026-10» -> «ottobre»; con l'anno «ottobre 2026».
export function nomeMeseDi(mese: string, conAnno = false): string {
  const [a, m] = mese.split("-");
  const nome = MESI[Number(m) - 1] ?? mese;
  return conAnno ? `${nome} ${a}` : nome;
}

// «2026-10» -> «ott»; con l'anno «ott 26» (quando il periodo attraversa piu' anni).
export function meseBreve(mese: string, conAnno = false): string {
  const [a, m] = mese.split("-");
  const nome = (MESI[Number(m) - 1] ?? mese).slice(0, 3);
  return conAnno ? `${nome} ${(a ?? "").slice(2)}` : nome;
}

// Vero se i mesi del periodo toccano piu' di un anno.
export function piuAnni(mesi: string[]): boolean {
  return new Set(mesi.map((m) => m.slice(0, 4))).size > 1;
}

// La larghezza (0-100) della barretta: il valore rispetto al massimo, mai fuori scala, e un filo visibile se c'e' un importo.
export function larghezzaBarra(valore: number, massimo: number): number {
  if (valore <= 0 || massimo <= 0) return 0;
  return Math.min(100, Math.max(2, (valore / massimo) * 100));
}

// La base delle quote: la somma delle sole voci positive. Con una nota di credito il totale netto puo' essere piccolo e le quote sul
// netto verrebbero sopra 100% o negative; cosi' le voci positive sommano a 100% e una voce negativa (la nota) non ha quota.
export function basePositiva(valori: readonly number[]): number {
  return valori.reduce((t, v) => t + Math.max(0, v), 0);
}

// La quota di una voce sulla base positiva: «—» per una voce negativa o senza voci positive. Mai sopra 100% ne' negativa.
export function quotaVoce(cent: number, base: number): string {
  if (cent < 0 || base <= 0) return "—";
  return percentuale(cent, base);
}

export interface VoceDelMese {
  voce: VoceStatistica;
  cent: number;
  // I movimenti della voce in quel mese (non in tutto il periodo).
  movimenti: number;
}

// Le voci che hanno un importo o dei movimenti nel mese scelto (posizione in `mesi`), dalla piu' alta; a parita' per nome. La riga
// senza voce in fondo.
export function vociDelMese(dati: StatisticheVoci, indice: number): { righe: VoceDelMese[]; totaleCent: number } {
  const righe = dati.voci
    .map((voce) => ({ voce, cent: voce.perMese[indice] ?? 0, movimenti: voce.movimentiPerMese[indice] ?? 0 }))
    .filter((r) => r.cent !== 0 || r.movimenti > 0)
    .sort((x, y) => Number(x.voce.id === null) - Number(y.voce.id === null) || y.cent - x.cent || x.voce.nome.localeCompare(y.voce.nome, "it"));
  return { righe, totaleCent: righe.reduce((t, r) => t + r.cent, 0) };
}

// Il totale di ogni mese (somma delle voci), per la riga dei totali della griglia.
export function totaliPerMese(dati: StatisticheVoci): number[] {
  return dati.mesi.map((_, i) => dati.voci.reduce((t, v) => t + (v.perMese[i] ?? 0), 0));
}

// L'importo piu' alto fra i mesi di una voce: la scala delle barrette dei suoi mesi.
export function massimoMese(voce: VoceStatistica): number {
  return Math.max(0, ...voce.perMese);
}

// Il mese da mostrare per primo quando i mesi sono piu' larghi dello schermo (griglia sul computer, chip sul telefono): il mese
// corrente se e' nel periodo, altrimenti l'ultimo con dati, altrimenti l'ultimo. -1 se non ci sono mesi.
export function meseInEvidenza(mesi: string[], totali: number[], oggi: string): number {
  if (mesi.length === 0) return -1;
  const corrente = mesi.indexOf(oggi.slice(0, 7));
  if (corrente >= 0) return corrente;
  for (let i = mesi.length - 1; i >= 0; i--) if ((totali[i] ?? 0) !== 0) return i;
  return mesi.length - 1;
}

// L'intestazione della prima colonna della griglia: la voce al singolare («Categoria», non «Categori»).
const INTESTAZIONE: Record<RaggruppaVoci, string> = { FORNITORE: "Fornitore", DIPENDENTE: "Dipendente", CATEGORIA: "Categoria" };
export function intestazioneVoce(raggruppa: RaggruppaVoci): string {
  return INTESTAZIONE[raggruppa];
}

// La colonna del mese da evidenziare nella griglia del computer: il mese scelto nell'indirizzo (m=yyyy-MM) se e' nel periodo,
// altrimenti quello di meseInEvidenza.
export function colonnaInEvidenza(mesi: string[], totali: number[], oggi: string, meseScelto: string | null): number {
  const scelto = meseScelto ? mesi.indexOf(meseScelto) : -1;
  return scelto >= 0 ? scelto : meseInEvidenza(mesi, totali, oggi);
}

export interface MisureGriglia {
  // Larghezza della prima colonna, fissa (sticky) a sinistra.
  fissa: number;
  // Larghezza visibile dell'area che scorre.
  larghezza: number;
  // Inizio e fine (stesse coordinate di offsetLeft) delle colonne dopo quella fissa, in ordine.
  colonne: { inizio: number; fine: number }[];
  // La colonna da portare in vista (posizione in `colonne`); -1 = nessuna.
  indice: number;
  // Lo scorrimento massimo senza margine (scrollWidth - clientWidth).
  massimo: number;
  // C'e' un mese scelto (m= nell'indirizzo). Senza, la griglia non scorre: Movim., Quota e Totale (le prime colonne dopo quella fissa)
  // restano in vista, e qualunque scorrimento coprirebbe almeno «Movim.».
  meseScelto: boolean;
}

// Lo scorrimento della griglia all'apertura: la colonna in evidenza intera e in vista, e la prima colonna dopo quella fissa intera (si
// scorre sempre fino all'inizio di una colonna: niente «Movim.» ridotto a «.» o importi tagliati sotto la colonna fissa). Se l'inizio di
// colonna giusto e' oltre lo scorrimento possibile (colonna in evidenza = l'ultima) serve un `margine` a destra, meno di una colonna.
export function scorrimentoIniziale(m: MisureGriglia): { scorri: number; margine: number } {
  const evidenza = m.colonne[m.indice];
  if (!evidenza || !m.meseScelto) return { scorri: 0, margine: 0 };
  const serve = evidenza.fine - m.larghezza;
  if (serve <= 0) return { scorri: 0, margine: 0 };
  // Al piu' fino a dove la colonna in evidenza comincia subito dopo quella fissa.
  const limite = evidenza.inizio - m.fissa;
  const candidato = m.colonne.map((c) => c.inizio - m.fissa).find((x) => x >= serve && x <= limite) ?? Math.max(0, limite);
  return { scorri: candidato, margine: Math.max(0, candidato - m.massimo) };
}

// Il periodo con cui si apre il dettaglio di una voce: il mese scelto sul telefono (yyyy-MM, dal primo all'ultimo giorno) oppure,
// con `mese` null (griglia del computer, che mostra sempre il periodo intero), il periodo della lista.
export function periodoDelDettaglio(da: string, a: string, mese: string | null): { da: string; a: string } {
  if (!mese) return { da, a };
  const [anno, m] = mese.split("-").map(Number);
  if (!anno || !m) return { da, a };
  return { da: `${mese}-01`, a: `${mese}-${String(new Date(anno, m, 0).getDate()).padStart(2, "0")}` };
}

// Il «Mese per mese» del dettaglio di una voce: dal primo all'ultimo mese con dati (un importo o dei movimenti, anche a somma zero).
// I mesi vuoti in testa e in coda si tolgono (con l'Anno erano dieci righe «—» su dodici); quelli vuoti in mezzo restano, cosi' si
// vede il buco fra un mese e l'altro.
export function mesiConDati(mesi: readonly string[], perMese: readonly number[], movimentiPerMese: readonly number[]): { mesi: string[]; importi: number[] } {
  const conDati = (i: number) => (perMese[i] ?? 0) !== 0 || (movimentiPerMese[i] ?? 0) > 0;
  const indici = mesi.map((_, i) => i).filter(conDati);
  if (indici.length === 0) return { mesi: [], importi: [] };
  const primo = indici[0]!;
  const ultimo = indici[indici.length - 1]!;
  return { mesi: mesi.slice(primo, ultimo + 1), importi: mesi.slice(primo, ultimo + 1).map((_, i) => perMese[primo + i] ?? 0) };
}

// Il verde e' dei ricavi (come in Riepilogo e Movimenti): vero solo quando l'elenco somma ricavi, cioe' le categorie dei ricavi.
// Costi, retribuzioni e «Ricavi e costi» insieme restano del colore del testo.
export function sommaRicavi(raggruppa: RaggruppaVoci, tipo: TipoVoci | "TUTTI"): boolean {
  return raggruppa === "CATEGORIA" && tipo === "RICAVO";
}
