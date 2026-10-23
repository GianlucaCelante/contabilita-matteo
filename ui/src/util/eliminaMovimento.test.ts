import { describe, expect, it } from "vitest";
import { sottotitoloElimina, sceltePerEliminare } from "./eliminaMovimento";

describe("eliminare un movimento", () => {
  it("un movimento normale (o con la ripetizione già ferma) ha una sola scelta", () => {
    expect(sceltePerEliminare(false)).toEqual([{ ambito: "SOLO_QUESTO", etichetta: "Sì, elimina", pericoloso: true }]);
  });

  it("in una ripetizione attiva le scelte sono due e dicono cosa succede ai prossimi", () => {
    const s = sceltePerEliminare(true);
    expect(s.map((x) => [x.ambito, x.etichetta])).toEqual([
      ["SOLO_QUESTO", "Elimina solo questo"],
      ["QUESTO_E_PROSSIMI", "Elimina e ferma la ripetizione"],
    ]);
  });

  it("i testi spiegano le due strade", () => {
    expect(sottotitoloElimina(false)).toBe("Non si può annullare.");
    const t = sottotitoloElimina(true);
    expect(t).toContain("ripete ogni mese");
    expect(t).toContain("solo questo");
    expect(t).toContain("ferma la ripetizione");
  });
});
