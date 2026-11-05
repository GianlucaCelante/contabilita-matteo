import { beforeEach, describe, expect, it } from "vitest";
import type { Categoria, Dipendente, Fornitore, Movimento, StatisticheVoci } from "../api/tipi";
import { rispondi } from "./backend";
import { ricomincia } from "./stato";

// Il servizio finto rispetta il contratto di docs/api.md: «Gestione di categorie, fornitori e dipendenti» e «Statistiche per voce».
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const invia = (metodo: string, percorso: string, corpo?: unknown, q = "") => rispondi(metodo, percorso, new URLSearchParams(q), corpo);
const nuovo = (c: object) => invia("POST", "/movimenti", { sedeId: 1, ...c }).corpo as Movimento;
// Periodo lontano dai dati di prova: ci sono solo i movimenti di questi test.
const P = "da=2019-02-10&a=2019-04-20";
const voci = (extra: string) => get("/statistiche/voci", `${P}&${extra}`);

beforeEach(() => ricomincia());

describe("demo: usi, PUT e DELETE di categorie, fornitori e dipendenti", () => {
  it("le GET elencano usi (numero di movimenti)", () => {
    nuovo({ data: "2019-03-05", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 1000, fornitore: "Bel Fungo", categoria: "Funghi" });
    nuovo({ data: "2019-03-06", tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 500, fornitore: "Bel Fungo" });
    expect((get("/fornitori", "q=bel").corpo as Fornitore[])[0]).toMatchObject({ nome: "Bel Fungo", usi: 2 });
    expect((get("/categorie", "tipo=COSTO_VARIABILE").corpo as Categoria[]).find((c) => c.nome === "Funghi")?.usi).toBe(1);
    expect((get("/dipendenti").corpo as Dipendente[]).every((d) => typeof d.usi === "number")).toBe(true);
  });

  it("PUT rinomina fornitore e dipendente, anche solo la grafia; i movimenti seguono", () => {
    const m = nuovo({ data: "2019-03-05", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 1000, fornitore: "Bel Fungho" });
    const f = (get("/fornitori", "q=fungho").corpo as Fornitore[])[0]!;
    expect(invia("PUT", `/fornitori/${f.id}`, { nome: "Bel Fungo" })).toMatchObject({ stato: 200, corpo: { id: f.id, nome: "Bel Fungo", usi: 1 } });
    expect((get(`/movimenti/${m.id}`).corpo as Movimento).fornitore).toEqual({ id: f.id, nome: "Bel Fungo" });
    expect(invia("PUT", `/fornitori/${f.id}`, { nome: "BEL FUNGO" }).stato).toBe(200);
    const d = (get("/dipendenti").corpo as Dipendente[])[0]!;
    expect(invia("PUT", `/dipendenti/${d.id}`, { nome: "Nuovo Nome" }).stato).toBe(200);
  });

  it("PUT: nome già usato 409, vuoto o lungo 400, inesistente 404", () => {
    const [a, b] = get("/dipendenti").corpo as Dipendente[];
    expect(invia("PUT", `/dipendenti/${a!.id}`, { nome: b!.nome.toLowerCase() })).toMatchObject({ stato: 409, corpo: { errore: "Esiste già un dipendente con questo nome." } });
    expect(invia("PUT", `/dipendenti/${a!.id}`, { nome: " " }).stato).toBe(400);
    expect(invia("PUT", `/fornitori/${a!.id}`, { nome: "x".repeat(121) }).stato).toBe(400);
    expect(invia("PUT", "/fornitori/99999", { nome: "X" }).stato).toBe(404);
  });

  it("DELETE senza parametri lascia i movimenti senza la voce (campo null) e toglie la voce dall'elenco", () => {
    const m = nuovo({ data: "2019-03-05", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 1000, fornitore: "Da Togliere", categoria: "Farine" });
    const f = (get("/fornitori", "q=togliere").corpo as Fornitore[])[0]!;
    expect(invia("DELETE", `/fornitori/${f.id}`).stato).toBe(204);
    expect((get(`/movimenti/${m.id}`).corpo as Movimento).fornitore).toBeNull();
    expect((get(`/movimenti/${m.id}`).corpo as Movimento).categoria).not.toBeNull();
    expect(get("/fornitori", "q=togliere").corpo).toEqual([]);
    expect(invia("DELETE", `/fornitori/${f.id}`).stato).toBe(404);
  });

  it("DELETE con sostituisciCon unisce: sposta movimenti e ripetizioni sull'altra voce", () => {
    const a = nuovo({ data: "2019-03-05", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 1000, fornitore: "Doppione" });
    const rip = nuovo({ data: "2019-03-06", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 700, fornitore: "Doppione", ricorrenza: { giorno: 6 } });
    const giusto = nuovo({ data: "2019-03-07", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 100, fornitore: "Giusto" });
    const idGiusto = giusto.fornitore!.id;
    expect(invia("DELETE", `/fornitori/${a.fornitore!.id}`, undefined, `sostituisciCon=${idGiusto}`).stato).toBe(204);
    expect((get(`/movimenti/${a.id}`).corpo as Movimento).fornitore).toEqual({ id: idGiusto, nome: "Giusto" });
    expect((get(`/movimenti/${rip.id}`).corpo as Movimento).fornitore?.id).toBe(idGiusto);
    // anche le occorrenze registrate dalla ripetizione vanno sul fornitore tenuto
    const tutti = (get("/movimenti", "da=2019-01-01&a=2030-12-31").corpo as { elementi: Movimento[] }).elementi;
    expect(tutti.filter((x) => x.fornitore?.nome === "Doppione")).toEqual([]);
    expect((get("/fornitori", "q=Giusto").corpo as Fornitore[])[0]!.usi).toBeGreaterThanOrEqual(3);
  });

  it("DELETE con sostituisciCon: se stessa 400, inesistente 404, categoria di tipo diverso 400 (tutto o niente)", () => {
    const f = (get("/fornitori").corpo as Fornitore[])[0]!;
    expect(invia("DELETE", `/fornitori/${f.id}`, undefined, `sostituisciCon=${f.id}`).stato).toBe(400);
    expect(invia("DELETE", `/fornitori/${f.id}`, undefined, "sostituisciCon=99999").stato).toBe(404);
    const ricavo = (get("/categorie", "tipo=RICAVO").corpo as Categoria[])[0]!;
    const costo = (get("/categorie", "tipo=COSTO_VARIABILE").corpo as Categoria[])[0]!;
    expect(invia("DELETE", `/categorie/${ricavo.id}`, undefined, `sostituisciCon=${costo.id}`).stato).toBe(400);
    expect((get("/categorie", "tipo=RICAVO").corpo as Categoria[]).some((c) => c.id === ricavo.id)).toBe(true);
  });
});

describe("demo: GET /statistiche/voci", () => {
  it("parametri non validi sono 400", () => {
    expect(get("/statistiche/voci", P).stato).toBe(400);
    expect(voci("raggruppa=ALTRO").stato).toBe(400);
    expect(voci("raggruppa=FORNITORE&tipo=BOH").stato).toBe(400);
    expect(get("/statistiche/voci", "da=2019-05-01&a=2019-04-20&raggruppa=FORNITORE").stato).toBe(400);
    expect(voci("raggruppa=FORNITORE&sedi=x").stato).toBe(400);
  });

  it("mesi di calendario, perMese che somma al totale, ordine per totale poi nome, nota di credito che riduce", () => {
    const doc = (data: string, importoCent: number, fornitore: string, documento = "FATTURA") =>
      nuovo({ data, tipo: "COSTO_VARIABILE", documento, importoCent, fornitore, ...(documento === "NOTA_DI_CREDITO" ? { numeroDocumento: "NC" } : {}) });
    doc("2019-02-12", 30000, "Bel Fungo");
    doc("2019-03-31", 50000, "Bel Fungo");
    doc("2019-03-10", 80000, "Alfa");
    doc("2019-04-01", 10000, "Bel Fungo", "NOTA_DI_CREDITO");
    doc("2019-05-02", 99999, "Bel Fungo"); // fuori periodo
    const r = voci("raggruppa=FORNITORE").corpo as StatisticheVoci;
    expect(r.mesi).toEqual(["2019-02", "2019-03", "2019-04"]);
    expect(r.voci.map((v) => v.nome)).toEqual(["Alfa", "Bel Fungo"]);
    expect(r.voci[0]).toMatchObject({ totaleCent: 80000, movimenti: 1, perMese: [0, 80000, 0] });
    expect(r.voci[1]).toMatchObject({ totaleCent: 70000, movimenti: 3, perMese: [30000, 50000, -10000] });
    for (const v of r.voci) expect(v.perMese.reduce((t, x) => t + x, 0)).toBe(v.totaleCent);
    expect(r.totaleCent).toBe(150000);
    expect(r.movimenti).toBe(4);
  });

  it("riga «Senza …» con id null, in fondo; tipo predefinito per raggruppa", () => {
    nuovo({ data: "2019-03-05", tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 100000 });
    nuovo({ data: "2019-03-05", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 500, fornitore: "Piccolo" });
    nuovo({ data: "2019-03-06", tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 7000 });
    const f = voci("raggruppa=FORNITORE").corpo as StatisticheVoci;
    expect(f.voci.map((v) => v.nome)).toEqual(["Piccolo", "Senza fornitore"]);
    expect(f.voci[1]!.id).toBeNull();
    // fornitori: solo costi (il ricavo non c'è)
    expect(f.movimenti).toBe(2);
    // categorie senza tipo: tutti i tipi, ricavi compresi
    expect((voci("raggruppa=CATEGORIA").corpo as StatisticheVoci).movimenti).toBe(3);
    expect((voci("raggruppa=CATEGORIA&tipo=RICAVO").corpo as StatisticheVoci).totaleCent).toBe(7000);
    expect((voci("raggruppa=CATEGORIA&tipo=COSTI").corpo as StatisticheVoci).movimenti).toBe(2);
    // dipendenti: solo retribuzioni; un costo fisso come l'affitto non conta, nemmeno in «Senza dipendente»
    nuovo({ data: "2019-03-05", tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent: 90000, categoria: "Affitto" });
    const d = voci("raggruppa=DIPENDENTE").corpo as StatisticheVoci;
    expect(d.voci).toEqual([]);
    expect((voci("raggruppa=DIPENDENTE&tipo=RICAVO").corpo as StatisticheVoci).voci).toEqual([]);
    expect(d.totaleCent).toBe(0);
  });

  it("dipendenti: regolare ed extra separati; il filtro per sedi vale", () => {
    const paga = (documento: string, importoCent: number, sedeId: number) =>
      nuovo({ data: "2019-03-05", tipo: "COSTO_FISSO", documento, importoCent, categoria: "Retribuzione", dipendente: "Mario Prova", sedeId });
    paga("RETRIBUZIONE_REGOLARE", 100000, 1);
    paga("RETRIBUZIONE_EXTRA", 20000, 1);
    paga("RETRIBUZIONE_REGOLARE", 5000, 2);
    const r = voci("raggruppa=DIPENDENTE").corpo as StatisticheVoci;
    expect(r.voci[0]).toMatchObject({ nome: "Mario Prova", totaleCent: 125000, regolareCent: 105000, extraCent: 20000, movimenti: 3 });
    const sede1 = voci("raggruppa=DIPENDENTE&sedi=1").corpo as StatisticheVoci;
    expect(sede1.voci[0]).toMatchObject({ totaleCent: 120000, regolareCent: 100000 });
    // per le categorie regolare ed extra restano 0
    expect((voci("raggruppa=CATEGORIA").corpo as StatisticheVoci).voci.every((v) => v.regolareCent === 0 && v.extraCent === 0)).toBe(true);
  });

  it("dopo l'eliminazione di una voce i suoi movimenti passano alla riga «Senza»: il totale non cambia", () => {
    const m = nuovo({ data: "2019-03-05", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 4000, fornitore: "Sparisce" });
    const prima = (voci("raggruppa=FORNITORE").corpo as StatisticheVoci).totaleCent;
    invia("DELETE", `/fornitori/${m.fornitore!.id}`);
    const dopo = voci("raggruppa=FORNITORE").corpo as StatisticheVoci;
    expect(dopo.totaleCent).toBe(prima);
    expect(dopo.voci).toHaveLength(1);
    expect(dopo.voci[0]).toMatchObject({ id: null, nome: "Senza fornitore" });
  });

  it("i dati di prova hanno più fornitori e dipendenti con movimenti su più mesi", () => {
    const f = get("/statistiche/voci", "da=2026-07-01&a=2026-11-30&raggruppa=FORNITORE").corpo as StatisticheVoci;
    expect(f.mesi.length).toBeGreaterThanOrEqual(4);
    expect(f.voci.filter((v) => v.id !== null && v.perMese.filter((x) => x > 0).length >= 3).length).toBeGreaterThanOrEqual(5);
    const d = get("/statistiche/voci", "da=2026-07-01&a=2026-11-30&raggruppa=DIPENDENTE").corpo as StatisticheVoci;
    expect(d.voci.filter((v) => v.id !== null && v.regolareCent > 0).length).toBeGreaterThanOrEqual(5);
  });
});
