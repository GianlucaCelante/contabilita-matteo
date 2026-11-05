import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Riepilogo, Sede } from "../api/tipi";
import { rispondi } from "./backend";
import { modalitaVuota, ricomincia } from "./stato";

// Demo «vuota» (?vuoto nell'indirizzo): si parte come un'installazione nuova, senza dati di prova.
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const invia = (metodo: string, percorso: string, corpo?: unknown) => rispondi(metodo, percorso, new URLSearchParams(), corpo);

beforeEach(() => {
  modalitaVuota(false);
  ricomincia();
});
afterEach(() => {
  modalitaVuota(false);
  ricomincia();
});

describe("demo vuota", () => {
  it("niente movimenti, categorie, fornitori, dipendenti né caselle di fatture; una sola sede", () => {
    modalitaVuota(true);
    expect(get("/categorie").corpo).toEqual([]);
    expect(get("/fornitori").corpo).toEqual([]);
    expect(get("/dipendenti").corpo).toEqual([]);
    expect(get("/fatture/caselle").corpo).toEqual([]);
    const sedi = get("/sedi").corpo as Sede[];
    expect(sedi).toHaveLength(1);
    expect(sedi[0]?.nome).toBe("Sede principale");
    const r = get("/riepilogo", "da=2000-01-01&a=2100-12-31").corpo as Riepilogo;
    expect(r.ricavi.totaleCent).toBe(0);
    expect(r.costiCent).toBe(0);
    expect(r.ricavi.voci).toEqual([]);
    expect(r.costiFissi.voci).toEqual([]);
  });

  it("si può inserire da zero: la categoria nasce dal movimento, ed è la sola", () => {
    modalitaVuota(true);
    const creato = invia("POST", "/movimenti", { data: "2026-11-02", sedeId: 1, tipo: "RICAVO", documento: "RICAVO_EXTRA", importoCent: 5000, categoria: "Sala" });
    expect(creato.stato).toBe(201);
    expect(get("/categorie").corpo).toHaveLength(1);
    const r = get("/riepilogo", "da=2026-11-01&a=2026-11-30").corpo as Riepilogo;
    expect(r.ricavi.totaleCent).toBe(5000);
    expect(r.ricavi.voci).toHaveLength(1);
  });

  it("senza ?vuoto la demo ha i suoi dati di prova", () => {
    modalitaVuota(false);
    expect((get("/categorie").corpo as unknown[]).length).toBeGreaterThan(5);
    expect(get("/sedi").corpo as Sede[]).toHaveLength(3);
  });
});
