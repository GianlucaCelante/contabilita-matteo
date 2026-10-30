import type { UnitaRipetizione } from "../util/ripetizione";
// Tipi del contratto API (docs/api.md): nomi dei campi alla lettera.
// Importi sempre in centesimi interi e positivi (il segno lo da' il tipo).

export type Tipo = "RICAVO" | "COSTO_VARIABILE" | "COSTO_FISSO";
export type Documento =
  | "RICAVO_FATTURATO"
  | "RICAVO_EXTRA"
  | "FATTURA"
  | "NOTA_DI_CREDITO"
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
  // Vero per le categorie create da chi usa l'app (dal movimento o a mano): solo queste si rinominano. Le predefinite no.
  personalizzata: boolean;
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

// Una sede (docs/api.md, «Sedi»). `movimenti` e' il numero di movimenti della sede.
export interface Sede {
  id: number;
  nome: string;
  archiviata: boolean;
  ordine: number;
  movimenti: number;
}

export interface RicorrenzaMovimento {
  id: number;
  giorno: number;
  attiva: boolean;
  unita: UnitaRipetizione;
  intervallo: number;
  // La prossima scadenza ancora da registrare (yyyy-MM-dd).
  prossimaData: string;
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
  sede: RifNome;
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
  // Vedi «Quale sede» in docs/api.md: con una sola sede attiva si puo' omettere.
  sedeId?: number;
  // Senza unita e intervallo vale «ogni mese»; il giorno serve per mesi e anni.
  ricorrenza?: { giorno?: number; unita?: UnitaRipetizione; intervallo?: number } | null;
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
  // «1,2»: le sedi scelte. Assente = tutte.
  sedi?: string;
  // «3,7»: id di categoria. Assente = tutte; i movimenti senza categoria (retribuzioni) restano fuori quando c'e'.
  categorie?: string;
}

// Una riga del Riepilogo per categoria. Nei ricavi e nei costi variabili sono solo le categorie personalizzate
// (l'importo di una nota di credito conta in negativo); l'ordine e' quello del servizio.
export interface VoceRiepilogo {
  categoria: string;
  importoCent: number;
}

export interface Riepilogo {
  da: string;
  a: string;
  ricavi: { fatturatiCent: number; extraCent: number; altreVoci: VoceRiepilogo[]; totaleCent: number };
  costiVariabili: { fattureCent: number; scontriniCent: number; altreVoci: VoceRiepilogo[]; totaleCent: number };
  costiFissi: {
    retribuzioneRegolareCent: number;
    retribuzioneExtraCent: number;
    altreVoci: VoceRiepilogo[];
    totaleCent: number;
  };
  costiCent: number;
  risultatoCent: number;
  // Una riga per ogni sede scelta; la somma e' uguale ai totali.
  perSede?: { sede: RifNome; ricaviCent: number; costiCent: number; risultatoCent: number }[];
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
  cartellaPredefinita: boolean;
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

// ---- Statistiche (docs/api.md, «Statistiche») ----

// Una sede in una settimana (GET /api/statistiche/settimana). Senza dati inseriti: pizze, ordini e medie sono null.
export interface RigaSettimana {
  sede: RifNome;
  pizze: number | null;
  ordini: number | null;
  ricaviCent: number;
  scontrinoMedioCent: number | null;
  pizzePerOrdine: number | null;
  completa: boolean;
}
export interface Settimana {
  // Il lunedi' (yyyy-MM-dd) e la domenica della settimana.
  settimana: string;
  fine: string;
  sedi: RigaSettimana[];
}
export interface VoceSettimanaInput {
  sedeId: number;
  pizze: number | null;
  ordini: number | null;
}
export interface SettimanaInput {
  settimana: string;
  voci: VoceSettimanaInput[];
}

export interface MedieStatistiche {
  pizze: number;
  ordini: number;
  ricaviCent: number;
  scontrinoMedioCent: number | null;
  pizzePerOrdine: number | null;
}
export interface StatisticheSede extends MedieStatistiche {
  sede: RifNome;
  settimaneConDati: number;
}
export interface StatisticheSettimana {
  settimana: string;
  pizze: number;
  ordini: number;
  ricaviCent: number;
  scontrinoMedioCent: number | null;
  sediMancanti: RifNome[];
}
export interface Statistiche {
  da: string;
  a: string;
  totale: MedieStatistiche & { settimaneConDati: number; settimaneTotali: number };
  perSede: StatisticheSede[];
  settimane: StatisticheSettimana[];
}
