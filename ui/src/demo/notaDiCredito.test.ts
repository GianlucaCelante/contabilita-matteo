import { beforeEach, describe, expect, it } from "vitest";
import type { ElencoMovimenti, Movimento, MovimentoInput, Riepilogo, StatisticheVoci } from "../api/tipi";
import { campiVuoti, DOCUMENTI_VARIABILI, preparaInput } from "../util/modelloMovimento";
import { raggruppaPerFornitore, riepilogoRicevute } from "../util/fattureRicevute";
import { rispondi } from "./backend";
import { ricomincia } from "./stato";

// La nota di credito registrata a mano (modulo «Nuovo movimento») fa la stessa strada di quella importata da XML: stessi controlli
// del servizio (docs/api.md: solo COSTO_VARIABILE la ammette), stesso segno in elenco, Riepilogo, Ricevute e statistiche per voce.
const vuoto = new URLSearchParams();
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const post = (percorso: string, corpo: unknown) => rispondi("POST", percorso, vuoto, corpo);
const put = (percorso: string, corpo: unknown) => rispondi("PUT", percorso, vuoto, corpo);

// Un mese lontano dai dati di prova: i conti sono solo quelli dei movimenti creati qui.
const periodo = "da=2019-03-01&a=2019-03-31";
const fattura: MovimentoInput = { data: "2019-03-05", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 10000, fornitore: "Carta Srl", categoria: "Imballaggi", numeroDocumento: "F-1", sedeId: 1 };

// Il corpo che manda il modulo per una nota di credito scritta a mano.
function notaDalModulo(): MovimentoInput {
  const campi = { ...campiVuoti(), tipo: "COSTO_VARIABILE" as const, documentoVariabile: "NOTA_DI_CREDITO" as const, data: "2019-03-12", importo: "30,00", fornitore: "Carta Srl", categoria: "Imballaggi", numeroDocumento: "NC-1", sedeId: 1, pagata: true };
  const { errori, input } = preparaInput(campi, true);
  expect(errori).toEqual({});
  return input!;
}

beforeEach(() => ricomincia());

describe("demo: nota di credito a mano", () => {
  it("si crea dal corpo del modulo: 201, origine MANO, importo positivo, mai «pagata»", () => {
    const r = post("/movimenti", notaDalModulo());
    expect(r.stato).toBe(201);
    expect(r.corpo).toMatchObject({ tipo: "COSTO_VARIABILE", documento: "NOTA_DI_CREDITO", importoCent: 3000, origine: "MANO", pagata: false, numeroDocumento: "NC-1", fornitore: { nome: "Carta Srl" }, categoria: { nome: "Imballaggi" }, ricorrenza: null });
  });
  it("come il servizio, è ammessa solo per il costo variabile: ricavo e costo fisso rispondono 400", () => {
    expect(post("/movimenti", { ...notaDalModulo(), tipo: "RICAVO" }).stato).toBe(400);
    expect(post("/movimenti", { ...notaDalModulo(), tipo: "COSTO_FISSO", categoria: "Affitto" }).stato).toBe(400);
  });
  it("ogni documento offerto dal modulo per il costo variabile è accettato dal servizio finto, e solo per quel tipo", () => {
    for (const { valore } of DOCUMENTI_VARIABILI) {
      expect(post("/movimenti", { ...notaDalModulo(), documento: valore }).stato).toBe(201);
      expect(post("/movimenti", { ...notaDalModulo(), documento: valore, tipo: "RICAVO" }).stato).toBe(400);
      expect(post("/movimenti", { ...notaDalModulo(), documento: valore, tipo: "COSTO_FISSO", categoria: "Affitto" }).stato).toBe(400);
    }
  });
  it("divisa fra due sedi («Tutte, dividi»): due movimenti, ma in Ricevute una riga sola che toglie l'importo intero", () => {
    post("/movimenti", fattura);
    const { sedeId: _sede, ...senzaSede } = notaDalModulo();
    const parti = rispondi("POST", "/movimenti/dividi", new URLSearchParams("sedi=1,2"), senzaSede).corpo as Movimento[];
    expect(parti.map((p) => [p.documento, p.importoCent, p.sede.id, p.pagata])).toEqual([
      ["NOTA_DI_CREDITO", 1500, 1, false],
      ["NOTA_DI_CREDITO", 1500, 2, false],
    ]);
    expect(parti[0]!.divisione).toBeTruthy();
    expect(parti[1]!.divisione).toBe(parti[0]!.divisione);
    const movimenti = (get("/movimenti", `${periodo}&tipo=COSTO_VARIABILE`).corpo as ElencoMovimenti).elementi;
    expect(movimenti).toHaveLength(3);
    const [gruppo] = raggruppaPerFornitore(movimenti);
    expect(gruppo!.fatture).toHaveLength(2);
    const note = gruppo!.fatture.filter((f) => f.nota);
    expect(note).toHaveLength(1);
    expect(note[0]).toMatchObject({ importoCent: 3000, numeroDocumento: "NC-1", pagata: false, pagataInParte: false });
    expect(note[0]!.parti).toHaveLength(2);
    expect(gruppo).toMatchObject({ totaleCent: 7000, daPagareCent: 7000, nDaPagare: 1, nPagate: 0 });
    // con una sede sola nel filtro si vede la sua parte
    const unaSede = (get("/movimenti", `${periodo}&tipo=COSTO_VARIABILE&sedi=2`).corpo as ElencoMovimenti).elementi;
    expect(raggruppaPerFornitore(unaSede)[0]).toMatchObject({ totaleCent: -1500 });
  });
  it("riduce i totali dell'elenco, la riga della categoria e «Fatture» del Riepilogo", () => {
    post("/movimenti", fattura);
    post("/movimenti", notaDalModulo());
    const elenco = get("/movimenti", periodo).corpo as ElencoMovimenti;
    expect(elenco.elementi.map((m) => m.documento).sort()).toEqual(["FATTURA", "NOTA_DI_CREDITO"]);
    expect(elenco.totali).toMatchObject({ costiCent: 7000, saldoCent: -7000 });
    const riepilogo = get("/riepilogo", periodo).corpo as Riepilogo;
    expect(riepilogo.costiVariabili.totaleCent).toBe(7000);
    expect(riepilogo.costiVariabili.fattureCent).toBe(7000);
    expect(riepilogo.costiVariabili.voci).toEqual([expect.objectContaining({ categoria: "Imballaggi", importoCent: 7000 })]);
  });
  it("in Ricevute e nelle statistiche per fornitore riduce il «da pagare»", () => {
    post("/movimenti", fattura);
    post("/movimenti", notaDalModulo());
    const movimenti = (get("/movimenti", `${periodo}&tipo=COSTO_VARIABILE`).corpo as ElencoMovimenti).elementi;
    const gruppi = raggruppaPerFornitore(movimenti);
    expect(gruppi).toHaveLength(1);
    expect(gruppi[0]).toMatchObject({ nome: "Carta Srl", totaleCent: 7000, pagataCent: 0 });
    expect(riepilogoRicevute(gruppi).daPagareCent).toBe(7000);
    const voci = get("/statistiche/voci", `${periodo}&raggruppa=FORNITORE&tipo=COSTO_VARIABILE`).corpo as StatisticheVoci;
    expect(voci.voci.find((v) => v.nome === "Carta Srl")).toMatchObject({ totaleCent: 7000, fattureCent: 7000, pagataCent: 0, movimenti: 2 });
  });
  it("non si segna pagata; cambiata in fattura è da pagare, e una fattura pagata cambiata in nota perde lo stato", () => {
    const nota = post("/movimenti", notaDalModulo()).corpo as Movimento;
    expect(put(`/movimenti/${nota.id}/pagata`, { pagata: true }).stato).toBe(400);
    expect(put(`/movimenti/${nota.id}`, { ...notaDalModulo(), documento: "FATTURA" }).corpo).toMatchObject({ documento: "FATTURA", pagata: false });
    const pagata = post("/movimenti", { ...fattura, pagata: true }).corpo as Movimento;
    expect(put(`/movimenti/${pagata.id}`, { ...fattura, documento: "NOTA_DI_CREDITO" }).corpo).toMatchObject({ documento: "NOTA_DI_CREDITO", pagata: false });
    // adesso nel mese ci sono una fattura da 30 e una nota da 100
    expect((get("/movimenti", periodo).corpo as ElencoMovimenti).totali.costiCent).toBe(3000 - 10000);
  });
});
