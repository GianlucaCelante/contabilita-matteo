import { describe, expect, it } from "vitest";
import { alternaCategoria, etichettaFiltroCategorie, gruppiCategorie, idValidi, leggiIdCategorie, scriviIdCategorie } from "./filtroCategorie";
import { leggiFiltri, salvaFiltri } from "./filtriSalvati";
import type { Tipo } from "../api/tipi";

const cat = (id: number, nome: string, tipo: Tipo) => ({ id, nome, tipo });
const TUTTE: { id: number; nome: string; tipo: Tipo }[] = [
  cat(1, "Vendite", "RICAVO"),
  cat(2, "Delivery", "RICAVO"),
  cat(3, "Ingredienti", "COSTO_VARIABILE"),
  cat(4, "Imballaggi", "COSTO_VARIABILE"),
  cat(5, "Affitto", "COSTO_FISSO"),
];

describe("filtro per categorie: indirizzo", () => {
  it("legge e scrive gli id, ordinati e senza doppioni", () => {
    expect(leggiIdCategorie("7,3")).toEqual([7, 3]);
    expect(scriviIdCategorie([7, 3, 7])).toBe("3,7");
    expect(leggiIdCategorie(null)).toEqual([]);
    expect(leggiIdCategorie("")).toEqual([]);
    expect(leggiIdCategorie("3, x,0,-2,3.5,4,3")).toEqual([3, 4]);
  });

  it("si ricorda come ultimo filtro, anche vuoto, e uno rovinato si scarta", () => {
    const dati: Record<string, string> = {};
    const m = { getItem: (k: string) => dati[k] ?? null, setItem: (k: string, v: string) => void (dati[k] = v) };
    salvaFiltri(m, { categorie: [3, 7] });
    expect(leggiFiltri(m).categorie).toEqual([3, 7]);
    salvaFiltri(m, { tipo: "RICAVO" });
    expect(leggiFiltri(m)).toEqual({ tipo: "RICAVO", categorie: [3, 7] });
    salvaFiltri(m, { categorie: [] });
    expect(leggiFiltri(m).categorie).toEqual([]);
    dati["contabilita.filtri.v1"] = JSON.stringify({ categorie: [3, "x", -1, 2.5, 8] });
    expect(leggiFiltri(m).categorie).toEqual([3, 8]);
    dati["contabilita.filtri.v1"] = JSON.stringify({ categorie: "3,7" });
    expect(leggiFiltri(m).categorie).toBeUndefined();
  });
});

describe("filtro per categorie: scelte valide", () => {
  it("una categoria che non esiste piu' si ignora", () => {
    expect(idValidi([3, 99], TUTTE, "")).toEqual([3]);
  });
  it("con un tipo scelto restano solo le categorie di quel tipo", () => {
    expect(idValidi([1, 3, 5], TUTTE, "COSTO_VARIABILE")).toEqual([3]);
    expect(idValidi([1, 3, 5], TUTTE, "")).toEqual([1, 3, 5]);
  });
  it("prima che l'elenco arrivi si tengono tutte", () => {
    expect(idValidi([3, 99], undefined, "RICAVO")).toEqual([3, 99]);
  });
});

describe("filtro per categorie: etichetta del pulsante", () => {
  it("nessuna, una, piu' d'una", () => {
    expect(etichettaFiltroCategorie([])).toBe("Categoria");
    expect(etichettaFiltroCategorie([TUTTE[2]!])).toBe("Categoria: Ingredienti");
    expect(etichettaFiltroCategorie([TUTTE[2]!, TUTTE[3]!])).toBe("Categorie (2)");
    // Una scelta di cui non si conosce ancora il nome non mostra un nome sbagliato.
    expect(etichettaFiltroCategorie([], 1)).toBe("Categorie (1)");
  });
});

describe("filtro per categorie: elenco nel foglio", () => {
  it("raggruppa per tipo, in ordine alfabetico", () => {
    const g = gruppiCategorie(TUTTE, "", "");
    expect(g.map((x) => x.titolo)).toEqual(["Ricavi", "Costi variabili", "Costi fissi"]);
    expect(g[0]!.categorie.map((c) => c.nome)).toEqual(["Delivery", "Vendite"]);
    expect(g[1]!.categorie.map((c) => c.nome)).toEqual(["Imballaggi", "Ingredienti"]);
  });
  it("con un tipo scelto in alto mostra solo quel tipo", () => {
    expect(gruppiCategorie(TUTTE, "COSTO_FISSO", "").map((x) => x.titolo)).toEqual(["Costi fissi"]);
  });
  it("la ricerca filtra i nomi senza badare alle maiuscole e toglie i gruppi vuoti", () => {
    const g = gruppiCategorie(TUTTE, "", " IMB");
    expect(g).toHaveLength(1);
    expect(g[0]!.categorie.map((c) => c.nome)).toEqual(["Imballaggi"]);
    expect(gruppiCategorie(TUTTE, "", "zzz")).toEqual([]);
  });
  it("alterna una scelta", () => {
    expect(alternaCategoria([3], 7)).toEqual([3, 7]);
    expect(alternaCategoria([3, 7], 3)).toEqual([7]);
  });
});
