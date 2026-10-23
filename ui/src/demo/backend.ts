// Il «servizio» della demo: risponde alle stesse chiamate /api dell'app vera, ma dentro il browser,
// con i dati di prova di stato.ts. Niente di questo parte nell'app vera (vedi demo/installa.ts).
import type { Categoria, Documento, Movimento, MovimentoInput, Riepilogo, Tipo } from "../api/tipi";
import type { AnteprimaImportazione, FatturaLetta } from "../api/importa";
import { MASSIMO_INTERVALLO, type UnitaRipetizione } from "../util/ripetizione";
import { costruisciXlsx } from "./xlsx";
import { aggiungiGiorni, daIso, oggiIso, successiva } from "./date";
import {
  aggiornaRiferimenti,
  aggiungiMovimento,
  creaRicorrenza,
  generaScadenze,
  riferimentoRicorrenza,
  ricomincia,
  salva,
  stato,
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

function valida(i: MovimentoInput): string | null {
  if (!i || !i.data || !/^\d{4}-\d{2}-\d{2}$/.test(i.data)) return "La data non è valida.";
  if (!DOCUMENTI[i.tipo]?.includes(i.documento)) return "Il tipo di documento non è valido per questo tipo di movimento.";
  if (!Number.isInteger(i.importoCent) || i.importoCent <= 0) return "L'importo deve essere maggiore di zero.";
  const r = i.ricorrenza;
  if (r) {
    if (i.documento === "RETRIBUZIONE_EXTRA") return "Una retribuzione extra non può essere ricorrente.";
    const unita = r.unita ?? "MESI";
    const n = r.intervallo ?? 1;
    const max = MASSIMO_INTERVALLO[unita];
    if (!Number.isInteger(n) || n < 1 || n > max) return `Ogni quanto: da 1 a ${max}.`;
    if ((unita === "MESI" || unita === "ANNI") && (!r.giorno || r.giorno < 1 || r.giorno > 31)) return "Il giorno della ripetizione va da 1 a 31.";
  }
  return null;
}

const pulito = (s: string | undefined | null) => (s && s.trim() ? s.trim() : undefined);

function applica(m: Movimento, i: MovimentoInput): void {
  const st = stato();
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
}

function elenco(q: URLSearchParams) {
  const da = q.get("da");
  const a = q.get("a");
  const tipo = q.get("tipo");
  const cerca = (q.get("q") ?? "").trim().toLowerCase();
  const dip = q.get("dipendente");
  const elementi = stato()
    .movimenti.filter(
      (m) =>
        (!da || m.data >= da) &&
        (!a || m.data <= a) &&
        (!tipo || m.tipo === tipo) &&
        (!dip || String(m.dipendente?.id) === dip) &&
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

function riepilogo(da: string, a: string): Riepilogo {
  const r = { fat: 0, extra: 0, fatture: 0, scontrini: 0, reg: 0, ext: 0 };
  const altre = new Map<string, number>();
  for (const m of stato().movimenti) {
    if (m.data < da || m.data > a) continue;
    switch (m.documento) {
      case "RICAVO_FATTURATO": r.fat += m.importoCent; break;
      case "RICAVO_EXTRA": r.extra += m.importoCent; break;
      case "FATTURA": r.fatture += m.importoCent; break;
      case "NOTA_DI_CREDITO": r.fatture -= m.importoCent; break;
      case "SCONTRINO": r.scontrini += m.importoCent; break;
      case "RETRIBUZIONE_REGOLARE": r.reg += m.importoCent; break;
      case "RETRIBUZIONE_EXTRA": r.ext += m.importoCent; break;
      default: {
        const nome = m.categoria?.nome ?? "Altre voci fisse";
        altre.set(nome, (altre.get(nome) ?? 0) + m.importoCent);
      }
    }
  }
  const altreVoci = [...altre.entries()].map(([categoria, importoCent]) => ({ categoria, importoCent })).sort((x, y) => y.importoCent - x.importoCent || x.categoria.localeCompare(y.categoria));
  const ricavi = r.fat + r.extra;
  const variabili = r.fatture + r.scontrini;
  const fissi = r.reg + r.ext + altreVoci.reduce((s, v) => s + v.importoCent, 0);
  return {
    da,
    a,
    ricavi: { fatturatiCent: r.fat, extraCent: r.extra, totaleCent: ricavi },
    costiVariabili: { fattureCent: r.fatture, scontriniCent: r.scontrini, totaleCent: variabili },
    costiFissi: { retribuzioneRegolareCent: r.reg, retribuzioneExtraCent: r.ext, altreVoci, totaleCent: fissi },
    costiCent: variabili + fissi,
    risultatoCent: ricavi - variabili - fissi,
  };
}

function creaMovimento(i: MovimentoInput): Movimento {
  const st = stato();
  const m = aggiungiMovimento(st, i.data, { ...i, categoria: undefined, fornitore: undefined, dipendente: undefined }, "MANO");
  applica(m, i);
  if (i.ricorrenza) {
    const unita: UnitaRipetizione = i.ricorrenza.unita ?? "MESI";
    const giorno = i.ricorrenza.giorno ?? daIso(i.data).getDate();
    const r = creaRicorrenza(st, i.data, { ...i, categoria: pulito(i.categoria), fornitore: pulito(i.fornitore), dipendente: pulito(i.dipendente) }, giorno, unita, i.ricorrenza.intervallo ?? 1);
    m.ricorrenza = riferimentoRicorrenza(r);
    generaScadenze(st, oggiIso());
  }
  return m;
}

function modifica(m: Movimento, i: MovimentoInput, ambito: string): void {
  const st = stato();
  applica(m, i);
  m.modificatoIl = `${oggiIso()}T12:00:00`;
  const r = m.ricorrenza ? st.ricorrenze.find((x) => x.id === m.ricorrenza?.id) : undefined;
  if (!r) return;
  if (ambito === "QUESTO_E_PROSSIMI") {
    r.modello = { tipo: i.tipo, documento: i.documento, importoCent: i.importoCent, categoria: pulito(i.categoria), fornitore: pulito(i.fornitore), dipendente: pulito(i.dipendente), descrizione: pulito(i.descrizione), note: pulito(i.note) };
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

// ---- anagrafiche ----

function fornitori(q: string) {
  const st = stato();
  const filtro = q.trim().toLowerCase();
  const usi = new Map<number, number>();
  for (const m of st.movimenti) if (m.fornitore) usi.set(m.fornitore.id, (usi.get(m.fornitore.id) ?? 0) + 1);
  return st.fornitori
    .filter((f) => !filtro || f.nome.toLowerCase().includes(filtro))
    .sort((x, y) => {
      const px = filtro && x.nome.toLowerCase().startsWith(filtro) ? 0 : 1;
      const py = filtro && y.nome.toLowerCase().startsWith(filtro) ? 0 : 1;
      return px - py || (usi.get(y.id) ?? 0) - (usi.get(x.id) ?? 0) || x.nome.localeCompare(y.nome);
    });
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

function confermaImportazione(righe: { indice: number; categoria: string | null }[]) {
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
    const m = aggiungiMovimento(st, f.data, { data: f.data, tipo: "COSTO_VARIABILE", documento: f.notaDiCredito ? "NOTA_DI_CREDITO" : "FATTURA", importoCent: f.totaleCent }, "XML");
    applica(m, { data: f.data, tipo: "COSTO_VARIABILE", documento: m.documento, importoCent: f.totaleCent, fornitore: f.fornitore.nome, categoria, numeroDocumento: f.numero });
    importati++;
  }
  return { importati, ignorate };
}

// ---- esportazione: solo CSV, costruito qui ----

const TIPO_FILE: Record<Tipo, string> = { RICAVO: "Ricavo", COSTO_VARIABILE: "Costo variabile", COSTO_FISSO: "Costo fisso" };
const virgola = (cent: number) => `${Math.floor(cent / 100)},${String(cent % 100).padStart(2, "0")}`;
const cella = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function esportaFile(q: URLSearchParams): Risposta {
  const da = q.get("da") ?? "";
  const a = q.get("a") ?? "";
  const tipi = (q.get("includi") ?? "").split(",").filter(Boolean);
  const righe = stato()
    .movimenti.filter((m) => m.data >= da && m.data <= a && tipi.includes(m.tipo))
    .sort((x, y) => (x.data === y.data ? x.id - y.id : x.data < y.data ? -1 : 1));
  const segno = (m: Movimento) => (m.tipo === "RICAVO" || m.documento === "NOTA_DI_CREDITO" ? 1 : -1);
  if (q.get("formato") === "xlsx") {
    const r = riepilogo(da, a);
    const e = (c: number) => c / 100;
    const foglioMovimenti = [
      ["Data", "Tipo", "Documento", "Fornitore", "Categoria", "Descrizione", "Numero", "Dipendente", "Origine", "Importo"],
      ...righe.map((m) => [m.data, TIPO_FILE[m.tipo], m.documento, m.fornitore?.nome ?? "", m.categoria?.nome ?? "", m.descrizione ?? "", m.numeroDocumento ?? "", m.dipendente?.nome ?? "", m.origine, segno(m) * e(m.importoCent)]),
    ];
    const foglioRiepilogo = [
      ["Periodo", `${da} – ${a}`],
      ["Ricavi", e(r.ricavi.totaleCent)],
      ["Costi variabili", -e(r.costiVariabili.totaleCent)],
      ["Costi fissi", -e(r.costiFissi.totaleCent)],
      ["Risultato", e(r.risultatoCent)],
    ];
    return { stato: 200, testo: { contenuto: costruisciXlsx([{ nome: "Movimenti", righe: foglioMovimenti }, { nome: "Riepilogo", righe: foglioRiepilogo }]), tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nomeFile: `contabilita-${da}_${a}.xlsx` } };
  }
  const testa = ["Data", "Tipo", "Documento", "Fornitore", "Categoria", "Descrizione", "Numero", "Dipendente", "Origine", "Importo"].join(";");
  const corpo = righe.map((m) =>
    [m.data, TIPO_FILE[m.tipo], m.documento, m.fornitore?.nome ?? "", m.categoria?.nome ?? "", m.descrizione ?? "", m.numeroDocumento ?? "", m.dipendente?.nome ?? "", m.origine, (m.tipo === "RICAVO" || m.documento === "NOTA_DI_CREDITO" ? "" : "-") + virgola(m.importoCent)].map(cella).join(";"),
  );
  return { stato: 200, testo: { contenuto: "﻿" + [testa, ...corpo].join("\r\n"), tipo: "text/csv;charset=utf-8", nomeFile: `contabilita-${da}_${a}.csv` } };
}

// ---- instradamento ----

export function rispondi(metodo: string, percorso: string, q: URLSearchParams, corpo: unknown): Risposta {
  const st = stato();
  let m: RegExpMatchArray | null;

  if (percorso === "/versione") return ok({ versione: "demo" });
  if (percorso === "/riepilogo" && metodo === "GET") {
    const da = q.get("da");
    const a = q.get("a");
    return da && a ? ok(riepilogo(da, a)) : errore(400, "Indica il periodo (da e a).");
  }
  if (percorso === "/movimenti" && metodo === "GET") return ok(elenco(q));
  if (percorso === "/movimenti" && metodo === "POST") {
    const input = corpo as MovimentoInput;
    const e = valida(input);
    if (e) return errore(400, e);
    const nuovo = creaMovimento(input);
    salva();
    return ok(nuovo, 201);
  }
  if ((m = percorso.match(/^\/movimenti\/(\d+)\/allegato$/))) return NELLA_DEMO("l'allegato di un file");
  if ((m = percorso.match(/^\/movimenti\/(\d+)$/))) {
    const mov = st.movimenti.find((x) => x.id === Number(m![1]));
    if (!mov) return errore(404, "Movimento non trovato.");
    if (metodo === "GET") return ok(mov);
    const ambito = q.get("ambito") ?? "SOLO_QUESTO";
    if (metodo === "PUT") {
      const input = corpo as MovimentoInput;
      const e = valida({ ...input, ricorrenza: input.ricorrenza ?? null });
      if (e) return errore(400, e);
      modifica(mov, input, ambito);
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
    return ok(st.categorie.filter((c) => !tipo || c.tipo === tipo).sort((x, y) => x.nome.localeCompare(y.nome)));
  }
  if (percorso === "/fornitori" && metodo === "GET") return ok(fornitori(q.get("q") ?? ""));
  if (percorso === "/dipendenti" && metodo === "GET") {
    const filtro = (q.get("q") ?? "").trim().toLowerCase();
    return ok(st.dipendenti.filter((d) => !filtro || d.nome.toLowerCase().includes(filtro)).sort((x, y) => x.nome.localeCompare(y.nome)));
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
    const c = corpo as { righe: { indice: number; categoria: string | null }[] };
    const esito = confermaImportazione(c.righe ?? []);
    salva();
    return ok(esito);
  }
  if (percorso === "/esporta" && metodo === "GET") return esportaFile(q);
  return errore(404, "Non trovato.");
}

export type { Categoria };
