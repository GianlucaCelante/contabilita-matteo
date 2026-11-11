import { createContext } from "react";
import type { Sede } from "../api/tipi";
import type { ColoreSede } from "../util/sedi";

export interface InfoSede {
  id: number;
  nome: string;
  lettera: string;
  colore: ColoreSede;
  archiviata: boolean;
  // Sede personale (spese dei titolari): si mostra col contrassegno «Personale».
  personale: boolean;
}

export interface ContestoSedi {
  // Falso finche' l'elenco delle sedi non e' arrivato (o ha dato errore: allora l'app va come con una sede sola).
  pronto: boolean;
  // Tutte le sedi, archiviate comprese, nell'ordine del servizio.
  sedi: Sede[];
  attive: Sede[];
  // Le sedi del locale: le attive non personali (pizze e ordini, «Tutte, dividi», «Tutte le sedi»).
  locale: Sede[];
  // Almeno due sedi attive, personali comprese: solo allora compaiono selettore, badge e la scelta della sede nei moduli.
  piu: boolean;
  // Almeno due sedi del locale: pizze e ordini per sede, «Per sede», «Tutte, dividi».
  piuLocale: boolean;
  // Le sedi del selettore: le attive (locale, poi personali) e le personali archiviate con movimenti.
  selezionabili: Sede[];
  // Almeno due sedi selezionabili: solo allora c'e' il selettore.
  selettore: boolean;
  // Le sedi selezionate (sempre almeno una, fra le selezionabili; una personale solo se scelta a mano).
  selezionate: Sede[];
  // La selezione e' esattamente il locale («Tutte le sedi»).
  tutteSelezionate: boolean;
  // Il filtro `sedi` per il servizio: niente se e' il locale; esplicito se c'e' una personale.
  parametro: string | undefined;
  etichetta: string;
  // Quali sedi sono incluse, o null se sono tutte (per i titoli).
  incluse: string | null;
  info: (id: number) => InfoSede | undefined;
  alterna: (id: number) => void;
  solo: (id: number) => void;
  tutte: () => void;
  // Accende altre sedi senza spegnere quelle selezionate (dopo un salvataggio su una sede che non si stava guardando).
  aggiungi: (ids: readonly number[]) => void;
  // Toglie una sede dalla scelta salvata (quando diventa personale in Impostazioni).
  togliDallaScelta: (id: number) => void;
}

// Contesto da solo in un file suo, come contestoAvviso.ts (React Fast Refresh).
export const Contesto = createContext<ContestoSedi | null>(null);
