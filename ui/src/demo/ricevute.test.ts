import { beforeEach, describe, expect, it } from "vitest";
import type { ElencoMovimenti, Movimento, MovimentoInput, StatisticheVoci } from "../api/tipi";
import { rispondi } from "./backend";
import { migraStato, ricomincia, stato } from "./stato";
import { aggiungiGiorni, oggiIso } from "./date";

// Fatture ricevute (docs/api.md, «Fatture ricevute»): il campo `pagata`, il filtro, PUT /movimenti/{id}/pagata e `pagataCent`.
const vuoto = new URLSearchParams();
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const post = (percorso: string, corpo: unknown) => rispondi("POST", percorso, vuoto, corpo);
const put = (percorso: string, corpo: unknown) => rispondi("PUT", percorso, vuoto, corpo);
const oggi = oggiIso();
const elenco = (q: string) => (get("/movimenti", q).corpo as ElencoMovimenti).elementi;
const fatture = () => elenco("tipo=COSTO_VARIABILE").filter((m) => m.documento === "FATTURA");

beforeEach(() => ricomincia());

const base: MovimentoInput = { data: oggi, tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 12345, fornitore: "Bel Fungo", sedeId: 1 };

describe("demo: fatture ricevute, dati di prova", () => {
  it("le fatture vecchie (oltre 45 giorni) sono pagate; quelle recenti sono miste", () => {
    const limite = aggiungiGiorni(oggi, -45);
    const tutte = fatture();
    const vecchie = tutte.filter((m) => m.data < limite);
    const recenti = tutte.filter((m) => m.data >= limite);
    expect(vecchie.length).toBeGreaterThan(0);
    expect(vecchie.every((m) => m.pagata)).toBe(true);
    expect(recenti.some((m) => m.pagata)).toBe(true);
    expect(recenti.some((m) => !m.pagata)).toBe(true);
  });
  it("solo le fatture hanno un stato: gli altri documenti sono sempre false", () => {
    const altri = elenco("").filter((m) => m.documento !== "FATTURA");
    expect(altri.length).toBeGreaterThan(0);
    expect(altri.every((m) => m.pagata === false)).toBe(true);
  });
});

describe("demo: movimenti con pagata", () => {
  it("una fattura nuova nasce da pagare; con pagata true nasce pagata", () => {
    const a = post("/movimenti", base).corpo as Movimento;
    expect(a.pagata).toBe(false);
    const b = post("/movimenti", { ...base, pagata: true }).corpo as Movimento;
    expect(b.pagata).toBe(true);
  });
  it("per gli altri documenti pagata si ignora", () => {
    const s = post("/movimenti", { ...base, documento: "SCONTRINO", fornitore: undefined, pagata: true }).corpo as Movimento;
    expect(s.pagata).toBe(false);
    const n = post("/movimenti", { ...base, documento: "NOTA_DI_CREDITO", pagata: true }).corpo as Movimento;
    expect(n.pagata).toBe(false);
  });
  it("in modifica, senza pagata resta com'e'; con pagata cambia", () => {
    const a = post("/movimenti", { ...base, pagata: true }).corpo as Movimento;
    const m1 = put(`/movimenti/${a.id}`, { ...base, importoCent: 999 }).corpo as Movimento;
    expect(m1.pagata).toBe(true);
    const m2 = put(`/movimenti/${a.id}`, { ...base, pagata: false }).corpo as Movimento;
    expect(m2.pagata).toBe(false);
  });
  it("se una fattura diventa scontrino, pagata torna false", () => {
    const a = post("/movimenti", { ...base, pagata: true }).corpo as Movimento;
    const m = put(`/movimenti/${a.id}`, { ...base, documento: "SCONTRINO" }).corpo as Movimento;
    expect(m.pagata).toBe(false);
  });
  it("il filtro pagata tiene solo le fatture pagate / da pagare; valore non valido 400", () => {
    const pagate = elenco("pagata=true");
    const daPagare = elenco("pagata=false");
    expect(pagate.length).toBeGreaterThan(0);
    expect(daPagare.length).toBeGreaterThan(0);
    expect(pagate.every((m) => m.documento === "FATTURA" && m.pagata)).toBe(true);
    expect(daPagare.every((m) => m.documento === "FATTURA" && !m.pagata)).toBe(true);
    expect(pagate.length + daPagare.length).toBe(fatture().length);
    expect(get("/movimenti", "pagata=forse").stato).toBe(400);
  });
});

describe("demo: PUT /movimenti/{id}/pagata", () => {
  it("segna pagata e da pagare, e il movimento aggiornato torna indietro", () => {
    const a = post("/movimenti", base).corpo as Movimento;
    const r = put(`/movimenti/${a.id}/pagata`, { pagata: true });
    expect(r.stato).toBe(200);
    expect((r.corpo as Movimento).pagata).toBe(true);
    expect((get(`/movimenti/${a.id}`).corpo as Movimento).pagata).toBe(true);
    expect((put(`/movimenti/${a.id}/pagata`, { pagata: false }).corpo as Movimento).pagata).toBe(false);
  });
  it("non cambia altro (nemmeno modificatoIl)", () => {
    const a = JSON.parse(JSON.stringify(post("/movimenti", base).corpo)) as Movimento;
    const m = put(`/movimenti/${a.id}/pagata`, { pagata: true }).corpo as Movimento;
    expect(m.pagata).toBe(true);
    expect({ ...m, pagata: false }).toEqual(a);
  });
  it("400 per un documento che non e' una fattura, 400 se pagata manca o non e' booleano, 404 se non esiste", () => {
    const s = post("/movimenti", { ...base, documento: "SCONTRINO", fornitore: undefined }).corpo as Movimento;
    expect(put(`/movimenti/${s.id}/pagata`, { pagata: true })).toMatchObject({ stato: 400, corpo: { errore: "Solo una fattura si segna come pagata." } });
    const a = post("/movimenti", base).corpo as Movimento;
    expect(put(`/movimenti/${a.id}/pagata`, {}).stato).toBe(400);
    expect(put(`/movimenti/${a.id}/pagata`, { pagata: "si" }).stato).toBe(400);
    expect(put(`/movimenti/${a.id}/pagata`, undefined).stato).toBe(400);
    expect(put("/movimenti/99999/pagata", { pagata: true }).stato).toBe(404);
  });
});

describe("demo: statistiche per fornitore con pagataCent", () => {
  const da = aggiungiGiorni(oggi, -60);
  const voci = (raggruppa: string, extra = "") => get("/statistiche/voci", `da=${da}&a=${oggi}&raggruppa=${raggruppa}${extra}`).corpo as StatisticheVoci;

  it("per fornitore: pagataCent = somma delle fatture pagate; le note di credito non sono pagate", () => {
    post("/movimenti", { ...base, fornitore: "Nuovo Fornitore", importoCent: 10000, pagata: true });
    post("/movimenti", { ...base, fornitore: "Nuovo Fornitore", importoCent: 5000 });
    post("/movimenti", { ...base, fornitore: "Nuovo Fornitore", importoCent: 2000, documento: "NOTA_DI_CREDITO" });
    const v = voci("FORNITORE").voci.find((x) => x.nome === "Nuovo Fornitore")!;
    expect(v.totaleCent).toBe(13000);
    expect(v.pagataCent).toBe(10000);
  });
  it("per ogni fornitore pagataCent e' la somma delle sue fatture pagate nel periodo", () => {
    const attese = new Map<number | null, number>();
    for (const m of fatture()) if (m.data >= da && m.data <= oggi && m.pagata) attese.set(m.fornitore?.id ?? null, (attese.get(m.fornitore?.id ?? null) ?? 0) + m.importoCent);
    for (const v of voci("FORNITORE").voci) expect(v.pagataCent).toBe(attese.get(v.id) ?? 0);
  });
  it("e' null con gli altri raggruppamenti", () => {
    expect(voci("CATEGORIA").voci.every((v) => v.pagataCent === null)).toBe(true);
    expect(voci("DIPENDENTE").voci.every((v) => v.pagataCent === null)).toBe(true);
  });
});

describe("demo: importazione XML", () => {
  it("le fatture importate nascono da pagare", () => {
    const anteprima = post("/importa/anteprima", ["a.xml", "b.xml"]).corpo as { fatture: { indice: number; duplicata?: boolean }[] };
    const righe = anteprima.fatture.filter((f) => !f.duplicata).map((f) => ({ indice: f.indice, categoria: null }));
    expect(righe.length).toBeGreaterThan(0);
    const prima = new Set(fatture().map((m) => m.id));
    const esito = post("/importa/conferma", { righe, sedeId: 1 }).corpo as { importati: number };
    expect(esito.importati).toBeGreaterThan(0);
    const nuove = fatture().filter((m) => !prima.has(m.id));
    expect(nuove.length).toBeGreaterThan(0);
    expect(nuove.every((m) => m.origine === "XML" && m.pagata === false)).toBe(true);
  });
});

describe("demo: dati salvati con la forma vecchia", () => {
  it("le fatture gia' presenti risultano pagate, le caselle ricevono dalMese e nessuna scadenza", () => {
    const attuale = JSON.parse(JSON.stringify(stato())) as Record<string, unknown>;
    // com'era prima: niente pagata, niente dalMese/giornoScadenza
    for (const m of attuale.movimenti as Record<string, unknown>[]) delete m.pagata;
    for (const c of (attuale.fatture as { caselle: Record<string, unknown>[] }).caselle) {
      delete c.dalMese;
      delete c.giornoScadenza;
    }
    const migrato = migraStato(attuale);
    const mov = migrato.movimenti;
    expect(mov.filter((m) => m.documento === "FATTURA").every((m) => m.pagata === true)).toBe(true);
    expect(mov.filter((m) => m.documento !== "FATTURA").every((m) => m.pagata === false)).toBe(true);
    for (const c of migrato.fatture.caselle) {
      expect(c.giornoScadenza).toBeNull();
      expect(c.dalMese).toMatch(/^\d{4}-\d{2}$/);
      // non c'e' un mese salvato prima del suo dalMese: niente arretrati nuovi
      expect(migrato.fatture.mesi.filter((x) => x.casellaId === c.id).every((x) => x.mese >= c.dalMese)).toBe(true);
    }
  });
  it("migrare due volte non cambia niente", () => {
    const una = migraStato(JSON.parse(JSON.stringify(stato())));
    const due = migraStato(JSON.parse(JSON.stringify(una)));
    expect(due).toEqual(una);
  });
});
