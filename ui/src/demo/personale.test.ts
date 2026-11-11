import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ElencoMovimenti, Movimento, Riepilogo, Sede, SerieStatistiche, Settimana, Statistiche, StatisticheVoci } from "../api/tipi";
import { rispondi } from "./backend";
import { migraStato, modalitaVuota, ricomincia } from "./stato";

// La sede «personale» nella demo (docs/api.md, «Sedi»): le spese dei titolari. Niente pizze e ordini, fuori dai totali del locale quando
// il filtro `sedi` manca, dentro quando la si sceglie. Si parte dalla demo vuota (una sola «Sede principale», id 1). Settimana: 2-8 marzo 2026.
const q = (t = "") => new URLSearchParams(t);
const get = (percorso: string, t = "") => rispondi("GET", percorso, q(t), undefined);
const post = (percorso: string, corpo: unknown, t = "") => rispondi("POST", percorso, q(t), corpo);
const put = (percorso: string, corpo: unknown) => rispondi("PUT", percorso, q(), corpo);
const erroreDi = (r: { corpo?: unknown }) => (r.corpo as { errore: string }).errore;
const nuovaSede = (nome: string, personale?: boolean) => {
  const r = post("/sedi", personale === undefined ? { nome } : { nome, personale });
  expect(r.stato).toBe(201);
  return r.corpo as Sede;
};
const movimento = (data: string, sedeId: number, tipo: string, documento: string, importoCent: number, extra: object = {}) =>
  expect(post("/movimenti", { data, sedeId, tipo, documento, importoCent, ...extra }).stato).toBe(201);
const P = "da=2026-03-01&a=2026-03-31";

beforeEach(() => {
  modalitaVuota(true);
  ricomincia();
});
afterEach(() => {
  modalitaVuota(false);
  ricomincia();
});

describe("demo: anagrafica della sede personale", () => {
  it("le sedi non sono personali se non lo si dice; creazione e modifica del flag", () => {
    expect((get("/sedi").corpo as Sede[])[0]!.personale).toBe(false);
    expect(nuovaSede("Mare").personale).toBe(false);
    const casa = nuovaSede("Spese titolari", true);
    expect(casa.personale).toBe(true);
    expect((get("/sedi").corpo as Sede[]).find((s) => s.id === casa.id)!.personale).toBe(true);
    expect(put(`/sedi/${casa.id}`, { personale: false })).toMatchObject({ stato: 200, corpo: { personale: false, nome: "Spese titolari" } });
    expect(put(`/sedi/${casa.id}`, { personale: true }).corpo).toMatchObject({ personale: true });
    // senza il campo resta com'e'
    expect(put(`/sedi/${casa.id}`, { nome: "Casa" }).corpo).toMatchObject({ personale: true });
    // se esiste gia', la creazione la restituisce com'e'
    expect(post("/sedi", { nome: "casa", personale: false })).toMatchObject({ stato: 200, corpo: { personale: true } });
  });

  it("l'ultima sede attiva non personale non diventa personale e non si archivia", () => {
    expect(put("/sedi/1", { personale: true }).stato).toBe(409);
    const casa = nuovaSede("Casa", true);
    expect(put("/sedi/1", { personale: true })).toMatchObject({ stato: 409, corpo: { errore: "L'ultima sede attiva del locale non può diventare personale." } });
    expect(put("/sedi/1", { archiviata: true }).stato).toBe(409);
    // tutto o niente: con il 409 non cambia nemmeno il nome; un nome non valido viene prima (come il servizio)
    expect(put("/sedi/1", { nome: "Nuovo nome", personale: true }).stato).toBe(409);
    expect((get("/sedi").corpo as Sede[])[0]).toMatchObject({ id: 1, nome: "Sede principale", personale: false });
    expect(put("/sedi/1", { nome: " ", personale: true }).stato).toBe(400);
    const mare = nuovaSede("Mare");
    expect(put("/sedi/1", { personale: true }).stato).toBe(200);
    expect(put(`/sedi/${mare.id}`, { personale: true }).stato).toBe(409);
    expect(put(`/sedi/${mare.id}`, { archiviata: true }).stato).toBe(409);
    expect(put(`/sedi/${casa.id}`, { archiviata: true }).stato).toBe(200);
  });

  it("i dati salvati prima del flag: le sedi diventano non personali", () => {
    const vecchio = {
      giorno: "2026-03-01",
      prossimoId: 1,
      movimenti: [],
      ricorrenze: [],
      categorie: [],
      fornitori: [],
      dipendenti: [],
      sedi: [{ id: 1, nome: "Sede principale", archiviata: false, ordine: 1 }],
      statistiche: [],
      statisticheGiorni: [],
      fatture: { caselle: [], mesi: [] },
    };
    expect(migraStato(vecchio).sedi[0]).toEqual({ id: 1, nome: "Sede principale", archiviata: false, personale: false, ordine: 1 });
  });
});

describe("demo: pizze e ordini senza la sede personale", () => {
  it("niente inserimento per la sede personale", () => {
    const casa = nuovaSede("Casa", true);
    const r = put("/statistiche/settimana", { settimana: "2026-03-02", voci: [{ sedeId: casa.id, pizze: 10, ordini: 5 }] });
    expect(r.stato).toBe(400);
    expect(erroreDi(r)).toBe("La sede «Casa» è personale: non ha pizze e ordini.");
    expect(put("/statistiche/giorni", { voci: [{ sedeId: casa.id, data: "2026-03-03", pizze: 10, ordini: 5 }] }).stato).toBe(400);
  });

  it("la sede personale non compare nella settimana, nel periodo, tra le mancanti, nella serie", () => {
    const casa = nuovaSede("Casa", true);
    movimento("2026-03-03", 1, "RICAVO", "RICAVO_FATTURATO", 10000);
    movimento("2026-03-03", casa.id, "RICAVO", "RICAVO_EXTRA", 7000);
    expect((get("/statistiche/settimana", "data=2026-03-04").corpo as Settimana).sedi.map((s) => s.sede.id)).toEqual([1]);
    const r = get("/statistiche", "da=2026-03-02&a=2026-03-08").corpo as Statistiche;
    expect(r.perSede.map((s) => s.sede.id)).toEqual([1]);
    expect(r.settimane[0]!.sediMancanti.map((s) => s.id)).toEqual([1]);
    expect(r.totale.ricaviTotaliCent).toBe(10000);
    const sola = get("/statistiche", `da=2026-03-02&a=2026-03-08&sedi=${casa.id}`).corpo as Statistiche;
    expect(sola.perSede).toEqual([]);
    expect(sola.settimane[0]!.sediMancanti).toEqual([]);
    expect(sola.totale.ricaviTotaliCent).toBe(0);
    expect((get("/statistiche/serie", "da=2026-03-02&a=2026-03-08&passo=SETTIMANA").corpo as SerieStatistiche).totale.ricaviTotaliCent).toBe(10000);
    expect((get("/statistiche/serie", `da=2026-03-02&a=2026-03-08&passo=SETTIMANA&sedi=1,${casa.id}`).corpo as SerieStatistiche).totale.ricaviTotaliCent).toBe(10000);
  });

  it("segnare personale una sede con pizze lascia i dati, che non contano finché torna normale", () => {
    const mare = nuovaSede("Mare");
    expect(put("/statistiche/settimana", { settimana: "2026-03-02", voci: [{ sedeId: mare.id, pizze: 100, ordini: 40 }] }).stato).toBe(200);
    expect(put(`/sedi/${mare.id}`, { personale: true }).stato).toBe(200);
    expect((get("/statistiche", `da=2026-03-02&a=2026-03-08&sedi=1,${mare.id}`).corpo as Statistiche).totale.pizze).toBe(0);
    expect((get("/statistiche/settimana", "data=2026-03-02").corpo as Settimana).sedi.map((s) => s.sede.id)).toEqual([1]);
    expect(put(`/sedi/${mare.id}`, { personale: false }).stato).toBe(200);
    expect((get("/statistiche", "da=2026-03-02&a=2026-03-08").corpo as Statistiche).totale.pizze).toBe(100);
  });
});

describe("demo: filtro sedi senza la sede personale", () => {
  it("senza filtro la sede personale resta fuori da movimenti, riepilogo, statistiche per voce ed esportazione; col filtro entra", () => {
    const casa = nuovaSede("Casa", true);
    const mare = nuovaSede("Mare");
    movimento("2026-03-03", 1, "RICAVO", "RICAVO_FATTURATO", 10000);
    movimento("2026-03-03", mare.id, "COSTO_VARIABILE", "SCONTRINO", 2000, { categoria: "Spesa" });
    movimento("2026-03-04", casa.id, "COSTO_VARIABILE", "SCONTRINO", 5000, { categoria: "Spesa", descrizione: "Spesa dei titolari" });

    const tutti = get("/movimenti", P).corpo as ElencoMovimenti;
    expect(tutti.elementi).toHaveLength(2);
    expect(tutti.totali.costiCent).toBe(2000);
    expect((get("/movimenti", `${P}&sedi=${casa.id}`).corpo as ElencoMovimenti).elementi).toHaveLength(1);
    expect((get("/movimenti", `${P}&sedi=1,${mare.id},${casa.id}`).corpo as ElencoMovimenti).elementi).toHaveLength(3);

    const riep = get("/riepilogo", P).corpo as Riepilogo;
    expect(riep.costiCent).toBe(2000);
    expect(riep.perSede!.map((s) => s.sede.id)).toEqual([1, mare.id]);
    const riepCasa = get("/riepilogo", `${P}&sedi=${casa.id}`).corpo as Riepilogo;
    expect(riepCasa.costiCent).toBe(5000);
    expect(riepCasa.perSede!.map((s) => s.sede.id)).toEqual([casa.id]);

    expect((get("/statistiche/voci", `${P}&raggruppa=CATEGORIA&tipo=COSTO_VARIABILE`).corpo as StatisticheVoci).totaleCent).toBe(2000);
    expect((get("/statistiche/voci", `${P}&raggruppa=CATEGORIA&tipo=COSTO_VARIABILE&sedi=${casa.id}`).corpo as StatisticheVoci).totaleCent).toBe(5000);

    const csv = (t: string) => get("/esporta", `formato=csv&${P}&includi=RICAVO,COSTO_VARIABILE,COSTO_FISSO${t}`).testo?.contenuto as string;
    expect(csv("")).not.toContain("Spesa dei titolari");
    expect(csv("")).toContain("Spesa");
    expect(csv(`&sedi=${casa.id}`)).toContain("Spesa dei titolari");
  });

  it("anche personale e archiviata resta fuori senza filtro", () => {
    const casa = nuovaSede("Casa", true);
    movimento("2026-03-04", casa.id, "COSTO_VARIABILE", "SCONTRINO", 5000);
    expect(put(`/sedi/${casa.id}`, { archiviata: true }).stato).toBe(200);
    expect((get("/movimenti", P).corpo as ElencoMovimenti).elementi).toHaveLength(0);
    expect((get("/riepilogo", P).corpo as Riepilogo).costiCent).toBe(0);
    expect((get("/movimenti", `${P}&sedi=${casa.id}`).corpo as ElencoMovimenti).elementi).toHaveLength(1);
  });

  it("«dividi» senza sedi esclude la personale; con le sedi esplicite la include", () => {
    const casa = nuovaSede("Casa", true);
    const mare = nuovaSede("Mare");
    const corpo = { data: "2026-03-03", tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent: 1000 };
    const parti = post("/movimenti/dividi", corpo);
    expect(parti.stato).toBe(201);
    expect((parti.corpo as Movimento[]).map((m) => m.sede.id)).toEqual([1, mare.id]);
    const conCasa = post("/movimenti/dividi", corpo, `sedi=1,${casa.id}`);
    expect((conCasa.corpo as Movimento[]).map((m) => m.sede.id)).toEqual([1, casa.id]);
  });
});
