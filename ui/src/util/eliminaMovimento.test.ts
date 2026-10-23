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

  it("niente sottotesto esplicativo per i movimenti ripetuti: i due pulsanti si spiegano da soli", () => {
    expect(sottotitoloElimina(false)).toBe("Non si può annullare.");
    expect(sottotitoloElimina(true)).toBe("");
  });
});
