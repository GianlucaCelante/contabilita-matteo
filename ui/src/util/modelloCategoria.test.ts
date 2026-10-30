import { describe, expect, it } from "vitest";
import { campiVuoti, chiedeCategoria, preparaInput, type CampiForm } from "./modelloMovimento";

const base = (parziale: Partial<CampiForm>): CampiForm => ({ ...campiVuoti(), data: "2026-10-29", importo: "10,00", ...parziale });

describe("la categoria nel movimento", () => {
  it("un ricavo può avere una categoria (facoltativa) e viene mandata per nome", () => {
    const c = base({ tipo: "RICAVO", categoria: "  Catering " });
    expect(chiedeCategoria(c)).toBe(true);
    expect(preparaInput(c, true).input?.categoria).toBe("Catering");
  });
  it("un ricavo senza categoria non manda niente (nessun errore)", () => {
    const r = preparaInput(base({ tipo: "RICAVO" }), true);
    expect(r.errori).toEqual({});
    expect(r.input).not.toHaveProperty("categoria");
  });
  it("una categoria oltre 120 caratteri dà un errore sul campo, per ricavi e costi", () => {
    const lunga = "a".repeat(121);
    expect(preparaInput(base({ tipo: "RICAVO", categoria: lunga }), true).errori.categoria).toMatch(/120/);
    expect(preparaInput(base({ tipo: "COSTO_VARIABILE", documentoVariabile: "SCONTRINO", categoria: lunga }), true).errori.categoria).toMatch(/120/);
    expect(preparaInput(base({ tipo: "COSTO_VARIABILE", documentoVariabile: "SCONTRINO", categoria: "a".repeat(120) }), true).errori.categoria).toBeUndefined();
  });
  it("una voce fissa propria vuota resta un errore", () => {
    expect(preparaInput(base({ tipo: "COSTO_FISSO", voceFissa: "ALTRA", categoria: " " }), true).errori.categoria).toBe("Scegli una voce o scrivine una nuova.");
  });
});
