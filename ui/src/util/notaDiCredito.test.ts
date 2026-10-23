import { describe, expect, it } from "vitest";
import type { Movimento } from "../api/tipi";
import { aumentaIlSaldo } from "./etichette";
import { campiVuoti, chiedeFornitore, daMovimento, preparaInput } from "./modelloMovimento";

const nota = {
  id: 7,
  data: "2026-10-09",
  tipo: "COSTO_VARIABILE",
  documento: "NOTA_DI_CREDITO",
  importoCent: 2440,
  categoria: { id: 1, nome: "Farine" },
  fornitore: { id: 1, nome: "Forno Rossi Srl" },
  dipendente: null,
  descrizione: null,
  numeroDocumento: "NC-1",
  note: null,
  origine: "XML",
  ricorrenza: null,
  allegatoNome: "nc.xml",
} as unknown as Movimento;

describe("nota di credito nell'interfaccia", () => {
  it("fa salire il saldo come un ricavo, anche se è un costo variabile", () => {
    expect(aumentaIlSaldo(nota)).toBe(true);
    expect(aumentaIlSaldo({ ...nota, documento: "FATTURA" })).toBe(false);
    expect(aumentaIlSaldo({ ...nota, tipo: "RICAVO", documento: "RICAVO_EXTRA" })).toBe(true);
  });
  it("modificando una nota di credito il documento resta quello (non diventa una fattura)", () => {
    const campi = daMovimento(nota);
    expect(campi.documentoVariabile).toBe("NOTA_DI_CREDITO");
    const { errori, input } = preparaInput(campi, false);
    expect(errori).toEqual({});
    expect(input?.documento).toBe("NOTA_DI_CREDITO");
    expect(input?.numeroDocumento).toBe("NC-1");
    expect(input?.fornitore).toBe("Forno Rossi Srl");
    expect(input?.importoCent).toBe(2440);
  });
  it("come per una fattura, il fornitore è obbligatorio", () => {
    expect(chiedeFornitore({ ...campiVuoti(), tipo: "COSTO_VARIABILE", documentoVariabile: "NOTA_DI_CREDITO" })).toBe("si");
    const r = preparaInput({ ...campiVuoti(), tipo: "COSTO_VARIABILE", documentoVariabile: "NOTA_DI_CREDITO", importo: "10", fornitore: "" }, false);
    expect(r.errori.fornitore).toBeTruthy();
  });
});
