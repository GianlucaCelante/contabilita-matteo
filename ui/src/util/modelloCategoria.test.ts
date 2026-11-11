import { describe, expect, it } from "vitest";
import { campiVuoti, categoriaRichiestaInModifica, preparaInput, type CampiForm } from "./modelloMovimento";

const base = (parziale: Partial<CampiForm>): CampiForm => ({ ...campiVuoti(), data: "2026-10-29", importo: "10,00", ...parziale });

describe("la categoria nel movimento", () => {
  it("un ricavo può avere una categoria (facoltativa) e viene mandata per nome", () => {
    const c = base({ tipo: "RICAVO", categoria: "  Catering " });
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
  it("in un costo variabile (fattura, scontrino, nota di credito) la categoria è obbligatoria", () => {
    for (const documentoVariabile of ["FATTURA", "SCONTRINO", "NOTA_DI_CREDITO"] as const) {
      const r = preparaInput(base({ tipo: "COSTO_VARIABILE", documentoVariabile, fornitore: "Molino Bianchi", categoria: "  " }), true);
      expect(r.errori.categoria).toBe("Scegli o crea una categoria.");
      expect(r.input).toBeNull();
    }
    const ok = preparaInput(base({ tipo: "COSTO_VARIABILE", fornitore: "Molino Bianchi", categoria: " Farine " }), true);
    expect(ok.errori).toEqual({});
    expect(ok.input?.categoria).toBe("Farine");
  });
  describe("in modifica (dettaglio)", () => {
    const senza = base({ tipo: "COSTO_VARIABILE", fornitore: "Molino Bianchi", categoria: "", pagata: true });
    it("un movimento già senza categoria, col campo mai toccato, si salva lo stesso (per esempio accendendo «Fattura pagata»)", () => {
      const richiesta = categoriaRichiestaInModifica({ categoria: "" }, false);
      expect(richiesta).toBe(false);
      const r = preparaInput(senza, true, false, richiesta);
      expect(r.errori).toEqual({});
      expect(r.input).toMatchObject({ pagata: true });
      expect(r.input).not.toHaveProperty("categoria");
    });
    it("se all'apertura la categoria c'era, svuotarla è un errore", () => {
      const richiesta = categoriaRichiestaInModifica({ categoria: "Farine" }, true);
      expect(richiesta).toBe(true);
      expect(preparaInput(senza, true, false, richiesta).errori.categoria).toBe("Scegli o crea una categoria.");
      // anche se nessuno ha toccato il campo (la voce è stata eliminata dalla matita): c'era, quindi si chiede
      expect(categoriaRichiestaInModifica({ categoria: "Farine" }, false)).toBe(true);
    });
    it("un movimento senza categoria, col campo toccato e lasciato vuoto, la chiede", () => {
      const richiesta = categoriaRichiestaInModifica({ categoria: "  " }, true);
      expect(richiesta).toBe(true);
      expect(preparaInput(senza, true, false, richiesta).input).toBeNull();
    });
    it("la categoria troppo lunga e la voce fissa vuota restano errori anche quando la categoria non è richiesta", () => {
      expect(preparaInput({ ...senza, categoria: "a".repeat(121) }, true, false, false).errori.categoria).toMatch(/120/);
      expect(preparaInput(base({ tipo: "COSTO_FISSO", categoria: "" }), true, false, false).errori.categoria).toBe("Scegli una voce o scrivine una nuova.");
    });
  });
  it("il numero della fattura resta facoltativo", () => {
    const r = preparaInput(base({ tipo: "COSTO_VARIABILE", fornitore: "Molino Bianchi", categoria: "Farine", numeroDocumento: "" }), true);
    expect(r.errori).toEqual({});
    expect(r.input).not.toHaveProperty("numeroDocumento");
  });
  it("una voce fissa vuota resta un errore (nessuna è scritta nel codice)", () => {
    expect(preparaInput(base({ tipo: "COSTO_FISSO", categoria: " " }), true).errori.categoria).toBe("Scegli una voce o scrivine una nuova.");
  });
});
