import { createContext } from "react";
import type { Sede } from "../api/tipi";
import type { ColoreSede } from "../util/sedi";

export interface InfoSede {
  id: number;
  nome: string;
  lettera: string;
  colore: ColoreSede;
  archiviata: boolean;
}

export interface ContestoSedi {
  // Falso finche' l'elenco delle sedi non e' arrivato (o ha dato errore: allora l'app va come con una sede sola).
  pronto: boolean;
  // Tutte le sedi, archiviate comprese, nell'ordine del servizio.
  sedi: Sede[];
  attive: Sede[];
  // Almeno due sedi attive: solo allora compaiono selettore, badge e «Per sede».
  piu: boolean;
  // Le sedi selezionate (sempre almeno una, fra le attive).
  selezionate: Sede[];
  tutteSelezionate: boolean;
  // Il filtro `sedi` per il servizio: niente se sono tutte.
  parametro: string | undefined;
  etichetta: string;
  // Quali sedi sono incluse, o null se sono tutte (per i titoli).
  incluse: string | null;
  sedePreselezionata: number | null;
  info: (id: number) => InfoSede | undefined;
  alterna: (id: number) => void;
  solo: (id: number) => void;
  tutte: () => void;
}

// Contesto da solo in un file suo, come contestoAvviso.ts (React Fast Refresh).
export const Contesto = createContext<ContestoSedi | null>(null);
