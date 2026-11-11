// Esportazione Excel/CSV (docs/api.md, «Esportazione (fase 3)»).
import { ErroreRichiesta, stringaQuery } from "./client";
import type { CorpoErrore, Documento, Movimento, Origine, Riepilogo, Tipo, VoceRiepilogo } from "./tipi";
import { numeroCent } from "../util/formato";

export type FormatoFile = "xlsx" | "csv";

export const TIPI_ESPORTAZIONE: { tipo: Tipo; etichetta: string }[] = [
  { tipo: "RICAVO", etichetta: "Ricavi" },
  { tipo: "COSTO_VARIABILE", etichetta: "Costi variabili" },
  { tipo: "COSTO_FISSO", etichetta: "Costi fissi" },
];

// Le colonne del foglio «Movimenti» e del CSV, nell'ordine del file, e le etichette scritte nel file: le stesse del servizio
// (EsportazioneService: INTESTAZIONI ed etichetta). Le usano l'anteprima qui sotto e il servizio finto della demo, cosi' non divergono.
export const INTESTAZIONI_FILE = ["Data", "Tipo", "Documento", "Categoria", "Fornitore", "Dipendente", "Descrizione", "N. documento", "Note", "Importo", "Origine", "Sede"];
export const TIPO_FILE: Record<Tipo, string> = { RICAVO: "Ricavo", COSTO_VARIABILE: "Costo variabile", COSTO_FISSO: "Costo fisso" };
export const DOCUMENTO_FILE: Record<Documento, string> = {
  RICAVO_FATTURATO: "Fatturato",
  RICAVO_EXTRA: "Extra",
  FATTURA: "Fattura",
  NOTA_DI_CREDITO: "Nota di credito",
  SCONTRINO: "Scontrino",
  RETRIBUZIONE_REGOLARE: "Retribuzione regolare",
  RETRIBUZIONE_EXTRA: "Retribuzione extra",
  NESSUNO: "-",
};
export const ORIGINE_FILE: Record<Origine, string> = { MANO: "A mano", XML: "Fattura elettronica", RICORRENZA: "Ricorrenza" };

// Il foglio «Riepilogo» dell'Excel, come lo scrive il servizio (EsportazioneService.voci e scriviRiepilogo): per ogni sezione una riga per
// categoria, il totale e le somme per documento (gia' comprese nel totale), poi «Costi» e «Risultato». I nomi delle righe fisse stanno qui.
export const RIEPILOGO_FILE = {
  titolo: (da: string, a: string) => `Riepilogo dal ${da} al ${a}`,
  voce: "Voce",
  importo: "Importo",
  totale: "Totale",
  totaleRicavi: "Totale ricavi",
  ricaviFatturati: "Ricavi fatturati",
  ricaviExtra: "Ricavi extra",
  totaleCostiVariabili: "Totale costi variabili",
  fatture: "Fatture",
  scontrini: "Scontrini",
  totaleCostiFissi: "Totale costi fissi",
  retribuzioneRegolare: "Retribuzione regolare",
  retribuzioneExtra: "Retribuzione extra",
  costi: "Costi",
  risultato: "Risultato",
} as const;

type VoceFile = [nome: string, importoCent: (x: Riepilogo) => number, totale?: true];

// Le voci del foglio «Riepilogo» nell'ordine del file (EsportazioneService.voci); `totale` segna le righe che il servizio scrive in grassetto.
function vociRiepilogo(r: Riepilogo): VoceFile[] {
  const N = RIEPILOGO_FILE;
  const perCategoria = (voci: VoceRiepilogo[], id: number | null) => voci.filter((v) => v.id === id).reduce((s, v) => s + v.importoCent, 0);
  return [
    ...r.ricavi.voci.map((c): VoceFile => [c.categoria, (x) => perCategoria(x.ricavi.voci, c.id)]),
    [N.totaleRicavi, (x) => x.ricavi.totaleCent, true],
    [N.ricaviFatturati, (x) => x.ricavi.fatturatiCent],
    [N.ricaviExtra, (x) => x.ricavi.extraCent],
    ...r.costiVariabili.voci.map((c): VoceFile => [c.categoria, (x) => perCategoria(x.costiVariabili.voci, c.id)]),
    [N.totaleCostiVariabili, (x) => x.costiVariabili.totaleCent, true],
    [N.fatture, (x) => x.costiVariabili.fattureCent],
    [N.scontrini, (x) => x.costiVariabili.scontriniCent],
    ...r.costiFissi.voci.map((c): VoceFile => [c.categoria, (x) => perCategoria(x.costiFissi.voci, c.id)]),
    [N.totaleCostiFissi, (x) => x.costiFissi.totaleCent, true],
    [N.retribuzioneRegolare, (x) => x.costiFissi.retribuzioneRegolareCent],
    [N.retribuzioneExtra, (x) => x.costiFissi.retribuzioneExtraCent],
    [N.costi, (x) => x.costiCent, true],
    [N.risultato, (x) => x.risultatoCent, true],
  ];
}

// Quante righe ha il foglio «Riepilogo» prima delle voci: titolo, riga vuota, intestazione. Le scrive `righeFoglioRiepilogo`, che le
// conta con questa costante (un test controlla che coincidano).
export const RIGHE_PRIMA_DELLE_VOCI = 3;

// Gli indici (da 0) delle righe del foglio «Riepilogo» che sono totali: il servizio le scrive in grassetto. Si riconoscono dal posto, non
// dal nome: una categoria puo' chiamarsi «Costi».
export function righeTotaliRiepilogo(r: Riepilogo): number[] {
  return vociRiepilogo(r).flatMap(([, , totale], i) => (totale ? [RIGHE_PRIMA_DELLE_VOCI + i] : []));
}

// Le righe del foglio «Riepilogo», cella per cella: il titolo, una riga vuota, l'intestazione («Voce» e «Importo», oppure una colonna per
// sede e «Totale») e le voci. `r` e' il Riepilogo complessivo e decide le righe; `sedi` sono i Riepiloghi delle singole sedi (vuoto = una
// colonna sola): dove una sede non ha la categoria l'importo e' 0. Gli importi sono in euro con il segno di GET /api/riepilogo: i costi
// sono positivi, come nel servizio.
export function righeFoglioRiepilogo(r: Riepilogo, sedi: { nome: string; riepilogo: Riepilogo }[] = []): (string | number)[][] {
  const N = RIEPILOGO_FILE;
  const colonne = [...sedi.map((s) => s.riepilogo), r];
  const prima: (string | number)[][] = [[N.titolo(r.da, r.a)], [], [N.voce, ...sedi.map((s) => s.nome), sedi.length === 0 ? N.importo : N.totale]];
  // righeTotaliRiepilogo e chi da' gli stili alle righe contano su questo numero
  if (prima.length !== RIGHE_PRIMA_DELLE_VOCI) throw new Error("Il foglio Riepilogo deve avere RIGHE_PRIMA_DELLE_VOCI righe prima delle voci.");
  return [...prima, ...vociRiepilogo(r).map(([nome, importo]) => [nome, ...colonne.map((x) => importo(x) / 100)])];
}

export const RIGHE_ANTEPRIMA = 7;

export interface ParametriEsportazione {
  formato: FormatoFile;
  da: string;
  a: string;
  tipi: Tipo[];
  // «1,2»: le sedi scelte. Assente = tutte.
  sedi?: string;
  // Solo Excel: nel foglio Riepilogo una colonna per sede più «Totale» (il CSV lo ignora).
  colonnePerSede?: boolean;
  // Solo Excel: con false il file non ha il foglio «Statistiche» (pizze, ordini, scontrino medio).
  statistiche?: boolean;
}

// Il nome previsto del file, come lo manda il servizio.
export function nomeFileEsportazione({ formato, da, a }: Pick<ParametriEsportazione, "formato" | "da" | "a">): string {
  return `contabilita-${da}_${a}.${formato}`;
}

// Le opzioni dell'Excel si mandano solo per l'Excel e solo quando sono state scelte (il servizio ha i suoi predefiniti).
export function urlEsportazione({ formato, da, a, tipi, sedi, colonnePerSede, statistiche }: ParametriEsportazione): string {
  const excel = formato === "xlsx";
  return `/api/esporta${stringaQuery({
    formato,
    da,
    a,
    includi: tipi.join(","),
    sedi,
    colonnePerSede: excel && colonnePerSede !== undefined ? String(colonnePerSede) : undefined,
    statistiche: excel && statistiche !== undefined ? String(statistiche) : undefined,
  })}`;
}

export interface RigaAnteprima {
  id: number;
  data: string;
  tipo: string;
  fornitore: string;
  documento: string;
  sede: string;
  importo: string;
  negativo: boolean;
}

// Il segno dell'importo nel file (EsportazioneService.riga e il servizio finto della demo): i costi sono negativi, i ricavi positivi e
// la nota di credito, che e' un costo variabile ma riduce i costi, e' positiva (docs/api.md, «Nota di credito»).
export function negativoNelFile(m: Pick<Movimento, "tipo" | "documento">): boolean {
  return m.tipo !== "RICAVO" && m.documento !== "NOTA_DI_CREDITO";
}

// Una riga del file, colonna per colonna come INTESTAZIONI_FILE, con i testi gia' in italiano. L'importo (posto 9) resta fuori: nel
// CSV e' un testo con la virgola, nell'Excel un numero; chi scrive il file lo mette fra `prima` e `dopo`.
export function testiRigaFile(m: Movimento): { prima: string[]; dopo: string[] } {
  return {
    prima: [m.data, TIPO_FILE[m.tipo], DOCUMENTO_FILE[m.documento], m.categoria?.nome ?? "", m.fornitore?.nome ?? "", m.dipendente?.nome ?? "", m.descrizione ?? "", m.numeroDocumento ?? "", m.note ?? ""],
    dopo: [ORIGINE_FILE[m.origine], m.sede.nome],
  };
}

// Importo con segno come nel file. Per il CSV e' il testo esatto del file (virgola decimale, nessun separatore, «-»: «-1234,50»). Per
// l'Excel il file contiene un numero col formato valuta «#,##0.00 [$€-410]» (EsportazioneService.FORMATO_VALUTA, demo/xlsx.ts): qui lo
// si mostra come lo mostra Excel in italiano, «-1.234,50 €» (trattino normale, non «−» U+2212; punto delle migliaia, virgola dei
// decimali, uno spazio e «€» dopo il numero). E' solo un formato di visualizzazione: valore e segno sono quelli del file.
function importoPerFile(m: Movimento, formato: FormatoFile): string {
  const negativo = negativoNelFile(m);
  if (formato === "xlsx") {
    const testo = `${numeroCent(Math.abs(m.importoCent))} €`;
    // uno zero non ha segno: Excel mostra «0,00 €» anche per un costo
    return negativo && m.importoCent !== 0 ? `-${testo}` : testo;
  }
  const testo = `${Math.floor(m.importoCent / 100)},${String(m.importoCent % 100).padStart(2, "0")}`;
  return negativo ? `-${testo}` : testo;
}

// Le prime righe del foglio «Movimenti»: stesso filtro per tipo e stesso
// ordine del file (data crescente, poi id).
export function righeAnteprima(movimenti: Movimento[], tipi: Tipo[], formato: FormatoFile): { righe: RigaAnteprima[]; totale: number } {
  const scelti = movimenti
    .filter((m) => tipi.includes(m.tipo))
    .sort((x, y) => (x.data === y.data ? x.id - y.id : x.data < y.data ? -1 : 1));
  const righe = scelti.slice(0, RIGHE_ANTEPRIMA).map((m) => ({
    id: m.id,
    // come nel file: testo «aaaa-mm-gg» nel CSV, cella data col formato «yyyy-mm-dd» nell'Excel
    data: m.data,
    tipo: TIPO_FILE[m.tipo],
    fornitore: m.fornitore?.nome ?? "",
    documento: DOCUMENTO_FILE[m.documento],
    sede: m.sede?.nome ?? "",
    importo: importoPerFile(m, formato),
    negativo: negativoNelFile(m),
  }));
  return { righe, totale: scelti.length };
}

function nomeDaIntestazione(valore: string | null, predefinito: string): string {
  const m = valore?.match(/filename="?([^";]+)"?/);
  return m?.[1] ?? predefinito;
}

// Scarica il file: se il servizio risponde con un errore (400...) si legge il
// messaggio e non si salva nulla.
export async function scaricaEsportazione(p: ParametriEsportazione): Promise<string> {
  const url = urlEsportazione(p);
  const risposta = await fetch(url);
  if (!risposta.ok) {
    let corpo: CorpoErrore | undefined;
    try {
      corpo = (await risposta.json()) as CorpoErrore;
    } catch {
      // corpo assente o non JSON
    }
    throw new ErroreRichiesta(url, risposta.status, corpo);
  }
  const nome = nomeDaIntestazione(risposta.headers.get("Content-Disposition"), nomeFileEsportazione(p));
  const blob = await risposta.blob();
  const indirizzo = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = indirizzo;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(indirizzo), 10_000);
  return nome;
}
