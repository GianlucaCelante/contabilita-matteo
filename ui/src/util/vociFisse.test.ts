import { describe, expect, it } from "vitest";
import { VALORE_NUOVA_VOCE, valoreMenuVoce, vociPersonalizzate } from "./modelloMovimento";

describe("vociPersonalizzate", () => {
  it("toglie le voci standard (senza badare alle maiuscole), i doppioni e le vuote, in ordine alfabetico", () => {
    expect(vociPersonalizzate(["Utenze", "commercialista", "Affitto", "Assicurazione", "Commercialista", " ", "Retribuzione"])).toEqual([
      "Assicurazione",
      "commercialista",
    ]);
  });
  it("nessuna voce propria: elenco vuoto", () => {
    expect(vociPersonalizzate(["Affitto", "Utenze"])).toEqual([]);
  });
});

describe("valoreMenuVoce", () => {
  const propri = ["Assicurazione", "Commercialista"];
  it("le voci standard sono il loro codice", () => {
    expect(valoreMenuVoce("AFFITTO", "", propri, false)).toBe("AFFITTO");
    expect(valoreMenuVoce("RETRIBUZIONE", "", propri, false)).toBe("RETRIBUZIONE");
  });
  it("una voce propria già esistente è scelta col suo nome", () => {
    expect(valoreMenuVoce("ALTRA", "Commercialista", propri, false)).toBe("voce:Commercialista");
  });
  it("«Nuova voce…» resta scelta anche se si scrive un nome già esistente", () => {
    expect(valoreMenuVoce("ALTRA", "Commercialista", propri, true)).toBe(VALORE_NUOVA_VOCE);
  });
  it("un nome non presente nell'elenco (ancora in caricamento o nuovo) è «Nuova voce…»", () => {
    expect(valoreMenuVoce("ALTRA", "Pubblicità", propri, false)).toBe(VALORE_NUOVA_VOCE);
    expect(valoreMenuVoce("ALTRA", "", propri, false)).toBe(VALORE_NUOVA_VOCE);
  });
});
