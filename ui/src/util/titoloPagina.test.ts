import { describe, expect, it } from "vitest";
import { titoloDellaVista, titoloDocumento, titoloPer } from "./titoloPagina";

describe("titolo della pagina (scheda del browser)", () => {
  it("ogni vista ha il suo titolo, anche il dettaglio di una voce", () => {
    expect(titoloPer("/riepilogo")).toBe("Riepilogo");
    expect(titoloPer("/movimenti/12")).toBe("Movimento");
    expect(titoloPer("/statistiche/voci")).toBe("Costi e ricavi per voce");
    expect(titoloPer("/statistiche/voci/dettaglio")).toBe("Dettaglio voce");
    expect(titoloPer("/boh")).toBe("");
  });
  it("«<titolo> · Fuorigioco»; senza titolo solo «Fuorigioco», mai «Fuorigioco · Fuorigioco»", () => {
    expect(titoloDocumento("Bel Fungo")).toBe("Bel Fungo · Fuorigioco");
    expect(titoloDocumento("")).toBe("Fuorigioco");
    expect(titoloDocumento(titoloPer("/boh"))).toBe("Fuorigioco");
  });
});

describe("viste con il titolo proprio", () => {
  it("il dettaglio di una voce si intitola da solo", () => {
    expect(titoloDellaVista("/statistiche/voci/dettaglio")).toBe(true);
    expect(titoloDellaVista("/statistiche/voci")).toBe(false);
  });
});
