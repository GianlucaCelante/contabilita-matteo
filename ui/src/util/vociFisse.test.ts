import { describe, expect, it } from "vitest";
import { campiDaNomeVoce, campiVuoti, nomeVoce, opzioniVoce, preparaInput, vociPersonalizzate } from "./modelloMovimento";

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

describe("nomeVoce e campiDaNomeVoce: un solo campo per la voce fissa", () => {
  it("le voci standard si riconoscono dal nome, comunque sia scritto", () => {
    expect(campiDaNomeVoce("Retribuzione")).toEqual({ voceFissa: "RETRIBUZIONE", categoria: "" });
    expect(campiDaNomeVoce(" affitto ")).toEqual({ voceFissa: "AFFITTO", categoria: "" });
    expect(campiDaNomeVoce("UTENZE")).toEqual({ voceFissa: "UTENZE", categoria: "" });
  });
  it("qualunque altro nome è una voce propria, nuova o già usata", () => {
    expect(campiDaNomeVoce("Commercialista")).toEqual({ voceFissa: "ALTRA", categoria: "Commercialista" });
    expect(campiDaNomeVoce("Retribuz")).toEqual({ voceFissa: "ALTRA", categoria: "Retribuz" });
    expect(campiDaNomeVoce("")).toEqual({ voceFissa: "ALTRA", categoria: "" });
  });
  it("il testo del campo è il nome della voce", () => {
    expect(nomeVoce({ voceFissa: "RETRIBUZIONE", categoria: "" })).toBe("Retribuzione");
    expect(nomeVoce({ voceFissa: "UTENZE", categoria: "" })).toBe("Utenze");
    expect(nomeVoce({ voceFissa: "ALTRA", categoria: "Commercialista" })).toBe("Commercialista");
  });
});

describe("opzioniVoce", () => {
  const proprie = ["Assicurazione", "Commercialista"];
  it("campo vuoto o con un nome già completo: si vedono tutte le voci, così si può cambiare scelta", () => {
    const tutte = ["Retribuzione", "Affitto", "Utenze", "Assicurazione", "Commercialista"];
    expect(opzioniVoce("", proprie)).toEqual(tutte);
    expect(opzioniVoce("Affitto", proprie)).toEqual(tutte);
    expect(opzioniVoce("commercialista", proprie)).toEqual(tutte);
  });
  it("mentre si scrive, restano le voci che contengono il testo", () => {
    expect(opzioniVoce("ass", proprie)).toEqual(["Assicurazione"]);
    expect(opzioniVoce("zz", proprie)).toEqual([]);
  });
});

describe("voce fissa nel salvataggio", () => {
  const fisso = { ...campiVuoti(), tipo: "COSTO_FISSO" as const, importo: "150" };
  it("una voce propria vuota non si salva", () => {
    const r = preparaInput({ ...fisso, voceFissa: "ALTRA", categoria: "  " }, false);
    expect(r.input).toBeNull();
    expect(r.errori.categoria).toBeTruthy();
  });
  it("una voce propria si manda come categoria", () => {
    const r = preparaInput({ ...fisso, voceFissa: "ALTRA", categoria: " Commercialista " }, false);
    expect(r.errori).toEqual({});
    expect(r.input?.categoria).toBe("Commercialista");
  });
});
