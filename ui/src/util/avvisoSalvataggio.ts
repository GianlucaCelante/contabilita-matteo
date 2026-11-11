// L'avviso dopo il salvataggio di un nuovo movimento (viste/NuovoMovimento.tsx), composto in un posto solo: cosi' tutte le varianti
// (normale, piu' sedi, allegato non caricato, allegato rifiutato, demo) dicono le stesse cose, compreso «Ora vedi …» quando il
// salvataggio ha spostato il periodo mostrato.
import { avvisoAllegatoNonCaricato, avvisoAllegatoRifiutato } from "./allegatoDemo";
import { etichettaIntervallo, intervalloDi } from "./formato";
import { fraseOraVedi, type SediDopoSalvataggio } from "./sedeDopoSalvataggio";

export interface EsitoSalvataggio {
  demo: boolean;
  // Quanti movimenti sono nati: piu' di uno con «Tutte, dividi».
  movimenti: number;
  // "nessuno": non c'era un file da caricare; "nonCaricato": c'era e il caricamento e' fallito (nella demo sempre).
  allegato: "nessuno" | "caricato" | "nonCaricato";
  // Il nome del file scelto e rifiutato dal campo; conta solo se non c'era un file buono al suo posto.
  rifiutato: string | null;
  // La data del movimento, se il periodo mostrato e' passato al suo mese (periodoDopoSalvataggio); null se non e' cambiato.
  dataSePeriodoCambiato: string | null;
  // Le sedi accese perche' il movimento si veda, e le personali rimaste spente (util/sedeDopoSalvataggio.ts); assente = niente da dire.
  sedi?: SediDopoSalvataggio | null;
}

// `errore`: l'avviso va in rosso (nell'app vera c'e' qualcosa da rifare dal dettaglio; nella demo gli allegati non esistono, non e' un errore).
export function avvisoMovimentoSalvato(e: EsitoSalvataggio): { testo: string; errore: boolean } {
  const periodo = e.dataSePeriodoCambiato ? etichettaIntervallo("mese", intervalloDi("mese", e.dataSePeriodoCambiato)).toLowerCase() : null;
  const dove = fraseOraVedi(periodo, e.sedi, e.movimenti > 1 ? "parte" : "uno");
  if (e.allegato === "nessuno" && e.rifiutato) return { testo: avvisoAllegatoRifiutato(e.demo, e.rifiutato, e.movimenti) + dove, errore: !e.demo };
  if (e.allegato === "nonCaricato") return { testo: avvisoAllegatoNonCaricato(e.demo, e.movimenti) + dove, errore: !e.demo };
  return { testo: (e.movimenti > 1 ? `Movimento diviso fra ${e.movimenti} sedi.` : "Movimento salvato.") + dove, errore: false };
}

// L'avviso dopo la conferma di un'importazione di fatture (viste/ImportaFatture.tsx). `cosa`: «documenti» se fra le righe ci sono
// note di credito, altrimenti «fatture». `oraVedi`: l'etichetta del periodo se e' stato spostato su quello dei documenti importati
// (periodoDopoImportazione), null se non e' cambiato. `sedi`: come per un nuovo movimento (la sede dell'importazione accesa, o
// personale e rimasta spenta).
export function avvisoImportazione(e: { importati: number; cosa: "documenti" | "fatture"; nonAggiunte: number; motivo: string | null; oraVedi: string | null; sedi?: SediDopoSalvataggio | null }): string {
  const quanti = e.importati === 1 ? "Importato 1 documento" : e.cosa === "fatture" ? `Importate ${e.importati} fatture` : `Importati ${e.importati} documenti`;
  const non = e.nonAggiunte > 0 ? `; ${e.nonAggiunte === 1 ? "1 non è stata aggiunta" : `${e.nonAggiunte} non sono state aggiunte`} (${e.motivo ?? "già presenti"})` : "";
  return `${quanti}${non}.${fraseOraVedi(e.oraVedi, e.sedi, e.importati === 1 ? "uno" : "piu")}`;
}
