// Importazione di fatture elettroniche (docs/api.md, «Importazione di fatture elettroniche (fase 4)»).
// Tipi e chiamate stanno qui, fuori da client.ts: il caricamento e' multipart (niente Content-Type
// JSON, lo mette il browser con il boundary).
import { ErroreRichiesta } from "./client";
import type { CorpoErrore } from "./tipi";

export interface FatturaLetta {
  indice: number;
  nomeFile: string;
  fornitore: { nome: string; partitaIva: string | null };
  numero: string;
  data: string;
  imponibileCent: number;
  ivaCent: number;
  totaleCent: number;
  categoriaSuggerita: string | null;
  duplicata: boolean;
  motivo: string | null;
  // Una nota di credito si importa come ricavo extra, non come fattura.
  notaDiCredito: boolean;
}

export interface ErroreFileImportato {
  nomeFile: string;
  messaggio: string;
}

export interface AnteprimaImportazione {
  importazioneId: string;
  fatture: FatturaLetta[];
  errori: ErroreFileImportato[];
}

export interface RigaConferma {
  indice: number;
  categoria: string | null;
}

export interface EsitoConferma {
  importati: number;
  ignorate: { indice: number; motivo: string }[];
}

async function leggiRisposta<T>(percorso: string, risposta: Response): Promise<T> {
  if (!risposta.ok) {
    let corpo: CorpoErrore | undefined;
    try {
      corpo = (await risposta.json()) as CorpoErrore;
    } catch {
      // corpo assente o non JSON: si resta senza dettaglio
    }
    throw new ErroreRichiesta(percorso, risposta.status, corpo);
  }
  return (await risposta.json()) as T;
}

export const apiImporta = {
  anteprima: async (file: File[]): Promise<AnteprimaImportazione> => {
    const corpo = new FormData();
    for (const f of file) corpo.append("files", f, f.name);
    const risposta = await fetch("/api/importa/anteprima", { method: "POST", body: corpo });
    return leggiRisposta<AnteprimaImportazione>("/importa/anteprima", risposta);
  },
  conferma: async (importazioneId: string, righe: RigaConferma[]): Promise<EsitoConferma> => {
    const risposta = await fetch("/api/importa/conferma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importazioneId, righe }),
    });
    return leggiRisposta<EsitoConferma>("/importa/conferma", risposta);
  },
};

// Il collegamento per aprire l'allegato di un movimento (XML della fattura, foto o PDF).
export function urlAllegato(idMovimento: number): string {
  return `/api/movimenti/${idMovimento}/allegato`;
}
