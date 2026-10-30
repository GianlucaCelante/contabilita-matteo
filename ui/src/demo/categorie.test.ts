import { beforeEach, describe, expect, it } from "vitest";
import type { Categoria, Movimento, Riepilogo } from "../api/tipi";
import { rispondi } from "./backend";
import { aggiungiGiorni, oggiIso } from "./date";
import { ricomincia } from "./stato";

// Categorie personalizzate («Tua») nel servizio finto: docs/api.md, «Anagrafiche» e «Riepilogo».
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const invia = (metodo: string, percorso: string, corpo?: unknown) => rispondi(metodo, percorso, new URLSearchParams(), corpo);
const categorie = (tipo: string) => get("/categorie", `tipo=${tipo}`).corpo as Categoria[];
const nuovoMovimento = (c: object) => invia("POST", "/movimenti", { data: "2019-03-05", sedeId: 1, ...c });
// Un periodo lontano dai dati di prova: ci sono solo i movimenti di questi test.
const PERIODO = "da=2019-03-01&a=2019-03-31";
const riepilogoProva = (extra = "") => get("/riepilogo", `${PERIODO}${extra}`).corpo as Riepilogo;

beforeEach(() => ricomincia());

describe("demo: categorie", () => {
  it("parte con categorie «Tua» realistiche accanto alle predefinite", () => {
    expect(categorie("RICAVO").filter((c) => c.personalizzata).map((c) => c.nome).sort()).toEqual(["Delivery", "Eventi"]);
    const variabili = categorie("COSTO_VARIABILE");
    expect(variabili.find((c) => c.nome === "Farine")?.personalizzata).toBe(false);
    expect(variabili.filter((c) => c.personalizzata).map((c) => c.nome).sort()).toEqual(["Imballaggi", "Pulizia"]);
    expect(categorie("COSTO_FISSO").filter((c) => c.personalizzata).map((c) => c.nome)).toEqual(["Commercialista"]);
  });

  it("i dati di partenza hanno movimenti «Tua» nelle ultime due settimane, e il Riepilogo li mostra come righe proprie", () => {
    const fine = oggiIso();
    const r = get("/riepilogo", `da=${aggiungiGiorni(fine, -14)}&a=${fine}`).corpo as Riepilogo;
    expect(r.ricavi.altreVoci.map((v) => v.categoria)).toContain("Delivery");
    expect(r.costiVariabili.altreVoci.map((v) => v.categoria)).toContain("Imballaggi");
  });

  it("POST crea una categoria personalizzata (201); con lo stesso nome e tipo restituisce quella che c'è (200)", () => {
    const nuova = invia("POST", "/categorie", { nome: "  Packaging ", tipo: "COSTO_VARIABILE" });
    expect(nuova.stato).toBe(201);
    expect(nuova.corpo).toMatchObject({ nome: "Packaging", tipo: "COSTO_VARIABILE", personalizzata: true });
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

  it("una categoria nata al volo dal movimento è personalizzata, anche con il nome di una predefinita di un altro tipo", () => {
    expect(nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 1000, categoria: "Farine" }).stato).toBe(201);
    expect(categorie("RICAVO").find((c) => c.nome === "Farine")?.personalizzata).toBe(true);
    expect(categorie("COSTO_VARIABILE").find((c) => c.nome === "Farine")?.personalizzata).toBe(false);
  });

  it("PUT rinomina una personalizzata, anche solo la grafia, e i movimenti la seguono", () => {
    const delivery = categorie("RICAVO").find((c) => c.nome === "Delivery")!;
    const id = (nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 1000, categoria: "Delivery" }).corpo as Movimento).id;
    const r = invia("PUT", `/categorie/${delivery.id}`, { nome: "  delivery  " });
    expect(r).toMatchObject({ stato: 200, corpo: { id: delivery.id, nome: "delivery", personalizzata: true } });
    expect(invia("PUT", `/categorie/${delivery.id}`, { nome: "Consegne" }).stato).toBe(200);
    expect((get(`/movimenti/${id}`).corpo as Movimento).categoria).toEqual({ id: delivery.id, nome: "Consegne" });
  });

  it("PUT: predefinita 409, nome già usato nello stesso tipo 409, nome vuoto o lungo 400, inesistente 404", () => {
    const farine = categorie("COSTO_VARIABILE").find((c) => c.nome === "Farine")!;
    expect(invia("PUT", `/categorie/${farine.id}`, { nome: "Pasta" })).toMatchObject({ stato: 409, corpo: { errore: "Questa categoria è predefinita e non si rinomina." } });
    const imballaggi = categorie("COSTO_VARIABILE").find((c) => c.nome === "Imballaggi")!;
    expect(invia("PUT", `/categorie/${imballaggi.id}`, { nome: "PULIZIA" })).toMatchObject({ stato: 409, corpo: { errore: "Esiste già una categoria con questo nome." } });
    expect(invia("PUT", `/categorie/${imballaggi.id}`, { nome: "Farine" }).stato).toBe(409);
    // lo stesso nome in un altro tipo va bene
    expect(invia("PUT", `/categorie/${imballaggi.id}`, { nome: "Delivery" }).stato).toBe(200);
    expect(invia("PUT", `/categorie/${imballaggi.id}`, { nome: " " }).stato).toBe(400);
    expect(invia("PUT", `/categorie/${imballaggi.id}`, { nome: "a".repeat(121) }).stato).toBe(400);
    expect(invia("PUT", "/categorie/9999", { nome: "X" }).stato).toBe(404);
  });
});

describe("demo: riepilogo con categorie personalizzate", () => {
  it("senza categorie personalizzate nel periodo il Riepilogo è quello di sempre, con altreVoci vuote", () => {
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 10000 });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 4000, fornitore: "Molino Bianchi Farine", categoria: "Farine" });
    const r = riepilogoProva();
    expect(r.ricavi).toEqual({ fatturatiCent: 10000, extraCent: 0, altreVoci: [], totaleCent: 10000 });
    expect(r.costiVariabili).toEqual({ fattureCent: 4000, scontriniCent: 0, altreVoci: [], totaleCent: 4000 });
  });

  it("un movimento con categoria personalizzata sta solo nella riga della sua categoria; i totali sono la somma di tutto", () => {
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 10000 });
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 3000, categoria: "Catering" });
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_FATTURATO", importoCent: 9000, categoria: "Eventi" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 20000, fornitore: "Imballaggi Rapidi", categoria: "Imballaggi" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 3000, categoria: "Farine" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 1500 });
    const r = riepilogoProva();
    // righe base: solo i movimenti senza categoria personalizzata
    expect(r.ricavi.fatturatiCent).toBe(10000);
    expect(r.ricavi.extraCent).toBe(0);
    // ordine: importo decrescente, poi nome
    expect(r.ricavi.altreVoci).toEqual([
      { categoria: "Eventi", importoCent: 9000 },
      { categoria: "Catering", importoCent: 3000 },
    ]);
    expect(r.ricavi.totaleCent).toBe(22000);
    expect(r.costiVariabili).toMatchObject({ fattureCent: 0, scontriniCent: 4500, altreVoci: [{ categoria: "Imballaggi", importoCent: 20000 }], totaleCent: 24500 });
    expect(r.costiCent).toBe(24500);
    expect(r.risultatoCent).toBe(22000 - 24500);
    expect(r.perSede!.reduce((s, x) => s + x.ricaviCent, 0)).toBe(r.ricavi.totaleCent);
    expect(r.perSede!.reduce((s, x) => s + x.costiCent, 0)).toBe(r.costiCent);
  });

  it("la nota di credito con categoria personalizzata riduce la riga della sua categoria (anche sotto zero) e i costi", () => {
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 20000, fornitore: "Imballaggi Rapidi", categoria: "Imballaggi" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 5000, fornitore: "Imballaggi Rapidi", categoria: "Imballaggi", numeroDocumento: "NC-1" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 2000, fornitore: "Pulizie Brillante", categoria: "Pulizia", numeroDocumento: "NC-2" });
    nuovoMovimento({ tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 1000, fornitore: "Molino Bianchi Farine", categoria: "Farine", numeroDocumento: "NC-3" });
    const r = riepilogoProva();
    expect(r.costiVariabili.altreVoci).toEqual([
      { categoria: "Imballaggi", importoCent: 15000 },
      { categoria: "Pulizia", importoCent: -2000 },
    ]);
    // la nota su una categoria predefinita riduce la riga Fatture, come sempre
    expect(r.costiVariabili.fattureCent).toBe(-1000);
    expect(r.costiVariabili.totaleCent).toBe(12000);
    expect(r.costiCent).toBe(12000);
  });

  it("i costi fissi non cambiano: le voci con documento NESSUNO restano in costiFissi.altreVoci", () => {
    nuovoMovimento({ tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent: 18000, categoria: "Commercialista" });
    nuovoMovimento({ tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent: 90000, categoria: "Affitto" });
    const r = riepilogoProva();
    expect(r.costiFissi.altreVoci).toEqual([
      { categoria: "Affitto", importoCent: 90000 },
      { categoria: "Commercialista", importoCent: 18000 },
    ]);
    expect(r.costiFissi.totaleCent).toBe(108000);
    expect(r.ricavi.altreVoci).toEqual([]);
    expect(r.costiVariabili.altreVoci).toEqual([]);
  });

  it("il filtro per sedi conta solo le sedi scelte; la rinomina cambia il nome della riga", () => {
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 10000, categoria: "Catering", sedeId: 1 });
    nuovoMovimento({ tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 7000, categoria: "Catering", sedeId: 2 });
    expect(riepilogoProva().ricavi.altreVoci).toEqual([{ categoria: "Catering", importoCent: 17000 }]);
    expect(riepilogoProva("&sedi=1").ricavi.altreVoci).toEqual([{ categoria: "Catering", importoCent: 10000 }]);
    expect(riepilogoProva("&sedi=2").ricavi.totaleCent).toBe(7000);
    expect(riepilogoProva("&sedi=3").ricavi.altreVoci).toEqual([]);
    const catering = categorie("RICAVO").find((c) => c.nome === "Catering")!;
    expect(invia("PUT", `/categorie/${catering.id}`, { nome: "Catering e feste" }).stato).toBe(200);
    expect(riepilogoProva().ricavi.altreVoci).toEqual([{ categoria: "Catering e feste", importoCent: 17000 }]);
  });
});
