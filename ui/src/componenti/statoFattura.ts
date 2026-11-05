import type { ComponentType } from "react";
import type { StatoFattura } from "../api/tipi";
import type { TonoStato, TonoVoce } from "../util/fatture";
import { IconaAllarme, IconaInviata, IconaOrologio, IconaSpunta, type ProprietaIcona } from "./Icone";

// Lo stato di una fattura si legge da tre cose insieme: la parola, la forma dell'icona e il colore (mai solo il colore).
// «Da fare» ha l'orologio (ambra); se il mese e' passato diventa il triangolo rosso; «Emessa» l'aeroplanino; «Pagata» la spunta (verde).
// «inattiva»: un mese prima della creazione della casella; neutro, senza icona (si scrive «—»).
export const CLASSI_TONO: Record<TonoVoce, string> = {
  inattiva: "bg-sabbia text-spento border-bordo",
  fare: "bg-ambrachiaro text-ambra border-ambrabordo",
  ritardo: "bg-rossochiaro text-rosso border-rossobordo",
  emessa: "bg-sabbia text-testo border-bordo2",
  pagata: "bg-verdechiaro text-verdescuro border-verdebordo",
};

export function iconaStato(stato: StatoFattura, tono: TonoStato): ComponentType<ProprietaIcona> {
  if (stato === "PAGATA") return IconaSpunta;
  if (stato === "EMESSA") return IconaInviata;
  return tono === "ritardo" ? IconaAllarme : IconaOrologio;
}
