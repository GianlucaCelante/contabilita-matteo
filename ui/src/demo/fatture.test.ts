import { beforeEach, describe, expect, it } from "vitest";
import type { CasellaFattura, Fatture, MeseFattura, PromemoriaFatture } from "../api/tipi";
import { meseCorrente, aggiungiMesiMese, dataScadenza, giorniMancanti } from "../util/fatture";
import { oggiIso } from "../util/formato";
import { rispondi } from "./backend";
import { ricomincia } from "./stato";

// Il servizio finto della demo deve rispettare il contratto di «Fatture da fare» (docs/api.md).
const vuoto = new URLSearchParams();
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const post = (percorso: string, corpo: unknown) => rispondi("POST", percorso, vuoto, corpo);
const put = (percorso: string, corpo: unknown) => rispondi("PUT", percorso, vuoto, corpo);
const elimina = (percorso: string) => rispondi("DELETE", percorso, vuoto, undefined);
const adesso = meseCorrente();

beforeEach(() => ricomincia());

describe("demo: fatture da fare, caselle", () => {
  it("parte con tre caselle di prova, nell'ordine di creazione", () => {
    const caselle = get("/fatture/caselle").corpo as CasellaFattura[];
    expect(caselle.map((c) => c.nome)).toEqual(["Fatture eventi", "Fatture catering Rossi", "Fatture Euro Service"]);
  });

  it("crea una casella (201); con lo stesso nome, senza badare alle maiuscole, restituisce quella che c'è (200)", () => {
    const nuova = post("/fatture/caselle", { nome: "  Fattura a Bianchi  " });
    expect(nuova.stato).toBe(201);
    expect((nuova.corpo as CasellaFattura).nome).toBe("Fattura a Bianchi");
    const doppia = post("/fatture/caselle", { nome: "fattura a BIANCHI" });
    expect(doppia.stato).toBe(200);
    expect((doppia.corpo as CasellaFattura).id).toBe((nuova.corpo as CasellaFattura).id);
    expect((get("/fatture/caselle").corpo as CasellaFattura[]).length).toBe(4);
  });

  it("rifiuta un nome vuoto o troppo lungo (400)", () => {
    expect(post("/fatture/caselle", { nome: "   " }).stato).toBe(400);
    expect(post("/fatture/caselle", {}).stato).toBe(400);
    expect(post("/fatture/caselle", { nome: "x".repeat(121) }).stato).toBe(400);
  });

  it("rinomina (200), e un nome già usato dà 409; casella inesistente 404", () => {
    expect(put("/fatture/caselle/1", { nome: "Eventi grandi" })).toMatchObject({ stato: 200, corpo: { id: 1, nome: "Eventi grandi" } });
    expect(put("/fatture/caselle/1", { nome: "fatture euro service" })).toMatchObject({ stato: 409, corpo: { errore: "Esiste già una casella con questo nome." } });
    expect(put("/fatture/caselle/1", { nome: "Fatture eventi" }).stato).toBe(200);
    expect(put("/fatture/caselle/1", { nome: "" }).stato).toBe(400);
    expect(put("/fatture/caselle/99", { nome: "Altra" }).stato).toBe(404);
  });

  it("eliminare una casella (204) cancella anche i suoi mesi; se non esiste 404", () => {
    expect(elimina("/fatture/caselle/1").stato).toBe(204);
    expect(elimina("/fatture/caselle/1").stato).toBe(404);
    const d = get("/fatture", `da=${adesso}&a=${adesso}`).corpo as Fatture;
    expect(d.caselle.map((c) => c.id)).toEqual([2, 3]);
    // una casella nuova non eredita i mesi di quella cancellata, nemmeno se riprende lo stesso id
    const nuova = post("/fatture/caselle", { nome: "Nuova" }).corpo as CasellaFattura;
    const letta = (get("/fatture", `da=${adesso}&a=${adesso}`).corpo as Fatture).caselle.find((c) => c.id === nuova.id)!;
    expect(letta.mesi).toEqual([{ mese: adesso, stato: "DA_FARE", importoCent: null, nota: null, attiva: true, scadenza: null }]);
  });
});

describe("demo: fatture da fare, mesi", () => {
  it("GET /fatture: un elemento per mese e per casella, in ordine, con daFare", () => {
    const da = aggiungiMesiMese(adesso, -2);
    const d = get("/fatture", `da=${da}&a=${adesso}`).corpo as Fatture;
    expect(d.mesi).toEqual([da, aggiungiMesiMese(adesso, -1), adesso]);
    expect(d.caselle.every((c) => c.mesi.map((m) => m.mese).join() === d.mesi.join())).toBe(true);
    const daFare = d.caselle.flatMap((c) => c.mesi).filter((m) => m.stato === "DA_FARE").length;
    expect(d.daFare).toBe(daFare);
    // nel mese in corso ce n'è qualcuna da fare (serve alla scheda del Riepilogo)
    const ora = get("/fatture", `da=${adesso}&a=${adesso}`).corpo as Fatture;
    expect(ora.daFare).toBeGreaterThan(0);
  });

  it("rifiuta intervalli non validi (400): formato, ordine, più di 24 mesi", () => {
    expect(get("/fatture", "da=2026-13&a=2026-14").stato).toBe(400);
    expect(get("/fatture", "da=2026-11-01&a=2026-11-30").stato).toBe(400);
    expect(get("/fatture", "da=2026-11").stato).toBe(400);
    expect(get("/fatture", "da=2026-11&a=2026-10").stato).toBe(400);
    expect(get("/fatture", "da=2025-01&a=2026-12").stato).toBe(200);
    expect(get("/fatture", "da=2025-01&a=2027-01").stato).toBe(400);
  });

  it("PUT salva stato, importo e nota; GET li restituisce", () => {
    const r = put(`/fatture/caselle/2/mesi/${adesso}`, { stato: "EMESSA", importoCent: 55000, nota: "N. 60" });
    expect(r).toMatchObject({ stato: 200, corpo: { mese: adesso, stato: "EMESSA", importoCent: 55000, nota: "N. 60" } });
    const m = (get("/fatture", `da=${adesso}&a=${adesso}`).corpo as Fatture).caselle.find((c) => c.id === 2)!.mesi[0] as MeseFattura;
    expect(m).toMatchObject({ mese: adesso, stato: "EMESSA", importoCent: 55000, nota: "N. 60", attiva: true });
  });

  it("DA_FARE senza importo né nota cancella lo stato salvato (si torna al predefinito)", () => {
    const mese = aggiungiMesiMese(adesso, -1);
    expect(put(`/fatture/caselle/1/mesi/${mese}`, { stato: "DA_FARE" })).toMatchObject({ stato: 200, corpo: { stato: "DA_FARE", importoCent: null, nota: null } });
    const m = (get("/fatture", `da=${mese}&a=${mese}`).corpo as Fatture).caselle.find((c) => c.id === 1)!.mesi[0]!;
    expect(m).toMatchObject({ mese, stato: "DA_FARE", importoCent: null, nota: null });
    // con una nota, invece, resta salvato
    put(`/fatture/caselle/1/mesi/${mese}`, { stato: "DA_FARE", nota: "Aspetto i dati" });
    const m2 = (get("/fatture", `da=${mese}&a=${mese}`).corpo as Fatture).caselle.find((c) => c.id === 1)!.mesi[0]!;
    expect(m2.nota).toBe("Aspetto i dati");
  });

  it("400 per mese, stato, importo o nota non validi; 404 per casella inesistente", () => {
    expect(put("/fatture/caselle/1/mesi/2026-13", { stato: "EMESSA" }).stato).toBe(400);
    expect(put("/fatture/caselle/1/mesi/novembre", { stato: "EMESSA" }).stato).toBe(400);
    expect(put(`/fatture/caselle/1/mesi/${adesso}`, { stato: "SPEDITA" }).stato).toBe(400);
    expect(put(`/fatture/caselle/1/mesi/${adesso}`, {}).stato).toBe(400);
    expect(put(`/fatture/caselle/1/mesi/${adesso}`, { stato: "EMESSA", importoCent: -1 }).stato).toBe(400);
    expect(put(`/fatture/caselle/1/mesi/${adesso}`, { stato: "EMESSA", importoCent: 10.5 }).stato).toBe(400);
    expect(put(`/fatture/caselle/1/mesi/${adesso}`, { stato: "EMESSA", importoCent: "12" }).stato).toBe(400);
    expect(put(`/fatture/caselle/1/mesi/${adesso}`, { stato: "EMESSA", nota: "x".repeat(201) }).stato).toBe(400);
    expect(put(`/fatture/caselle/1/mesi/${adesso}`, { stato: "EMESSA", importoCent: 0, nota: "x".repeat(200) }).stato).toBe(200);
    expect(put(`/fatture/caselle/99/mesi/${adesso}`, { stato: "EMESSA" }).stato).toBe(404);
  });
});

describe("demo: caselle con scadenza e mesi attivi", () => {
  const oggi = oggiIso();
  const giornoOggi = Number(oggi.slice(8, 10));

  it("una casella nuova parte dal mese corrente: i mesi prima sono non attivi e non contano", () => {
    const nuova = post("/fatture/caselle", { nome: "Fattura a Bianchi" }).corpo as CasellaFattura;
    expect(nuova).toMatchObject({ dalMese: adesso, giornoScadenza: null });
    const da = aggiungiMesiMese(adesso, -3);
    const d = get("/fatture", `da=${da}&a=${adesso}`).corpo as Fatture;
    const c = d.caselle.find((x) => x.id === nuova.id)!;
    expect(c.mesi.map((m) => m.attiva)).toEqual([false, false, false, true]);
    // gli inattivi non sono «Da fare» per il conteggio
    const attiviDaFare = d.caselle.flatMap((x) => x.mesi).filter((m) => m.attiva && m.stato === "DA_FARE").length;
    expect(d.daFare).toBe(attiviDaFare);
    const senza = get("/fatture", `da=${da}&a=${aggiungiMesiMese(adesso, -1)}`).corpo as Fatture;
    expect(senza.caselle.find((x) => x.id === nuova.id)!.mesi.every((m) => !m.attiva)).toBe(true);
  });

  it("dalMese si puo' dare alla creazione; un mese con uno stato salvato e' sempre attivo", () => {
    const dal = aggiungiMesiMese(adesso, -2);
    const nuova = post("/fatture/caselle", { nome: "Vecchia", dalMese: dal }).corpo as CasellaFattura;
    expect(nuova.dalMese).toBe(dal);
    put(`/fatture/caselle/${nuova.id}/mesi/${aggiungiMesiMese(adesso, -4)}`, { stato: "PAGATA", importoCent: 100 });
    const d = get("/fatture", `da=${aggiungiMesiMese(adesso, -4)}&a=${adesso}`).corpo as Fatture;
    expect(d.caselle.find((x) => x.id === nuova.id)!.mesi.map((m) => m.attiva)).toEqual([true, false, true, true, true]);
  });

  it("la scadenza cade nel mese; nei mesi corti vale l'ultimo giorno", () => {
    const nuova = post("/fatture/caselle", { nome: "Fine mese", giornoScadenza: 31, dalMese: "2026-01" }).corpo as CasellaFattura;
    expect(nuova.giornoScadenza).toBe(31);
    const d = get("/fatture", "da=2026-01&a=2026-04").corpo as Fatture;
    expect(d.caselle.find((x) => x.id === nuova.id)!.mesi.map((m) => m.scadenza)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    // senza giorno di scadenza, scadenza null
    expect((d.caselle.find((x) => x.id === 3)!.mesi[0] as MeseFattura).scadenza).not.toBeNull(); // Euro Service ha una scadenza di prova
    const altra = post("/fatture/caselle", { nome: "Senza", dalMese: "2026-01" }).corpo as CasellaFattura;
    expect((get("/fatture", "da=2026-01&a=2026-01").corpo as Fatture).caselle.find((x) => x.id === altra.id)!.mesi[0]!.scadenza).toBeNull();
  });

  it("PUT cambia scadenza e dalMese; null toglie la scadenza; valori non validi 400; nessun campo 400", () => {
    expect(put("/fatture/caselle/1", { giornoScadenza: 12 })).toMatchObject({ stato: 200, corpo: { id: 1, giornoScadenza: 12, nome: "Fatture eventi" } });
    expect(put("/fatture/caselle/1", { giornoScadenza: null })).toMatchObject({ stato: 200, corpo: { giornoScadenza: null } });
    expect(put("/fatture/caselle/1", { dalMese: "2026-01" })).toMatchObject({ stato: 200, corpo: { dalMese: "2026-01" } });
    for (const v of [0, 32, 1.5, "3"]) expect(put("/fatture/caselle/1", { giornoScadenza: v }).stato).toBe(400);
    expect(put("/fatture/caselle/1", { dalMese: "2026-13" }).stato).toBe(400);
    expect(put("/fatture/caselle/1", {}).stato).toBe(400);
    expect(post("/fatture/caselle", { nome: "X", giornoScadenza: 40 }).stato).toBe(400);
    expect(post("/fatture/caselle", { nome: "X", dalMese: "novembre" }).stato).toBe(400);
  });

  it("le caselle di prova: almeno una Da fare e in scadenza entro tre giorni da oggi", () => {
    const p = get("/fatture/promemoria").corpo as PromemoriaFatture;
    expect(p.inScadenza.length).toBeGreaterThan(0);
    expect(p.inScadenza.every((s) => s.giorniMancanti <= 3)).toBe(true);
    expect(p.inScadenza.some((s) => s.giorniMancanti >= 0)).toBe(true);
  });

  it("promemoria: solo il mese corrente, caselle attive Da fare con scadenza <= 3 giorni, ordinate per giorni mancanti", () => {
    ricomincia();
    // parte da una demo con le caselle di prova; ne aggiungo di mie con scadenze note
    const a = post("/fatture/caselle", { nome: "A oggi", giornoScadenza: giornoOggi }).corpo as CasellaFattura;
    const b = post("/fatture/caselle", { nome: "B senza scadenza" }).corpo as CasellaFattura;
    const c = post("/fatture/caselle", { nome: "C emessa", giornoScadenza: giornoOggi }).corpo as CasellaFattura;
    put(`/fatture/caselle/${c.id}/mesi/${adesso}`, { stato: "EMESSA" });
    const p = get("/fatture/promemoria").corpo as PromemoriaFatture;
    const ids = p.inScadenza.map((s) => s.casellaId);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(ids).not.toContain(c.id);
    const voce = p.inScadenza.find((s) => s.casellaId === a.id)!;
    expect(voce).toMatchObject({ nome: "A oggi", mese: adesso, scadenza: dataScadenza(adesso, giornoOggi), giorniMancanti: giorniMancanti(dataScadenza(adesso, giornoOggi)!, oggi) });
    const giorni = p.inScadenza.map((s) => s.giorniMancanti);
    expect(giorni).toEqual([...giorni].sort((x, y) => x - y));
    // daFare = caselle attive Da fare questo mese
    const ora = get("/fatture", `da=${adesso}&a=${adesso}`).corpo as Fatture;
    expect(p.daFare).toBe(ora.daFare);
  });

  it("promemoria con una casella appena creata e senza scadenza: conta ma non e' in scadenza", () => {
    ricomincia();
    const vuoto = get("/fatture/promemoria").corpo as PromemoriaFatture;
    const n = post("/fatture/caselle", { nome: "Solo promemoria" }).corpo as CasellaFattura;
    const dopo = get("/fatture/promemoria").corpo as PromemoriaFatture;
    expect(dopo.daFare).toBe(vuoto.daFare + 1);
    expect(dopo.inScadenza.map((s) => s.casellaId)).not.toContain(n.id);
  });
});
