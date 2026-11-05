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
  // Solo per i costi fissi: vero se e' una retribuzione (con dipendente, regolare ed extra). Non esistono categorie predefinite:
  // sono tutte dell'utente, si creano, rinominano ed eliminano.
  retribuzione: boolean;
  // Quanti movimenti usano la categoria.
  usi: number;
}
export interface Fornitore {
  id: number;
  nome: string;
  partitaIva: string | null;
  usi: number;
}
export interface Dipendente {
  id: number;
  nome: string;
  usi: number;
}

// Le tre anagrafiche che si rinominano, si eliminano e si uniscono (docs/api.md, «Gestione di categorie, fornitori e dipendenti»).
export type Anagrafica = "categorie" | "fornitori" | "dipendenti";

// ---- Statistiche per voce (docs/api.md, «Statistiche per voce») ----

export type RaggruppaVoci = "FORNITORE" | "DIPENDENTE" | "CATEGORIA";
// Il filtro per tipo: i tre tipi, oppure COSTI = variabili + fissi. Assente = il predefinito del raggruppamento.
export type TipoVoci = Tipo | "COSTI";

export interface VoceStatistica {
  // null = i movimenti rimasti senza la voce («Senza fornitore»…).
  id: number | null;
  nome: string;
  totaleCent: number;
  movimenti: number;
  // Solo per i dipendenti; altrimenti 0.
  regolareCent: number;
  extraCent: number;
  // Solo con raggruppa=FORNITORE: la parte del totale gia' pagata (fatture con pagata=true); altrimenti null. Da pagare = totale - pagata.
  pagataCent: number | null;
  // Un importo per ogni mese di `mesi`, nello stesso ordine.
  perMese: number[];
}
export interface StatisticheVoci {
  da: string;
  a: string;
  raggruppa: RaggruppaVoci;
  // Tutti i mesi di calendario (yyyy-MM) toccati dal periodo.
  mesi: string[];
  totaleCent: number;
  movimenti: number;
  voci: VoceStatistica[];
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
  // Solo per le fatture ricevute (FATTURA): vero se gia' pagata. Per ogni altro documento e' sempre false.
  pagata: boolean;
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
  // Solo FATTURA: predefinito false in creazione, invariato in modifica se manca.
  pagata?: boolean;
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
  // Filtri «per voce» (cosa compone una riga delle statistiche per voce): id del fornitore, oppure `senza` = solo i movimenti
  // senza quella voce («Senza fornitore / dipendente / categoria»).
  fornitore?: number;
  senza?: RaggruppaVoci;
  // true = solo i movimenti con documento RETRIBUZIONE_REGOLARE / RETRIBUZIONE_EXTRA (elenco delle righe «Dipendenti»).
  retribuzione?: boolean;
  // Solo le fatture pagate (true) o da pagare (false).
  pagata?: boolean;
}

// Una riga del Riepilogo per categoria (`id` null = «Senza categoria», sempre in fondo). L'importo di una nota di credito conta in
// negativo; l'ordine e' quello del servizio. La somma delle righe di una sezione e' il suo totale.
export interface VoceRiepilogo {
  id: number | null;
  categoria: string;
  importoCent: number;
}

// Le somme per documento (fatturati/extra, fatture/scontrini, retribuzione regolare/extra) sono «di cui»: dettaglio del totale, non da sommare.
export interface Riepilogo {
  da: string;
  a: string;
  ricavi: { voci: VoceRiepilogo[]; fatturatiCent: number; extraCent: number; totaleCent: number };
  costiVariabili: { voci: VoceRiepilogo[]; fattureCent: number; scontriniCent: number; totaleCent: number };
  costiFissi: { voci: VoceRiepilogo[]; retribuzioneRegolareCent: number; retribuzioneExtraCent: number; totaleCent: number };
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

// ---- Fatture da fare (promemoria mensile, docs/api.md) ----

export type StatoFattura = "DA_FARE" | "EMESSA" | "PAGATA";
export interface CasellaFattura {
  id: number;
  nome: string;
  // Il mese (yyyy-MM) in cui e' stata creata: i mesi prima non contano (niente arretrati).
  dalMese: string;
  // Entro che giorno del mese fare la fattura (1-31; nei mesi corti l'ultimo giorno), o null.
  giornoScadenza: number | null;
}
// Lo stato di una casella in un mese (`mese` = yyyy-MM). Importo e nota sono facoltativi.
export interface MeseFattura {
  mese: string;
  stato: StatoFattura;
  importoCent: number | null;
  nota: string | null;
  // Falso per i mesi prima di `dalMese` senza stato salvato: si mostrano neutri, non contano e non sono «in ritardo».
  attiva: boolean;
  // La data limite del mese (yyyy-MM-dd) se la casella ha una scadenza, altrimenti null.
  scadenza: string | null;
}
export interface CasellaConMesi extends CasellaFattura {
  mesi: MeseFattura[];
}
export interface Fatture {
  mesi: string[];
  caselle: CasellaConMesi[];
  // Coppie (casella, mese) ancora «Da fare» nell'intervallo chiesto.
  daFare: number;
}
// GET /api/fatture/promemoria: sempre il mese corrente. `giorniMancanti` = scadenza - oggi (negativo se scaduta).
export interface ScadenzaFattura {
  casellaId: number;
  nome: string;
  mese: string;
  scadenza: string;
  giorniMancanti: number;
}
export interface PromemoriaFatture {
  daFare: number;
  inScadenza: ScadenzaFattura[];
}
export interface CasellaInput {
  nome?: string;
  giornoScadenza?: number | null;
  dalMese?: string;
}
export interface MeseFatturaInput {
  stato: StatoFattura;
  importoCent?: number | null;
  nota?: string | null;
}
