import { describe, expect, it } from "vitest";
import { chipDeiFiltri, leggiFiltriVoce } from "./filtriMovimenti";

const leggi = (query: string) => leggiFiltriVoce(new URLSearchParams(query));

describe("filtri per voce dei Movimenti, dall'indirizzo", () => {
  it("senza parametri non c'e' nessun filtro", () => {
    expect(leggi("p=mese&tipo=RICAVO&categorie=1,2")).toEqual({});
  });
  it("legge fornitore, dipendente, senza, retribuzione e pagata", () => {
    expect(leggi("fornitore=3")).toEqual({ fornitore: 3 });
    expect(leggi("dipendente=12&retribuzione=true")).toEqual({ dipendente: 12, retribuzione: true });
    expect(leggi("senza=FORNITORE")).toEqual({ senza: "FORNITORE" });
    expect(leggi("senza=DIPENDENTE&retribuzione=true")).toEqual({ senza: "DIPENDENTE", retribuzione: true });
    expect(leggi("pagata=false")).toEqual({ pagata: false });
    expect(leggi("pagata=true")).toEqual({ pagata: true });
  });
  it("tipo=COSTI (variabili + fissi, da «Vedi in Movimenti» di una categoria con «Costi») e' un filtro dell'indirizzo; gli altri tipi no", () => {
    expect(leggi("tipo=COSTI&senza=CATEGORIA")).toEqual({ tipo: "COSTI", senza: "CATEGORIA" });
    expect(leggi("tipo=COSTO_FISSO")).toEqual({});
    expect(leggi("tipo=costi")).toEqual({});
  });
  it("i valori che non si capiscono si ignorano", () => {
    expect(leggi("fornitore=abc&dipendente=-2&senza=ALTRO&retribuzione=si&pagata=forse")).toEqual({});
    expect(leggi("fornitore=0&dipendente=1.5&fornitore=")).toEqual({});
    expect(leggi("retribuzione=false")).toEqual({});
  });
});

describe("chip dei filtri", () => {
  it("un chip per filtro, con il nome della voce quando si conosce", () => {
    expect(chipDeiFiltri({ fornitore: 3 }, { fornitore: "Bel Fungo" })).toEqual([{ parametro: "fornitore", testo: "Fornitore: Bel Fungo" }]);
    expect(chipDeiFiltri({ dipendente: 4, retribuzione: true }, { dipendente: "Anna" })).toEqual([
      { parametro: "dipendente", testo: "Dipendente: Anna" },
      { parametro: "retribuzione", testo: "Solo retribuzioni" },
    ]);
    expect(chipDeiFiltri({ fornitore: 3 })).toEqual([{ parametro: "fornitore", testo: "Un solo fornitore" }]);
  });
  it("«Senza fornitore», «Senza dipendente», «Senza categoria»", () => {
    expect(chipDeiFiltri({ senza: "FORNITORE" })[0]?.testo).toBe("Senza fornitore");
    expect(chipDeiFiltri({ senza: "DIPENDENTE" })[0]?.testo).toBe("Senza dipendente");
    expect(chipDeiFiltri({ senza: "CATEGORIA" })[0]?.testo).toBe("Senza categoria");
  });
  it("«Da pagare» ha la sua pillola e non un chip; le pagate sì", () => {
    expect(chipDeiFiltri({ pagata: false })).toEqual([]);
    expect(chipDeiFiltri({ pagata: true })).toEqual([{ parametro: "pagata", testo: "Solo fatture pagate" }]);
    expect(chipDeiFiltri({})).toEqual([]);
  });
  it("«Solo costi» per tipo=COSTI: il chip toglie il parametro tipo", () => {
    expect(chipDeiFiltri({ tipo: "COSTI", senza: "CATEGORIA" })).toEqual([
      { parametro: "tipo", testo: "Solo costi" },
      { parametro: "senza", testo: "Senza categoria" },
    ]);
  });
});
