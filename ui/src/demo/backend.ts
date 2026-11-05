// Il «servizio» della demo: risponde alle stesse chiamate /api dell'app vera, ma dentro il browser,
// con i dati di prova di stato.ts. Niente di questo parte nell'app vera (vedi demo/installa.ts).
import type { Categoria, Documento, Fatture, MeseFattura, Movimento, MovimentoInput, PromemoriaFatture, Riepilogo, Sede, StatoFattura, Tipo, VoceRiepilogo } from "../api/tipi";
import { MASSIMO_NOME_CATEGORIA } from "../util/categorie";
import { leggiIdCategorie } from "../util/filtroCategorie";
import type { AnteprimaImportazione, FatturaLetta } from "../api/importa";
import { MASSIMO_INTERVALLO, type UnitaRipetizione } from "../util/ripetizione";
import { elencoMesi, contaMesi, dataScadenza, giorniMancanti, GIORNI_PREAVVISO, meseValido, MASSIMO_NOME_CASELLA, MASSIMO_NOTA_FATTURA, STATI } from "../util/fatture";
import { dividiImporto } from "../util/sedi";
import { costruisciXlsx } from "./xlsx";
import { conUsi, contaUsi, eRetribuzione, eliminaVoce, raggruppamentoValido, rinominaVoce, statisticheVoci, tipoPredefinito, TIPI_VOCI } from "./voci";
import { aggiungiGiorni, daIso, iso, lunediDi, oggiIso, successiva } from "./date";
import {
  aggiornaRiferimenti,
  aggiungiMovimento,
  creaRicorrenza,
  generaScadenze,
  riferimentoRicorrenza,
  ricomincia,
  salva,
  stato,
  type SedeDemo,
  type StatoDemo,
  eDocumentoRetribuzione,
  trova,
  trovaDipendente,
  trovaFornitore,
} from "./stato";

export interface Risposta {
  stato: number;
  corpo?: unknown;
  testo?: { contenuto: string | Uint8Array; tipo: string; nomeFile: string };
}

const ok = (corpo?: unknown, st = 200): Risposta => ({ stato: st, corpo });
const errore = (st: number, messaggio: string): Risposta => ({ stato: st, corpo: { errore: messaggio } });
const NELLA_DEMO = (cosa: string) => errore(400, `Nella demo ${cosa} non è disponibile.`);

const DOCUMENTI: Record<Tipo, Documento[]> = {
  RICAVO: ["RICAVO_FATTURATO", "RICAVO_EXTRA"],
  COSTO_VARIABILE: ["FATTURA", "NOTA_DI_CREDITO", "SCONTRINO"],
  COSTO_FISSO: ["RETRIBUZIONE_REGOLARE", "RETRIBUZIONE_EXTRA", "NESSUNO"],
};

// Quanto un movimento pesa sui costi: la nota di credito li riduce.
const effettoCosti = (m: Movimento) => (m.documento === "NOTA_DI_CREDITO" ? -m.importoCent : m.importoCent);

// Retribuzione e categoria (docs/api.md): per un costo fisso il documento RETRIBUZIONE_* e una categoria con il flag vanno sempre insieme.
// La categoria si cerca dal nome come sempre; una che non c'e' nascerebbe senza flag.
function controlloRetribuzione(st: StatoDemo, i: MovimentoInput): string | null {
  if (i.tipo !== "COSTO_FISSO") return null;
  const nome = pulito(i.categoria);
  const cat = nome ? st.categorie.find((c) => c.tipo === "COSTO_FISSO" && c.nome.toLowerCase() === nome.toLowerCase()) : undefined;
  if (eDocumentoRetribuzione(i.documento)) {
    if (!nome) return "Una retribuzione ha bisogno di una categoria di tipo retribuzione.";
    if (!cat?.retribuzione) return `La categoria «${cat?.nome ?? nome}» non è una retribuzione.`;
  } else if (cat?.retribuzione) {
    return `La categoria «${cat.nome}» è una retribuzione: scegli Regolare o Extra.`;
  }
  return null;
}

function valida(st: StatoDemo, i: MovimentoInput): string | null {
  if (!i || !i.data || !/^\d{4}-\d{2}-\d{2}$/.test(i.data)) return "La data non è valida.";
  if (!DOCUMENTI[i.tipo]?.includes(i.documento)) return "Il tipo di documento non è valido per questo tipo di movimento.";
  if (!Number.isInteger(i.importoCent) || i.importoCent <= 0) return "L'importo deve essere maggiore di zero.";
  if (pulito(i.categoria) && pulito(i.categoria)!.length > MASSIMO_NOME_CATEGORIA) return `La categoria può avere al massimo ${MASSIMO_NOME_CATEGORIA} caratteri.`;
  const r = i.ricorrenza;
  if (r) {
    if (i.documento === "RETRIBUZIONE_EXTRA") return "Una retribuzione extra non può essere ricorrente.";
    const unita = r.unita ?? "MESI";
    const n = r.intervallo ?? 1;
    const max = MASSIMO_INTERVALLO[unita];
    if (!Number.isInteger(n) || n < 1 || n > max) return `Ogni quanto: da 1 a ${max}.`;
    if ((unita === "MESI" || unita === "ANNI") && (!r.giorno || r.giorno < 1 || r.giorno > 31)) return "Il giorno della ripetizione va da 1 a 31.";
  }
  return controlloRetribuzione(st, i);
}

const pulito = (s: string | undefined | null) => (s && s.trim() ? s.trim() : undefined);

// ---- sedi (stesse regole di docs/api.md, «Sedi») ----

const perOrdine = (x: SedeDemo, y: SedeDemo) => x.ordine - y.ordine || x.id - y.id;
const sediAttive = (st: StatoDemo) => st.sedi.filter((s) => !s.archiviata).sort(perOrdine);

// GET /sedi: prima le non archiviate (per ordine), in fondo le archiviate; con il numero di movimenti.
function elencoSedi(st: StatoDemo): Sede[] {
  const conta = new Map<number, number>();
  for (const m of st.movimenti) conta.set(m.sede.id, (conta.get(m.sede.id) ?? 0) + 1);
  return [...st.sedi]
    .sort((x, y) => Number(x.archiviata) - Number(y.archiviata) || perOrdine(x, y))
    .map((s) => ({ id: s.id, nome: s.nome, archiviata: s.archiviata, ordine: s.ordine, movimenti: conta.get(s.id) ?? 0 }));
}

// Il filtro `sedi=1,2`: assente o vuoto = tutte (anche le archiviate); un valore che non e' un numero e' un errore.
function filtroSedi(q: URLSearchParams): { ids: Set<number> | null; errore?: string } {
  const grezzo = (q.get("sedi") ?? "").trim();
  if (!grezzo) return { ids: null };
  const ids = new Set<number>();
  for (const pezzo of grezzo.split(",")) {
    const t = pezzo.trim();
    if (!/^\d+$/.test(t)) return { ids: null, errore: `sedi: valore non valido: ${t}` };
    ids.add(Number(t));
  }
  return { ids };
}

// «Quale sede»: se manca e c'e' una sola sede attiva si usa quella; se ce n'e' piu' d'una si deve scegliere; archiviata o inesistente = errore.
function sceglieSede(st: StatoDemo, sedeId: unknown): { sede?: SedeDemo; errore?: string } {
  if (sedeId === undefined || sedeId === null) {
    const attive = sediAttive(st);
    if (attive.length === 1) return { sede: attive[0]! };
    return { errore: "Scegli la sede: ce n'è più di una." };
  }
  const sede = st.sedi.find((s) => s.id === sedeId);
  if (!sede) return { errore: "Sede non trovata." };
  if (sede.archiviata) return { errore: `La sede «${sede.nome}» è archiviata.` };
  return { sede };
}

function applica(m: Movimento, i: MovimentoInput, sede?: SedeDemo): void {
  const st = stato();
  if (sede) m.sede = { id: sede.id, nome: sede.nome };
  m.data = i.data;
  m.tipo = i.tipo;
  m.documento = i.documento;
  m.importoCent = i.importoCent;
  const cat = pulito(i.categoria);
  const forn = pulito(i.fornitore);
  const dip = pulito(i.dipendente);
  m.categoria = cat ? { id: trova(st.categorie, cat, i.tipo), nome: cat } : null;
  m.fornitore = forn ? { id: trovaFornitore(st, forn), nome: forn } : null;
  m.dipendente = dip ? { id: trovaDipendente(st, dip), nome: dip } : null;
  m.descrizione = pulito(i.descrizione) ?? null;
  m.numeroDocumento = pulito(i.numeroDocumento) ?? null;
  m.note = pulito(i.note) ?? null;
  // `pagata` esiste solo per le fatture: senza valore resta com'e', per gli altri documenti e' sempre false.
  if (i.documento !== "FATTURA") m.pagata = false;
  else if (typeof i.pagata === "boolean") m.pagata = i.pagata;
}

const SENZA_VOCE = ["FORNITORE", "DIPENDENTE", "CATEGORIA"] as const;

// Controlla i filtri per voce (`fornitore`, `senza`, `categorie`): stessi 400 del contratto di docs/api.md.
function erroreFiltriVoce(q: URLSearchParams): string | null {
  const categorie = q.get("categorie");
  const fornitore = q.get("fornitore");
  if (fornitore && !/^\d+$/.test(fornitore.trim())) return `fornitore: valore non valido: ${fornitore}`;
  const senza = q.get("senza");
  if (senza && !SENZA_VOCE.some((v) => v === senza)) return `senza: valore non valido: ${senza}`;
  if (senza === "CATEGORIA" && categorie) return "categorie e senza=CATEGORIA non possono stare insieme.";
  for (const campo of ["retribuzione", "pagata"]) {
    const v = q.get(campo);
    if (v && v !== "true" && v !== "false") return `${campo}: valore non valido: ${v}`;
  }
  return null;
}

function elenco(q: URLSearchParams, ids: Set<number> | null) {
  const da = q.get("da");
  const a = q.get("a");
  const tipo = q.get("tipo");
  const cerca = (q.get("q") ?? "").trim().toLowerCase();
  const dip = q.get("dipendente");
  const cat = leggiIdCategorie(q.get("categorie"));
  const fornitore = q.get("fornitore")?.trim();
  const senza = q.get("senza");
  const soloPaghe = q.get("retribuzione") === "true";
  const pagata = q.get("pagata");
  const elementi = stato()
    .movimenti.filter(
      (m) =>
        (!da || m.data >= da) &&
        (!a || m.data <= a) &&
        (!tipo || m.tipo === tipo) &&
        (!ids || ids.has(m.sede.id)) &&
        (!dip || String(m.dipendente?.id) === dip) &&
        (cat.length === 0 || (!!m.categoria && cat.includes(m.categoria.id))) &&
        (!fornitore || String(m.fornitore?.id) === fornitore) &&
        (!soloPaghe || eRetribuzione(m)) &&
        (!pagata || (m.documento === "FATTURA" && m.pagata === (pagata === "true"))) &&
        (senza !== "FORNITORE" || !m.fornitore) &&
        (senza !== "DIPENDENTE" || !m.dipendente) &&
        (senza !== "CATEGORIA" || !m.categoria) &&
        (!cerca || [m.fornitore?.nome, m.descrizione, m.note].some((c) => c?.toLowerCase().includes(cerca))),
    )
    .sort((x, y) => (x.data === y.data ? y.id - x.id : x.data < y.data ? 1 : -1));
  let ricavi = 0;
  let costi = 0;
  for (const m of elementi) {
    if (m.tipo === "RICAVO") ricavi += m.importoCent;
    else costi += effettoCosti(m);
  }
  return { elementi, totali: { ricaviCent: ricavi, costiCent: costi, saldoCent: ricavi - costi } };
}

function riepilogo(da: string, a: string, ids: Set<number> | null = null): Riepilogo {
  // `di cui`: le somme per documento sommano tutti i movimenti con quel documento, qualunque categoria, e non vanno aggiunte al totale.
  const r = { fat: 0, extra: 0, fatture: 0, scontrini: 0, reg: 0, ext: 0 };
  // Una riga per categoria in ogni sezione (id null = «Senza categoria», sempre in fondo); la nota di credito conta in negativo.
  const sezioni = { RICAVO: new Map<number | null, VoceRiepilogo>(), COSTO_VARIABILE: new Map<number | null, VoceRiepilogo>(), COSTO_FISSO: new Map<number | null, VoceRiepilogo>() };
  const sedeTot = new Map<number, { ricavi: number; costi: number; n: number }>();
  for (const m of stato().movimenti) {
    if (m.data < da || m.data > a) continue;
    if (ids && !ids.has(m.sede.id)) continue;
    const t = sedeTot.get(m.sede.id) ?? { ricavi: 0, costi: 0, n: 0 };
    if (m.tipo === "RICAVO") t.ricavi += m.importoCent;
    else t.costi += effettoCosti(m);
    t.n++;
    sedeTot.set(m.sede.id, t);
    const mappa = sezioni[m.tipo];
    const chiave = m.categoria?.id ?? null;
    const riga = mappa.get(chiave) ?? { id: chiave, categoria: m.categoria?.nome ?? "Senza categoria", importoCent: 0 };
    riga.importoCent += m.tipo === "RICAVO" ? m.importoCent : effettoCosti(m);
    mappa.set(chiave, riga);
    switch (m.documento) {
      case "RICAVO_FATTURATO": r.fat += m.importoCent; break;
      case "RICAVO_EXTRA": r.extra += m.importoCent; break;
      case "FATTURA": r.fatture += m.importoCent; break;
      case "NOTA_DI_CREDITO": r.fatture -= m.importoCent; break;
      case "SCONTRINO": r.scontrini += m.importoCent; break;
      case "RETRIBUZIONE_REGOLARE": r.reg += m.importoCent; break;
      case "RETRIBUZIONE_EXTRA": r.ext += m.importoCent; break;
      default: break;
    }
  }
  // Dall'importo piu' alto, poi per nome; «Senza categoria» in fondo.
  const righe = (mappa: Map<number | null, VoceRiepilogo>): VoceRiepilogo[] =>
    [...mappa.values()].sort((x, y) => (x.id === null ? 1 : 0) - (y.id === null ? 1 : 0) || y.importoCent - x.importoCent || x.categoria.localeCompare(y.categoria, "it"));
  const voci = { ricavi: righe(sezioni.RICAVO), variabili: righe(sezioni.COSTO_VARIABILE), fissi: righe(sezioni.COSTO_FISSO) };
  const somma = (v: VoceRiepilogo[]) => v.reduce((s, x) => s + x.importoCent, 0);
  const ricavi = somma(voci.ricavi);
  const variabili = somma(voci.variabili);
  const fissi = somma(voci.fissi);
  // Una riga per ogni sede scelta: le attive anche a zero, le archiviate solo se nel periodo hanno movimenti.
  const perSede = elencoSedi(stato())
    .filter((s) => (!ids || ids.has(s.id)) && (!s.archiviata || sedeTot.has(s.id)))
    .map((s) => {
      const t = sedeTot.get(s.id) ?? { ricavi: 0, costi: 0, n: 0 };
      return { sede: { id: s.id, nome: s.nome }, ricaviCent: t.ricavi, costiCent: t.costi, risultatoCent: t.ricavi - t.costi };
    });
  return {
    da,
    a,
    ricavi: { voci: voci.ricavi, fatturatiCent: r.fat, extraCent: r.extra, totaleCent: ricavi },
    costiVariabili: { voci: voci.variabili, fattureCent: r.fatture, scontriniCent: r.scontrini, totaleCent: variabili },
    costiFissi: { voci: voci.fissi, retribuzioneRegolareCent: r.reg, retribuzioneExtraCent: r.ext, totaleCent: fissi },
    costiCent: variabili + fissi,
    risultatoCent: ricavi - variabili - fissi,
    perSede,
  };
}

function creaMovimento(i: MovimentoInput, sede: SedeDemo): Movimento {
  const st = stato();
  const m = aggiungiMovimento(st, i.data, { ...i, sedeId: sede.id, categoria: undefined, fornitore: undefined, dipendente: undefined }, "MANO");
  applica(m, i, sede);
  if (i.ricorrenza) {
    const unita: UnitaRipetizione = i.ricorrenza.unita ?? "MESI";
    const giorno = i.ricorrenza.giorno ?? daIso(i.data).getDate();
    const r = creaRicorrenza(st, i.data, { ...i, sedeId: sede.id, categoria: pulito(i.categoria), fornitore: pulito(i.fornitore), dipendente: pulito(i.dipendente) }, giorno, unita, i.ricorrenza.intervallo ?? 1);
    m.ricorrenza = riferimentoRicorrenza(r);
    generaScadenze(st, oggiIso());
  }
  return m;
}

function modifica(m: Movimento, i: MovimentoInput, ambito: string, sede?: SedeDemo): void {
  const st = stato();
  applica(m, i, sede);
  m.modificatoIl = `${oggiIso()}T12:00:00`;
  const r = m.ricorrenza ? st.ricorrenze.find((x) => x.id === m.ricorrenza?.id) : undefined;
  if (!r) return;
  if (ambito === "QUESTO_E_PROSSIMI") {
    r.modello = { tipo: i.tipo, documento: i.documento, importoCent: i.importoCent, categoria: pulito(i.categoria), fornitore: pulito(i.fornitore), dipendente: pulito(i.dipendente), descrizione: pulito(i.descrizione), note: pulito(i.note), sedeId: m.sede.id };
  }
  // La frequenza e' della ripetizione e vale sempre, qualunque ambito.
  if (i.ricorrenza && (i.ricorrenza.unita || i.ricorrenza.intervallo || i.ricorrenza.giorno)) {
    r.unita = i.ricorrenza.unita ?? r.unita;
    r.intervallo = i.ricorrenza.intervallo ?? r.intervallo;
    r.giorno = i.ricorrenza.giorno ?? r.giorno;
    const ultima = st.movimenti.filter((x) => x.ricorrenza?.id === r.id).reduce((mx, x) => (x.data > mx ? x.data : mx), m.data);
    let prossima = successiva(ultima, r.unita, r.intervallo, r.giorno);
    while (prossima <= oggiIso()) prossima = successiva(prossima, r.unita, r.intervallo, r.giorno);
    r.prossimaData = prossima;
  }
  aggiornaRiferimenti(st);
}

// ---- statistiche: pizze e ordini a settimana (docs/api.md, «Statistiche») ----

const MASSIMO_CONTEGGIO = 1_000_000;
const dataIsoValida = (t: string) => /^\d{4}-\d{2}-\d{2}$/.test(t) && iso(daIso(t)) === t;

// Ricavi / ordini al centesimo e pizze / ordini a due decimali, mezzo in su; null se gli ordini sono 0.
const scontrinoMedio = (ricaviCent: number, ordini: number): number | null => (ordini > 0 ? Math.floor((2 * ricaviCent + ordini) / (2 * ordini)) : null);
const pizzePerOrdine = (pizze: number, ordini: number): number | null => (ordini > 0 ? Math.floor((200 * pizze + ordini) / (2 * ordini)) / 100 : null);

// I ricavi (tipo RICAVO, qualunque documento) di ogni sede in ogni settimana, per data del movimento: chiave «sede|lunedi'».
function ricaviPerSettimana(st: StatoDemo, da: string, a: string, ids: Set<number> | null): Map<string, number> {
  const ricavi = new Map<string, number>();
  for (const m of st.movimenti) {
    if (m.tipo !== "RICAVO" || m.data < da || m.data > a || (ids && !ids.has(m.sede.id))) continue;
    const k = `${m.sede.id}|${lunediDi(m.data)}`;
    ricavi.set(k, (ricavi.get(k) ?? 0) + m.importoCent);
  }
  return ricavi;
}

// Le sedi come le elenca GET /sedi: prima le non archiviate (per ordine), poi le archiviate.
const sediInOrdine = (st: StatoDemo) => [...st.sedi].sort((x, y) => Number(x.archiviata) - Number(y.archiviata) || perOrdine(x, y));

function settimanaStatistiche(st: StatoDemo, lunedi: string) {
  const ricavi = ricaviPerSettimana(st, lunedi, aggiungiGiorni(lunedi, 6), null);
  const righe = [];
  for (const s of sediInOrdine(st)) {
    const d = st.statistiche.find((x) => x.sedeId === s.id && x.settimana === lunedi);
    const ric = ricavi.get(`${s.id}|${lunedi}`);
    if (s.archiviata && !d && ric === undefined) continue;
    const ricaviCent = ric ?? 0;
    righe.push({
      sede: { id: s.id, nome: s.nome },
      pizze: d?.pizze ?? null,
      ordini: d?.ordini ?? null,
      ricaviCent,
      scontrinoMedioCent: d ? scontrinoMedio(ricaviCent, d.ordini) : null,
      pizzePerOrdine: d ? pizzePerOrdine(d.pizze, d.ordini) : null,
      completa: !!d,
    });
  }
  return { settimana: lunedi, fine: aggiungiGiorni(lunedi, 6), sedi: righe };
}

// PUT /statistiche/settimana: tutto o niente, con gli stessi errori del servizio.
function salvaSettimanaStatistiche(st: StatoDemo, corpo: unknown): Risposta {
  const c = (corpo ?? {}) as { settimana?: unknown; voci?: unknown };
  if (typeof c.settimana !== "string" || !c.settimana.trim()) return errore(400, "Indica la settimana (un giorno qualsiasi, yyyy-MM-dd).");
  if (!dataIsoValida(c.settimana.trim())) return errore(400, `La settimana non è una data valida (yyyy-MM-dd): ${c.settimana}`);
  const lunedi = lunediDi(c.settimana.trim());
  if (!Array.isArray(c.voci) || c.voci.length === 0) return errore(400, "Indica almeno una voce.");
  const voci: { sede: SedeDemo; pizze: number | null; ordini: number | null }[] = [];
  const viste = new Set<number>();
  for (const v of c.voci as ({ sedeId?: unknown; pizze?: unknown; ordini?: unknown } | null)[]) {
    if (!v || typeof v.sedeId !== "number") return errore(400, "Ogni voce deve avere la sede.");
    if (viste.has(v.sedeId)) return errore(400, `La sede ${v.sedeId} compare più volte.`);
    viste.add(v.sedeId);
    const sede = st.sedi.find((x) => x.id === v.sedeId);
    if (!sede) return errore(400, "Sede non trovata.");
    if (sede.archiviata) return errore(400, `La sede «${sede.nome}» è archiviata.`);
    const intero = (valore: unknown, campo: string): { v: number | null; errore?: string } => {
      if (valore === null || valore === undefined) return { v: null };
      if (typeof valore !== "number" || !Number.isInteger(valore)) return { v: null, errore: `Sede «${sede.nome}»: ${campo} deve essere un numero intero.` };
      if (valore < 0) return { v: null, errore: `Sede «${sede.nome}»: ${campo} non può essere negativo.` };
      if (valore > MASSIMO_CONTEGGIO) return { v: null, errore: `Sede «${sede.nome}»: ${campo} è troppo grande (massimo ${MASSIMO_CONTEGGIO}).` };
      return { v: valore };
    };
    const p = intero(v.pizze, "pizze");
    if (p.errore) return errore(400, p.errore);
    const o = intero(v.ordini, "ordini");
    if (o.errore) return errore(400, o.errore);
    if ((p.v === null) !== (o.v === null)) return errore(400, `Sede «${sede.nome}»: indica sia le pizze sia gli ordini (o nessuno dei due per cancellare il dato).`);
    if (o.v === 0 && p.v !== null && p.v > 0) return errore(400, `Sede «${sede.nome}»: con 0 ordini le pizze devono essere 0.`);
    voci.push({ sede, pizze: p.v, ordini: o.v });
  }
  for (const v of voci) {
    const resto = st.statistiche.filter((x) => !(x.sedeId === v.sede.id && x.settimana === lunedi));
    st.statistiche = v.pizze === null || v.ordini === null ? resto : [...resto, { settimana: lunedi, sedeId: v.sede.id, pizze: v.pizze, ordini: v.ordini }];
  }
  salva();
  return ok(settimanaStatistiche(st, lunedi));
}

// GET /statistiche: le settimane il cui lunedi' cade in [da, a]. Nelle somme contano solo le coppie sede-settimana con dati e ordini > 0.
function statistichePeriodo(st: StatoDemo, da: string, a: string, ids: Set<number> | null) {
  const lunedi: string[] = [];
  for (let l = lunediDi(da) < da ? aggiungiGiorni(lunediDi(da), 7) : da; l <= a; l = aggiungiGiorni(l, 7)) lunedi.push(l);
  const scelte = sediInOrdine(st).filter((s) => !ids || ids.has(s.id));
  const ricavi = lunedi.length > 0 ? ricaviPerSettimana(st, lunedi[0]!, aggiungiGiorni(lunedi[lunedi.length - 1]!, 6), ids) : new Map<string, number>();
  const perSede = new Map<number, { pizze: number; ordini: number; ricavi: number; settimane: number }>();
  const conAttivita = new Set<number>();
  const settimane = [];
  const tot = { pizze: 0, ordini: 0, ricavi: 0, settimaneConDati: 0 };
  for (const l of lunedi) {
    const sett = { pizze: 0, ordini: 0, ricavi: 0 };
    let conDati = false;
    const mancanti = [];
    for (const s of scelte) {
      const d = st.statistiche.find((x) => x.sedeId === s.id && x.settimana === l);
      if (ricavi.has(`${s.id}|${l}`)) conAttivita.add(s.id);
      if (!d) {
        if (!s.archiviata) mancanti.push({ id: s.id, nome: s.nome });
        continue;
      }
      conDati = true;
      conAttivita.add(s.id);
      const v = perSede.get(s.id) ?? { pizze: 0, ordini: 0, ricavi: 0, settimane: 0 };
      v.settimane++;
      if (d.ordini > 0) {
        const ric = ricavi.get(`${s.id}|${l}`) ?? 0;
        v.pizze += d.pizze;
        v.ordini += d.ordini;
        v.ricavi += ric;
        sett.pizze += d.pizze;
        sett.ordini += d.ordini;
        sett.ricavi += ric;
      }
      perSede.set(s.id, v);
    }
    if (conDati) tot.settimaneConDati++;
    tot.pizze += sett.pizze;
    tot.ordini += sett.ordini;
    tot.ricavi += sett.ricavi;
    settimane.push({ settimana: l, pizze: sett.pizze, ordini: sett.ordini, ricaviCent: sett.ricavi, scontrinoMedioCent: scontrinoMedio(sett.ricavi, sett.ordini), sediMancanti: mancanti });
  }
  const righe = scelte
    .filter((s) => !s.archiviata || conAttivita.has(s.id))
    .map((s) => {
      const v = perSede.get(s.id) ?? { pizze: 0, ordini: 0, ricavi: 0, settimane: 0 };
      return {
        sede: { id: s.id, nome: s.nome },
        pizze: v.pizze,
        ordini: v.ordini,
        ricaviCent: v.ricavi,
        scontrinoMedioCent: scontrinoMedio(v.ricavi, v.ordini),
        pizzePerOrdine: pizzePerOrdine(v.pizze, v.ordini),
        settimaneConDati: v.settimane,
      };
    });
  return {
    da,
    a,
    totale: {
      pizze: tot.pizze,
      ordini: tot.ordini,
      ricaviCent: tot.ricavi,
      scontrinoMedioCent: scontrinoMedio(tot.ricavi, tot.ordini),
      pizzePerOrdine: pizzePerOrdine(tot.pizze, tot.ordini),
      settimaneConDati: tot.settimaneConDati,
      settimaneTotali: lunedi.length,
    },
    perSede: righe,
    settimane,
  };
}

// ---- anagrafiche ----

function fornitori(q: string) {
  const st = stato();
  const filtro = q.trim().toLowerCase();
  const usi = contaUsi(st, "fornitori");
  return conUsi(st, "fornitori", st.fornitori
    .filter((f) => !filtro || f.nome.toLowerCase().includes(filtro))
    .sort((x, y) => {
      const px = filtro && x.nome.toLowerCase().startsWith(filtro) ? 0 : 1;
      const py = filtro && y.nome.toLowerCase().startsWith(filtro) ? 0 : 1;
      return px - py || (usi.get(y.id) ?? 0) - (usi.get(x.id) ?? 0) || x.nome.localeCompare(y.nome);
    }));
}

// ---- importazione: nella demo i file scelti non si leggono, si mostra sempre lo stesso gruppo di fatture di prova ----

let ultimaAnteprima: AnteprimaImportazione | null = null;

function anteprimaDemo(nomi: string[]): AnteprimaImportazione {
  const st = stato();
  const oggi = oggiIso();
  const base = (i: number, nome: string, iva: string, numero: string, giorniFa: number, imponibile: number, extra: Partial<FatturaLetta> = {}): FatturaLetta => {
    const data = aggiungiGiorni(oggi, -giorniFa);
    const iv = Math.round(imponibile * 0.22);
    const duplicata = st.movimenti.some((m) => m.numeroDocumento === numero && m.fornitore?.nome === nome);
    return {
      indice: i,
      nomeFile: nomi[i % Math.max(nomi.length, 1)] ?? `fattura-${i}.xml`,
      fornitore: { nome, partitaIva: iva },
      numero,
      data,
      imponibileCent: imponibile,
      ivaCent: iv,
      totaleCent: imponibile + iv,
      categoriaSuggerita: st.movimenti.find((m) => m.fornitore?.nome === nome && m.categoria)?.categoria?.nome ?? null,
      duplicata,
      motivo: duplicata ? "Già registrata" : null,
      notaDiCredito: false,
      integrazione: false,
      ...extra,
    };
  };
  const fatture = [
    base(0, "Molino Bianchi Farine", "01234500011", "DEMO-1", 3, 41200),
    base(1, "Caseificio Valle Chiara", "01234500022", "DEMO-2", 4, 28750),
    base(2, "Ortofrutta Il Campo", "01234500033", "DEMO-3", 5, 15620),
    base(3, "Cartiera Nuova Aurora", "01234500101", "DEMO-4", 6, 9800),
    base(4, "Cartiera Nuova Aurora", "01234500101", "DEMO-5", 8, 12400),
    base(5, "Cartiera Nuova Aurora", "01234500101", "DEMO-6", 11, 7300),
    base(6, "Bevande Colli Srl", "01234500055", "DEMO-7", 9, 64300),
    base(7, "Molino Bianchi Farine", "01234500011", "DEMO-8 NC", 10, 9900, { notaDiCredito: true }),
    base(8, "Distributore Estero GmbH", "DE123456789", "DEMO-9", 12, 21000, { integrazione: true }),
  ];
  const errori = [{ nomeFile: nomi[0] ?? "fattura.xml", messaggio: "Tipo di documento TD16 non ammesso: fattura non importata." }];
  ultimaAnteprima = { importazioneId: `demo-${Date.now()}`, fatture, errori };
  return ultimaAnteprima;
}

function confermaImportazione(righe: { indice: number; categoria: string | null }[], sede: SedeDemo) {
  const st = stato();
  let importati = 0;
  const ignorate: { indice: number; motivo: string }[] = [];
  for (const riga of righe) {
    const f = ultimaAnteprima?.fatture.find((x) => x.indice === riga.indice);
    if (!f) {
      ignorate.push({ indice: riga.indice, motivo: "Fattura non trovata: rileggi i file." });
      continue;
    }
    if (f.duplicata || st.movimenti.some((m) => m.numeroDocumento === f.numero && m.fornitore?.nome === f.fornitore.nome)) {
      ignorate.push({ indice: riga.indice, motivo: "Già registrata" });
      continue;
    }
    const categoria = riga.categoria?.trim() || undefined;
    trovaFornitore(st, f.fornitore.nome, f.fornitore.partitaIva);
    const m = aggiungiMovimento(st, f.data, { data: f.data, tipo: "COSTO_VARIABILE", documento: f.notaDiCredito ? "NOTA_DI_CREDITO" : "FATTURA", importoCent: f.totaleCent, sedeId: sede.id }, "XML");
    applica(m, { data: f.data, tipo: "COSTO_VARIABILE", documento: m.documento, importoCent: f.totaleCent, fornitore: f.fornitore.nome, categoria, numeroDocumento: f.numero }, sede);
    importati++;
  }
  return { importati, ignorate };
}

// ---- esportazione: solo CSV, costruito qui ----

const TIPO_FILE: Record<Tipo, string> = { RICAVO: "Ricavo", COSTO_VARIABILE: "Costo variabile", COSTO_FISSO: "Costo fisso" };
const virgola = (cent: number) => `${Math.floor(cent / 100)},${String(cent % 100).padStart(2, "0")}`;
const cella = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function esportaFile(q: URLSearchParams, ids: Set<number> | null): Risposta {
  const da = q.get("da") ?? "";
  const a = q.get("a") ?? "";
  const tipi = (q.get("includi") ?? "").split(",").filter(Boolean);
  const righe = stato()
    .movimenti.filter((m) => m.data >= da && m.data <= a && tipi.includes(m.tipo) && (!ids || ids.has(m.sede.id)))
    .sort((x, y) => (x.data === y.data ? x.id - y.id : x.data < y.data ? -1 : 1));
  const segno = (m: Movimento) => (m.tipo === "RICAVO" || m.documento === "NOTA_DI_CREDITO" ? 1 : -1);
  if (q.get("formato") === "xlsx") {
    const r = riepilogo(da, a, ids);
    const e = (c: number) => c / 100;
    const foglioMovimenti = [
      ["Data", "Tipo", "Documento", "Fornitore", "Categoria", "Descrizione", "Numero", "Dipendente", "Origine", "Importo", "Sede"],
      ...righe.map((m) => [m.data, TIPO_FILE[m.tipo], m.documento, m.fornitore?.nome ?? "", m.categoria?.nome ?? "", m.descrizione ?? "", m.numeroDocumento ?? "", m.dipendente?.nome ?? "", m.origine, segno(m) * e(m.importoCent), m.sede.nome]),
    ];
    // Riepilogo: stesse righe di GET /riepilogo, per sezione una riga per categoria (+ «Senza categoria»), il totale e le somme «di cui» (gia' nel
    // totale). Con «colonnePerSede» una colonna per ogni sede scelta e «Totale» in fondo (solo Excel, il CSV non ha il riepilogo): le righe sono
    // quelle del Riepilogo complessivo, una categoria presente solo in alcune sedi ha 0 nelle altre.
    const chiave = (sezione: string, id: number | null, nome: string) => `${sezione}|${id ?? "senza"}|${nome}`;
    const voci = (x: Riepilogo, base?: Riepilogo): [string, number][] => {
      const sezione = (titolo: string, k: string, parte: Riepilogo["ricavi"] | Riepilogo["costiVariabili"] | Riepilogo["costiFissi"], segno: number, dettaglio: [string, number][]): [string, number][] => {
        const righe: [string, number][] = [];
        // Con `base` le righe sono quelle del complessivo (zero dove questo Riepilogo non ha la categoria).
        const elenco = (base ? (base[k as "ricavi"] as typeof parte).voci : parte.voci);
        for (const v of elenco) {
          const propria = parte.voci.find((p) => chiave(k, p.id, p.categoria) === chiave(k, v.id, v.categoria));
          righe.push([`${titolo}: ${v.categoria}`, segno * e(propria?.importoCent ?? 0)]);
        }
        righe.push([`Totale ${titolo.toLowerCase()}`, segno * e(parte.totaleCent)]);
        for (const [nome, cent] of dettaglio) if (cent > 0 || base) righe.push([`  di cui ${nome}`, segno * e(cent)]);
        return righe;
      };
      return [
        ...sezione("Ricavi", "ricavi", x.ricavi, 1, [["fatturati", x.ricavi.fatturatiCent], ["extra", x.ricavi.extraCent]]),
        ...sezione("Costi variabili", "costiVariabili", x.costiVariabili, -1, [["fatture", x.costiVariabili.fattureCent], ["scontrini", x.costiVariabili.scontriniCent]]),
        ...sezione("Costi fissi", "costiFissi", x.costiFissi, -1, [["retribuzione regolare", x.costiFissi.retribuzioneRegolareCent], ["retribuzione extra", x.costiFissi.retribuzioneExtraCent]]),
        ["Costi", -e(x.costiCent)],
        ["Risultato", e(x.risultatoCent)],
      ];
    };
    const foglioRiepilogo: (string | number)[][] = [["Periodo", `${da} – ${a}`]];
    const sediRiepilogo = r.perSede ?? [];
    if (q.get("colonnePerSede") === "true" && sediRiepilogo.length > 0) {
      const perSede = sediRiepilogo.map((s) => voci(riepilogo(da, a, new Set([s.sede.id])), r));
      foglioRiepilogo.push(["", ...sediRiepilogo.map((s) => s.sede.nome), "Totale"]);
      voci(r, r).forEach(([nome, totale], i) => foglioRiepilogo.push([nome, ...perSede.map((v) => v[i]![1]), totale]));
    } else {
      foglioRiepilogo.push(...voci(r));
    }
    // Ultimo foglio, solo se nel periodo c'e' almeno un dato di pizze e ordini (come il servizio): una riga per dato inserito nelle settimane
    // il cui lunedi' cade in [da, a], con tutti i ricavi della sede in quella settimana.
    const ricaviSettimane = ricaviPerSettimana(stato(), lunediDi(da) < da ? aggiungiGiorni(lunediDi(da), 7) : da, a, ids);
    const righeStat = stato()
      .statistiche.filter((d) => d.settimana >= da && d.settimana <= a && (!ids || ids.has(d.sedeId)))
      .sort((x, y) => (x.settimana < y.settimana ? -1 : x.settimana > y.settimana ? 1 : x.sedeId - y.sedeId))
      .map((d) => {
        const ricavi = ricaviSettimane.get(`${d.sedeId}|${d.settimana}`) ?? 0;
        const medio = scontrinoMedio(ricavi, d.ordini);
        return [d.settimana, stato().sedi.find((x) => x.id === d.sedeId)?.nome ?? "", d.pizze, d.ordini, e(ricavi), medio === null ? "" : e(medio)];
      });
    const fogli = [{ nome: "Movimenti", righe: foglioMovimenti }, { nome: "Riepilogo", righe: foglioRiepilogo }];
    if (q.get("statistiche") !== "false" && righeStat.length > 0) fogli.push({ nome: "Statistiche", righe: [["Settimana", "Sede", "Pizze", "Ordini", "Ricavi", "Scontrino medio"], ...righeStat] });
    return { stato: 200, testo: { contenuto: costruisciXlsx(fogli), tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nomeFile: `contabilita-${da}_${a}.xlsx` } };
  }
  const testa = ["Data", "Tipo", "Documento", "Fornitore", "Categoria", "Descrizione", "Numero", "Dipendente", "Origine", "Importo", "Sede"].join(";");
  const corpo = righe.map((m) =>
    [m.data, TIPO_FILE[m.tipo], m.documento, m.fornitore?.nome ?? "", m.categoria?.nome ?? "", m.descrizione ?? "", m.numeroDocumento ?? "", m.dipendente?.nome ?? "", m.origine, (m.tipo === "RICAVO" || m.documento === "NOTA_DI_CREDITO" ? "" : "-") + virgola(m.importoCent), m.sede.nome].map(cella).join(";"),
  );
  return { stato: 200, testo: { contenuto: "﻿" + [testa, ...corpo].join("\r\n"), tipo: "text/csv;charset=utf-8", nomeFile: `contabilita-${da}_${a}.csv` } };
}

// ---- fatture da fare (stesse regole di docs/api.md, «Fatture da fare») ----

const MASSIMO_MESI_FATTURE = 24;

function fatture(st: StatoDemo, da: string, a: string): Fatture {
  const mesi = elencoMesi(da, a);
  let daFare = 0;
  const caselle = st.fatture.caselle.map((c) => ({
    ...c,
    mesi: mesi.map((mese): MeseFattura => {
      const salvato = st.fatture.mesi.find((x) => x.casellaId === c.id && x.mese === mese);
      const scadenza = dataScadenza(mese, c.giornoScadenza);
      // Prima del mese di creazione, senza uno stato salvato, il mese non conta (niente arretrati).
      if (!salvato) {
        const attiva = mese >= c.dalMese;
        if (attiva) daFare++;
        return { mese, stato: "DA_FARE", importoCent: null, nota: null, attiva, scadenza };
      }
      if (salvato.stato === "DA_FARE") daFare++;
      return { mese, stato: salvato.stato, importoCent: salvato.importoCent, nota: salvato.nota, attiva: true, scadenza };
    }),
  }));
  return { mesi, caselle, daFare };
}

// Il corpo di POST/PUT di una casella. In creazione il nome e' obbligatorio; in modifica basta uno qualunque dei campi.
// `giornoScadenza: null` toglie la scadenza (undefined = non cambia).
interface CorpoCasella {
  nome?: string;
  giornoScadenza?: number | null;
  dalMese?: string;
  errore?: Risposta;
}
function leggiCasella(corpo: unknown, creazione: boolean): CorpoCasella {
  const c = (corpo ?? {}) as { nome?: unknown; giornoScadenza?: unknown; dalMese?: unknown };
  const r: CorpoCasella = {};
  if (creazione || c.nome !== undefined) {
    const nome = typeof c.nome === "string" ? pulito(c.nome) : undefined;
    if (!nome) return { errore: errore(400, "Il nome della casella è obbligatorio.") };
    if (nome.length > MASSIMO_NOME_CASELLA) return { errore: errore(400, `Il nome della casella può avere al massimo ${MASSIMO_NOME_CASELLA} caratteri.`) };
    r.nome = nome;
  }
  if (c.giornoScadenza !== undefined) {
    const g = c.giornoScadenza;
    if (g !== null && (typeof g !== "number" || !Number.isInteger(g) || g < 1 || g > 31)) return { errore: errore(400, "Il giorno di scadenza va da 1 a 31.") };
    r.giornoScadenza = g;
  }
  if (c.dalMese !== undefined) {
    if (typeof c.dalMese !== "string" || !meseValido(c.dalMese)) return { errore: errore(400, "Il mese non è valido (anno-mese, per esempio 2026-11).") };
    r.dalMese = c.dalMese;
  }
  if (!creazione && r.nome === undefined && r.giornoScadenza === undefined && r.dalMese === undefined) return { errore: errore(400, "Indica almeno un campo da cambiare.") };
  return r;
}

// GET /fatture/promemoria: il mese corrente, qualunque periodo guardi l'utente. In scadenza = Da fare con scadenza entro 3 giorni (o gia' passata).
function promemoriaFatture(st: StatoDemo): PromemoriaFatture {
  const oggi = oggiIso();
  const mese = oggi.slice(0, 7);
  let daFare = 0;
  const inScadenza: PromemoriaFatture["inScadenza"] = [];
  for (const c of st.fatture.caselle) {
    const salvato = st.fatture.mesi.find((x) => x.casellaId === c.id && x.mese === mese);
    const attiva = !!salvato || mese >= c.dalMese;
    if (!attiva || (salvato ? salvato.stato : "DA_FARE") !== "DA_FARE") continue;
    daFare++;
    const scadenza = dataScadenza(mese, c.giornoScadenza);
    if (scadenza === null) continue;
    const giorni = giorniMancanti(scadenza, oggi);
    if (giorni <= GIORNI_PREAVVISO) inScadenza.push({ casellaId: c.id, nome: c.nome, mese, scadenza, giorniMancanti: giorni });
  }
  inScadenza.sort((x, y) => x.giorniMancanti - y.giorniMancanti || x.casellaId - y.casellaId);
  return { daFare, inScadenza };
}

function fattureRispondi(st: StatoDemo, metodo: string, percorso: string, q: URLSearchParams, corpo: unknown): Risposta | null {
  let m: RegExpMatchArray | null;
  const f = st.fatture;
  if (percorso === "/fatture/caselle") {
    if (metodo === "GET") return ok(f.caselle);
    if (metodo === "POST") {
      const n = leggiCasella(corpo, true);
      if (n.errore || !n.nome) return n.errore!;
      const esistente = f.caselle.find((c) => c.nome.toLowerCase() === n.nome!.toLowerCase());
      if (esistente) return ok(esistente, 200);
      const nuova = { id: Math.max(0, ...f.caselle.map((c) => c.id)) + 1, nome: n.nome, dalMese: n.dalMese ?? oggiIso().slice(0, 7), giornoScadenza: n.giornoScadenza ?? null };
      f.caselle.push(nuova);
      salva();
      return ok(nuova, 201);
    }
  }
  if ((m = percorso.match(/^\/fatture\/caselle\/(\d+)$/))) {
    const casella = f.caselle.find((c) => c.id === Number(m![1]));
    if (!casella) return errore(404, "Casella non trovata.");
    if (metodo === "PUT") {
      const n = leggiCasella(corpo, false);
      if (n.errore) return n.errore;
      if (n.nome !== undefined && f.caselle.some((c) => c.id !== casella.id && c.nome.toLowerCase() === n.nome!.toLowerCase())) return errore(409, "Esiste già una casella con questo nome.");
      if (n.nome !== undefined) casella.nome = n.nome;
      if (n.giornoScadenza !== undefined) casella.giornoScadenza = n.giornoScadenza;
      if (n.dalMese !== undefined) casella.dalMese = n.dalMese;
      salva();
      return ok(casella);
    }
    if (metodo === "DELETE") {
      f.caselle = f.caselle.filter((c) => c.id !== casella.id);
      f.mesi = f.mesi.filter((x) => x.casellaId !== casella.id);
      salva();
      return { stato: 204 };
    }
  }
  if ((m = percorso.match(/^\/fatture\/caselle\/(\d+)\/mesi\/([^/]+)$/)) && metodo === "PUT") {
    const casella = f.caselle.find((c) => c.id === Number(m![1]));
    if (!casella) return errore(404, "Casella non trovata.");
    const mese = m[2]!;
    if (!meseValido(mese)) return errore(400, "Il mese non è valido (anno-mese, per esempio 2026-11).");
    const c = (corpo ?? {}) as { stato?: unknown; importoCent?: unknown; nota?: unknown };
    if (!STATI.includes(c.stato as StatoFattura)) return errore(400, "Lo stato non è valido.");
    const importo = c.importoCent ?? null;
    if (importo !== null && (typeof importo !== "number" || !Number.isInteger(importo) || importo < 0)) return errore(400, "L'importo non può essere negativo.");
    if (c.nota !== undefined && c.nota !== null && typeof c.nota !== "string") return errore(400, "La nota non è valida.");
    const nota = typeof c.nota === "string" ? (pulito(c.nota) ?? null) : null;
    if (nota && nota.length > MASSIMO_NOTA_FATTURA) return errore(400, `La nota può avere al massimo ${MASSIMO_NOTA_FATTURA} caratteri.`);
    const stato = c.stato as StatoFattura;
    f.mesi = f.mesi.filter((x) => !(x.casellaId === casella.id && x.mese === mese));
    // «Da fare» senza importo ne' nota e' lo stato di partenza: non si salva niente.
    if (stato !== "DA_FARE" || importo !== null || nota !== null) f.mesi.push({ casellaId: casella.id, mese, stato, importoCent: importo, nota });
    salva();
    return ok({ mese, stato, importoCent: importo, nota });
  }
  if (percorso === "/fatture/promemoria" && metodo === "GET") return ok(promemoriaFatture(st));
  if (percorso === "/fatture" && metodo === "GET") {
    const da = q.get("da") ?? "";
    const a = q.get("a") ?? "";
    if (!meseValido(da) || !meseValido(a)) return errore(400, "Servono i mesi da e a nel formato anno-mese (per esempio 2026-11).");
    if (da > a) return errore(400, "Il mese iniziale non può essere dopo quello finale.");
    if (contaMesi(da, a) > MASSIMO_MESI_FATTURE) return errore(400, `Si possono chiedere al massimo ${MASSIMO_MESI_FATTURE} mesi alla volta.`);
    return ok(fatture(st, da, a));
  }
  return null;
}

// ---- instradamento ----

export function rispondi(metodo: string, percorso: string, q: URLSearchParams, corpo: unknown): Risposta {
  const st = stato();
  let m: RegExpMatchArray | null;

  if (percorso === "/versione") return ok({ versione: "demo" });
  if (percorso === "/sedi") {
    if (metodo === "GET") return ok(elencoSedi(st));
    if (metodo === "POST") {
      const nome = pulito((corpo as { nome?: string } | undefined)?.nome);
      if (!nome) return errore(400, "Il nome della sede è obbligatorio.");
      if (nome.length > 120) return errore(400, "Il nome della sede può avere al massimo 120 caratteri.");
      const esistente = st.sedi.find((s) => s.nome.toLowerCase() === nome.toLowerCase());
      if (esistente) return ok(elencoSedi(st).find((s) => s.id === esistente.id), 200);
      const nuova: SedeDemo = { id: Math.max(0, ...st.sedi.map((s) => s.id)) + 1, nome, archiviata: false, ordine: Math.max(0, ...st.sedi.map((s) => s.ordine)) + 1 };
      st.sedi.push(nuova);
      salva();
      return ok(elencoSedi(st).find((s) => s.id === nuova.id), 201);
    }
  }
  if ((m = percorso.match(/^\/sedi\/(\d+)$/))) {
    const sede = st.sedi.find((s) => s.id === Number(m![1]));
    if (!sede) return errore(404, "Sede non trovata.");
    if (metodo === "DELETE") return errore(405, "Una sede non si cancella: si archivia.");
    if (metodo === "PUT") {
      const c = (corpo ?? {}) as { nome?: string; archiviata?: boolean };
      if (c.nome !== undefined) {
        const nome = pulito(c.nome);
        if (!nome) return errore(400, "Il nome della sede è obbligatorio.");
        if (nome.length > 120) return errore(400, "Il nome della sede può avere al massimo 120 caratteri.");
        if (st.sedi.some((s) => s.id !== sede.id && s.nome.toLowerCase() === nome.toLowerCase())) return errore(409, "Esiste già una sede con questo nome.");
        sede.nome = nome;
        for (const mov of st.movimenti) if (mov.sede.id === sede.id) mov.sede = { id: sede.id, nome };
      }
      if (c.archiviata !== undefined) {
        if (c.archiviata && !sede.archiviata && sediAttive(st).length === 1) return errore(409, "Non si può archiviare l'ultima sede attiva.");
        sede.archiviata = c.archiviata;
      }
      salva();
      return ok(elencoSedi(st).find((s) => s.id === sede.id));
    }
  }
  if (percorso.startsWith("/fatture")) {
    const r = fattureRispondi(st, metodo, percorso, q, corpo);
    if (r) return r;
  }
  if (percorso === "/riepilogo" && metodo === "GET") {
    const da = q.get("da");
    const a = q.get("a");
    const f = filtroSedi(q);
    if (f.errore) return errore(400, f.errore);
    return da && a ? ok(riepilogo(da, a, f.ids)) : errore(400, "Indica il periodo (da e a).");
  }
  // GET /statistiche/voci?da=&a=&raggruppa=&tipo=&sedi=: costi e ricavi per fornitore, dipendente o categoria, con i totali mese per mese.
  if (percorso === "/statistiche/voci" && metodo === "GET") {
    const da = q.get("da") ?? "";
    const a = q.get("a") ?? "";
    const raggruppa = raggruppamentoValido(q.get("raggruppa"));
    const tipoGrezzo = q.get("tipo");
    const tipo = tipoGrezzo ? TIPI_VOCI.find((t) => t === tipoGrezzo) : undefined;
    const f = filtroSedi(q);
    if (f.errore) return errore(400, f.errore);
    if (!dataIsoValida(da) || !dataIsoValida(a)) return errore(400, "Indica il periodo (da e a).");
    if (da > a) return errore(400, "La data di inizio non può essere dopo quella di fine.");
    if (!raggruppa) return errore(400, "Indica come raggruppare: FORNITORE, DIPENDENTE o CATEGORIA.");
    if (tipoGrezzo && !tipo) return errore(400, `Valore non valido per «tipo»: ${tipoGrezzo}`);
    return ok(statisticheVoci(st, { da, a, raggruppa, tipo: tipo ?? tipoPredefinito(raggruppa), ids: f.ids }));
  }
  if (percorso === "/statistiche/settimana") {
    if (metodo === "PUT") return salvaSettimanaStatistiche(st, corpo);
    if (metodo === "GET") {
      const data = q.get("data") ?? oggiIso();
      return dataIsoValida(data) ? ok(settimanaStatistiche(st, lunediDi(data))) : errore(400, "Il parametro data non è valido.");
    }
  }
  if (percorso === "/statistiche" && metodo === "GET") {
    const da = q.get("da");
    const a = q.get("a");
    if (!da || !a) return errore(400, "Servono entrambe le date: da e a.");
    if (!dataIsoValida(da) || !dataIsoValida(a)) return errore(400, "Il parametro da o a non è valido.");
    if (da > a) return errore(400, "La data iniziale non può essere dopo quella finale.");
    const f = filtroSedi(q);
    return f.errore ? errore(400, f.errore) : ok(statistichePeriodo(st, da, a, f.ids));
  }
  if (percorso === "/movimenti" && metodo === "GET") {
    const f = filtroSedi(q);
    if (f.errore) return errore(400, f.errore);
    const filtriVoce = erroreFiltriVoce(q);
    return filtriVoce ? errore(400, filtriVoce) : ok(elenco(q, f.ids));
  }
  if (percorso === "/movimenti" && metodo === "POST") {
    const input = corpo as MovimentoInput;
    const e = valida(st, input);
    if (e) return errore(400, e);
    const scelta = sceglieSede(st, input.sedeId);
    if (scelta.errore || !scelta.sede) return errore(400, scelta.errore ?? "Sede non trovata.");
    const nuovo = creaMovimento(input, scelta.sede);
    salva();
    return ok(nuovo, 201);
  }
  // «Dividi»: un movimento (con la sua ripetizione, se c'e') per ogni sede attiva (o solo per quelle di `sedi=1,2`, almeno due), importo in parti uguali (il resto ai primi); tutto o niente.
  if (percorso === "/movimenti/dividi" && metodo === "POST") {
    const input = corpo as MovimentoInput;
    if (input?.sedeId !== undefined && input.sedeId !== null) return errore(400, "Per dividere fra più sedi non indicare la sede.");
    const e = valida(st, input);
    if (e) return errore(400, e);
    const scelte = filtroSedi(q);
    if (scelte.errore) return errore(400, scelte.errore);
    let attive = sediAttive(st);
    if (scelte.ids) {
      if (scelte.ids.size < 2) return errore(400, "Per dividere scegli almeno due sedi.");
      for (const id of scelte.ids) {
        const verifica = sceglieSede(st, id);
        if (verifica.errore) return errore(400, verifica.errore);
      }
      attive = attive.filter((s) => scelte.ids!.has(s.id));
    }
    const parti = dividiImporto(input.importoCent, attive.length);
    const creati = attive.flatMap((s, i) => (parti[i]! > 0 ? [creaMovimento({ ...input, importoCent: parti[i]! }, s)] : []));
    salva();
    return ok(creati, 201);
  }
  if ((m = percorso.match(/^\/movimenti\/(\d+)\/allegato$/))) return NELLA_DEMO("l'allegato di un file");
  // PUT /movimenti/{id}/pagata {pagata}: cambia solo questo campo, e solo per le fatture.
  if ((m = percorso.match(/^\/movimenti\/(\d+)\/pagata$/)) && metodo === "PUT") {
    const mov = st.movimenti.find((x) => x.id === Number(m![1]));
    if (!mov) return errore(404, "Movimento non trovato.");
    const pagata = (corpo as { pagata?: unknown } | undefined)?.pagata;
    if (typeof pagata !== "boolean") return errore(400, "Indica se la fattura è pagata (true o false).");
    if (mov.documento !== "FATTURA") return errore(400, "Solo una fattura si segna come pagata.");
    mov.pagata = pagata;
    salva();
    return ok(mov);
  }
  if ((m = percorso.match(/^\/movimenti\/(\d+)$/))) {
    const mov = st.movimenti.find((x) => x.id === Number(m![1]));
    if (!mov) return errore(404, "Movimento non trovato.");
    if (metodo === "GET") return ok(mov);
    const ambito = q.get("ambito") ?? "SOLO_QUESTO";
    if (metodo === "PUT") {
      const input = corpo as MovimentoInput;
      const e = valida(st, { ...input, ricorrenza: input.ricorrenza ?? null });
      if (e) return errore(400, e);
      // Con sedeId il movimento cambia sede (non verso una archiviata); senza resta nella sua.
      let nuovaSede: SedeDemo | undefined;
      if (input.sedeId !== undefined && input.sedeId !== null) {
        const scelta = sceglieSede(st, input.sedeId);
        if (scelta.errore) return errore(400, scelta.errore);
        nuovaSede = scelta.sede;
      }
      modifica(mov, input, ambito, nuovaSede);
      salva();
      return ok(mov);
    }
    if (metodo === "DELETE") {
      const r = mov.ricorrenza ? st.ricorrenze.find((x) => x.id === mov.ricorrenza?.id) : undefined;
      if (ambito === "QUESTO_E_PROSSIMI" && r) r.attiva = false;
      st.movimenti = st.movimenti.filter((x) => x.id !== mov.id);
      aggiornaRiferimenti(st);
      salva();
      return { stato: 204 };
    }
  }
  if ((m = percorso.match(/^\/ricorrenze\/(\d+)\/(ferma|riattiva)$/)) && metodo === "POST") {
    const r = st.ricorrenze.find((x) => x.id === Number(m![1]));
    if (!r) return errore(404, "Ripetizione non trovata.");
    if (m[2] === "ferma") r.attiva = false;
    else if (!r.attiva) {
      r.attiva = true;
      while (r.prossimaData <= oggiIso()) r.prossimaData = successiva(r.prossimaData, r.unita, r.intervallo, r.giorno);
    }
    aggiornaRiferimenti(st);
    salva();
    return { stato: 204 };
  }
  if (percorso === "/categorie" && metodo === "GET") {
    const tipo = q.get("tipo");
    return ok(conUsi(st, "categorie", st.categorie.filter((c) => !tipo || c.tipo === tipo).sort((x, y) => x.nome.localeCompare(y.nome))));
  }
  // POST /categorie {nome, tipo, retribuzione?}: 201 se nuova, 200 con quella che c'e' (il flag non cambia) se lo stesso nome (senza badare
  // alle maiuscole) esiste nello stesso tipo. `retribuzione=true` solo con COSTO_FISSO, altrimenti 400.
  if (percorso === "/categorie" && metodo === "POST") {
    const c = (corpo ?? {}) as { nome?: unknown; tipo?: unknown; retribuzione?: unknown };
    const nome = typeof c.nome === "string" ? pulito(c.nome) : undefined;
    if (!nome) return errore(400, "Il nome della categoria è obbligatorio.");
    if (nome.length > MASSIMO_NOME_CATEGORIA) return errore(400, `Il nome della categoria può avere al massimo ${MASSIMO_NOME_CATEGORIA} caratteri.`);
    if (c.tipo !== "RICAVO" && c.tipo !== "COSTO_VARIABILE" && c.tipo !== "COSTO_FISSO") return errore(400, "Il tipo della categoria non è valido.");
    if (c.retribuzione !== undefined && typeof c.retribuzione !== "boolean") return errore(400, "Il valore di «retribuzione» non è valido.");
    if (c.retribuzione === true && c.tipo !== "COSTO_FISSO") return errore(400, "Solo una categoria dei costi fissi può essere una retribuzione.");
    const esistente = st.categorie.find((x) => x.tipo === c.tipo && x.nome.toLowerCase() === nome.toLowerCase());
    if (esistente) return ok(esistente);
    trova(st.categorie, nome, c.tipo, c.retribuzione === true);
    salva();
    return ok(st.categorie.find((x) => x.tipo === c.tipo && x.nome === nome), 201);
  }
  if (percorso === "/fornitori" && metodo === "GET") return ok(fornitori(q.get("q") ?? ""));
  if (percorso === "/dipendenti" && metodo === "GET") {
    const filtro = (q.get("q") ?? "").trim().toLowerCase();
    return ok(conUsi(st, "dipendenti", st.dipendenti.filter((d) => !filtro || d.nome.toLowerCase().includes(filtro)).sort((x, y) => x.nome.localeCompare(y.nome))));
  }
  // PUT /{anagrafica}/{id} {nome} (per le categorie anche {retribuzione}): rinomina qualunque voce; DELETE con o senza ?sostituisciCon=.
  if ((m = percorso.match(/^\/(categorie|fornitori|dipendenti)\/(\d+)$/)) && (metodo === "PUT" || metodo === "DELETE")) {
    const anagrafica = m[1] as "categorie" | "fornitori" | "dipendenti";
    const id = Number(m[2]);
    const esito = metodo === "PUT" ? rinominaVoce(st, anagrafica, id, corpo) : eliminaVoce(st, anagrafica, id, q.get("sostituisciCon"));
    if ("errore" in esito) return errore(esito.errore.stato, esito.errore.messaggio);
    salva();
    return metodo === "PUT" ? ok(esito.valore) : { stato: 204 };
  }
  if (percorso === "/rete") return ok({ porta: 8766, indirizzi: [] });
  if (percorso === "/programma" && metodo === "GET") return ok({ versione: "demo", cartellaBackup: "Demo: i dati restano solo su questo telefono", cartellaPredefinita: true, ultimoBackup: null });
  if (percorso === "/programma/backup") return NELLA_DEMO("la copia di sicurezza");
  if (percorso === "/programma/copie") return ok([]);
  if (percorso === "/programma/ripristina") return NELLA_DEMO("il ripristino");
  if (percorso === "/programma/ricomincia" && metodo === "POST") {
    ricomincia();
    return { stato: 204 };
  }
  if (percorso === "/importa/anteprima" && metodo === "POST") return ok(anteprimaDemo(corpo as string[]));
  if (percorso === "/importa/conferma" && metodo === "POST") {
    const c = corpo as { righe: { indice: number; categoria: string | null }[]; sedeId?: number };
    // La sede si controlla prima di salvare qualunque riga.
    const scelta = sceglieSede(st, c.sedeId);
    if (scelta.errore || !scelta.sede) return errore(400, scelta.errore ?? "Sede non trovata.");
    const esito = confermaImportazione(c.righe ?? [], scelta.sede);
    salva();
    return ok(esito);
  }
  if (percorso === "/esporta" && metodo === "GET") {
    const f = filtroSedi(q);
    return f.errore ? errore(400, f.errore) : esportaFile(q, f.ids);
  }
  return errore(404, "Non trovato.");
}

export type { Categoria };
