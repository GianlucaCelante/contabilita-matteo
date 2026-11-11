// Categorie, fornitori e dipendenti nella demo: uso, rinomina, eliminazione (con unione) e statistiche per voce.
// Stesso contratto del servizio (docs/api.md, «Gestione di categorie, fornitori e dipendenti» e «Statistiche per voce»).
import type { Anagrafica, Categoria, Movimento, RaggruppaVoci, RifNome, StatisticheVoci, Tipo, VoceStatistica } from "../api/tipi";
import { MASSIMO_NOME_CATEGORIA, normalizzaNome } from "../util/categorie";
import { ANAGRAFICA } from "../util/voci";
import { eDocumentoRetribuzione, type CategoriaDemo, type DipendenteDemo, type FornitoreDemo, type StatoDemo } from "./stato";

// Un errore del servizio finto: stato HTTP e messaggio.
export interface ErroreVoci {
  stato: number;
  messaggio: string;
}
export type EsitoVoci<T> = { errore: ErroreVoci } | { valore: T };

const err = (stato: number, messaggio: string): { errore: ErroreVoci } => ({ errore: { stato, messaggio } });

type Voce = CategoriaDemo | FornitoreDemo | DipendenteDemo;

const elencoDi = (st: StatoDemo, anagrafica: Anagrafica): Voce[] => st[anagrafica];

// Il riferimento che un movimento ha alla voce (null se non ne ha).
function riferimento(m: Movimento, anagrafica: Anagrafica): RifNome | null {
  return anagrafica === "categorie" ? m.categoria : anagrafica === "fornitori" ? m.fornitore : m.dipendente;
}
function impostaRiferimento(m: Movimento, anagrafica: Anagrafica, rif: RifNome | null): void {
  if (anagrafica === "categorie") m.categoria = rif;
  else if (anagrafica === "fornitori") m.fornitore = rif;
  else m.dipendente = rif;
}

// Quanti movimenti usano ogni voce (id -> numero).
export function contaUsi(st: StatoDemo, anagrafica: Anagrafica): Map<number, number> {
  const usi = new Map<number, number>();
  for (const m of st.movimenti) {
    const r = riferimento(m, anagrafica);
    if (r) usi.set(r.id, (usi.get(r.id) ?? 0) + 1);
  }
  return usi;
}

// Le voci con `usi`, come le restituiscono le GET.
export function conUsi<T extends Voce>(st: StatoDemo, anagrafica: Anagrafica, voci: T[]): (T & { usi: number })[] {
  const usi = contaUsi(st, anagrafica);
  return voci.map((v) => ({ ...v, usi: usi.get(v.id) ?? 0 }));
}

// Le ripetizioni tengono il NOME della voce nel loro modello: dopo una rinomina o un'eliminazione lo seguono.
function aggiornaModelli(st: StatoDemo, anagrafica: Anagrafica, voce: Voce, nuovoNome: string | undefined): void {
  const uguale = (n: string | undefined) => !!n && n.toLowerCase() === voce.nome.toLowerCase();
  for (const r of st.ricorrenze) {
    if (anagrafica === "categorie") {
      if (r.modello.tipo === (voce as Categoria).tipo && uguale(r.modello.categoria)) r.modello.categoria = nuovoNome;
    } else if (anagrafica === "fornitori") {
      if (uguale(r.modello.fornitore)) r.modello.fornitore = nuovoNome;
    } else if (uguale(r.modello.dipendente)) r.modello.dipendente = nuovoNome;
  }
}

// PUT: il nome deve essere valido e libero (nella stessa anagrafica, per le categorie nello stesso tipo, senza badare alle maiuscole).
// Le categorie accettano anche `retribuzione` (almeno uno dei due, `nome` o `retribuzione`): vero solo per i costi fissi (400 altrimenti);
// toglierlo a una categoria che ha retribuzioni (documento RETRIBUZIONE_*) e' 409. Tutto o niente: se un controllo fallisce non cambia nulla.
export function rinominaVoce(st: StatoDemo, anagrafica: Anagrafica, id: number, corpo: unknown): EsitoVoci<Voce & { usi: number }> {
  const d = ANAGRAFICA[anagrafica];
  const voce = elencoDi(st, anagrafica).find((x) => x.id === id);
  const c = (corpo ?? {}) as { nome?: unknown; partitaIva?: unknown; retribuzione?: unknown };
  if (!voce) return err(404, d.nonTrovata);
  const categoria = anagrafica === "categorie" ? (voce as CategoriaDemo) : undefined;
  const conNome = c.nome !== undefined || !categoria || c.retribuzione === undefined;
  const nome = typeof c.nome === "string" ? normalizzaNome(c.nome) : "";
  if (categoria && c.retribuzione !== undefined && typeof c.retribuzione !== "boolean") return err(400, "Il valore di «retribuzione» non è valido.");
  if (conNome) {
    if (!nome) return err(400, `Il nome ${d.del} è obbligatorio.`);
    if (nome.length > MASSIMO_NOME_CATEGORIA) return err(400, `Il nome ${d.del} può avere al massimo ${MASSIMO_NOME_CATEGORIA} caratteri.`);
    const tipo = categoria?.tipo;
    const doppione = elencoDi(st, anagrafica).some((x) => x.id !== id && (tipo === undefined || (x as Categoria).tipo === tipo) && x.nome.toLowerCase() === nome.toLowerCase());
    if (doppione) return err(409, `Esiste già ${d.uno} con questo nome.`);
  }
  if (categoria && typeof c.retribuzione === "boolean") {
    if (c.retribuzione && categoria.tipo !== "COSTO_FISSO") return err(400, "Solo una categoria dei costi fissi può essere una retribuzione.");
    if (!c.retribuzione && categoria.retribuzione && st.movimenti.some((m) => m.categoria?.id === id && eDocumentoRetribuzione(m.documento))) {
      return err(409, "Questa categoria ha già delle retribuzioni.");
    }
  }
  if (conNome) {
    aggiornaModelli(st, anagrafica, voce, nome);
    voce.nome = nome;
    for (const m of st.movimenti) {
      const r = riferimento(m, anagrafica);
      if (r?.id === id) impostaRiferimento(m, anagrafica, { id, nome });
    }
  }
  if (categoria && typeof c.retribuzione === "boolean") categoria.retribuzione = c.retribuzione;
  if (anagrafica === "fornitori" && typeof c.partitaIva === "string") (voce as FornitoreDemo).partitaIva = c.partitaIva.trim() || null;
  return { valore: { ...voce, usi: contaUsi(st, anagrafica).get(id) ?? 0 } };
}

// DELETE: senza `sostituisciCon` i movimenti restano senza la voce; con l'id di un'altra voce passano a lei (unione). Tutto o niente.
export function eliminaVoce(st: StatoDemo, anagrafica: Anagrafica, id: number, sostituisciCon: string | null): EsitoVoci<null> {
  const d = ANAGRAFICA[anagrafica];
  const lista = elencoDi(st, anagrafica);
  const voce = lista.find((x) => x.id === id);
  if (!voce) return err(404, d.nonTrovata);
  let altra: Voce | undefined;
  if (sostituisciCon !== null) {
    const idAltra = Number(sostituisciCon);
    if (!Number.isInteger(idAltra)) return err(400, "Il parametro sostituisciCon non è valido.");
    if (idAltra === id) return err(400, `Per unire servono ${d.dueDiverse}.`);
    altra = lista.find((x) => x.id === idAltra);
    if (!altra) return err(404, d.altraNonTrovata);
    if (anagrafica === "categorie" && (altra as Categoria).tipo !== (voce as Categoria).tipo) return err(400, "Si possono unire solo categorie dello stesso tipo.");
  }
  for (const m of st.movimenti) {
    const r = riferimento(m, anagrafica);
    if (r?.id === id) impostaRiferimento(m, anagrafica, altra ? { id: altra.id, nome: altra.nome } : null);
  }
  aggiornaModelli(st, anagrafica, voce, altra?.nome);
  lista.splice(lista.indexOf(voce), 1);
  return { valore: null };
}

// ---- statistiche per voce ----

// Tutti i mesi di calendario (yyyy-MM) toccati dal periodo, in ordine.
export function mesiDelPeriodo(da: string, a: string): string[] {
  const mesi: string[] = [];
  let anno = Number(da.slice(0, 4));
  let mese = Number(da.slice(5, 7));
  const fine = a.slice(0, 7);
  for (;;) {
    const m = `${anno}-${String(mese).padStart(2, "0")}`;
    if (m > fine) break;
    mesi.push(m);
    mese += 1;
    if (mese > 12) {
      mese = 1;
      anno += 1;
    }
  }
  return mesi;
}

const RAGGRUPPAMENTI: RaggruppaVoci[] = ["FORNITORE", "DIPENDENTE", "CATEGORIA"];
export const TIPI_VOCI = ["RICAVO", "COSTO_VARIABILE", "COSTO_FISSO", "COSTI"] as const;

// Il tipo predefinito di ogni raggruppamento (docs/api.md): null = tutti i tipi; per i fornitori i costi variabili, come il servizio.
// Per i dipendenti il tipo non si usa: contano solo le retribuzioni.
export function tipoPredefinito(raggruppa: RaggruppaVoci): (typeof TIPI_VOCI)[number] | null {
  return raggruppa === "FORNITORE" ? "COSTO_VARIABILE" : null;
}

export const eRetribuzione = (m: Movimento) => m.documento === "RETRIBUZIONE_REGOLARE" || m.documento === "RETRIBUZIONE_EXTRA";

export function raggruppamentoValido(testo: string | null): RaggruppaVoci | null {
  return RAGGRUPPAMENTI.find((r) => r === testo) ?? null;
}

export interface ParametriVoci {
  da: string;
  a: string;
  raggruppa: RaggruppaVoci;
  tipo: (typeof TIPI_VOCI)[number] | null;
  // Le sedi scelte (null = tutte).
  ids: Set<number> | null;
}

// Quanto un movimento pesa sul totale della sua voce: la nota di credito lo riduce.
const effetto = (m: Movimento) => (m.documento === "NOTA_DI_CREDITO" ? -m.importoCent : m.importoCent);

export function statisticheVoci(st: StatoDemo, p: ParametriVoci): StatisticheVoci {
  const mesi = mesiDelPeriodo(p.da, p.a);
  const tipi: Tipo[] | null = p.tipo === null ? null : p.tipo === "COSTI" ? ["COSTO_VARIABILE", "COSTO_FISSO"] : [p.tipo];
  const gruppi = new Map<number | null, VoceStatistica>();
  // Fatture e pagato (totali e per mese) esistono solo per i fornitori: null con gli altri raggruppamenti.
  const perFornitore = p.raggruppa === "FORNITORE";
  let totaleCent = 0;
  let movimenti = 0;
  // I conteggi: le parti di un movimento diviso fra sedi (stesso `divisione`) nella stessa voce e nello stesso mese contano una volta,
  // anche se il filtro delle sedi ne prende solo alcune. Gli importi restano la somma delle parti. Come il servizio.
  const contate = new Set<string>();
  for (const m of st.movimenti) {
    if (m.data < p.da || m.data > p.a) continue;
    if (p.ids && !p.ids.has(m.sede.id)) continue;
    if (p.raggruppa === "DIPENDENTE") {
      // Solo le retribuzioni: un costo fisso come l'affitto non e' una paga e non va nemmeno in «Senza dipendente».
      if (!eRetribuzione(m)) continue;
    } else if (tipi && !tipi.includes(m.tipo)) continue;
    const rif = p.raggruppa === "FORNITORE" ? m.fornitore : p.raggruppa === "DIPENDENTE" ? m.dipendente : m.categoria;
    const chiave = rif?.id ?? null;
    let g = gruppi.get(chiave);
    if (!g) {
      g = {
        id: chiave,
        nome: rif?.nome ?? ANAGRAFICA[p.raggruppa === "FORNITORE" ? "fornitori" : p.raggruppa === "DIPENDENTE" ? "dipendenti" : "categorie"].senza,
        totaleCent: 0,
        movimenti: 0,
        regolareCent: 0,
        extraCent: 0,
        pagataCent: perFornitore ? 0 : null,
        fattureCent: perFornitore ? 0 : null,
        perMese: mesi.map(() => 0),
        movimentiPerMese: mesi.map(() => 0),
        pagataPerMese: perFornitore ? mesi.map(() => 0) : null,
        fatturePerMese: perFornitore ? mesi.map(() => 0) : null,
      };
      gruppi.set(chiave, g);
    }
    const importo = effetto(m);
    g.totaleCent += importo;
    const indice = mesi.indexOf(m.data.slice(0, 7));
    const chiaveDivisione = m.divisione ? `${chiave}\n${indice}\n${m.divisione}` : null;
    const daContare = chiaveDivisione === null || !contate.has(chiaveDivisione);
    if (chiaveDivisione !== null) contate.add(chiaveDivisione);
    if (daContare) g.movimenti += 1;
    if (indice >= 0) {
      g.perMese[indice] = (g.perMese[indice] ?? 0) + importo;
      if (daContare) g.movimentiPerMese[indice] = (g.movimentiPerMese[indice] ?? 0) + 1;
    }
    // Il «da pagare» riguarda solo le fatture (meno le note di credito): gli scontrini sono gia' pagati alla cassa.
    if (g.fattureCent !== null && g.fatturePerMese && (m.documento === "FATTURA" || m.documento === "NOTA_DI_CREDITO")) {
      g.fattureCent += importo;
      if (indice >= 0) g.fatturePerMese[indice] = (g.fatturePerMese[indice] ?? 0) + importo;
    }
    if (g.pagataCent !== null && g.pagataPerMese && m.documento === "FATTURA" && m.pagata) {
      g.pagataCent += m.importoCent;
      if (indice >= 0) g.pagataPerMese[indice] = (g.pagataPerMese[indice] ?? 0) + m.importoCent;
    }
    if (p.raggruppa === "DIPENDENTE") {
      if (m.documento === "RETRIBUZIONE_REGOLARE") g.regolareCent += importo;
      else if (m.documento === "RETRIBUZIONE_EXTRA") g.extraCent += importo;
    }
    totaleCent += importo;
    if (daContare) movimenti += 1;
  }
  // Per totale decrescente, a parita' per nome; la riga senza voce in fondo.
  const voci = [...gruppi.values()].sort((x, y) => Number(x.id === null) - Number(y.id === null) || y.totaleCent - x.totaleCent || x.nome.localeCompare(y.nome, "it"));
  // Il tipo effettivo, come il servizio: per i dipendenti non si usa (null), per le categorie null = tutti i tipi.
  const tipo = p.raggruppa === "DIPENDENTE" ? null : p.tipo;
  return { da: p.da, a: p.a, raggruppa: p.raggruppa, tipo, mesi, totaleCent, movimenti, voci };
}
