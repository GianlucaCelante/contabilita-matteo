// Formattazione italiana di importi, date e periodi. Importi in centesimi.

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

function conPunti(intero: number): string {
  return String(intero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// 123456 -> "1.234,56" (senza simbolo, con il meno se negativo)
export function numeroCent(cent: number): string {
  const assoluto = Math.abs(Math.round(cent));
  const testo = `${conPunti(Math.floor(assoluto / 100))},${String(assoluto % 100).padStart(2, "0")}`;
  return cent < 0 ? `−${testo}` : testo;
}

// 123456 -> "€ 1.234,56"; -5000 -> "−€ 50,00"
export function euro(cent: number): string {
  const assoluto = numeroCent(Math.abs(cent));
  return cent < 0 ? `−€ ${assoluto}` : `€ ${assoluto}`;
}

// Con il segno esplicito dei movimenti: "+ € 10,00" / "− € 10,00".
export function euroConSegno(cent: number, ricavo: boolean): string {
  return `${ricavo ? "+" : "−"} € ${numeroCent(Math.abs(cent))}`;
}

// Quello che si scrive in un campo importo, in centesimi interi; null se non valido.
// Accetta "86", "86,5", "86,50", "1.234,56", "86.50".
export function leggiEuro(testo: string): number | null {
  let t = testo.replace(/[€\s]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

// Il valore di un campo importo a partire dai centesimi: "1234,50".
export function euroPerCampo(cent: number): string {
  return `${Math.floor(cent / 100)},${String(cent % 100).padStart(2, "0")}`;
}

export function percentuale(parte: number, totale: number): string {
  if (totale <= 0) return "–";
  return `${(Math.round((parte / totale) * 1000) / 10).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// ---- date ISO (yyyy-MM-dd), senza fuso ----

const due = (n: number) => String(n).padStart(2, "0");

export function isoDa(d: Date): string {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}
export function daIso(iso: string): Date {
  const [a, m, g] = iso.split("-").map(Number);
  return new Date(a ?? 1970, (m ?? 1) - 1, g ?? 1);
}
export function oggiIso(): string {
  return isoDa(new Date());
}
export function dataValida(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && isoDa(daIso(iso)) === iso;
}
export function aggiungiGiorni(iso: string, giorni: number): string {
  const d = daIso(iso);
  d.setDate(d.getDate() + giorni);
  return isoDa(d);
}
export function ultimoGiornoMese(anno: number, mese0: number): number {
  return new Date(anno, mese0 + 1, 0).getDate();
}
export function aggiungiMesi(iso: string, mesi: number): string {
  const d = daIso(iso);
  const giorno = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + mesi);
  d.setDate(Math.min(giorno, ultimoGiornoMese(d.getFullYear(), d.getMonth())));
  return isoDa(d);
}

// "2026-10-21" -> "21/10/2026"
export function dataBreve(iso: string): string {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}
// "2026-10-21" -> "21/10" oppure, con l'anno, "21/10/26"
export function dataRiga(iso: string, conAnno: boolean): string {
  const [a, m, g] = iso.split("-");
  return conAnno ? `${g}/${m}/${(a ?? "").slice(2)}` : `${g}/${m}`;
}
// "2026-10-21" -> "Mercoledì 21 ottobre"
export function dataGiorno(iso: string): string {
  const d = daIso(iso);
  const testo = `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}
// "2026-10-21T03:00:00" -> "21/10/2026 alle 03:00" (se non e' una data valida, il testo com'e')
export function dataOra(testo: string): string {
  const d = new Date(testo);
  if (Number.isNaN(d.getTime())) return testo;
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} alle ${due(d.getHours())}:${due(d.getMinutes())}`;
}

// 1234567 -> "1,2 MB"; 900 -> "900 byte"
export function dimensioneLeggibile(byte: number): string {
  if (byte < 1024) return `${byte} byte`;
  const unita = ["KB", "MB", "GB"];
  let valore = byte / 1024;
  let i = 0;
  while (valore >= 1024 && i < unita.length - 1) {
    valore /= 1024;
    i++;
  }
  return `${valore.toLocaleString("it-IT", { maximumFractionDigits: 1 })} ${unita[i]}`;
}

// ---- periodi ----

export type TipoPeriodo = "settimana" | "mese" | "anno" | "periodo";

export interface Intervallo {
  da: string;
  a: string;
}

export function lunediDi(iso: string): string {
  const d = daIso(iso);
  const giorno = (d.getDay() + 6) % 7; // lunedi' = 0
  return aggiungiGiorni(iso, -giorno);
}

// L'intervallo di un tipo di periodo che contiene il giorno `riferimento`.
export function intervalloDi(tipo: Exclude<TipoPeriodo, "periodo">, riferimento: string): Intervallo {
  const d = daIso(riferimento);
  if (tipo === "settimana") {
    const da = lunediDi(riferimento);
    return { da, a: aggiungiGiorni(da, 6) };
  }
  if (tipo === "mese") {
    return {
      da: isoDa(new Date(d.getFullYear(), d.getMonth(), 1)),
      a: isoDa(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    };
  }
  return { da: `${d.getFullYear()}-01-01`, a: `${d.getFullYear()}-12-31` };
}

// Sposta il giorno di riferimento di un periodo avanti (+1) o indietro (-1).
export function spostaRiferimento(tipo: Exclude<TipoPeriodo, "periodo">, riferimento: string, verso: 1 | -1): string {
  if (tipo === "settimana") return aggiungiGiorni(riferimento, 7 * verso);
  if (tipo === "mese") return aggiungiMesi(`${riferimento.slice(0, 8)}01`, verso);
  return aggiungiMesi(`${riferimento.slice(0, 4)}-01-01`, 12 * verso);
}

// "12 – 18 ottobre 2026", "28 settembre – 4 ottobre 2026", "Ottobre 2026", "2026".
export function etichettaIntervallo(tipo: TipoPeriodo, { da, a }: Intervallo): string {
  const d = daIso(da);
  const f = daIso(a);
  if (tipo === "anno") return String(d.getFullYear());
  if (tipo === "mese") {
    const m = MESI[d.getMonth()] ?? "";
    return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getFullYear()}`;
  }
  if (tipo === "settimana") {
    const finale = `${f.getDate()} ${MESI[f.getMonth()]} ${f.getFullYear()}`;
    if (d.getFullYear() !== f.getFullYear()) return `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()} – ${finale}`;
    if (d.getMonth() !== f.getMonth()) return `${d.getDate()} ${MESI[d.getMonth()]} – ${finale}`;
    return `${d.getDate()} – ${finale}`;
  }
  return `${dataBreve(da)} – ${dataBreve(a)}`;
}

// "Sett. 19 – 25 ott" per il riquadro «Dove finisce».
export function settimanaBreve({ da, a }: Intervallo): string {
  const d = daIso(da);
  const f = daIso(a);
  const mese = (x: Date) => (MESI[x.getMonth()] ?? "").slice(0, 3);
  return d.getMonth() === f.getMonth()
    ? `Sett. ${d.getDate()} – ${f.getDate()} ${mese(f)}`
    : `Sett. ${d.getDate()} ${mese(d)} – ${f.getDate()} ${mese(f)}`;
}

export const NOME_PERIODO: Record<TipoPeriodo, string> = {
  settimana: "della settimana",
  mese: "del mese",
  anno: "dell'anno",
  periodo: "del periodo",
};
