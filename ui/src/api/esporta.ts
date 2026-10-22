// Esportazione Excel/CSV (docs/api.md, «Esportazione (fase 3)»).
import { ErroreRichiesta, stringaQuery } from "./client";
import type { CorpoErrore, Documento, Movimento, Origine, Tipo } from "./tipi";
import { numeroCent } from "../util/formato";

export type FormatoFile = "xlsx" | "csv";

export const TIPI_ESPORTAZIONE: { tipo: Tipo; etichetta: string }[] = [
  { tipo: "RICAVO", etichetta: "Ricavi" },
  { tipo: "COSTO_VARIABILE", etichetta: "Costi variabili" },
  { tipo: "COSTO_FISSO", etichetta: "Costi fissi" },
];

// Le etichette scritte nel file (le stesse del servizio).
const TIPO_FILE: Record<Tipo, string> = { RICAVO: "Ricavo", COSTO_VARIABILE: "Costo variabile", COSTO_FISSO: "Costo fisso" };
const TIPO_ANTEPRIMA_EXCEL: Record<Tipo, string> = { RICAVO: "ricavo", COSTO_VARIABILE: "variabile", COSTO_FISSO: "fisso" };
const DOCUMENTO_FILE: Record<Documento, string> = {
  RICAVO_FATTURATO: "Fatturato",
  RICAVO_EXTRA: "Extra",
  FATTURA: "Fattura",
  SCONTRINO: "Scontrino",
  RETRIBUZIONE_REGOLARE: "Retribuzione regolare",
  RETRIBUZIONE_EXTRA: "Retribuzione extra",
  NESSUNO: "-",
};
export const ORIGINE_FILE: Record<Origine, string> = { MANO: "A mano", XML: "XML", RICORRENZA: "Ricorrenza" };

export const RIGHE_ANTEPRIMA = 7;

export interface ParametriEsportazione {
  formato: FormatoFile;
  da: string;
  a: string;
  tipi: Tipo[];
}

// Il nome previsto del file, come lo manda il servizio.
export function nomeFileEsportazione({ formato, da, a }: Pick<ParametriEsportazione, "formato" | "da" | "a">): string {
  return `contabilita-${da}_${a}.${formato}`;
}

export function urlEsportazione({ formato, da, a, tipi }: ParametriEsportazione): string {
  return `/api/esporta${stringaQuery({ formato, da, a, includi: tipi.join(",") })}`;
}

export interface RigaAnteprima {
  id: number;
  data: string;
  tipo: string;
  fornitore: string;
  documento: string;
  importo: string;
  negativo: boolean;
}

// Importo con segno (costi negativi) come nel file: Excel mostra il numero
// formattato all'italiana, il CSV la virgola decimale senza separatori.
function importoPerFile(m: Movimento, formato: FormatoFile): string {
  const negativo = m.tipo !== "RICAVO";
  if (formato === "xlsx") {
    const testo = numeroCent(m.importoCent);
    return negativo ? `−${testo}` : testo;
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
    data: m.data,
    tipo: formato === "xlsx" ? TIPO_ANTEPRIMA_EXCEL[m.tipo] : TIPO_FILE[m.tipo],
    fornitore: m.fornitore?.nome ?? "",
    documento: DOCUMENTO_FILE[m.documento],
    importo: importoPerFile(m, formato),
    negativo: m.tipo !== "RICAVO",
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
