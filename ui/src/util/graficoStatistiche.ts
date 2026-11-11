import type { IntervalloSerie, PassoSerie } from "../api/tipi";
import { aggiungiGiorni, aggiungiMesi, daIso, dataGiorno, etichettaIntervallo, euro, lunediDi, type Intervallo, type TipoPeriodo } from "./formato";
import { numeroSettimanaIso, testoConteggio } from "./statistiche";

// Logica pura del grafico di Statistiche: pizze e ricavi giorno per giorno, per settimana, per mese o per un anno diviso mese per mese
// (GET /api/statistiche/serie, docs/api.md). Le barre partono da zero (sono totali), al contrario del grafico dello scontrino medio.

export type PassoGrafico = "GIORNO" | "SETTIMANA" | "MESE" | "ANNO";
export type MisuraGrafico = "pizze" | "ricavi";

export const PASSI_GRAFICO: { passo: PassoGrafico; etichetta: string }[] = [
  { passo: "GIORNO", etichetta: "Giorno" },
  { passo: "SETTIMANA", etichetta: "Settimana" },
  { passo: "MESE", etichetta: "Mese" },
  { passo: "ANNO", etichetta: "Anno" },
];

// Quante barre al massimo: oltre il grafico mostra le ultime (il servizio ne accetta 400, ma a 320 px non si leggerebbero).
export const MASSIMO_GIORNI = 35;
export const GIORNI_RECENTI = 5; // settimane, giorno per giorno, quando il periodo e' piu' lungo
export const MINIMO_SETTIMANE = 4;
export const SETTIMANE_RECENTI = 12;
export const MASSIMO_SETTIMANE = 53;
export const MINIMO_MESI = 3;
export const MESI_RECENTI = 12;
export const MASSIMO_MESI = 36;

const giorniTra = (da: string, a: string) => Math.round((daIso(a).getTime() - daIso(da).getTime()) / 86_400_000) + 1;
const primoDelMese = (iso: string) => `${iso.slice(0, 8)}01`;
const mesiTra = (da: string, a: string) => (Number(a.slice(0, 4)) - Number(da.slice(0, 4))) * 12 + Number(a.slice(5, 7)) - Number(da.slice(5, 7)) + 1;

// Il massimo di intervalli per richiesta di GET /statistiche/serie (oltre: 400 «Troppi intervalli»).
export const MASSIMO_INTERVALLI = 400;

// I numeri in cima alle Statistiche si chiedono mese per mese su tutto il periodo: si puo' finche' i mesi sono al massimo 400 (33 anni).
// Oltre, la schermata lo dice invece di chiedere (e di fallire).
export function numeriPossibili({ da, a }: Intervallo): boolean {
  return mesiTra(da, a) <= MASSIMO_INTERVALLI;
}

// Il passo con cui si apre il grafico, dal periodo scelto: una settimana o un mese giorno per giorno, un anno mese per mese.
export function passoPredefinito(tipo: TipoPeriodo, { da, a }: Intervallo): PassoGrafico {
  if (tipo === "anno") return "ANNO";
  if (tipo !== "periodo") return "GIORNO";
  const giorni = giorniTra(da, a);
  return giorni <= MASSIMO_GIORNI ? "GIORNO" : giorni <= 7 * MASSIMO_SETTIMANE ? "SETTIMANA" : "MESE";
}

export interface RichiestaSerie {
  da: string;
  a: string;
  passo: PassoSerie;
  // «Giorno per giorno», «Ultime 12 settimane», «2026, mese per mese»: il titolo del grafico; sotto, le date effettive.
  titolo: string;
  date: string;
}

// L'intervallo da chiedere al servizio per il passo scelto: il periodo scelto, intero (i giorni o i mesi che devono ancora venire
// restano vuoti, come dicembre nell'anno in corso). Se il periodo e' troppo corto per il passo (una settimana divisa per settimane farebbe una
// barra sola) o troppo lungo si guardano le ultime settimane o gli ultimi mesi che finiscono con il periodo, fermandosi a oggi se il
// periodo e' in corso. L'anno e'
// sempre gennaio-dicembre dell'anno del periodo, mese per mese. Mai oltre i 400 intervalli del servizio.
export function intervalloSerie(passo: PassoGrafico, { da, a }: Intervallo, oggi: string): RichiestaSerie {
  const fine = da <= oggi && oggi < a ? oggi : a;
  const date = (x: string, y: string) => etichettaIntervallo("settimana", { da: x, a: y });
  if (passo === "ANNO") {
    const anno = fine.slice(0, 4);
    return { da: `${anno}-01-01`, a: `${anno}-12-31`, passo: "MESE", titolo: `${anno}, mese per mese`, date: `Gennaio – dicembre ${anno}` };
  }
  if (passo === "GIORNO") {
    if (giorniTra(da, a) <= MASSIMO_GIORNI) return { da, a, passo: "GIORNO", titolo: "Giorno per giorno", date: date(da, a) };
    const inizio = aggiungiGiorni(lunediDi(fine), -7 * (GIORNI_RECENTI - 1));
    return { da: inizio, a: fine, passo: "GIORNO", titolo: `Ultime ${GIORNI_RECENTI} settimane, giorno per giorno`, date: date(inizio, fine) };
  }
  if (passo === "SETTIMANA") {
    // Si contano le settimane di quello che si chiederebbe ({da, a} interi), non fino a oggi: un periodo che va lontano nel futuro
    // farebbe troppi intervalli (400 del servizio).
    const settimane = Math.round(giorniTra(lunediDi(da), lunediDi(a)) / 7) + 1;
    if (settimane < MINIMO_SETTIMANE || settimane > MASSIMO_SETTIMANE) {
      const quante = settimane < MINIMO_SETTIMANE ? SETTIMANE_RECENTI : MASSIMO_SETTIMANE - 1;
      const inizio = aggiungiGiorni(lunediDi(fine), -7 * (quante - 1));
      return { da: inizio, a: fine, passo: "SETTIMANA", titolo: `Ultime ${quante} settimane`, date: date(inizio, fine) };
    }
    return { da, a, passo: "SETTIMANA", titolo: "Settimana per settimana", date: date(da, a) };
  }
  const mesi = mesiTra(da, a); // come per le settimane: sull'intervallo che si chiederebbe
  if (mesi < MINIMO_MESI || mesi > MASSIMO_MESI) {
    const quanti = mesi < MINIMO_MESI ? MESI_RECENTI : MASSIMO_MESI;
    const inizio = aggiungiMesi(primoDelMese(fine), -(quanti - 1));
    return { da: inizio, a: fine, passo: "MESE", titolo: `Ultimi ${quanti} mesi`, date: date(inizio, fine) };
  }
  return { da, a, passo: "MESE", titolo: "Mese per mese", date: date(da, a) };
}

// ---- la scala ----

export interface Scala {
  // Il valore in cima al grafico (un numero tondo >= del massimo) e le linee orizzontali, da 0 alla cima.
  cima: number;
  tacche: number[];
}

// Una scala da zero con numeri tondi (1, 2, 2,5 o 5 per una potenza di 10) e circa `quante` linee. `passoMinimo` evita le frazioni
// (1 pizza, 100 centesimi).
export function scalaDaZero(massimo: number, passoMinimo = 1, quante = 4): Scala {
  if (!(massimo > 0)) return { cima: passoMinimo * quante, tacche: Array.from({ length: quante + 1 }, (_, i) => i * passoMinimo) };
  const grezzo = massimo / quante;
  const potenza = 10 ** Math.floor(Math.log10(grezzo));
  const n = grezzo / potenza;
  // 2,5 solo se resta un multiplo del passo minimo (25 pizze si', 2,5 pizze no; 25 euro si', 2,50 euro no)
  const con25 = (2.5 * potenza) % passoMinimo === 0;
  const passo = Math.max((n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 && con25 ? 2.5 : n <= 5 ? 5 : 10) * potenza, passoMinimo);
  const cima = Math.ceil(massimo / passo - 1e-9) * passo;
  const tacche: number[] = [];
  for (let v = 0; v <= cima + 1e-9; v += passo) tacche.push(Math.round(v));
  return { cima, tacche };
}

// «€ 12.500» (le linee del grafico: euro interi).
export function euroTondo(cent: number): string {
  return `€\u00a0${testoConteggio(Math.round(cent / 100))}`;
}

// ---- le barre ----

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const GIORNI_BREVI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

export interface Barra {
  inizio: string;
  fine: string;
  // Sotto la barra: «12», «lun 2», «S10», «mar».
  etichetta: string;
  // Per il dettaglio e gli screen reader: «Lunedì 2 marzo 2026», «Settimana 10 (2 – 8 marzo 2026)», «Marzo 2026».
  nome: string;
  // dati = c'e' il numero (per le pizze: inserito; per i ricavi: sempre, anche 0); senzaDati = pizze non inserite; nelTotale = pizze
  // giorno per giorno, un giorno senza dati suoi in una settimana col totale (contato tutto sul lunedi'); futuro = non ancora.
  stato: "dati" | "senzaDati" | "nelTotale" | "futuro";
  // Pizze, o i ricavi totali in centesimi (mai sotto zero: le note di credito non disegnano barre in giu').
  valore: number;
  // Solo per i ricavi: la parte extra (compresa in valore).
  extra: number;
  // 0..1 rispetto alla cima della scala.
  altezza: number;
  altezzaExtra: number;
  // «312 pizze · 98 ordini · scontrino € 24,50», «€ 3.120,00, di cui extra € 400,00», «non inseriti».
  testo: string;
  // Le etichette sotto le barre sono poche (al massimo 7 sul telefono, 14 sul computer), contate dall'ultima.
  etichettaTelefono: boolean;
  etichettaComputer: boolean;
  // Solo pizze giorno per giorno: il giorno contiene un «Totale della settimana», contato tutto sul suo lunedi' (la barra e' alta per
  // questo, non per un giorno eccezionale). Si disegna diversa, con la voce di legenda e il testo per gli screen reader.
  settimanale: boolean;
}

export interface DatiGrafico {
  barre: Barra[];
  scala: Scala;
  // C'e' almeno una barra con un valore > 0 (altrimenti il grafico mostra «nessun dato» invece di barre piatte).
  qualcosa: boolean;
  // Almeno una barra `settimanale`: allora la legenda ha la voce «Totale della settimana, messo sul lunedì».
  settimanali: boolean;
}

function nomi(i: IntervalloSerie, passo: PassoSerie, quante: number, anniDiversi: boolean): { etichetta: string; nome: string } {
  const d = daIso(i.inizio);
  if (passo === "GIORNO") {
    return { etichetta: quante <= 7 ? `${GIORNI_BREVI[d.getDay()]} ${d.getDate()}` : String(d.getDate()), nome: `${dataGiorno(i.inizio)} ${d.getFullYear()}` };
  }
  if (passo === "SETTIMANA") {
    const n = numeroSettimanaIso(lunediDi(i.inizio));
    return { etichetta: `S${n}`, nome: `Settimana ${n} (${etichettaIntervallo("settimana", { da: i.inizio, a: i.fine })})` };
  }
  const mese = MESI[d.getMonth()] ?? "";
  return { etichetta: anniDiversi && d.getMonth() === 0 ? `${mese} ${String(d.getFullYear()).slice(2)}` : mese, nome: etichettaIntervallo("mese", { da: i.inizio, a: i.fine }) };
}

// Con ordini ma nessun incasso registrato (ricavi dei giorni con dati = 0) lo scontrino non e' «€ 0,00» ma «—» con l'avviso, come in
// «Pizze e ordini» (scontrinoGiorno, util/pizzeOrdini.ts): quasi sempre l'incasso e' registrato in un altro giorno.
function testoPizze(i: IntervalloSerie, passo: PassoSerie): string {
  const parti = [`${testoConteggio(i.pizze)} pizze`, `${testoConteggio(i.ordini)} ordini`];
  if (i.ordini > 0 && i.ricaviConDatiCent === 0) parti.push("scontrino —", passo === "GIORNO" ? "nessun incasso registrato in questo giorno" : "nessun incasso registrato");
  else if (i.scontrinoMedioCent !== null) parti.push(`scontrino ${euro(i.scontrinoMedioCent)}`);
  return parti.join(" · ");
}

// Le barre del grafico per la misura scelta. Le pizze di un intervallo senza dati inseriti non sono «0»: hanno lo stato senzaDati
// (si disegnano diverse). I ricavi ci sono sempre (sono i movimenti): zero e' zero. Gli intervalli che iniziano dopo oggi sono futuri.
export function barreGrafico(intervalli: readonly IntervalloSerie[], passo: PassoSerie, misura: MisuraGrafico, oggi: string): DatiGrafico {
  const anniDiversi = intervalli.length > 0 && intervalli[0]!.inizio.slice(0, 4) !== intervalli[intervalli.length - 1]!.inizio.slice(0, 4);
  const valori = intervalli.map((i) => (misura === "pizze" ? Math.max(i.pizze, 0) : Math.max(i.ricaviTotaliCent, 0)));
  const scala = scalaDaZero(Math.max(0, ...valori), misura === "pizze" ? 1 : 100);
  const n = intervalli.length;
  // I lunedi' che portano un totale della settimana: i giorni dopo, senza dati loro, sono «nel totale», non «non inseriti».
  const lunediConTotale = new Set(passo === "GIORNO" && misura === "pizze" ? intervalli.filter((i) => i.daTotaleSettimanale).map((i) => i.inizio) : []);
  const ogni = (massimo: number) => Math.max(1, Math.ceil(n / massimo));
  const barre = intervalli.map((i, k): Barra => {
    const futuro = i.inizio > oggi;
    const stato = futuro ? "futuro" : misura === "pizze" && !i.conDati ? (lunediConTotale.has(lunediDi(i.inizio)) ? "nelTotale" : "senzaDati") : "dati";
    const valore = stato === "dati" ? valori[k]! : 0;
    const extra = misura === "ricavi" && stato === "dati" ? Math.min(Math.max(i.ricaviExtraCent, 0), valore) : 0;
    const testo =
      stato === "futuro"
        ? "non ancora"
        : stato === "nelTotale"
          ? "nel totale della settimana, messo sul lunedì"
          : stato === "senzaDati"
          ? "pizze e ordini non inseriti"
          : misura === "pizze"
            ? testoPizze(i, passo)
            : extra > 0
              ? `${euro(valore)}, di cui extra ${euro(extra)}`
              : euro(valore);
    const dallUltima = n - 1 - k;
    const settimanale = passo === "GIORNO" && misura === "pizze" && stato === "dati" && i.daTotaleSettimanale;
    return {
      inizio: i.inizio,
      fine: i.fine,
      ...nomi(i, passo, n, anniDiversi),
      stato,
      valore,
      extra,
      altezza: valore / scala.cima,
      altezzaExtra: extra / scala.cima,
      testo: settimanale ? `${testo} · totale della settimana, messo sul lunedì` : testo,
      settimanale,
      etichettaTelefono: dallUltima % ogni(7) === 0,
      etichettaComputer: dallUltima % ogni(14) === 0,
    };
  });
  return { barre, scala, qualcosa: barre.some((b) => b.valore > 0), settimanali: barre.some((b) => b.settimanale) };
}

// La barra mostrata all'inizio nel dettaglio: l'ultima che non e' nel futuro.
export function barraIniziale(barre: readonly Barra[]): number {
  for (let i = barre.length - 1; i >= 0; i--) if (barre[i]!.stato !== "futuro") return i;
  return barre.length - 1;
}
