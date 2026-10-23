import { describe, expect, it } from "vitest";
import type { Movimento } from "../api/tipi";
import { sottotitoloTelefono } from "./etichette";

const base = {
  id: 1,
  data: "2026-10-20",
  tipo: "COSTO_VARIABILE",
  documento: "FATTURA",
  importoCent: 100,
  categoria: null,
  fornitore: null,
  dipendente: null,
  descrizione: null,
  numeroDocumento: null,
  note: null,
  origine: "MANO",
  ricorrenza: null,
  allegatoNome: null,
} as unknown as Movimento;

describe("sottotitoloTelefono", () => {
  it("separa il documento (che si può accorciare) dal tipo (che resta sempre intero)", () => {
    expect(sottotitoloTelefono({ ...base, numeroDocumento: "FT-2026/000123" })).toEqual({ documento: "Fattura FT-2026/000123", tipo: "Variabile" });
  });
  it("senza numero il documento è solo il nome", () => {
    expect(sottotitoloTelefono(base)).toEqual({ documento: "Fattura", tipo: "Variabile" });
  });
  it("senza documento (voce fissa generica) il documento è vuoto, così la riga non inizia con un puntino", () => {
    expect(sottotitoloTelefono({ ...base, tipo: "COSTO_FISSO", documento: "NESSUNO" })).toEqual({ documento: "", tipo: "Fisso" });
  });
});
