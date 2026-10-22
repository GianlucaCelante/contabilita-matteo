// Tipi del contratto API (docs/api.md): nomi dei campi alla lettera.
// Importi sempre in centesimi interi e positivi (il segno lo da' il tipo).

export type Tipo = "RICAVO" | "COSTO_VARIABILE" | "COSTO_FISSO";
export type Documento =
  | "RICAVO_FATTURATO"
  | "RICAVO_EXTRA"
  | "FATTURA"
  | "SCONTRINO"
  | "RETRIBUZIONE_REGOLARE"
  | "RETRIBUZIONE_EXTRA"
  | "NESSUNO";
export type Origine = "MANO" | "XML" | "RICORRENZA";
export type Ambito = "SOLO_QUESTO" | "QUESTO_E_PROSSIMI";

export interface CorpoErrore {
  errore: string;
}

export interface Categoria {
  id: number;
  nome: string;
  tipo: Tipo;
}
export interface Fornitore {
  id: number;
  nome: string;
  partitaIva: string | null;
}
export interface Dipendente {
  id: number;
  nome: string;
}
export interface RifNome {
  id: number;
  nome: string;
}

export interface RicorrenzaMovimento {
  id: number;
  giorno: number;
  attiva: boolean;
}

export interface Movimento {
  id: number;
  data: string;
  tipo: Tipo;
  documento: Documento;
  importoCent: number;
  categoria: RifNome | null;
  fornitore: RifNome | null;
  dipendente: RifNome | null;
  descrizione: string | null;
  numeroDocumento: string | null;
  note: string | null;
  origine: Origine;
  ricorrenza: RicorrenzaMovimento | null;
  allegatoNome: string | null;
  // ISO AAAA-MM-GGTHH:MM:SS; modificatoIl e' null se il movimento non e' mai stato modificato.
  creatoIl: string;
  modificatoIl: string | null;
}

export interface MovimentoInput {
  data: string;
  tipo: Tipo;
  documento: Documento;
  importoCent: number;
  categoria?: string;
  fornitore?: string;
  dipendente?: string;
  descrizione?: string;
  numeroDocumento?: string;
  note?: string;
  ricorrenza?: { giorno: number } | null;
}

export interface TotaliMovimenti {
  ricaviCent: number;
  costiCent: number;
  saldoCent: number;
}
export interface ElencoMovimenti {
  elementi: Movimento[];
  totali: TotaliMovimenti;
}

export interface FiltroMovimenti {
  da?: string;
  a?: string;
  tipo?: Tipo;
  q?: string;
  dipendente?: number;
}

export interface Riepilogo {
  da: string;
  a: string;
  ricavi: { fatturatiCent: number; extraCent: number; totaleCent: number };
  costiVariabili: { fattureCent: number; scontriniCent: number; totaleCent: number };
  costiFissi: {
    retribuzioneRegolareCent: number;
    retribuzioneExtraCent: number;
    altreVoci: { categoria: string; importoCent: number }[];
    totaleCent: number;
  };
  costiCent: number;
  risultatoCent: number;
}

export interface IndirizzoRete {
  ip: string;
  tipo: "WIFI" | "CAVO" | "ALTRO";
}
export interface Rete {
  porta: number;
  indirizzi: IndirizzoRete[];
}
export interface Programma {
  versione: string;
  cartellaBackup: string;
  ultimoBackup: { quando: string; cartella: string } | null;
}

// Una copia di sicurezza trovata nella cartella delle copie (GET /api/programma/copie).
export interface CopiaBackup {
  nome: string;
  quando: string;
  dimensioneByte: number;
}
export interface RispostaRipristino {
  riavvio: boolean;
  copiaDiSicurezza: string;
}
