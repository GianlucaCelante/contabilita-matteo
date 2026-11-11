import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnteprimaImportazione } from "../api/importa";
import type { ElencoMovimenti, MovimentoInput } from "../api/tipi";
import { rispondi } from "./backend";
import { modalitaVuota, ricomincia } from "./stato";

// Importazione delle fatture nella demo (docs/api.md, «Importazione di fatture elettroniche»): i doppioni si riconoscono come nel
// servizio (documento, fornitore, numero e data) e l'anteprima dice il tipo di documento.
const vuoto = new URLSearchParams();
const post = (percorso: string, corpo: unknown) => rispondi("POST", percorso, vuoto, corpo);
const anteprima = () => post("/importa/anteprima", ["fatture.zip"]).corpo as AnteprimaImportazione;
const movimenti = () => (rispondi("GET", "/movimenti", vuoto, undefined).corpo as ElencoMovimenti).elementi;
const conferma = (indici: number[]) =>
  post("/importa/conferma", { importazioneId: "x", righe: indici.map((indice) => ({ indice, categoria: null })), sedeId: 1 }).corpo as {
    importati: number;
    ignorate: { indice: number; motivo: string }[];
  };

beforeEach(() => ricomincia());

describe("demo: doppioni dell'importazione (s46)", () => {
  it("una nota di credito con numero e data di una fattura non la rende doppia, e viceversa", () => {
    const a = anteprima();
    const fattura = a.fatture.find((f) => f.numero === "DEMO-1")!;
    const nota = a.fatture.find((f) => f.notaDiCredito)!;
    const aMano = (documento: MovimentoInput["documento"], f: typeof fattura): MovimentoInput => ({
      data: f.data,
      tipo: "COSTO_VARIABILE",
      documento,
      importoCent: 1000,
      fornitore: f.fornitore.nome,
      categoria: "Ingredienti",
      numeroDocumento: f.numero,
      sedeId: 1,
    });
    // registrate a mano col documento «sbagliato»: stesso fornitore, numero e data, ma l'altro tipo
    expect(post("/movimenti", aMano("NOTA_DI_CREDITO", fattura)).stato).toBe(201);
    expect(post("/movimenti", aMano("FATTURA", nota)).stato).toBe(201);
    const dopo = anteprima();
    expect(dopo.fatture.find((f) => f.numero === fattura.numero)).toMatchObject({ duplicata: false, motivo: null });
    expect(dopo.fatture.find((f) => f.numero === nota.numero)).toMatchObject({ duplicata: false, motivo: null });
    expect(conferma([fattura.indice, nota.indice])).toEqual({ importati: 2, ignorate: [] });
    // adesso ci sono davvero: al giro dopo risultano già registrate e la conferma le salta
    const poi = anteprima();
    expect(poi.fatture.find((f) => f.numero === fattura.numero)).toMatchObject({ duplicata: true, motivo: "Già registrata" });
    expect(poi.fatture.find((f) => f.numero === nota.numero)).toMatchObject({ duplicata: true, motivo: "Già registrata" });
    expect(conferma([fattura.indice, nota.indice])).toEqual({
      importati: 0,
      ignorate: [
        { indice: fattura.indice, motivo: "Già registrata" },
        { indice: nota.indice, motivo: "Già registrata" },
      ],
    });
  });

  it("lo stesso numero in un'altra data non è un doppione; il nome del fornitore non bada alle maiuscole", () => {
    const fattura = anteprima().fatture.find((f) => f.numero === "DEMO-2")!;
    const corpo: MovimentoInput = { data: "2020-01-15", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 1000, fornitore: fattura.fornitore.nome, categoria: "Ingredienti", numeroDocumento: fattura.numero, sedeId: 1 };
    post("/movimenti", corpo);
    expect(anteprima().fatture.find((f) => f.numero === "DEMO-2")!.duplicata).toBe(false);
    post("/movimenti", { ...corpo, data: fattura.data, fornitore: fattura.fornitore.nome.toUpperCase() });
    expect(anteprima().fatture.find((f) => f.numero === "DEMO-2")!.duplicata).toBe(true);
  });

  it("una nota di debito è un movimento FATTURA: con numero e data di una fattura registrata resta doppia (limite del servizio)", () => {
    const debito = anteprima().fatture.find((f) => f.notaDiDebito)!;
    post("/movimenti", { data: debito.data, tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 1000, fornitore: debito.fornitore.nome, categoria: "Ingredienti", numeroDocumento: debito.numero, sedeId: 1 });
    expect(anteprima().fatture.find((f) => f.notaDiDebito)).toMatchObject({ duplicata: true });
  });
});

describe("demo: tipo di documento nell'anteprima (s47)", () => {
  it("le fatture d'esempio sono dieci: fatture, una nota di credito, un'integrazione e una nota di debito", () => {
    const a = anteprima();
    expect(a.fatture).toHaveLength(10);
    expect(a.fatture.map((f) => f.indice)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(a.fatture.filter((f) => f.notaDiCredito).map((f) => f.tipoDocumento)).toEqual(["TD04"]);
    expect(a.fatture.filter((f) => f.integrazione).map((f) => f.tipoDocumento)).toEqual(["TD17"]);
    expect(a.fatture.filter((f) => f.notaDiDebito).map((f) => f.tipoDocumento)).toEqual(["TD05"]);
    expect(a.fatture.filter((f) => !f.notaDiCredito && !f.integrazione && !f.notaDiDebito).every((f) => f.tipoDocumento === "TD01")).toBe(true);
  });

  it("la nota di debito si importa come una fattura pagata, per il suo importo", () => {
    const debito = anteprima().fatture.find((f) => f.notaDiDebito)!;
    const prima = new Set(movimenti().map((m) => m.id));
    expect(conferma([debito.indice]).importati).toBe(1);
    const nuovo = movimenti().filter((m) => !prima.has(m.id));
    expect(nuovo).toHaveLength(1);
    expect(nuovo[0]).toMatchObject({ documento: "FATTURA", tipo: "COSTO_VARIABILE", pagata: true, importoCent: debito.totaleCent, numeroDocumento: debito.numero, origine: "XML" });
  });
});

// Review di s46: la data fa parte della chiave dei doppioni, quindi le fatture d'esempio non possono seguire «oggi» giorno per giorno,
// altrimenti il giorno dopo quelle gia' importate tornerebbero «da importare» e si registrerebbero due volte. Nella demo pubblicata
// (quella «vuota») i dati restano nel browser da un giorno all'altro.
describe("demo: le fatture d'esempio hanno date stabili", () => {
  const giorno = (g: number) => vi.setSystemTime(new Date(2026, 10, g, 10, 0, 0));
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    giorno(11);
    modalitaVuota(true);
    ricomincia();
  });
  afterEach(() => {
    ricomincia();
    modalitaVuota(false);
    vi.useRealTimers();
  });

  it("importate oggi, nei giorni dopo risultano già registrate e non si registrano due volte", () => {
    const prima = anteprima();
    expect(prima.fatture.find((f) => f.numero === "DEMO-1")!.data).toBe("2026-11-08");
    expect(conferma(prima.fatture.map((f) => f.indice)).importati).toBe(10);
    for (const g of [12, 14, 30]) {
      giorno(g);
      const dopo = anteprima();
      expect(dopo.fatture.map((f) => f.data)).toEqual(prima.fatture.map((f) => f.data));
      expect(dopo.fatture.every((f) => f.duplicata && f.motivo === "Già registrata")).toBe(true);
      expect(conferma(dopo.fatture.map((f) => f.indice)).importati).toBe(0);
    }
    expect(movimenti()).toHaveLength(10);
  });

  it("importate in parte: le altre tengono le date della prima lettura, e si importano una volta sola", () => {
    const prima = anteprima();
    const uno = prima.fatture.find((f) => f.numero === "DEMO-1")!;
    expect(conferma([uno.indice]).importati).toBe(1);
    giorno(15);
    const dopo = anteprima();
    expect(dopo.fatture.map((f) => f.data)).toEqual(prima.fatture.map((f) => f.data));
    expect(dopo.fatture.filter((f) => f.duplicata).map((f) => f.numero)).toEqual(["DEMO-1"]);
    expect(conferma(dopo.fatture.map((f) => f.indice)).importati).toBe(9);
    expect(movimenti()).toHaveLength(10);
  });

  it("finché nessuna è registrata le date seguono oggi (restano recenti), anche dopo averle eliminate", () => {
    expect(anteprima().fatture.find((f) => f.numero === "DEMO-1")!.data).toBe("2026-11-08");
    giorno(14);
    const dopo = anteprima();
    expect(dopo.fatture.find((f) => f.numero === "DEMO-1")!.data).toBe("2026-11-11");
    expect(conferma(dopo.fatture.map((f) => f.indice)).importati).toBe(10);
    for (const m of movimenti()) rispondi("DELETE", `/movimenti/${m.id}`, vuoto, undefined);
    giorno(20);
    expect(anteprima().fatture.find((f) => f.numero === "DEMO-1")).toMatchObject({ data: "2026-11-17", duplicata: false });
  });

  it("la data più recente non è mai nel futuro e la più vecchia resta entro due settimane dalla prima lettura", () => {
    const date = anteprima().fatture.map((f) => f.data).sort();
    expect(date[0]! >= "2026-10-28").toBe(true);
    expect(date[date.length - 1]! <= "2026-11-11").toBe(true);
  });
});
