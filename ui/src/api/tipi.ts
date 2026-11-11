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
  // Solo con raggruppa=FORNITORE (altrimenti null): le fatture gia' pagate (pagata=true) e le fatture meno le note di credito della
  // voce, senza gli scontrini. Da pagare = fattureCent - pagataCent.
  pagataCent: number | null;
  fattureCent: number | null;
  // Un importo per ogni mese di `mesi`, nello stesso ordine.
  perMese: number[];
  // Quanti movimenti in ogni mese di `mesi`, nello stesso ordine (la somma e' `movimenti`).
  movimentiPerMese: number[];
  // Solo con raggruppa=FORNITORE (altrimenti null): pagato e fatture di ogni mese, come `perMese`.
  pagataPerMese: number[] | null;
  fatturePerMese: number[] | null;
}
export interface StatisticheVoci {
  da: string;
  a: string;
  raggruppa: RaggruppaVoci;
  // Il tipo effettivo: per i fornitori quello chiesto o COSTO_VARIABILE; per le categorie quello chiesto o null (= tutti); null per i
  // dipendenti (solo le retribuzioni).
  tipo: TipoVoci | null;
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

// Una sede (docs/api.md, «Sedi»). `movimenti` e' il numero di movimenti della sede. `personale`: sede delle spese dei titolari, senza
// pizze e ordini e fuori dai totali quando il filtro `sedi` manca (scelta esplicitamente, conta).
export interface Sede {
  id: number;
  nome: string;
  archiviata: boolean;
  personale: boolean;
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
  // L'id comune delle parti di un movimento diviso fra sedi («dividi»): lo stesso per tutte le parti, null se non e' diviso.
  // Non si cambia con la modifica. Vedi docs/api.md, «Movimenti».
  divisione: string | null;
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
  // COSTI = costi variabili + costi fissi (docs/api.md, «Movimenti»).
  tipo?: Tipo | "COSTI";
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
// Pizze e ordini si inseriscono in due modi: giorno per giorno (PUT /statistiche/giorni) o con il totale della settimana
// (PUT /statistiche/settimana). Per una (sede, settimana) vale un solo modo: salvare l'uno cancella l'altro (l'interfaccia chiede conferma).
// I ricavi hanno nomi diversi per i due usi: `ricaviTotaliCent` = tutti i ricavi (fatturati + extra), `ricaviExtraCent` = i soli extra,
// `ricaviConDatiCent` = i ricavi dei soli giorni (o vecchie settimane) con dati e ordini > 0, cioe' quelli dello scontrino medio.

// Il modo in uso per una sede in una settimana: i giorni, oppure il totale settimanale.
export type FonteStatistica = "GIORNI" | "SETTIMANA";

// Un giorno di una sede: pizze e ordini null se il giorno non e' inserito; medie null se mancano o con 0 ordini.
export interface GiornoStatistica {
  data: string;
  pizze: number | null;
  ordini: number | null;
  ricaviTotaliCent: number;
  ricaviExtraCent: number;
  scontrinoMedioCent: number | null;
  pizzePerOrdine: number | null;
}

// Una sede in una settimana (GET /api/statistiche/settimana). Senza dati inseriti: pizze, ordini e medie sono null.
export interface RigaSettimana {
  sede: RifNome;
  pizze: number | null;
  ordini: number | null;
  // Tutti i ricavi della settimana (come prima; uguale a ricaviTotaliCent).
  ricaviCent: number;
  // ricaviConDatiCent / ordini.
  scontrinoMedioCent: number | null;
  pizzePerOrdine: number | null;
  // C'e' almeno un giorno inserito, o il vecchio totale settimanale.
  completa: boolean;
  ricaviTotaliCent: number;
  ricaviExtraCent: number;
  ricaviConDatiCent: number;
  fonte: FonteStatistica | null;
  giorniInseriti: number;
  // Sempre 7 giorni, da lunedi' a domenica.
  giorni: GiornoStatistica[];
}
export interface Settimana {
  // Il lunedi' (yyyy-MM-dd) e la domenica della settimana.
  settimana: string;
  fine: string;
  sedi: RigaSettimana[];
}
// Il totale della settimana per sede (PUT /api/statistiche/settimana): con i numeri cancella i giorni di quella sede e settimana.
export interface VoceSettimanaInput {
  sedeId: number;
  pizze: number | null;
  ordini: number | null;
}
export interface SettimanaInput {
  settimana: string;
  voci: VoceSettimanaInput[];
}
// PUT /api/statistiche/giorni: tutti i giorni della stessa settimana; pizze e ordini null = cancella quel giorno. Un giorno con i numeri
// cancella il totale settimanale della sua sede in quella settimana.
export interface VoceGiornoInput {
  sedeId: number;
  data: string;
  pizze: number | null;
  ordini: number | null;
}
export interface GiorniInput {
  voci: VoceGiornoInput[];
}
// PUT /api/statistiche/settimana-completa: una settimana intera in un solo salvataggio, tutto o niente. `giorni` (tutti della settimana
// indicata) e `totali` come le voci di /giorni e /settimana; almeno una voce in tutto; una sede non puo' avere i numeri in entrambi.
export interface SettimanaCompletaInput {
  // Un giorno qualsiasi della settimana (yyyy-MM-dd).
  settimana: string;
  giorni: VoceGiornoInput[];
  totali: VoceSettimanaInput[];
}

export interface MedieStatistiche {
  pizze: number;
  ordini: number;
  // I ricavi dello scontrino (come prima; uguale a ricaviConDatiCent).
  ricaviCent: number;
  scontrinoMedioCent: number | null;
  pizzePerOrdine: number | null;
  ricaviConDatiCent: number;
  ricaviTotaliCent: number;
  ricaviExtraCent: number;
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
  ricaviConDatiCent: number;
  ricaviTotaliCent: number;
  ricaviExtraCent: number;
}
export interface Statistiche {
  da: string;
  a: string;
  totale: MedieStatistiche & { settimaneConDati: number; settimaneTotali: number };
  perSede: StatisticheSede[];
  settimane: StatisticheSettimana[];
}

// GET /api/statistiche/serie: il grafico giorno per giorno, per settimana o per mese («annuale» = MESE su un anno).
// Al massimo 400 intervalli per richiesta (oltre: 400 «Troppi intervalli …»).
export type PassoSerie = "GIORNO" | "SETTIMANA" | "MESE";
export interface IntervalloSerie {
  // Estremi compresi, tagliati al periodo chiesto.
  inizio: string;
  fine: string;
  pizze: number;
  ordini: number;
  ricaviTotaliCent: number;
  ricaviExtraCent: number;
  ricaviConDatiCent: number;
  scontrinoMedioCent: number | null;
  pizzePerOrdine: number | null;
  // C'e' almeno un dato inserito (per distinguere «zero» da «non inserito»).
  conDati: boolean;
  // Fra i dati c'e' almeno un totale settimanale («Totale della settimana»), che conta tutto sul suo lunedi'.
  daTotaleSettimanale: boolean;
}
// Una sede nella serie: gli stessi campi del totale, sulle date esatte [da, a] (inizio = da, fine = a).
export interface SedeSerie extends IntervalloSerie {
  sedeId: number;
  nome: string;
  archiviata: boolean;
}
export interface SerieStatistiche {
  da: string;
  a: string;
  passo: PassoSerie;
  // Tutto il periodo (lo scontrino e' calcolato sul totale, non come media degli intervalli).
  totale: IntervalloSerie;
  intervalli: IntervalloSerie[];
  // Le sedi del filtro (mai le personali) nell'ordine di GET /sedi: le attive sempre (anche a zero), le archiviate solo con ricavi o
  // dati nel periodo. La somma di pizze, ordini e ricavi e' il totale.
  perSede: SedeSerie[];
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
