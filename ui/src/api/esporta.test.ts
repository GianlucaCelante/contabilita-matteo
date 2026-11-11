import { describe, expect, it } from "vitest";
import { righeAnteprima, urlEsportazione } from "./esporta";
import type { Documento, Movimento, Tipo } from "./tipi";

const base = { da: "2026-10-01", a: "2026-10-31", tipi: ["RICAVO" as const, "COSTO_FISSO" as const] };

describe("urlEsportazione", () => {
  it("senza opzioni non manda niente in più (valgono i predefiniti del servizio)", () => {
    expect(urlEsportazione({ ...base, formato: "xlsx" })).toBe("/api/esporta?formato=xlsx&da=2026-10-01&a=2026-10-31&includi=RICAVO%2CCOSTO_FISSO");
  });

  it("per l'Excel manda colonnePerSede e statistiche, anche a false", () => {
    const q = new URLSearchParams(urlEsportazione({ ...base, formato: "xlsx", sedi: "1,2", colonnePerSede: true, statistiche: false }).split("?")[1]);
    expect(q.get("colonnePerSede")).toBe("true");
    expect(q.get("statistiche")).toBe("false");
    expect(q.get("sedi")).toBe("1,2");
  });

  it("per il CSV le opzioni dell'Excel non partono", () => {
    const url = urlEsportazione({ ...base, formato: "csv", colonnePerSede: true, statistiche: false });
    expect(url).not.toContain("colonnePerSede");
    expect(url).not.toContain("statistiche");
  });
});

// Il file mette i costi in negativo e la nota di credito in positivo (riduce i costi): l'anteprima deve dire lo stesso.
describe("righeAnteprima: il segno è quello del file", () => {
  const mov = (id: number, tipo: Tipo, documento: Documento, importoCent: number) =>
    ({ id, data: "2026-10-09", tipo, documento, importoCent, fornitore: null, sede: { id: 1, nome: "Sede" } }) as unknown as Movimento;
  const movimenti = [
    mov(1, "RICAVO", "RICAVO_FATTURATO", 50000),
    mov(2, "COSTO_VARIABILE", "FATTURA", 123456),
    mov(3, "COSTO_VARIABILE", "NOTA_DI_CREDITO", 12078),
    mov(4, "COSTO_FISSO", "NESSUNO", 9000),
  ];
  const tutti: Tipo[] = ["RICAVO", "COSTO_VARIABILE", "COSTO_FISSO"];

  // Nel file l'importo è un numero col formato valuta «#,##0.00 [$€-410]»: Excel in italiano lo mostra «-1.234,56 €» (trattino normale,
  // punto delle migliaia, virgola dei decimali, «€» dopo il numero). L'anteprima deve mostrarlo uguale.
  it("Excel: costi negativi, ricavi e nota di credito positivi, scritti come li mostra Excel", () => {
    const { righe } = righeAnteprima(movimenti, tutti, "xlsx");
    expect(righe.map((r) => r.importo)).toEqual(["500,00 €", "-1.234,56 €", "120,78 €", "-90,00 €"]);
    expect(righe.map((r) => r.negativo)).toEqual([false, true, false, true]);
    // niente «−» tipografico (U+2212): Excel scrive il trattino normale
    expect(righe.map((r) => r.importo).join("")).not.toContain("\u2212");
  });

  it("Excel: milioni, centesimi e zero", () => {
    const { righe } = righeAnteprima([mov(1, "COSTO_FISSO", "NESSUNO", 123456789), mov(2, "RICAVO", "RICAVO_EXTRA", 5), mov(3, "COSTO_VARIABILE", "SCONTRINO", 0)], tutti, "xlsx");
    expect(righe.map((r) => r.importo)).toEqual(["-1.234.567,89 €", "0,05 €", "0,00 €"]);
  });

  // La data nel file è una cella col formato «yyyy-mm-dd» (nel CSV è lo stesso testo): l'anteprima la mostra così, non all'italiana.
  it("la data è scritta come nel file, aaaa-mm-gg, per l'Excel e per il CSV", () => {
    for (const formato of ["xlsx", "csv"] as const) expect(righeAnteprima(movimenti, tutti, formato).righe.map((r) => r.data)).toEqual(["2026-10-09", "2026-10-09", "2026-10-09", "2026-10-09"]);
  });

  it("CSV: lo stesso segno, con il trattino e senza separatori", () => {
    const { righe } = righeAnteprima(movimenti, tutti, "csv");
    expect(righe.map((r) => r.importo)).toEqual(["500,00", "-1234,56", "120,78", "-90,00"]);
    expect(righe.map((r) => r.negativo)).toEqual([false, true, false, true]);
  });
});
