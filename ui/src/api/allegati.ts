// Upload e rimozione manuale dell'allegato di un movimento (docs/api.md, «Allegati (fase 4)»).
// Il caricamento e' multipart: niente Content-Type JSON, lo mette il browser con il boundary.
import { ErroreRichiesta } from "./client";
import type { CorpoErrore, Movimento } from "./tipi";

async function controlla(percorso: string, risposta: Response): Promise<Response> {
  if (!risposta.ok) {
    let corpo: CorpoErrore | undefined;
    try {
      corpo = (await risposta.json()) as CorpoErrore;
    } catch {
      // corpo assente o non JSON
    }
    throw new ErroreRichiesta(percorso, risposta.status, corpo);
  }
  return risposta;
}

export const apiAllegati = {
  carica: async (idMovimento: number, file: File): Promise<Movimento> => {
    const percorso = `/movimenti/${idMovimento}/allegato`;
    const corpo = new FormData();
    corpo.append("file", file, file.name);
    const risposta = await controlla(percorso, await fetch(`/api${percorso}`, { method: "POST", body: corpo }));
    return (await risposta.json()) as Movimento;
  },
  rimuovi: async (idMovimento: number): Promise<void> => {
    const percorso = `/movimenti/${idMovimento}/allegato`;
    await controlla(percorso, await fetch(`/api${percorso}`, { method: "DELETE" }));
  },
};
