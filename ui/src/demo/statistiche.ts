// Pizze e ordini nella demo (docs/api.md, «Statistiche»): stesse regole del servizio (StatisticheService). Pizze e ordini si inseriscono
// in due modi, giorno per giorno o con il totale della settimana; per una (sede, settimana) vale un solo modo: salvare i giorni cancella
// il totale e viceversa. Il totale settimanale conta nel suo lunedi'. Lo scontrino medio usa solo i ricavi dei giorni (o delle settimane
// del totale) con dati e ordini > 0.
import type { FonteStatistica, GiornoStatistica, IntervalloSerie, PassoSerie, RifNome, SedeSerie, RigaSettimana, SerieStatistiche, Settimana, Statistiche, StatisticheSede, StatisticheSettimana } from "../api/tipi";
import { aggiungiGiorni, daIso, iso, lunediDi, oggiIso } from "./date";
import { salva, type SedeDemo, type StatisticaDemo, type StatisticaGiornoDemo, type StatoDemo } from "./stato";

export const MASSIMO_CONTEGGIO = 1_000_000;
export const MASSIMO_INTERVALLI = 400;

export const dataIsoValida = (t: string) => /^\d{4}-\d{2}-\d{2}$/.test(t) && iso(daIso(t)) === t;

// Ricavi / ordini al centesimo e pizze / ordini a due decimali, mezzo in su; null se gli ordini sono 0. Lo scontrino arrotonda come il
// servizio (HALF_UP, lontano da zero) anche con ricavi negativi: si arrotonda il valore assoluto e si rimette il segno (−2,5 → −3).
// Senza ricavi (0) lo scontrino e' null anche con ordini > 0, come il servizio (regola 3): «—», cella vuota nei fogli.
const metaInSu = (ricaviCent: number, ordini: number) => Math.floor((2 * ricaviCent + ordini) / (2 * ordini));
export const scontrinoMedio = (ricaviCent: number, ordini: number): number | null =>
  ordini > 0 && ricaviCent !== 0 ? (ricaviCent < 0 ? -metaInSu(-ricaviCent, ordini) : metaInSu(ricaviCent, ordini)) : null;
export const pizzePerOrdine = (pizze: number, ordini: number): number | null => (ordini > 0 ? Math.floor((200 * pizze + ordini) / (2 * ordini)) / 100 : null);

const perOrdine = (x: SedeDemo, y: SedeDemo) => x.ordine - y.ordine || x.id - y.id;
// Le sedi come le elenca GET /sedi: prima le non archiviate (per ordine), poi le archiviate.
// Le sedi personali (spese dei titolari) non hanno pizze e ordini: qui non compaiono mai, nemmeno scelte con il filtro.
const sediInOrdine = (st: StatoDemo) =>
  st.sedi.filter((s) => !s.personale).sort((x, y) => Number(x.archiviata) - Number(y.archiviata) || perOrdine(x, y));

const chiave = (sedeId: number, giorno: string) => `${sedeId}|${giorno}`;
const ggMmAaaa = (giorno: string) => `${giorno.slice(8, 10)}/${giorno.slice(5, 7)}/${giorno.slice(0, 4)}`;

interface Contributo {
  pizze: number;
  ordini: number;
  ricaviConDati: number;
  // Viene da un totale settimanale (conta tutto sul suo lunedi').
  settimanale: boolean;
}

// I dati inseriti e i ricavi (per sede e giorno) delle settimane intere che toccano [da, a], gia' filtrati per sede.
interface Archivio {
  giorni: Map<string, StatisticaGiornoDemo>;
  // chiave: sede|lunedi'
  settimanali: Map<string, StatisticaDemo>;
  settimaneConGiorni: Set<string>;
  // sede|giorno -> [tutti i ricavi, ricavi extra]
  ricavi: Map<string, [number, number]>;
  // un giorno nel suo giorno, un totale settimanale nel suo lunedi'
  contributi: Map<string, Contributo>;
}

function ricaviFra(ar: Archivio, sedeId: number, da: string, a: string): [number, number] {
  const t: [number, number] = [0, 0];
  for (let g = da; g <= a; g = aggiungiGiorni(g, 1)) {
    const r = ar.ricavi.get(chiave(sedeId, g));
    if (r) {
      t[0] += r[0];
      t[1] += r[1];
    }
  }
  return t;
}

function carica(st: StatoDemo, da: string, a: string, ids: Set<number> | null): Archivio {
  const primo = lunediDi(da);
  const ultimoLunedi = lunediDi(a);
  const ultimo = aggiungiGiorni(ultimoLunedi, 6);
  const ar: Archivio = { giorni: new Map(), settimanali: new Map(), settimaneConGiorni: new Set(), ricavi: new Map(), contributi: new Map() };
  // le sedi personali restano sempre fuori: anche i loro ricavi e i dati inseriti prima che lo diventassero
  const personali = new Set(st.sedi.filter((s) => s.personale).map((s) => s.id));
  const fuori = (sedeId: number) => personali.has(sedeId) || (ids !== null && !ids.has(sedeId));
  for (const d of st.statisticheGiorni) {
    if (d.giorno < primo || d.giorno > ultimo || fuori(d.sedeId)) continue;
    ar.giorni.set(chiave(d.sedeId, d.giorno), d);
    ar.settimaneConGiorni.add(chiave(d.sedeId, lunediDi(d.giorno)));
  }
  for (const d of st.statistiche) {
    if (d.settimana < primo || d.settimana > ultimoLunedi || fuori(d.sedeId)) continue;
    ar.settimanali.set(chiave(d.sedeId, d.settimana), d);
  }
  for (const m of st.movimenti) {
    if (m.tipo !== "RICAVO" || m.data < primo || m.data > ultimo || fuori(m.sede.id)) continue;
    const k = chiave(m.sede.id, m.data);
    const r = ar.ricavi.get(k) ?? [0, 0];
    r[0] += m.importoCent;
    if (m.documento === "RICAVO_EXTRA") r[1] += m.importoCent;
    ar.ricavi.set(k, r);
  }
  for (const [k, d] of ar.giorni) {
    ar.contributi.set(k, { pizze: d.pizze, ordini: d.ordini, ricaviConDati: d.ordini > 0 ? (ar.ricavi.get(k)?.[0] ?? 0) : 0, settimanale: false });
  }
  for (const [k, d] of ar.settimanali) {
    if (ar.settimaneConGiorni.has(k)) continue; // la settimana ha i giorni: il totale non conta (non dovrebbe succedere)
    const ricavi = d.ordini > 0 ? ricaviFra(ar, d.sedeId, d.settimana, aggiungiGiorni(d.settimana, 6))[0] : 0;
    ar.contributi.set(k, { pizze: d.pizze, ordini: d.ordini, ricaviConDati: ricavi, settimanale: true });
  }
  return ar;
}

interface SedeSettimana {
  fonte: FonteStatistica | null;
  pizze: number;
  ordini: number;
  ricaviConDati: number;
  giorniInseriti: number;
}

function riassunto(ar: Archivio, sedeId: number, lunedi: string): SedeSettimana {
  if (ar.settimaneConGiorni.has(chiave(sedeId, lunedi))) {
    const r: SedeSettimana = { fonte: "GIORNI", pizze: 0, ordini: 0, ricaviConDati: 0, giorniInseriti: 0 };
    for (let i = 0; i < 7; i++) {
      const c = ar.contributi.get(chiave(sedeId, aggiungiGiorni(lunedi, i)));
      if (!c) continue;
      r.giorniInseriti++;
      r.pizze += c.pizze;
      r.ordini += c.ordini;
      r.ricaviConDati += c.ricaviConDati;
    }
    return r;
  }
  const c = ar.contributi.get(chiave(sedeId, lunedi));
  if (c) return { fonte: "SETTIMANA", pizze: c.pizze, ordini: c.ordini, ricaviConDati: c.ricaviConDati, giorniInseriti: 0 };
  return { fonte: null, pizze: 0, ordini: 0, ricaviConDati: 0, giorniInseriti: 0 };
}

// ---- GET /statistiche/settimana ----

export function settimanaStatistiche(st: StatoDemo, lunedi: string): Settimana {
  const domenica = aggiungiGiorni(lunedi, 6);
  const ar = carica(st, lunedi, lunedi, null);
  const righe: RigaSettimana[] = [];
  for (const s of sediInOrdine(st)) {
    const r = riassunto(ar, s.id, lunedi);
    const vecchio = ar.settimanali.get(chiave(s.id, lunedi));
    const [totali, extra] = ricaviFra(ar, s.id, lunedi, domenica);
    if (s.archiviata && !r.fonte && !vecchio && totali === 0) continue;
    const giorni: GiornoStatistica[] = [];
    for (let i = 0; i < 7; i++) {
      const g = aggiungiGiorni(lunedi, i);
      const d = ar.giorni.get(chiave(s.id, g));
      const [tg, eg] = ricaviFra(ar, s.id, g, g);
      giorni.push({
        data: g,
        pizze: d?.pizze ?? null,
        ordini: d?.ordini ?? null,
        ricaviTotaliCent: tg,
        ricaviExtraCent: eg,
        scontrinoMedioCent: d ? scontrinoMedio(tg, d.ordini) : null,
        pizzePerOrdine: d ? pizzePerOrdine(d.pizze, d.ordini) : null,
      });
    }
    righe.push({
      sede: { id: s.id, nome: s.nome },
      pizze: r.fonte ? r.pizze : null,
      ordini: r.fonte ? r.ordini : null,
      ricaviCent: totali,
      scontrinoMedioCent: r.fonte ? scontrinoMedio(r.ricaviConDati, r.ordini) : null,
      pizzePerOrdine: r.fonte ? pizzePerOrdine(r.pizze, r.ordini) : null,
      completa: !!r.fonte,
      ricaviTotaliCent: totali,
      ricaviExtraCent: extra,
      ricaviConDatiCent: r.ricaviConDati,
      fonte: r.fonte,
      giorniInseriti: r.giorniInseriti,
      giorni,
    });
  }
  return { settimana: lunedi, fine: domenica, sedi: righe };
}

// ---- inserimento ----

type Esito<T> = { corpo: T; errore?: undefined } | { corpo?: undefined; errore: string };

// Sede esistente e non archiviata.
function sedeScrivibile(st: StatoDemo, sedeId: number): { sede?: SedeDemo; errore?: string } {
  const sede = st.sedi.find((x) => x.id === sedeId);
  if (!sede) return { errore: "Sede non trovata." };
  if (sede.archiviata) return { errore: `La sede «${sede.nome}» è archiviata.` };
  if (sede.personale) return { errore: `La sede «${sede.nome}» è personale: non ha pizze e ordini.` };
  return { sede };
}

// Le regole dei numeri, uguali per giorno e settimana: interi 0..1.000.000, entrambi o nessuno, con 0 ordini 0 pizze.
function numeri(pizzeGrezze: unknown, ordiniGrezzi: unknown, chi: string): { pizze: number | null; ordini: number | null; errore?: string } {
  const intero = (valore: unknown, campo: string): { v: number | null; errore?: string } => {
    if (valore === null || valore === undefined) return { v: null };
    if (typeof valore !== "number" || !Number.isInteger(valore)) return { v: null, errore: `${chi}: ${campo} deve essere un numero intero.` };
    if (valore < 0) return { v: null, errore: `${chi}: ${campo} non può essere negativo.` };
    if (valore > MASSIMO_CONTEGGIO) return { v: null, errore: `${chi}: ${campo} è troppo grande (massimo ${MASSIMO_CONTEGGIO}).` };
    return { v: valore };
  };
  const p = intero(pizzeGrezze, "pizze");
  if (p.errore) return { pizze: null, ordini: null, errore: p.errore };
  const o = intero(ordiniGrezzi, "ordini");
  if (o.errore) return { pizze: null, ordini: null, errore: o.errore };
  if ((p.v === null) !== (o.v === null)) return { pizze: null, ordini: null, errore: `${chi}: indica sia le pizze sia gli ordini (o nessuno dei due per cancellare il dato).` };
  if (o.v === 0 && p.v !== null && p.v > 0) return { pizze: null, ordini: null, errore: `${chi}: con 0 ordini le pizze devono essere 0.` };
  return { pizze: p.v, ordini: o.v };
}

type VoceTotale = { sede: SedeDemo; pizze: number | null; ordini: number | null };
type VoceGiorno = { sede: SedeDemo; giorno: string; pizze: number | null; ordini: number | null };

// Il lunedi' della settimana indicata (un giorno qualsiasi), o l'errore.
function settimanaDa(settimana: unknown): { lunedi?: string; errore?: string } {
  if (typeof settimana !== "string" || !settimana.trim()) return { errore: "Indica la settimana (un giorno qualsiasi, yyyy-MM-dd)." };
  if (!dataIsoValida(settimana.trim())) return { errore: `La settimana non è una data valida (yyyy-MM-dd): ${settimana}` };
  return { lunedi: lunediDi(settimana.trim()) };
}

// Le voci dei totali settimanali, controllate tutte (sede presente, una volta sola, scrivibile; numeri).
function validaTotali(st: StatoDemo, grezze: unknown[]): { voci?: VoceTotale[]; errore?: string } {
  const voci: VoceTotale[] = [];
  const viste = new Set<number>();
  for (const v of grezze as ({ sedeId?: unknown; pizze?: unknown; ordini?: unknown } | null)[]) {
    if (!v || typeof v.sedeId !== "number") return { errore: "Ogni voce deve avere la sede." };
    if (viste.has(v.sedeId)) return { errore: `La sede ${v.sedeId} compare più volte.` };
    viste.add(v.sedeId);
    const { sede, errore } = sedeScrivibile(st, v.sedeId);
    if (!sede) return { errore: errore! };
    const n = numeri(v.pizze, v.ordini, `Sede «${sede.nome}»`);
    if (n.errore) return { errore: n.errore };
    voci.push({ sede, pizze: n.pizze, ordini: n.ordini });
  }
  return { voci };
}

// Le voci dei giorni, controllate tutte; tutti nella stessa settimana: quella di `lunedi` se indicato, altrimenti quella del primo giorno.
function validaGiorni(st: StatoDemo, grezze: unknown[], lunediAtteso: string | null): { voci?: VoceGiorno[]; lunedi?: string; errore?: string } {
  let lunedi = lunediAtteso;
  const voci: VoceGiorno[] = [];
  const viste = new Set<string>();
  for (const v of grezze as ({ sedeId?: unknown; data?: unknown; pizze?: unknown; ordini?: unknown } | null)[]) {
    if (!v || typeof v.sedeId !== "number") return { errore: "Ogni voce deve avere la sede." };
    if (typeof v.data !== "string" || !v.data.trim()) return { errore: "Ogni voce deve avere il giorno (yyyy-MM-dd)." };
    const giorno = v.data.trim();
    if (!dataIsoValida(giorno)) return { errore: `Il giorno non è una data valida (yyyy-MM-dd): ${v.data}` };
    if (lunedi === null) lunedi = lunediDi(giorno);
    else if (lunedi !== lunediDi(giorno)) return { errore: "Tutti i giorni devono essere della stessa settimana (da lunedì a domenica)." };
    const { sede, errore } = sedeScrivibile(st, v.sedeId);
    if (!sede) return { errore: errore! };
    const chi = `Sede «${sede.nome}», ${ggMmAaaa(giorno)}`;
    if (viste.has(chiave(sede.id, giorno))) return { errore: `${chi}: il giorno compare più volte.` };
    viste.add(chiave(sede.id, giorno));
    const n = numeri(v.pizze, v.ordini, chi);
    if (n.errore) return { errore: n.errore };
    // i numeri di un giorno futuro no (cancellarlo si': serve a pulire); il totale settimanale non ha questo limite
    if (n.pizze !== null && giorno > oggiIso()) return { errore: "Non si possono inserire pizze e ordini per un giorno futuro." };
    voci.push({ sede, giorno, pizze: n.pizze, ordini: n.ordini });
  }
  return { voci, lunedi: lunedi ?? undefined };
}

// Upsert (o cancellazione, senza numeri) dei totali; un totale con i numeri cancella i giorni della sua sede nella settimana.
function scriviTotali(st: StatoDemo, voci: VoceTotale[], lunedi: string): void {
  const domenica = aggiungiGiorni(lunedi, 6);
  for (const v of voci) {
    const resto = st.statistiche.filter((x) => !(x.sedeId === v.sede.id && x.settimana === lunedi));
    st.statistiche = v.pizze === null || v.ordini === null ? resto : [...resto, { settimana: lunedi, sedeId: v.sede.id, pizze: v.pizze, ordini: v.ordini }];
    // il totale sostituisce i giorni della sede in quella settimana
    if (v.pizze !== null) st.statisticheGiorni = st.statisticheGiorni.filter((x) => !(x.sedeId === v.sede.id && x.giorno >= lunedi && x.giorno <= domenica));
  }
}

// Upsert (o cancellazione, senza numeri) dei giorni; un giorno con i numeri cancella il totale settimanale della sua sede.
function scriviGiorni(st: StatoDemo, voci: VoceGiorno[], lunedi: string): void {
  for (const v of voci) {
    const resto = st.statisticheGiorni.filter((x) => !(x.sedeId === v.sede.id && x.giorno === v.giorno));
    st.statisticheGiorni = v.pizze === null || v.ordini === null ? resto : [...resto, { giorno: v.giorno, sedeId: v.sede.id, pizze: v.pizze, ordini: v.ordini }];
    if (v.pizze !== null) st.statistiche = st.statistiche.filter((x) => !(x.sedeId === v.sede.id && x.settimana === lunedi));
  }
}

// PUT /statistiche/settimana: il totale della settimana per sede, tutto o niente. Con i numeri cancella i giorni di quella sede in quella
// settimana; senza numeri cancella il totale.
export function salvaSettimana(st: StatoDemo, corpo: unknown): Esito<Settimana> {
  const c = (corpo ?? {}) as { settimana?: unknown; voci?: unknown };
  const { lunedi, errore } = settimanaDa(c.settimana);
  if (!lunedi) return { errore: errore! };
  if (!Array.isArray(c.voci) || c.voci.length === 0) return { errore: "Indica almeno una voce." };
  const t = validaTotali(st, c.voci);
  if (!t.voci) return { errore: t.errore! };
  scriviTotali(st, t.voci, lunedi);
  salva();
  return { corpo: settimanaStatistiche(st, lunedi) };
}

// PUT /statistiche/giorni: tutti i giorni della stessa settimana, tutto o niente; pizze e ordini assenti cancellano il giorno. Un giorno con
// i numeri cancella il totale settimanale della sua sede in quella settimana.
export function salvaGiorni(st: StatoDemo, corpo: unknown): Esito<Settimana> {
  const c = (corpo ?? {}) as { voci?: unknown };
  if (!Array.isArray(c.voci) || c.voci.length === 0) return { errore: "Indica almeno una voce." };
  const g = validaGiorni(st, c.voci, null);
  if (!g.voci || !g.lunedi) return { errore: g.errore! };
  scriviGiorni(st, g.voci, g.lunedi);
  salva();
  return { corpo: settimanaStatistiche(st, g.lunedi) };
}

// PUT /statistiche/settimana-completa: giorni di alcune sedi e totali settimanali di altre in un solo salvataggio, tutto o niente, con le
// regole e i messaggi di /giorni e /settimana; una sede non puo' avere i numeri sia nei giorni sia nei totali.
export function salvaSettimanaCompleta(st: StatoDemo, corpo: unknown): Esito<Settimana> {
  const c = (corpo ?? {}) as { settimana?: unknown; giorni?: unknown; totali?: unknown };
  const { lunedi, errore } = settimanaDa(c.settimana);
  if (!lunedi) return { errore: errore! };
  const giorniGrezzi = Array.isArray(c.giorni) ? c.giorni : [];
  const totaliGrezzi = Array.isArray(c.totali) ? c.totali : [];
  if (giorniGrezzi.length === 0 && totaliGrezzi.length === 0) return { errore: "Indica almeno una voce." };
  const g = validaGiorni(st, giorniGrezzi, lunedi);
  if (!g.voci) return { errore: g.errore! };
  const t = validaTotali(st, totaliGrezzi);
  if (!t.voci) return { errore: t.errore! };
  const conGiorni = new Set(g.voci.filter((v) => v.pizze !== null).map((v) => v.sede.id));
  const doppia = t.voci.find((v) => v.pizze !== null && conGiorni.has(v.sede.id));
  if (doppia) return { errore: `Sede «${doppia.sede.nome}»: scegli un solo modo per la settimana, giorno per giorno o totale della settimana.` };
  scriviTotali(st, t.voci, lunedi);
  scriviGiorni(st, g.voci, lunedi);
  salva();
  return { corpo: settimanaStatistiche(st, lunedi) };
}

// ---- GET /statistiche: le settimane il cui lunedi' cade in [da, a] ----

export function statistichePeriodo(st: StatoDemo, da: string, a: string, ids: Set<number> | null): Statistiche {
  const lunedi: string[] = [];
  for (let l = lunediDi(da) < da ? aggiungiGiorni(lunediDi(da), 7) : da; l <= a; l = aggiungiGiorni(l, 7)) lunedi.push(l);
  const scelte = sediInOrdine(st).filter((s) => !ids || ids.has(s.id));
  const ar = lunedi.length > 0 ? carica(st, lunedi[0]!, lunedi[lunedi.length - 1]!, ids) : null;
  const vuoto = () => ({ pizze: 0, ordini: 0, ricavi: 0, settimane: 0, totali: 0, extra: 0 });
  const perSede = new Map<number, ReturnType<typeof vuoto>>();
  const conAttivita = new Set<number>();
  const settimane: StatisticheSettimana[] = [];
  const tot = { ...vuoto(), settimaneConDati: 0 };
  for (const l of lunedi) {
    const sett = vuoto();
    let conDati = false;
    const mancanti: RifNome[] = [];
    for (const s of scelte) {
      const r = riassunto(ar!, s.id, l);
      const [totali, extra] = ricaviFra(ar!, s.id, l, aggiungiGiorni(l, 6));
      const v = perSede.get(s.id) ?? vuoto();
      perSede.set(s.id, v);
      v.totali += totali;
      v.extra += extra;
      sett.totali += totali;
      sett.extra += extra;
      if (totali !== 0) conAttivita.add(s.id);
      if (!r.fonte) {
        if (!s.archiviata) mancanti.push({ id: s.id, nome: s.nome });
        continue;
      }
      conDati = true;
      conAttivita.add(s.id);
      v.settimane++;
      if (r.ordini > 0) {
        v.pizze += r.pizze;
        v.ordini += r.ordini;
        v.ricavi += r.ricaviConDati;
        sett.pizze += r.pizze;
        sett.ordini += r.ordini;
        sett.ricavi += r.ricaviConDati;
      }
    }
    if (conDati) tot.settimaneConDati++;
    tot.pizze += sett.pizze;
    tot.ordini += sett.ordini;
    tot.ricavi += sett.ricavi;
    tot.totali += sett.totali;
    tot.extra += sett.extra;
    settimane.push({
      settimana: l,
      pizze: sett.pizze,
      ordini: sett.ordini,
      ricaviCent: sett.ricavi,
      scontrinoMedioCent: scontrinoMedio(sett.ricavi, sett.ordini),
      sediMancanti: mancanti,
      ricaviConDatiCent: sett.ricavi,
      ricaviTotaliCent: sett.totali,
      ricaviExtraCent: sett.extra,
    });
  }
  const righe: StatisticheSede[] = scelte
    .filter((s) => !s.archiviata || conAttivita.has(s.id))
    .map((s) => {
      const v = perSede.get(s.id) ?? vuoto();
      return {
        sede: { id: s.id, nome: s.nome },
        pizze: v.pizze,
        ordini: v.ordini,
        ricaviCent: v.ricavi,
        scontrinoMedioCent: scontrinoMedio(v.ricavi, v.ordini),
        pizzePerOrdine: pizzePerOrdine(v.pizze, v.ordini),
        settimaneConDati: v.settimane,
        ricaviConDatiCent: v.ricavi,
        ricaviTotaliCent: v.totali,
        ricaviExtraCent: v.extra,
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
      ricaviConDatiCent: tot.ricavi,
      ricaviTotaliCent: tot.totali,
      ricaviExtraCent: tot.extra,
    },
    perSede: righe,
    settimane,
  };
}

// ---- GET /statistiche/serie ----

const PASSI: readonly PassoSerie[] = ["GIORNO", "SETTIMANA", "MESE"];
const fineMese = (giorno: string) => {
  const d = daIso(giorno);
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
const indiceMese = (giorno: string) => Number(giorno.slice(0, 4)) * 12 + Number(giorno.slice(5, 7)) - 1;
const giorniFra = (da: string, a: string) => Math.round((daIso(a).getTime() - daIso(da).getTime()) / 86_400_000);

// `da` e `a` gia' controllati (date valide, da <= a); `passo` come arriva nella richiesta.
export function serieStatistiche(st: StatoDemo, da: string, a: string, passoGrezzo: string | null, ids: Set<number> | null): Esito<SerieStatistiche> {
  if (!passoGrezzo || !passoGrezzo.trim()) return { errore: "Indica il passo: GIORNO, SETTIMANA o MESE." };
  const passo = PASSI.find((p) => p === passoGrezzo.trim());
  if (!passo) return { errore: `passo: valore non valido: ${passoGrezzo} (GIORNO, SETTIMANA o MESE).` };
  const quanti = passo === "GIORNO" ? giorniFra(da, a) + 1 : passo === "SETTIMANA" ? giorniFra(lunediDi(da), lunediDi(a)) / 7 + 1 : indiceMese(a) - indiceMese(da) + 1;
  if (quanti > MASSIMO_INTERVALLI) return { errore: `Troppi intervalli (${quanti}): al massimo ${MASSIMO_INTERVALLI}. Scegli un passo più lungo o un periodo più breve.` };
  const ar = carica(st, da, a, ids);
  const tutte = perGiornoDi(ar, null);
  const intervalli: IntervalloSerie[] = [];
  for (let inizio = da; inizio <= a; ) {
    let fine = passo === "GIORNO" ? inizio : passo === "SETTIMANA" ? aggiungiGiorni(lunediDi(inizio), 6) : fineMese(inizio);
    if (fine > a) fine = a;
    intervalli.push(intervalloSerie(tutte, inizio, fine));
    inizio = aggiungiGiorni(fine, 1);
  }
  // Per sede, sulle date esatte: le sedi del filtro nell'ordine di GET /sedi; un'archiviata solo se nel periodo ha ricavi o dati.
  const perSede: SedeSerie[] = [];
  for (const s of sediInOrdine(st)) {
    if (ids && !ids.has(s.id)) continue;
    const v = intervalloSerie(perGiornoDi(ar, s.id), da, a);
    if (s.archiviata && !v.conDati && v.ricaviTotaliCent === 0) continue;
    perSede.push({ sedeId: s.id, nome: s.nome, archiviata: s.archiviata, ...v });
  }
  return { corpo: { da, a, passo, totale: intervalloSerie(tutte, da, a), intervalli, perSede } };
}

// Per giorno, le sedi dell'archivio insieme (sedeId null) o una sola:
// [pizze, ordini, ricavi con dati, dati inseriti, ricavi totali, extra, totali settimanali].
function perGiornoDi(ar: Archivio, sedeId: number | null): Map<string, number[]> {
  const perGiorno = new Map<string, number[]>();
  const di = (k: string) => {
    if (sedeId !== null && Number(k.slice(0, k.indexOf("|"))) !== sedeId) return null;
    const g = k.slice(k.indexOf("|") + 1);
    const t = perGiorno.get(g) ?? [0, 0, 0, 0, 0, 0, 0];
    perGiorno.set(g, t);
    return t;
  };
  for (const [k, c] of ar.contributi) {
    const t = di(k);
    if (!t) continue;
    t[0]! += c.pizze;
    t[1]! += c.ordini;
    t[2]! += c.ricaviConDati;
    t[3]! += 1;
    if (c.settimanale) t[6]! += 1;
  }
  for (const [k, r] of ar.ricavi) {
    const t = di(k);
    if (!t) continue;
    t[4]! += r[0];
    t[5]! += r[1];
  }
  return perGiorno;
}

function intervalloSerie(perGiorno: Map<string, number[]>, inizio: string, fine: string): IntervalloSerie {
  const t = [0, 0, 0, 0, 0, 0, 0];
  for (let g = inizio; g <= fine; g = aggiungiGiorni(g, 1)) {
    const d = perGiorno.get(g);
    if (d) for (let i = 0; i < 7; i++) t[i]! += d[i]!;
  }
  const [pizze, ordini, conDati, inseriti, totali, extra, settimanali] = t as [number, number, number, number, number, number, number];
  return {
    inizio, fine, pizze, ordini, ricaviTotaliCent: totali, ricaviExtraCent: extra, ricaviConDatiCent: conDati,
    scontrinoMedioCent: scontrinoMedio(conDati, ordini), pizzePerOrdine: pizzePerOrdine(pizze, ordini), conDati: inseriti > 0, daTotaleSettimanale: settimanali > 0,
  };
}

// ---- esportazione ----

export interface RigheEsportazione {
  // [lunedi', sede, pizze, ordini, ricavi, scontrino | null, extra, ricavi con dati, giorni inseriti | null (= totale settimanale)]
  settimane: [string, string, number, number, number, number | null, number, number, number | null][];
  // [giorno, sede, pizze, ordini, ricavi, extra, scontrino | null]
  giorni: [string, string, number, number, number, number, number | null][];
}

// I fogli «Statistiche» e «Pizze per giorno»: le settimane il cui lunedi' cade in [da, a], per settimana (o giorno) e poi per sede.
export function righeEsportazione(st: StatoDemo, da: string, a: string, ids: Set<number> | null): RigheEsportazione {
  const out: RigheEsportazione = { settimane: [], giorni: [] };
  const primo = lunediDi(da) < da ? aggiungiGiorni(lunediDi(da), 7) : da;
  if (primo > a) return out;
  const ultimo = lunediDi(a);
  const ar = carica(st, primo, ultimo, ids);
  const scelte = sediInOrdine(st).filter((s) => !ids || ids.has(s.id));
  for (let l = primo; l <= ultimo; l = aggiungiGiorni(l, 7)) {
    for (const s of scelte) {
      const r = riassunto(ar, s.id, l);
      if (!r.fonte) continue;
      const [totali, extra] = ricaviFra(ar, s.id, l, aggiungiGiorni(l, 6));
      out.settimane.push([l, s.nome, r.pizze, r.ordini, totali, scontrinoMedio(r.ricaviConDati, r.ordini), extra, r.ricaviConDati, r.fonte === "GIORNI" ? r.giorniInseriti : null]);
    }
    for (let i = 0; i < 7; i++) {
      const g = aggiungiGiorni(l, i);
      for (const s of scelte) {
        const d = ar.giorni.get(chiave(s.id, g));
        if (!d) continue;
        const [tg, eg] = ricaviFra(ar, s.id, g, g);
        // senza incassi nel giorno lo scontrino resta vuoto (come «—» nell'interfaccia), non 0: lo fa scontrinoMedio
        out.giorni.push([g, s.nome, d.pizze, d.ordini, tg, eg, scontrinoMedio(tg, d.ordini)]);
      }
    }
  }
  return out;
}
