// Lo stato della demo: dati di prova inventati, tenuti nel browser (niente servizio, niente dati veri).
import type { Categoria, Dipendente, Fornitore, Movimento, MovimentoInput, Tipo } from "../api/tipi";
import type { UnitaRipetizione } from "../util/ripetizione";
import { aggiungiGiorni, daIso, iso, oggiIso, successiva } from "./date";

export interface RicorrenzaDemo {
  id: number;
  attiva: boolean;
  giorno: number;
  unita: UnitaRipetizione;
  intervallo: number;
  prossimaData: string;
  // I dati con cui nascono le prossime occorrenze.
  modello: Pick<MovimentoInput, "tipo" | "documento" | "importoCent" | "categoria" | "fornitore" | "dipendente" | "descrizione" | "note">;
}

export interface StatoDemo {
  giorno: string; // quando e' stato generato: il giorno dopo si rigenera, cosi' «oggi» ha sempre dei dati
  prossimoId: number;
  movimenti: Movimento[];
  ricorrenze: RicorrenzaDemo[];
  categorie: Categoria[];
  fornitori: Fornitore[];
  dipendenti: Dipendente[];
}

const CHIAVE = "contabilita-demo-v2";

// Generatore pseudo-casuale con seme fisso: la demo e' sempre uguale.
function casuale(seme: number): () => number {
  let s = seme;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const FORNITORI: { nome: string; iva: string; categoria: string; da: number; a: number }[] = [
  { nome: "Molino Bianchi Farine", iva: "01234500011", categoria: "Farine", da: 18000, a: 95000 },
  { nome: "Caseificio Valle Chiara", iva: "01234500022", categoria: "Latticini", da: 12000, a: 80000 },
  { nome: "Ortofrutta Il Campo", iva: "01234500033", categoria: "Verdure", da: 6000, a: 38000 },
  { nome: "Conserve del Sud", iva: "01234500044", categoria: "Pomodoro e conserve", da: 9000, a: 52000 },
  { nome: "Bevande Colli Srl", iva: "01234500055", categoria: "Bevande", da: 15000, a: 110000 },
  { nome: "Salumi Dal Borgo", iva: "01234500066", categoria: "Salumi", da: 8000, a: 46000 },
  { nome: "Imballaggi Rapidi", iva: "01234500077", categoria: "Imballaggi", da: 5000, a: 30000 },
  { nome: "Pulizie Brillante", iva: "01234500088", categoria: "Detersivi", da: 3500, a: 18000 },
  { nome: "Tecnoforni Assistenza", iva: "01234500099", categoria: "Manutenzione", da: 9000, a: 60000 },
];
const DIPENDENTI = ["Luca Ferri", "Sara Gentile", "Paolo Moretti"];
const CATEGORIE_FISSE = ["Affitto", "Luce", "Gas", "Internet", "Assicurazioni", "Pulizie"];

function mov(stato: StatoDemo, d: string, i: MovimentoInput, origine: Movimento["origine"], ricorrenza: Movimento["ricorrenza"] = null): Movimento {
  const m: Movimento = {
    id: stato.prossimoId++,
    data: d,
    tipo: i.tipo,
    documento: i.documento,
    importoCent: i.importoCent,
    categoria: i.categoria ? { id: trova(stato.categorie, i.categoria, i.tipo), nome: i.categoria } : null,
    fornitore: i.fornitore ? { id: trovaFornitore(stato, i.fornitore), nome: i.fornitore } : null,
    dipendente: i.dipendente ? { id: trovaDipendente(stato, i.dipendente), nome: i.dipendente } : null,
    descrizione: i.descrizione ?? null,
    numeroDocumento: i.numeroDocumento ?? null,
    note: i.note ?? null,
    origine,
    ricorrenza,
    allegatoNome: null,
    creatoIl: `${d}T09:00:00`,
    modificatoIl: null,
  };
  stato.movimenti.push(m);
  return m;
}

// «Trova o crea» dal solo nome, senza badare alle maiuscole (come il servizio).
export function trova(lista: Categoria[], nome: string, tipo: Tipo): number {
  const trovata = lista.find((c) => c.tipo === tipo && c.nome.toLowerCase() === nome.toLowerCase());
  if (trovata) return trovata.id;
  const nuova = { id: Math.max(0, ...lista.map((c) => c.id)) + 1, nome, tipo };
  lista.push(nuova);
  return nuova.id;
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

// Registra le scadenze arrivate (solo fino a oggi), come il controllo giornaliero del servizio.
export function generaScadenze(stato: StatoDemo, oggi: string): void {
  for (const r of stato.ricorrenze) {
    while (r.attiva && r.prossimaData <= oggi) {
      mov(stato, r.prossimaData, r.modello as MovimentoInput, "RICORRENZA", riferimentoRicorrenza(r));
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

export function creaRicorrenza(stato: StatoDemo, primaData: string, input: MovimentoInput, giorno: number, unita: UnitaRipetizione, intervallo: number): RicorrenzaDemo {
  const r: RicorrenzaDemo = {
    id: Math.max(0, ...stato.ricorrenze.map((x) => x.id)) + 1,
    attiva: true,
    giorno,
    unita,
    intervallo,
    prossimaData: successiva(primaData, unita, intervallo, giorno),
    modello: {
      tipo: input.tipo,
      documento: input.documento,
      importoCent: input.importoCent,
      categoria: input.categoria,
      fornitore: input.fornitore,
      dipendente: input.dipendente,
      descrizione: input.descrizione,
      note: input.note,
    },
  };
  stato.ricorrenze.push(r);
  return r;
}

function generaDaZero(oggi: string): StatoDemo {
  const rnd = casuale(20260101);
  const tra = (a: number, b: number) => Math.round(a + rnd() * (b - a));
  const stato: StatoDemo = { giorno: oggi, prossimoId: 1, movimenti: [], ricorrenze: [], categorie: [], fornitori: [], dipendenti: [] };
  for (const f of FORNITORI) {
    trovaFornitore(stato, f.nome, f.iva);
    trova(stato.categorie, f.categoria, "COSTO_VARIABILE");
  }
  for (const c of CATEGORIE_FISSE) trova(stato.categorie, c, "COSTO_FISSO");
  trova(stato.categorie, "Retribuzione", "COSTO_FISSO");
  for (const d of DIPENDENTI) trovaDipendente(stato, d);

  const inizio = aggiungiGiorni(oggi, -150);
  let numero = 100;
  for (let d = inizio; d <= oggi; d = aggiungiGiorni(d, 1)) {
    const giornoSett = daIso(d).getDay(); // 0 domenica, 1 lunedi'
    if (giornoSett !== 1) {
      const festivo = giornoSett === 0 || giornoSett === 5 || giornoSett === 6;
      mov(stato, d, { data: d, tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: festivo ? tra(70000, 112000) : tra(36000, 62000), descrizione: "Incasso del giorno" }, "MANO");
      mov(stato, d, { data: d, tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: tra(5000, 21000), descrizione: "Asporto e consegne" }, "MANO");
    }
    if (rnd() < 0.42) {
      const f = FORNITORI[Math.floor(rnd() * FORNITORI.length)]!;
      numero += 1 + Math.floor(rnd() * 4);
      mov(stato, d, { data: d, tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: tra(f.da, f.a), fornitore: f.nome, categoria: f.categoria, numeroDocumento: `FT-${numero}` }, "MANO");
    }
    if (giornoSett === 6) {
      mov(stato, d, { data: d, tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: tra(15000, 60000), descrizione: "Spesa del sabato" }, "MANO");
    }
  }
  for (const [n, dip] of [[0, DIPENDENTI[0]!], [1, DIPENDENTI[2]!], [2, DIPENDENTI[1]!], [3, DIPENDENTI[0]!]] as const) {
    const d = aggiungiGiorni(inizio, 12 + n * 31);
    if (d <= oggi) mov(stato, d, { data: d, tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_EXTRA", importoCent: tra(6000, 22000), dipendente: dip, descrizione: "Serata extra" }, "MANO");
  }
  const f = FORNITORI[0]!;
  mov(stato, aggiungiGiorni(inizio, 40), { data: aggiungiGiorni(inizio, 40), tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 12400, fornitore: f.nome, categoria: f.categoria, numeroDocumento: "NC-12" }, "MANO");

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
  const fisso = (importoCent: number, categoria: string, descrizione?: string): MovimentoInput => ({ data: "", tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent, categoria, descrizione });
  const paga = (dipendente: string, importoCent: number): MovimentoInput => ({ data: "", tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_REGOLARE", importoCent, dipendente });
  ripeti(primoGiorno(27), paga(DIPENDENTI[0]!, 168000), 27, "MESI", 1);
  ripeti(primoGiorno(27), paga(DIPENDENTI[1]!, 154000), 27, "MESI", 1);
  ripeti(primoGiorno(27), paga(DIPENDENTI[2]!, 131000), 27, "MESI", 1);
  ripeti(primoGiorno(5), fisso(135000, "Affitto", "Canone del locale"), 5, "MESI", 1);
  ripeti(primoGiorno(10), fisso(18500, "Gas"), 10, "MESI", 1);
  ripeti(primoGiorno(12), fisso(61000, "Luce", "Bolletta bimestrale"), 12, "MESI", 2);
  ripeti(primoGiorno(20), fisso(6500, "Internet"), 20, "MESI", 1);
  ripeti(aggiungiGiorni(inizio, 3), fisso(9000, "Pulizie", "Pulizia settimanale"), daIso(aggiungiGiorni(inizio, 3)).getDate(), "SETTIMANE", 1);
  generaScadenze(stato, oggi);
  return stato;
}

let corrente: StatoDemo | null = null;

export function stato(): StatoDemo {
  if (corrente) return corrente;
  const oggi = oggiIso();
  try {
    const salvato = localStorage.getItem(CHIAVE);
    if (salvato) {
      const letto = JSON.parse(salvato) as StatoDemo;
      if (letto.giorno === oggi) {
        corrente = letto;
        return letto;
      }
    }
  } catch {
    // niente memoria del browser: si riparte dai dati di prova
  }
  corrente = generaDaZero(oggi);
  salva();
  return corrente;
}

export function salva(): void {
  try {
    if (corrente) localStorage.setItem(CHIAVE, JSON.stringify(corrente));
  } catch {
    // memoria piena o bloccata (navigazione privata): la demo funziona lo stesso, senza ricordare
  }
}

export function ricomincia(): void {
  corrente = null;
  try {
    localStorage.removeItem(CHIAVE);
  } catch {
    // niente
  }
}

export { mov as aggiungiMovimento, iso };
