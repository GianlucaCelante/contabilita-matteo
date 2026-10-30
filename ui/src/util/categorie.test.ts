import { describe, expect, it } from "vitest";
import type { Categoria } from "../api/tipi";
import { dividiVociFisse, eTua, erroreNome, nomiTue, normalizzaNome, trovaDoppione } from "./categorie";

const lista: Categoria[] = [
  { id: 1, nome: "Farine", tipo: "COSTO_VARIABILE", personalizzata: false },
  { id: 2, nome: "Imballaggi", tipo: "COSTO_VARIABILE", personalizzata: true },
  { id: 3, nome: "Imballaggi", tipo: "COSTO_FISSO", personalizzata: true },
  { id: 4, nome: "Delivery", tipo: "RICAVO", personalizzata: true },
];

describe("normalizzaNome e erroreNome", () => {
  it("toglie gli spazi ai bordi e riduce quelli interni a uno", () => {
    expect(normalizzaNome("  Pulizia   forno ")).toBe("Pulizia forno");
  });
  it("un nome vuoto o di soli spazi non va", () => {
    expect(erroreNome("")).toBe("Scrivi il nome della categoria.");
    expect(erroreNome("   ")).toBe("Scrivi il nome della categoria.");
  });
  it("120 caratteri vanno, 121 no (contati dopo la normalizzazione)", () => {
    expect(erroreNome("a".repeat(120))).toBeNull();
    expect(erroreNome(`  ${"a".repeat(120)}  `)).toBeNull();
    expect(erroreNome("a".repeat(121))).toBe("Il nome può avere al massimo 120 caratteri.");
  });
  it("un nome normale va", () => {
    expect(erroreNome("Packaging")).toBeNull();
  });
});

describe("trovaDoppione", () => {
  it("riconosce il doppione senza badare alle maiuscole e agli spazi, nello stesso tipo", () => {
    expect(trovaDoppione("  imballaggi ", lista, "COSTO_VARIABILE")?.id).toBe(2);
    expect(trovaDoppione("IMBALLAGGI", lista, "COSTO_FISSO")?.id).toBe(3);
  });
  it("lo stesso nome in un altro tipo non è un doppione", () => {
    expect(trovaDoppione("Delivery", lista, "COSTO_VARIABILE")).toBeUndefined();
    expect(trovaDoppione("Delivery", lista, "RICAVO")?.id).toBe(4);
  });
  it("nella rinomina una categoria non è un doppione di se stessa, ma lo è di un'altra", () => {
    expect(trovaDoppione("imballaggi", lista, "COSTO_VARIABILE", 2)).toBeUndefined();
    expect(trovaDoppione("farine", lista, "COSTO_VARIABILE", 2)?.id).toBe(1);
  });
});

describe("categorie «Tua»", () => {
  const tue = nomiTue(lista);
  it("nomiTue tiene solo le personalizzate, in minuscolo", () => {
    expect([...tue].sort()).toEqual(["delivery", "imballaggi"]);
    expect(eTua(" Delivery ", tue)).toBe(true);
    expect(eTua("Farine", tue)).toBe(false);
    expect(eTua("Delivery", undefined)).toBe(false);
  });
  it("sul telefono i costi fissi «Tua» hanno la loro riga e il resto si somma in una", () => {
    const voci = [
      { categoria: "Affitto", importoCent: 100000 },
      { categoria: "Commercialista", importoCent: 20000 },
      { categoria: "Luce", importoCent: 5000 },
    ];
    const r = dividiVociFisse(voci, new Set(["commercialista"]));
    expect(r.tue).toEqual([{ categoria: "Commercialista", importoCent: 20000 }]);
    expect(r.altre.map((v) => v.categoria)).toEqual(["Affitto", "Luce"]);
    expect(r.sommaAltre).toBe(105000);
  });
  it("senza categorie «Tua» tutto resta nella riga unica, come prima", () => {
    const r = dividiVociFisse([{ categoria: "Affitto", importoCent: 100000 }], new Set());
    expect(r.tue).toEqual([]);
    expect(r.sommaAltre).toBe(100000);
  });
});
