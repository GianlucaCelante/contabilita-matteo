// Lo stato della demo: dati di prova inventati, tenuti nel browser (niente servizio, niente dati veri).
import type { Categoria, Dipendente, Fornitore, Movimento, MovimentoInput, StatoFattura, Tipo } from "../api/tipi";
import type { UnitaRipetizione } from "../util/ripetizione";
import { aggiungiGiorni, daIso, iso, lunediDi, oggiIso, successiva } from "./date";

export interface SedeDemo {
  id: number;
  nome: string;
  archiviata: boolean;
  // Sede delle spese dei titolari: niente pizze e ordini, fuori dai totali se il filtro `sedi` manca.
  personale: boolean;
  ordine: number;
}

export interface RicorrenzaDemo {
  id: number;
  attiva: boolean;
  giorno: number;
  unita: UnitaRipetizione;
  intervallo: number;
  prossimaData: string;
  // Le ripetizioni nate dallo stesso «dividi» (una per sede) hanno lo stesso valore; null se la ripetizione non e' divisa.
  divisione: string | null;
  // I dati con cui nascono le prossime occorrenze.
  modello: Pick<MovimentoInput, "tipo" | "documento" | "importoCent" | "categoria" | "fornitore" | "dipendente" | "descrizione" | "note" | "sedeId">;
}

// Il totale di pizze e ordini di una sede in una settimana (docs/api.md, «Statistiche»): `settimana` e' il lunedi'. Al piu' un dato
// per sede e settimana. Per una (sede, settimana) vale un solo modo: salvare i giorni cancella il totale e viceversa.
export interface StatisticaDemo {
  settimana: string;
  sedeId: number;
  pizze: number;
  ordini: number;
}

// Pizze e ordini di una sede in un giorno (yyyy-MM-dd). Al piu' un dato per sede e giorno.
export interface StatisticaGiornoDemo {
  giorno: string;
  sedeId: number;
  pizze: number;
  ordini: number;
}

// Fatture da fare (docs/api.md): le caselle dell'utente e lo stato salvato per (casella, mese). Un mese senza riga e' «Da fare».
export interface CasellaFatturaDemo {
  id: number;
  nome: string;
  // Il mese (yyyy-MM) di creazione: i mesi prima non contano. Il giorno entro cui fare la fattura (1-31) o null.
  dalMese: string;
  giornoScadenza: number | null;
}
export interface MeseFatturaDemo {
  casellaId: number;
  mese: string;
  stato: StatoFattura;
  importoCent: number | null;
  nota: string | null;
}
export interface FattureDemo {
  caselle: CasellaFatturaDemo[];
  mesi: MeseFatturaDemo[];
}

// Le voci salvate nella demo: `usi` non si salva, lo calcola il servizio finto a ogni lettura (demo/voci.ts).
export type CategoriaDemo = Omit<Categoria, "usi">;
export type FornitoreDemo = Omit<Fornitore, "usi">;
export type DipendenteDemo = Omit<Dipendente, "usi">;

export interface StatoDemo {
  giorno: string; // quando e' stato generato: il giorno dopo si rigenera, cosi' «oggi» ha sempre dei dati
  prossimoId: number;
  movimenti: Movimento[];
  ricorrenze: RicorrenzaDemo[];
  categorie: CategoriaDemo[];
  fornitori: FornitoreDemo[];
  dipendenti: DipendenteDemo[];
  sedi: SedeDemo[];
  statistiche: StatisticaDemo[];
  statisticheGiorni: StatisticaGiornoDemo[];
  fatture: FattureDemo;
  // Il giorno a cui sono ancorate le date delle fatture d'esempio dell'importazione (backend.ts, anteprimaDemo). Manca finche' non si
  // legge la prima volta.
  dataEsempi?: string;
}

const CHIAVE = "contabilita-demo-v9";
// Le memorie delle versioni prima, dalla piu' recente: la v8 (senza i giorni di pizze e ordini) e la v7 (anche senza «pagata» e senza
// scadenze). Se ce n'e' ancora una, si legge e si porta alla forma nuova (migraStato).
const CHIAVI_PRECEDENTI = ["contabilita-demo-v8", "contabilita-demo-v7"];

// Generatore pseudo-casuale con seme fisso: la demo e' sempre uguale.
function casuale(seme: number): () => number {
  let s = seme;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const FORNITORI: { nome: string; iva: string; categoria: string; da: number; a: number }[] = [
  { nome: "Molino Bianchi Farine", iva: "01234500011", categoria: "Ingredienti", da: 18000, a: 95000 },
  { nome: "Caseificio Valle Chiara", iva: "01234500022", categoria: "Ingredienti", da: 12000, a: 80000 },
  { nome: "Ortofrutta Il Campo", iva: "01234500033", categoria: "Ingredienti", da: 6000, a: 38000 },
  { nome: "Conserve del Sud", iva: "01234500044", categoria: "Ingredienti", da: 9000, a: 52000 },
  { nome: "Bevande Colli Srl", iva: "01234500055", categoria: "Bevande", da: 15000, a: 110000 },
  { nome: "Salumi Dal Borgo", iva: "01234500066", categoria: "Ingredienti", da: 8000, a: 46000 },
  { nome: "Imballaggi Rapidi", iva: "01234500077", categoria: "Carta e contenitori", da: 5000, a: 30000 },
  { nome: "Pulizie Brillante", iva: "01234500088", categoria: "Pulizia", da: 3500, a: 18000 },
  { nome: "Tecnoforni Assistenza", iva: "01234500099", categoria: "Manutenzione", da: 9000, a: 60000 },
];
const DIPENDENTI = ["Luca Ferri", "Sara Gentile", "Paolo Moretti", "Elena Riva", "Marco Bellini", "Giulia Conti"];
// Le tre sedi di prova (nomi inventati): peso = quanto incassano rispetto alla prima, fatture = quanto spesso arriva una fattura,
// chiusa = il giorno della settimana (0 domenica, 1 lunedi') in cui la sede e' chiusa. Scontrino e pizze per ordine servono ai dati di
// «Pizze e ordini»: si ricavano dagli incassi, cosi' le statistiche tornano con il riepilogo.
const SEDI_DEMO = [
  { id: 1, nome: "Via Roma", peso: 1, fatture: 1, chiusa: 2, scontrinoCent: 2025, pizzePerOrdine: 2.9 },
  { id: 2, nome: "Lungomare", peso: 0.72, fatture: 0.85, chiusa: 3, scontrinoCent: 2410, pizzePerOrdine: 3.4 },
  { id: 3, nome: "Mercato", peso: 0.42, fatture: 0.55, chiusa: 0, scontrinoCent: 1660, pizzePerOrdine: 2.6 },
];
// Le categorie di partenza dei costi fissi: sono ordinarie come tutte (si rinominano e si eliminano). Quella con il flag e' «Retribuzione»,
// ma il nome non conta: conta il flag. Le altre categorie nascono dai movimenti di prova qui sotto.
const CATEGORIE_FISSE = ["Affitto", "Luce", "Gas", "Internet", "Assicurazioni", "Pulizie", "Commercialista"];
const RICAVI_CATEGORIE = ["Sala", "Asporto", "Delivery", "Eventi"];
const VARIABILI_CATEGORIE = ["Ingredienti", "Bevande", "Carta e contenitori", "Imballaggi", "Pulizia"];

function mov(stato: StatoDemo, d: string, i: MovimentoInput, origine: Movimento["origine"], ricorrenza: Movimento["ricorrenza"] = null, divisione: string | null = null): Movimento {
  const m: Movimento = {
    id: stato.prossimoId++,
    data: d,
    tipo: i.tipo,
    documento: i.documento,
    importoCent: i.importoCent,
    categoria: i.categoria ? { id: trova(stato.categorie, i.categoria, i.tipo), nome: i.categoria } : null,
    fornitore: i.fornitore ? { id: trovaFornitore(stato, i.fornitore), nome: i.fornitore } : null,
    dipendente: i.dipendente ? { id: trovaDipendente(stato, i.dipendente), nome: i.dipendente } : null,
    sede: rifSede(stato, i.sedeId),
    descrizione: i.descrizione ?? null,
    numeroDocumento: i.numeroDocumento ?? null,
    note: i.note ?? null,
    origine,
    pagata: i.documento === "FATTURA" && i.pagata === true,
    ricorrenza,
    allegatoNome: null,
    creatoIl: `${d}T09:00:00`,
    modificatoIl: null,
    divisione,
  };
  stato.movimenti.push(m);
  return m;
}

// La sede di un movimento: quella indicata, altrimenti la prima (nella demo le sedi ci sono sempre).
export function rifSede(stato: StatoDemo, id: number | undefined): { id: number; nome: string } {
  const s = stato.sedi.find((x) => x.id === id) ?? stato.sedi[0]!;
  return { id: s.id, nome: s.nome };
}

// «Trova o crea» dal solo nome, senza badare alle maiuscole (come il servizio). Non esistono categorie predefinite: sono tutte
// dell'utente. `retribuzione` conta solo alla creazione (per una categoria che c'e' gia' il flag non cambia).
export function trova(lista: CategoriaDemo[], nome: string, tipo: Tipo, retribuzione = false): number {
  const trovata = lista.find((c) => c.tipo === tipo && c.nome.toLowerCase() === nome.toLowerCase());
  if (trovata) return trovata.id;
  const nuova: CategoriaDemo = { id: Math.max(0, ...lista.map((c) => c.id)) + 1, nome, tipo, retribuzione: tipo === "COSTO_FISSO" && retribuzione };
  lista.push(nuova);
  return nuova.id;
}

// Un movimento che e' una retribuzione (regolare o extra): vuole una categoria con il flag retribuzione.
export function eDocumentoRetribuzione(documento: string): boolean {
  return documento === "RETRIBUZIONE_REGOLARE" || documento === "RETRIBUZIONE_EXTRA";
}
export function trovaFornitore(stato: StatoDemo, nome: string, partitaIva: string | null = null): number {
  const trovato = stato.fornitori.find((f) => f.nome.toLowerCase() === nome.toLowerCase());
  if (trovato) return trovato.id;
  const nuovo = { id: Math.max(0, ...stato.fornitori.map((f) => f.id)) + 1, nome, partitaIva };
  stato.fornitori.push(nuovo);
  return nuovo.id;
}
export function trovaDipendente(stato: StatoDemo, nome: string): number {
  const trovato = stato.dipendenti.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
  if (trovato) return trovato.id;
  const nuovo = { id: Math.max(0, ...stato.dipendenti.map((x) => x.id)) + 1, nome };
  stato.dipendenti.push(nuovo);
  return nuovo.id;
}

export function riferimentoRicorrenza(r: RicorrenzaDemo): NonNullable<Movimento["ricorrenza"]> {
  return { id: r.id, giorno: r.giorno, attiva: r.attiva, unita: r.unita, intervallo: r.intervallo, prossimaData: r.prossimaData };
}

// L'id comune delle parti generate per una scadenza di una ripetizione divisa fra sedi: quello della divisione piu' la data, quindi
// uno per scadenza e lo stesso per tutte le sedi (ogni sede ha la sua ripetizione). Null se la ripetizione non e' divisa. Come il servizio.
export function divisioneDellaScadenza(r: Pick<RicorrenzaDemo, "divisione">, data: string): string | null {
  return r.divisione ? `${r.divisione}:${data}` : null;
}

// Registra le scadenze arrivate (solo fino a oggi), come il controllo giornaliero del servizio.
export function generaScadenze(stato: StatoDemo, oggi: string): void {
  for (const r of stato.ricorrenze) {
    while (r.attiva && r.prossimaData <= oggi) {
      mov(stato, r.prossimaData, r.modello as MovimentoInput, "RICORRENZA", riferimentoRicorrenza(r), divisioneDellaScadenza(r, r.prossimaData));
      r.prossimaData = successiva(r.prossimaData, r.unita, r.intervallo, r.giorno);
    }
  }
  aggiornaRiferimenti(stato);
}

export function aggiornaRiferimenti(stato: StatoDemo): void {
  const perId = new Map(stato.ricorrenze.map((r) => [r.id, r]));
  for (const m of stato.movimenti) {
    if (m.ricorrenza) {
      const r = perId.get(m.ricorrenza.id);
      if (r) m.ricorrenza = riferimentoRicorrenza(r);
    }
  }
}

export function creaRicorrenza(stato: StatoDemo, primaData: string, input: MovimentoInput, giorno: number, unita: UnitaRipetizione, intervallo: number, divisione: string | null = null): RicorrenzaDemo {
  const r: RicorrenzaDemo = {
    id: Math.max(0, ...stato.ricorrenze.map((x) => x.id)) + 1,
    attiva: true,
    giorno,
    unita,
    intervallo,
    prossimaData: successiva(primaData, unita, intervallo, giorno),
    divisione,
    modello: {
      tipo: input.tipo,
      documento: input.documento,
      importoCent: input.importoCent,
      categoria: input.categoria,
      fornitore: input.fornitore,
      dipendente: input.dipendente,
      descrizione: input.descrizione,
      note: input.note,
      sedeId: input.sedeId,
    },
  };
  stato.ricorrenze.push(r);
  return r;
}

function generaDaZero(oggi: string): StatoDemo {
  const rnd = casuale(20260101);
  const tra = (a: number, b: number) => Math.round(a + rnd() * (b - a));
  const stato: StatoDemo = {
    giorno: oggi,
    prossimoId: 1,
    movimenti: [],
    ricorrenze: [],
    categorie: [],
    fornitori: [],
    dipendenti: [],
    sedi: SEDI_DEMO.map((s) => ({ id: s.id, nome: s.nome, archiviata: false, personale: false, ordine: s.id })),
    statistiche: [],
    statisticheGiorni: [],
    fatture: { caselle: [], mesi: [] },
  };
  for (const f of FORNITORI) {
    trovaFornitore(stato, f.nome, f.iva);
  }
  for (const c of RICAVI_CATEGORIE) trova(stato.categorie, c, "RICAVO");
  for (const c of VARIABILI_CATEGORIE) trova(stato.categorie, c, "COSTO_VARIABILE");
  for (const c of CATEGORIE_FISSE) trova(stato.categorie, c, "COSTO_FISSO");
  trova(stato.categorie, "Retribuzione", "COSTO_FISSO", true);
  for (const d of DIPENDENTI) trovaDipendente(stato, d);

  const inizio = aggiungiGiorni(oggi, -150);
  let numero = 100;
  for (let d = inizio; d <= oggi; d = aggiungiGiorni(d, 1)) {
    const giornoSett = daIso(d).getDay(); // 0 domenica, 1 lunedi'
    for (const s of SEDI_DEMO) {
      const sedeId = s.id;
      const scala = (cent: number) => Math.round(cent * s.peso);
      // Ogni sede ha il suo giorno di chiusura (il Mercato la domenica): cosi' ogni giorno almeno una sede incassa e la settimana in corso non parte mai a zero.
      const chiusa = giornoSett === s.chiusa;
      if (!chiusa) {
        const festivo = giornoSett === 0 || giornoSett === 5 || giornoSett === 6;
        mov(stato, d, { data: d, tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: scala(festivo ? tra(70000, 112000) : tra(36000, 62000)), categoria: "Sala", descrizione: "Incasso del giorno", sedeId }, "MANO");
        mov(stato, d, { data: d, tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: scala(tra(5000, 21000)), ...(daIso(d).getDate() === 13 ? {} : { categoria: "Asporto" }), descrizione: "Asporto e consegne", sedeId }, "MANO");
      }
      if (rnd() < s.fatture) {
        const f = FORNITORI[Math.floor(rnd() * FORNITORI.length)]!;
        numero += 1 + Math.floor(rnd() * 4);
        mov(stato, d, { data: d, tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: Math.round(scala(tra(f.da, f.a)) * 0.66) + 1000, fornitore: f.nome, categoria: f.categoria, numeroDocumento: `FT-${numero}`, sedeId }, "MANO");
      }
      if (giornoSett === 6) {
        mov(stato, d, { data: d, tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: scala(tra(15000, 60000)), descrizione: "Spesa del sabato", sedeId }, "MANO");
      }
    }
  }
  // Altre categorie di partenza: Delivery ed Eventi fra i ricavi, Imballaggi e Pulizia fra i costi variabili (Commercialista, fra i fissi,
  // e' piu' sotto). Hanno un generatore a parte: i dati di prima non cambiano.
  // Gli importi sono piccoli rispetto agli incassi, cosi' i risultati restano positivi.
  const rndTue = casuale(20261030);
  const traTue = (a: number, b: number) => Math.round(a + rndTue() * (b - a));
  for (let d = inizio; d <= oggi; d = aggiungiGiorni(d, 1)) {
    const giornoSett = daIso(d).getDay();
    for (const s of SEDI_DEMO) {
      const sedeId = s.id;
      const scala = (cent: number) => Math.round(cent * s.peso);
      if (giornoSett !== s.chiusa && rndTue() < 0.55) {
        mov(stato, d, { data: d, tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: scala(traTue(9000, 26000)), categoria: "Delivery", descrizione: "Consegne a domicilio", sedeId }, "MANO");
      }
      // gli imballaggi arrivano il sabato (giorno di incasso forte), i detersivi del locale ogni dieci giorni circa
      if (giornoSett === 6) {
        numero += 1;
        mov(stato, d, { data: d, tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: scala(traTue(4000, 11000)), fornitore: "Imballaggi Rapidi", categoria: "Imballaggi", numeroDocumento: `FT-${numero}`, sedeId }, "MANO");
      }
      if (rndTue() < 0.1) {
        mov(stato, d, { data: d, tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: scala(traTue(2500, 6500)), categoria: "Pulizia", descrizione: "Prodotti per la pulizia", sedeId }, "MANO");
      }
    }
  }
  // Eventi: una serata ogni due settimane, a turno nelle tre sedi (l'ultima e' la settimana scorsa).
  for (let n = 1; n < 22; n += 2) {
    const sabato = aggiungiGiorni(lunediDi(oggi), -7 * n + 5);
    if (sabato < inizio || sabato > oggi) continue;
    const sede = SEDI_DEMO[(n >> 1) % SEDI_DEMO.length]!;
    mov(stato, sabato, { data: sabato, tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: Math.round(traTue(30000, 64000) * Math.max(sede.peso, 0.7)), categoria: "Eventi", descrizione: "Serata su prenotazione", sedeId: sede.id }, "MANO");
  }

  // Ogni dipendente lavora in una sede: tre in Via Roma, due al Lungomare, uno al Mercato.
  const SEDE_DI: Record<string, number> = { "Luca Ferri": 1, "Elena Riva": 1, "Marco Bellini": 1, "Sara Gentile": 2, "Giulia Conti": 2, "Paolo Moretti": 3 };
  for (const [n, dip] of [[0, DIPENDENTI[0]!], [1, DIPENDENTI[2]!], [2, DIPENDENTI[1]!], [3, DIPENDENTI[0]!]] as const) {
    const d = aggiungiGiorni(inizio, 12 + n * 31);
    if (d <= oggi) mov(stato, d, { data: d, tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_EXTRA", importoCent: tra(6000, 22000), categoria: "Retribuzione", dipendente: dip, descrizione: "Serata extra", sedeId: SEDE_DI[dip] }, "MANO");
  }
  const f = FORNITORI[0]!;
  mov(stato, aggiungiGiorni(inizio, 40), { data: aggiungiGiorni(inizio, 40), tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 12400, fornitore: f.nome, categoria: f.categoria, numeroDocumento: "NC-12", sedeId: 1 }, "MANO");

  // Le ripetizioni: la prima occorrenza cade il giorno scelto dentro il periodo, le altre le registra il generatore.
  const primoGiorno = (g: number): string => {
    let d = inizio;
    while (daIso(d).getDate() !== g) d = aggiungiGiorni(d, 1);
    return d;
  };
  const ripeti = (primo: string, i: MovimentoInput, giorno: number, unita: UnitaRipetizione, intervallo: number) => {
    const r = creaRicorrenza(stato, primo, i, giorno, unita, intervallo);
    mov(stato, primo, { ...i, data: primo }, "MANO", riferimentoRicorrenza(r));
  };
  const fisso = (sedeId: number, importoCent: number, categoria: string, descrizione?: string): MovimentoInput => ({ data: "", tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent, categoria, descrizione, sedeId });
  const paga = (dipendente: string, importoCent: number): MovimentoInput => ({ data: "", tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_REGOLARE", importoCent, categoria: "Retribuzione", dipendente, sedeId: SEDE_DI[dipendente] });
  // Le retribuzioni sono settimanali (il sabato): cosi' ogni settimana porta la sua parte di costo e il risultato della settimana e'
  // realistico, non gonfiato dalle settimane senza paghe e non in rosso in quella in cui cadono. Per ogni sede, importi mensili / 52 x 12.
  let giornoPaghe = inizio;
  while (daIso(giornoPaghe).getDay() !== 6) giornoPaghe = aggiungiGiorni(giornoPaghe, 1);
  // Affitto e bollette sono mensili ma cadono in giorni scelti «all'indietro» da oggi (almeno 18 giorni fa): non finiscono mai nella
  // settimana in corso ne' in quella scorsa, e il mese in corso non parte in rosso. La demo si rigenera ogni giorno.
  const giornoDelMese = (giorniFa: number) => daIso(aggiungiGiorni(oggi, -giorniFa)).getDate();
  const gAffitto = giornoDelMese(18);
  const gGas = giornoDelMese(20);
  const gLuce = giornoDelMese(22);
  const gInternet = giornoDelMese(24);
  for (const [dip, mensile] of [["Luca Ferri", 225000], ["Elena Riva", 200000], ["Marco Bellini", 185000], ["Sara Gentile", 215000], ["Giulia Conti", 190000], ["Paolo Moretti", 175000]] as const) {
    ripeti(giornoPaghe, paga(dip, Math.round((mensile * 12) / 52 / 100) * 100), daIso(giornoPaghe).getDate(), "SETTIMANE", 1);
  }
  ripeti(primoGiorno(gAffitto), fisso(1, 135000, "Affitto", "Canone del locale"), gAffitto, "MESI", 1);
  ripeti(primoGiorno(gAffitto), fisso(2, 110000, "Affitto", "Canone del locale"), gAffitto, "MESI", 1);
  ripeti(primoGiorno(gAffitto), fisso(3, 72000, "Affitto", "Canone del banco"), gAffitto, "MESI", 1);
  ripeti(primoGiorno(gGas), fisso(1, 18500, "Gas"), gGas, "MESI", 1);
  ripeti(primoGiorno(gGas), fisso(2, 14200, "Gas"), gGas, "MESI", 1);
  ripeti(primoGiorno(gLuce), fisso(1, 61000, "Luce", "Bolletta bimestrale"), gLuce, "MESI", 2);
  ripeti(primoGiorno(gLuce), fisso(2, 43500, "Luce", "Bolletta bimestrale"), gLuce, "MESI", 2);
  ripeti(primoGiorno(gLuce), fisso(3, 23800, "Luce", "Bolletta bimestrale"), gLuce, "MESI", 2);
  // Commercialista: voce fissa come le altre, mensile, un giorno scelto come le altre (almeno 19 giorni fa).
  const gCommercialista = giornoDelMese(19);
  ripeti(primoGiorno(gCommercialista), fisso(1, 18000, "Commercialista", "Contabilità e dichiarazioni"), gCommercialista, "MESI", 1);
  ripeti(primoGiorno(gInternet), fisso(1, 6500, "Internet"), gInternet, "MESI", 1);
  ripeti(primoGiorno(gInternet), fisso(2, 5900, "Internet"), gInternet, "MESI", 1);
  ripeti(aggiungiGiorni(inizio, 3), fisso(1, 9000, "Pulizie", "Pulizia settimanale"), daIso(aggiungiGiorni(inizio, 3)).getDate(), "SETTIMANE", 1);
  ripeti(aggiungiGiorni(inizio, 5), fisso(2, 7000, "Pulizie", "Pulizia settimanale"), daIso(aggiungiGiorni(inizio, 5)).getDate(), "SETTIMANE", 1);
  generaScadenze(stato, oggi);
  generaStatistiche(stato, oggi);
  generaFatture(stato, oggi);
  generaPagate(stato, oggi);
  return stato;
}

// Fatture ricevute di prova: quelle di oltre 45 giorni fa sono pagate; le piu' recenti sono miste (una su tre ancora da pagare),
// cosi' «Ricevute» e le statistiche per fornitore si vedono con entrambi gli stati.
function generaPagate(stato: StatoDemo, oggi: string): void {
  const limite = aggiungiGiorni(oggi, -45);
  for (const m of stato.movimenti) {
    if (m.documento !== "FATTURA") continue;
    m.pagata = m.data < limite || m.id % 3 !== 0;
  }
}

// Fatture da fare di prova: tre caselle inventate. I mesi passati sono quasi tutti pagati (una ancora da incassare, una dimenticata);
// il mese in corso ha due «Da fare» e una gia' emessa, cosi' la scheda del Riepilogo e i contatori si vedono subito.
function generaFatture(stato: StatoDemo, oggi: string): void {
  const f = stato.fatture;
  const adesso = oggi.slice(0, 7);
  // Le scadenze: Eventi il 28; Catering Rossi fra due giorni (cosi' il Riepilogo mostra sempre una riga in evidenza, qualunque sia oggi); Euro Service il 5.
  const giornoOggi = Number(oggi.slice(8, 10));
  const ultimoGiorno = new Date(Number(adesso.slice(0, 4)), Number(adesso.slice(5, 7)), 0).getDate();
  const fra2Giorni = Math.min(giornoOggi + 2, ultimoGiorno);
  const [aa, mm] = adesso.split("-").map(Number);
  const indiceDal = (aa ?? 1970) * 12 + ((mm ?? 1) - 1) - 5;
  const dalMese = `${Math.floor(indiceDal / 12)}-${String((indiceDal % 12) + 1).padStart(2, "0")}`;
  f.caselle.push(
    { id: 1, nome: "Fatture eventi", dalMese, giornoScadenza: 28 },
    { id: 2, nome: "Fatture catering Rossi", dalMese, giornoScadenza: fra2Giorni },
    { id: 3, nome: "Fatture Euro Service", dalMese, giornoScadenza: 5 },
  );
  const meseA = (indietro: number) => {
    const [a, m] = adesso.split("-").map(Number);
    const indice = (a ?? 1970) * 12 + ((m ?? 1) - 1) - indietro;
    return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}`;
  };
  const metti = (casellaId: number, indietro: number, stato: StatoFattura, importoCent: number | null, nota: string | null) =>
    f.mesi.push({ casellaId, mese: meseA(indietro), stato, importoCent, nota });
  // Eventi: ogni mese una fattura, pagata; quella del mese scorso e' ancora da incassare.
  metti(1, 5, "PAGATA", 180000, "N. 31");
  metti(1, 4, "PAGATA", 240000, "N. 36");
  metti(1, 3, "PAGATA", 95000, "N. 40");
  metti(1, 2, "PAGATA", 310000, "N. 44");
  metti(1, 1, "EMESSA", 265000, "N. 49, bonifico a 30 giorni");
  metti(1, 0, "EMESSA", 120000, "N. 53");
  // Catering Rossi: due mesi senza (tornano «Da fare»: dimenticate), il resto pagato.
  metti(2, 5, "PAGATA", 82000, null);
  metti(2, 3, "PAGATA", 76000, null);
  metti(2, 1, "PAGATA", 91000, "N. 48");
  // Euro Service: mensile, di solito pagata dopo un mese.
  metti(3, 5, "PAGATA", 125000, "N. 30");
  metti(3, 4, "PAGATA", 125000, "N. 35");
  metti(3, 3, "PAGATA", 125000, "N. 39");
  metti(3, 2, "PAGATA", 125000, "N. 43");
  metti(3, 1, "EMESSA", 125000, "N. 50");
}

// Pizze e ordini di prova. Le ultime tre settimane intere e quella in corso (fino a oggi) sono inserite giorno per giorno: ogni giorno con
// degli incassi ha il suo dato, il giorno di chiusura della sede resta vuoto (e non rende la settimana «mancante»). Le quattro settimane
// prima hanno il totale settimanale, come quando si inseriva una volta a settimana (cinque settimane fa il Lungomare manca, per
// vedere «2 su 3»). Nella settimana in corso il Mercato non e' ancora stato inserito. Ordini = ricavi / scontrino tipico della sede (con un
// po' di variazione), pizze = ordini x pizze per ordine: cosi' lo scontrino medio che esce e' quello tipico e il Riepilogo torna.
function generaStatistiche(stato: StatoDemo, oggi: string): void {
  const rnd = casuale(20261029);
  const corrente = lunediDi(oggi);
  const ricavi = (sedeId: number, da: string, a: string) =>
    stato.movimenti.filter((m) => m.tipo === "RICAVO" && m.sede.id === sedeId && m.data >= da && m.data <= a).reduce((t, m) => t + m.importoCent, 0);
  const numeri = (s: (typeof SEDI_DEMO)[number], incassi: number, variazione: number) => {
    const scontrino = s.scontrinoCent * (1 + (rnd() - 0.5) * variazione);
    const ordini = Math.max(1, Math.round(incassi / scontrino));
    return { ordini, pizze: Math.round(ordini * s.pizzePerOrdine * (1 + (rnd() - 0.5) * 0.06)) };
  };
  for (let n = 7; n >= 0; n--) {
    const lunedi = aggiungiGiorni(corrente, -7 * n);
    for (const s of SEDI_DEMO) {
      if ((n === 0 && s.id === 3) || (n === 5 && s.id === 2)) continue;
      if (n >= 4) {
        const incassi = ricavi(s.id, lunedi, aggiungiGiorni(lunedi, 6));
        if (incassi > 0) stato.statistiche.push({ settimana: lunedi, sedeId: s.id, ...numeri(s, incassi, 0.08) });
        continue;
      }
      for (let i = 0; i < 7; i++) {
        const giorno = aggiungiGiorni(lunedi, i);
        if (giorno > oggi) break;
        const incassi = ricavi(s.id, giorno, giorno);
        if (incassi > 0) stato.statisticheGiorni.push({ giorno, sedeId: s.id, ...numeri(s, incassi, 0.1) });
      }
    }
  }
}

let corrente: StatoDemo | null = null;

// Demo «vuota» (indirizzo con ?vuoto): si parte come un'installazione nuova, senza dati di prova, con la sola «Sede principale».
// Ha una memoria sua: non tocca i dati di prova e, a differenza di questi, non si rigenera il giorno dopo.
// Nella demo pubblicata (VITE_DEMO=1) e' sempre cosi': il generatore dei dati inventati resta solo per i test e non entra nella build.
let vuota = import.meta.env.VITE_DEMO === "1";
const chiave = () => (vuota ? `${CHIAVE}-vuoto` : CHIAVE);
const chiaviPrecedenti = () => CHIAVI_PRECEDENTI.map((c) => (vuota ? `${c}-vuoto` : c));

// Porta alla forma di adesso uno stato salvato dalle versioni prima: le fatture gia' presenti risultano pagate (come la migrazione del
// servizio, per non riempire di arretrati chi usa gia' l'app); le caselle ricevono `dalMese` (il primo mese con uno stato salvato, altrimenti
// questo) e nessuna scadenza; i giorni di pizze e ordini partono vuoti e i totali settimanali restano come sono (valgono finche'
// in quella settimana non si inserisce un giorno); le sedi senza il flag `personale` sono normali; i movimenti e le ripetizioni senza
// `divisione` (salvati prima dell'id comune dei movimenti divisi) la ricevono null, come la colonna nuova del servizio: per loro le
// Ricevute usano ancora l'euristica. Si puo' ripetere: non cambia uno stato gia' aggiornato.
export function migraStato(letto: unknown): StatoDemo {
  const st = letto as StatoDemo;
  if (!Array.isArray(st.statistiche)) st.statistiche = [];
  if (!Array.isArray(st.statisticheGiorni)) st.statisticheGiorni = [];
  for (const s of st.sedi) {
    if (typeof s.personale !== "boolean") s.personale = false;
  }
  for (const m of st.movimenti) {
    if (typeof m.pagata !== "boolean") m.pagata = m.documento === "FATTURA";
    if (typeof m.divisione !== "string") m.divisione = null;
  }
  for (const r of st.ricorrenze) {
    if (typeof r.divisione !== "string") r.divisione = null;
  }
  const adesso = oggiIso().slice(0, 7);
  for (const c of st.fatture.caselle) {
    if (typeof c.dalMese !== "string") {
      const salvati = st.fatture.mesi.filter((x) => x.casellaId === c.id).map((x) => x.mese);
      c.dalMese = salvati.length > 0 ? salvati.reduce((a, b) => (b < a ? b : a)) : adesso;
    }
    if (c.giornoScadenza === undefined) c.giornoScadenza = null;
  }
  return st;
}

export function modalitaVuota(attiva: boolean): void {
  if (vuota === attiva) return;
  vuota = attiva;
  corrente = null;
}

function generaVuoto(oggi: string): StatoDemo {
  return {
    giorno: oggi,
    prossimoId: 1,
    movimenti: [],
    ricorrenze: [],
    categorie: [],
    fornitori: [],
    dipendenti: [],
    sedi: [{ id: 1, nome: "Sede principale", archiviata: false, personale: false, ordine: 1 }],
    statistiche: [],
    statisticheGiorni: [],
    fatture: { caselle: [], mesi: [] },
  };
}

export function stato(): StatoDemo {
  if (corrente) return corrente;
  const oggi = oggiIso();
  try {
    let salvato = localStorage.getItem(chiave());
    for (const c of chiaviPrecedenti()) salvato ??= localStorage.getItem(c);
    if (salvato) {
      const letto = migraStato(JSON.parse(salvato));
      if (vuota || letto.giorno === oggi) {
        corrente = letto;
        return letto;
      }
    }
  } catch {
    // niente memoria del browser: si riparte dai dati di partenza
  }
  // Il controllo su VITE_DEMO e' una costante della build: nella demo pubblicata il generatore sparisce dal codice.
  corrente = import.meta.env.VITE_DEMO === "1" || vuota ? generaVuoto(oggi) : generaDaZero(oggi);
  salva();
  return corrente;
}

export function salva(): void {
  try {
    if (corrente) localStorage.setItem(chiave(), JSON.stringify(corrente));
  } catch {
    // memoria piena o bloccata (navigazione privata): la demo funziona lo stesso, senza ricordare
  }
}

export function ricomincia(): void {
  corrente = null;
  try {
    localStorage.removeItem(chiave());
    for (const c of chiaviPrecedenti()) localStorage.removeItem(c);
  } catch {
    // niente
  }
}

export { mov as aggiungiMovimento, iso };
