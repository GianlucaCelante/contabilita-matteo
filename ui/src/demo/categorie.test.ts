import { beforeEach, describe, expect, it } from "vitest";
import type { Categoria, Movimento, Riepilogo, VoceRiepilogo } from "../api/tipi";
import { rispondi } from "./backend";
import { aggiungiGiorni, oggiIso } from "./date";
import { ricomincia } from "./stato";

// Categorie nel servizio finto (docs/api.md, «Anagrafiche» e «Riepilogo»): non ce ne sono di predefinite, sono tutte dell'utente.
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const invia = (metodo: string, percorso: string, corpo?: unknown) => rispondi(metodo, percorso, new URLSearchParams(), corpo);
const categorie = (tipo: string) => get("/categorie", `tipo=${tipo}`).corpo as Categoria[];
const nuovoMovimento = (c: object) => invia("POST", "/movimenti", { data: "2019-03-05", sedeId: 1, ...c });
// Un periodo lontano dai dati di prova: ci sono solo i movimenti di questi test.
const PERIODO = "da=2019-03-01&a=2019-03-31";
const riepilogoProva = (extra = "") => get("/riepilogo", `${PERIODO}${extra}`).corpo as Riepilogo;
const somma = (v: VoceRiepilogo[]) => v.reduce((s, x) => s + x.importoCent, 0);

beforeEach(() => ricomincia());

describe("demo: categorie", () => {
  it("parte con categorie ordinarie, tutte dell'utente: nessun campo «personalizzata»", () => {
    expect(categorie("RICAVO").map((c) => c.nome)).toEqual(expect.arrayContaining(["Sala", "Delivery", "Eventi"]));
    expect(categorie("COSTO_VARIABILE").map((c) => c.nome)).toEqual(expect.arrayContaining(["Ingredienti", "Bevande", "Carta e contenitori", "Imballaggi", "Pulizia"]));
    expect(categorie("COSTO_FISSO").map((c) => c.nome)).toEqual(expect.arrayContaining(["Affitto", "Luce", "Gas", "Internet", "Assicurazioni", "Commercialista", "Retribuzione"]));
    for (const c of get("/categorie").corpo as Categoria[]) {
      expect(c).not.toHaveProperty("personalizzata");
      expect(typeof c.retribuzione).toBe("boolean");
    }
  });

  it("solo «Retribuzione» fra i costi fissi ha il flag retribuzione; ricavi e costi variabili mai", () => {
    const tutte = get("/categorie").corpo as Categoria[];
    expect(tutte.filter((c) => c.retribuzione).map((c) => `${c.tipo}:${c.nome}`)).toEqual(["COSTO_FISSO:Retribuzione"]);
  });

  it("i dati di partenza hanno movimenti con categoria nelle ultime due settimane, e il Riepilogo li mostra come righe", () => {
    const fine = oggiIso();
    const r = get("/riepilogo", `da=${aggiungiGiorni(fine, -14)}&a=${fine}`).corpo as Riepilogo;
    expect(r.ricavi.voci.map((v) => v.categoria)).toEqual(expect.arrayContaining(["Sala", "Delivery"]));
    expect(r.costiVariabili.voci.map((v) => v.categoria)).toEqual(expect.arrayContaining(["Ingredienti", "Imballaggi"]));
    expect(r.costiFissi.voci.map((v) => v.categoria)).toContain("Retribuzione");
  });

  it("nei dati di partenza quasi tutto ha una categoria, ma qualche movimento no («Senza categoria»)", () => {
    const r = get("/riepilogo", `da=${aggiungiGiorni(oggiIso(), -120)}&a=${oggiIso()}`).corpo as Riepilogo;
    const senza = [r.ricavi, r.costiVariabili].flatMap((s) => s.voci).filter((v) => v.id === null);
    expect(senza.length).toBeGreaterThan(0);
    const senzaCent = senza.reduce((s, v) => s + v.importoCent, 0);
    expect(senzaCent).toBeLessThan((r.ricavi.totaleCent + r.costiVariabili.totaleCent) / 5);
  });

  it("POST crea una categoria (201); con lo stesso nome e tipo restituisce quella che c'è (200)", () => {
    const nuova = invia("POST", "/categorie", { nome: "  Packaging ", tipo: "COSTO_VARIABILE" });
    expect(nuova.stato).toBe(201);
    expect(nuova.corpo).toMatchObject({ nome: "Packaging", tipo: "COSTO_VARIABILE", retribuzione: false });
    const ancora = invia("POST", "/categorie", { nome: "packaging", tipo: "COSTO_VARIABILE" });
    expect(ancora.stato).toBe(200);
    expect((ancora.corpo as Categoria).id).toBe((nuova.corpo as Categoria).id);
    // lo stesso nome in un altro tipo è un'altra categoria
    expect(invia("POST", "/categorie", { nome: "Packaging", tipo: "COSTO_FISSO" }).stato).toBe(201);
  });

  it("POST: nome vuoto, oltre 120 caratteri o tipo non valido sono 400", () => {
    expect(invia("POST", "/categorie", { nome: "  ", tipo: "RICAVO" }).stato).toBe(400);
    expect(invia("POST", "/categorie", { nome: "a".repeat(121), tipo: "RICAVO" }).stato).toBe(400);
    expect(invia("POST", "/categorie", { nome: "a".repeat(120), tipo: "RICAVO" }).stato).toBe(201);
    expect(invia("POST", "/categorie", { nome: "Prova", tipo: "ALTRO" }).stato).toBe(400);
  });

  it("POST con retribuzione=true: solo per i costi fissi (400 altrimenti); se la categoria c'è già il flag non cambia", () => {
    expect(invia("POST", "/categorie", { nome: "Stipendi", tipo: "COSTO_FISSO", retribuzione: true })).toMatchObject({ stato: 201, corpo: { nome: "Stipendi", retribuzione: true } });
    expect(invia("POST", "/categorie", { nome: "Stipendi bis", tipo: "RICAVO", retribuzione: true }).stato).toBe(400);
    expect(invia("POST", "/categorie", { nome: "Stipendi bis", tipo: "COSTO_VARIABILE", retribuzione: true }).stato).toBe(400);
    expect(invia("POST", "/categorie", { nome: "Affitto", tipo: "COSTO_FISSO", retribuzione: true })).toMatchObject({ stato: 200, corpo: { nome: "Affitto", retribuzione: false } });
    expect(invia("POST", "/categorie", { nome: "stipendi", tipo: "COSTO_FISSO" })).toMatchObject({ stato: 200, corpo: { retribuzione: true } });
  });

  it("una categoria nata al volo dal movimento è una categoria come le altre", () => {
    expect(nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 1000, categoria: "Ingredienti" }).stato).toBe(201);
    expect(categorie("RICAVO").find((c) => c.nome === "Ingredienti")).toMatchObject({ retribuzione: false });
    expect(categorie("COSTO_VARIABILE").find((c) => c.nome === "Ingredienti")).toBeDefined();
  });

  it("una categoria creata al volo dal solo nome non e' una retribuzione (serve POST /categorie con il flag)", () => {
    expect(nuovoMovimento({ tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_REGOLARE", importoCent: 5000, categoria: "Paghe", dipendente: "Luca Ferri" }).stato).toBe(400);
    expect(invia("POST", "/categorie", { nome: "Paghe", tipo: "COSTO_FISSO", retribuzione: true }).stato).toBe(201);
    expect(nuovoMovimento({ tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_REGOLARE", importoCent: 5000, categoria: "Paghe", dipendente: "Luca Ferri" }).stato).toBe(201);
    expect(categorie("COSTO_FISSO").find((c) => c.nome === "Paghe")?.retribuzione).toBe(true);
    nuovoMovimento({ tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent: 5000, categoria: "Cancelleria" });
    expect(categorie("COSTO_FISSO").find((c) => c.nome === "Cancelleria")?.retribuzione).toBe(false);
  });

  it("PUT rinomina una categoria, anche solo la grafia, e i movimenti la seguono", () => {
    const delivery = categorie("RICAVO").find((c) => c.nome === "Delivery")!;
    const id = (nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 1000, categoria: "Delivery" }).corpo as Movimento).id;
    const r = invia("PUT", `/categorie/${delivery.id}`, { nome: "  delivery  " });
    expect(r).toMatchObject({ stato: 200, corpo: { id: delivery.id, nome: "delivery", retribuzione: false } });
    expect(invia("PUT", `/categorie/${delivery.id}`, { nome: "Consegne" }).stato).toBe(200);
    expect((get(`/movimenti/${id}`).corpo as Movimento).categoria).toEqual({ id: delivery.id, nome: "Consegne" });
  });

  it("PUT rinomina qualunque categoria (anche una dei dati di partenza): il Riepilogo cambia solo il nome della riga", () => {
    const ingredienti = categorie("COSTO_VARIABILE").find((c) => c.nome === "Ingredienti")!;
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 4000, fornitore: "Molino Bianchi Farine", categoria: "Ingredienti" });
    const prima = riepilogoProva();
    expect(invia("PUT", `/categorie/${ingredienti.id}`, { nome: "Materie prime" })).toMatchObject({ stato: 200, corpo: { id: ingredienti.id, nome: "Materie prime" } });
    const dopo = riepilogoProva();
    expect(dopo.costiVariabili.voci).toEqual([{ id: ingredienti.id, categoria: "Materie prime", importoCent: 4000 }]);
    expect(dopo.costiVariabili.totaleCent).toBe(prima.costiVariabili.totaleCent);
    expect(categorie("COSTO_VARIABILE").some((c) => c.nome === "Ingredienti")).toBe(false);
  });

  it("PUT: nome già usato nello stesso tipo 409, nome vuoto o lungo 400, inesistente 404", () => {
    const imballaggi = categorie("COSTO_VARIABILE").find((c) => c.nome === "Imballaggi")!;
    expect(invia("PUT", `/categorie/${imballaggi.id}`, { nome: "PULIZIA" })).toMatchObject({ stato: 409, corpo: { errore: "Esiste già una categoria con questo nome." } });
    expect(invia("PUT", `/categorie/${imballaggi.id}`, { nome: "Ingredienti" }).stato).toBe(409);
    // lo stesso nome in un altro tipo va bene
    expect(invia("PUT", `/categorie/${imballaggi.id}`, { nome: "Delivery" }).stato).toBe(200);
    expect(invia("PUT", `/categorie/${imballaggi.id}`, { nome: " " }).stato).toBe(400);
    expect(invia("PUT", `/categorie/${imballaggi.id}`, { nome: "a".repeat(121) }).stato).toBe(400);
    expect(invia("PUT", "/categorie/9999", { nome: "X" }).stato).toBe(404);
    // né nome né retribuzione: niente da fare
    expect(invia("PUT", `/categorie/${imballaggi.id}`, {}).stato).toBe(400);
  });
});

describe("demo: il flag retribuzione di una categoria", () => {
  const retribuzione = () => categorie("COSTO_FISSO").find((c) => c.retribuzione)!;

  it("«Retribuzione» si rinomina in «Paghe» e il flag resta", () => {
    const r = retribuzione();
    expect(invia("PUT", `/categorie/${r.id}`, { nome: "Paghe" })).toMatchObject({ stato: 200, corpo: { nome: "Paghe", retribuzione: true } });
    expect(retribuzione().nome).toBe("Paghe");
    expect(categorie("COSTO_FISSO").some((c) => c.nome === "Retribuzione")).toBe(false);
  });

  it("si accende su una categoria dei costi fissi (anche senza nome) e si spegne se non ha retribuzioni", () => {
    const affitto = categorie("COSTO_FISSO").find((c) => c.nome === "Affitto")!;
    expect(invia("PUT", `/categorie/${affitto.id}`, { retribuzione: true })).toMatchObject({ stato: 200, corpo: { nome: "Affitto", retribuzione: true } });
    expect(invia("PUT", `/categorie/${affitto.id}`, { retribuzione: false })).toMatchObject({ stato: 200, corpo: { retribuzione: false } });
    expect(invia("PUT", `/categorie/${affitto.id}`, { nome: "Canone", retribuzione: true })).toMatchObject({ stato: 200, corpo: { nome: "Canone", retribuzione: true } });
  });

  it("su ricavi e costi variabili è 400, e un valore non booleano pure", () => {
    const sala = categorie("RICAVO").find((c) => c.nome === "Sala")!;
    expect(invia("PUT", `/categorie/${sala.id}`, { retribuzione: true }).stato).toBe(400);
    const ingredienti = categorie("COSTO_VARIABILE")[0]!;
    expect(invia("PUT", `/categorie/${ingredienti.id}`, { nome: "Altro nome", retribuzione: true }).stato).toBe(400);
    expect(categorie("COSTO_VARIABILE").some((c) => c.nome === "Altro nome")).toBe(false);
    expect(invia("PUT", `/categorie/${retribuzione().id}`, { retribuzione: "si" }).stato).toBe(400);
  });

  it("non si toglie se ci sono retribuzioni: 409 e niente cambia (nemmeno il nome)", () => {
    const r = retribuzione();
    expect(invia("PUT", `/categorie/${r.id}`, { retribuzione: false })).toMatchObject({ stato: 409, corpo: { errore: "Questa categoria ha già delle retribuzioni." } });
    expect(invia("PUT", `/categorie/${r.id}`, { nome: "Altro", retribuzione: false }).stato).toBe(409);
    expect(retribuzione()).toMatchObject({ id: r.id, nome: "Retribuzione", retribuzione: true });
  });

  it("senza retribuzioni registrate il flag si toglie e il nome si cambia: nulla è «di sistema»", () => {
    const nuova = invia("POST", "/categorie", { nome: "Stipendi", tipo: "COSTO_FISSO", retribuzione: true }).corpo as Categoria;
    expect(invia("PUT", `/categorie/${nuova.id}`, { retribuzione: false })).toMatchObject({ stato: 200, corpo: { retribuzione: false } });
    expect(invia("DELETE", `/categorie/${nuova.id}`).stato).toBe(204);
  });

  it("la categoria con il flag si può eliminare, anche con le sue retribuzioni (restano senza categoria)", () => {
    const r = retribuzione();
    const prima = riepilogoProva();
    nuovoMovimento({ tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_REGOLARE", importoCent: 12000, categoria: r.nome, dipendente: "Luca Ferri" });
    expect(invia("DELETE", `/categorie/${r.id}`).stato).toBe(204);
    const dopo = riepilogoProva();
    expect(dopo.costiFissi.voci).toEqual([{ id: null, categoria: "Senza categoria", importoCent: 12000 }]);
    expect(dopo.costiFissi.retribuzioneRegolareCent).toBe(12000);
    expect(dopo.costiFissi.totaleCent).toBe(prima.costiFissi.totaleCent + 12000);
  });
});

describe("demo: riepilogo, una riga per categoria", () => {
  it("senza movimenti: nessuna riga e tutto a zero", () => {
    const r = riepilogoProva();
    expect(r.ricavi).toEqual({ voci: [], fatturatiCent: 0, extraCent: 0, totaleCent: 0 });
    expect(r.costiVariabili).toEqual({ voci: [], fattureCent: 0, scontriniCent: 0, totaleCent: 0 });
    expect(r.costiFissi).toEqual({ voci: [], retribuzioneRegolareCent: 0, retribuzioneExtraCent: 0, totaleCent: 0 });
  });

  it("una riga per categoria, dall'importo più alto; «Senza categoria» in fondo; la somma delle righe è il totale", () => {
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 10000 });
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 3000, categoria: "Catering" });
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 9000, categoria: "Eventi" });
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 500, categoria: "Eventi" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 20000, fornitore: "Imballaggi Rapidi", categoria: "Imballaggi" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 3000, categoria: "Ingredienti" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 1500 });
    const r = riepilogoProva();
    const id = (nome: string, tipo: string) => categorie(tipo).find((c) => c.nome === nome)!.id;
    expect(r.ricavi.voci).toEqual([
      { id: id("Eventi", "RICAVO"), categoria: "Eventi", importoCent: 9500 },
      { id: id("Catering", "RICAVO"), categoria: "Catering", importoCent: 3000 },
      { id: null, categoria: "Senza categoria", importoCent: 10000 },
    ]);
    expect(r.costiVariabili.voci.map((v) => [v.categoria, v.importoCent])).toEqual([
      ["Imballaggi", 20000],
      ["Ingredienti", 3000],
      ["Senza categoria", 1500],
    ]);
    expect(somma(r.ricavi.voci)).toBe(r.ricavi.totaleCent);
    expect(somma(r.costiVariabili.voci)).toBe(r.costiVariabili.totaleCent);
    expect(r.ricavi.totaleCent).toBe(22500);
    expect(r.costiCent).toBe(24500);
    expect(r.risultatoCent).toBe(22500 - 24500);
    expect(r.perSede!.reduce((s, x) => s + x.ricaviCent, 0)).toBe(r.ricavi.totaleCent);
    expect(r.perSede!.reduce((s, x) => s + x.costiCent, 0)).toBe(r.costiCent);
  });

  it("le somme per documento sono «di cui»: contano tutte le categorie e non si aggiungono al totale", () => {
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 10000, categoria: "Sala" });
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 3000, categoria: "Sala" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 8000, fornitore: "Imballaggi Rapidi", categoria: "Imballaggi" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 900, categoria: "Imballaggi" });
    nuovoMovimento({ tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_REGOLARE", importoCent: 50000, categoria: "Retribuzione", dipendente: "Luca Ferri" });
    nuovoMovimento({ tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_EXTRA", importoCent: 7000, categoria: "Retribuzione", dipendente: "Luca Ferri" });
    nuovoMovimento({ tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent: 90000, categoria: "Affitto" });
    const r = riepilogoProva();
    expect(r.ricavi).toMatchObject({ fatturatiCent: 10000, extraCent: 3000, totaleCent: 13000 });
    expect(r.ricavi.voci).toHaveLength(1);
    expect(r.costiVariabili).toMatchObject({ fattureCent: 8000, scontriniCent: 900, totaleCent: 8900 });
    expect(r.costiVariabili.voci).toEqual([expect.objectContaining({ categoria: "Imballaggi", importoCent: 8900 })]);
    // costi fissi: la categoria con il flag ha la sua riga (57000); il «di cui» è un dettaglio, e i NESSUNO contano solo nelle righe
    expect(r.costiFissi.voci.map((v) => [v.categoria, v.importoCent])).toEqual([
      ["Affitto", 90000],
      ["Retribuzione", 57000],
    ]);
    expect(r.costiFissi).toMatchObject({ retribuzioneRegolareCent: 50000, retribuzioneExtraCent: 7000, totaleCent: 147000 });
  });

  it("la nota di credito riduce la riga della sua categoria (anche sotto zero), il «di cui» fatture e i costi", () => {
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 20000, fornitore: "Imballaggi Rapidi", categoria: "Imballaggi" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 5000, fornitore: "Imballaggi Rapidi", categoria: "Imballaggi", numeroDocumento: "NC-1" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 2000, fornitore: "Pulizie Brillante", categoria: "Pulizia", numeroDocumento: "NC-2" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 1000, fornitore: "Molino Bianchi Farine", numeroDocumento: "NC-3" });
    const r = riepilogoProva();
    expect(r.costiVariabili.voci.map((v) => [v.categoria, v.importoCent])).toEqual([
      ["Imballaggi", 15000],
      ["Pulizia", -2000],
      ["Senza categoria", -1000],
    ]);
    expect(r.costiVariabili.fattureCent).toBe(20000 - 5000 - 2000 - 1000);
    expect(r.costiVariabili.totaleCent).toBe(12000);
    expect(somma(r.costiVariabili.voci)).toBe(12000);
    expect(r.costiCent).toBe(12000);
  });

  it("il filtro per sedi conta solo le sedi scelte; la rinomina cambia il nome della riga", () => {
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 10000, categoria: "Catering", sedeId: 1 });
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 7000, categoria: "Catering", sedeId: 2 });
    const righe = (extra = "") => riepilogoProva(extra).ricavi.voci.map((v) => [v.categoria, v.importoCent]);
    expect(righe()).toEqual([["Catering", 17000]]);
    expect(righe("&sedi=1")).toEqual([["Catering", 10000]]);
    expect(riepilogoProva("&sedi=2").ricavi.totaleCent).toBe(7000);
    expect(righe("&sedi=3")).toEqual([]);
    const catering = categorie("RICAVO").find((c) => c.nome === "Catering")!;
    expect(invia("PUT", `/categorie/${catering.id}`, { nome: "Catering e feste" }).stato).toBe(200);
    expect(righe()).toEqual([["Catering e feste", 17000]]);
  });

  it("l'Excel finto ha nel foglio Riepilogo le righe del servizio: una per categoria, il totale e le somme per documento", () => {
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 10000, categoria: "Sala" });
    nuovoMovimento({ tipo: "COSTO_FISSO", documento: "RETRIBUZIONE_REGOLARE", importoCent: 5000, categoria: "Retribuzione", dipendente: "Luca Ferri" });
    const q = new URLSearchParams(`${PERIODO}&formato=xlsx&statistiche=false`);
    const file = rispondi("GET", "/esporta", q, undefined);
    expect(file.stato).toBe(200);
    const testo = new TextDecoder().decode((file.testo as { contenuto: Uint8Array }).contenuto);
    // i nomi sono quelli di EsportazioneService: la categoria da sola, senza «Ricavi: », e niente «di cui» (dettaglio in esporta.test.ts)
    for (const nome of ["Sala", "Totale ricavi", "Ricavi fatturati", "Retribuzione", "Retribuzione regolare", "Scontrini"]) expect(testo).toContain(`<t>${nome}</t>`);
    expect(testo).not.toContain("Ricavi: Sala");
    expect(testo).not.toContain("di cui");
  });
});
