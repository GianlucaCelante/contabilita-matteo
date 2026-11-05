import { describe, expect, it } from "vitest";
import type { StatisticheVoci, VoceStatistica } from "../api/tipi";
import { larghezzaBarra, massimoMese, meseBreve, meseInEvidenza, nomeMeseDi, piuAnni, tipoPerServizio, totaliPerMese, vociDelMese } from "./statisticheVoci";

const voce = (id: number | null, nome: string, perMese: number[]): VoceStatistica => ({
  id,
  nome,
  pagataCent: null,
  totaleCent: perMese.reduce((t, x) => t + x, 0),
  movimenti: 1,
  regolareCent: 0,
  extraCent: 0,
  perMese,
});
const dati: StatisticheVoci = {
  da: "2026-09-01",
  a: "2026-11-30",
  raggruppa: "FORNITORE",
  mesi: ["2026-09", "2026-10", "2026-11"],
  totaleCent: 0,
  movimenti: 4,
  voci: [voce(1, "Bel Fungo", [30000, 50000, 0]), voce(2, "Alfa", [0, 50000, 1000]), voce(null, "Senza fornitore", [500, 0, 0])],
};

describe("statisticheVoci: mesi e tipo", () => {
  it("nomi dei mesi", () => {
    expect(nomeMeseDi("2026-10")).toBe("ottobre");
    expect(nomeMeseDi("2026-10", true)).toBe("ottobre 2026");
    expect(meseBreve("2026-10")).toBe("ott");
    expect(meseBreve("2026-10", true)).toBe("ott 26");
    expect(piuAnni(["2026-11", "2026-12"])).toBe(false);
    expect(piuAnni(["2026-12", "2027-01"])).toBe(true);
  });
  it("il tipo da mandare: scontato per fornitori e dipendenti, scelto per le categorie, «Tutti» = assente", () => {
    expect(tipoPerServizio("FORNITORE", "RICAVO")).toBe("COSTO_VARIABILE");
    // dipendenti: solo retribuzioni, il tipo non si manda (il servizio lo ignora)
    expect(tipoPerServizio("DIPENDENTE", "TUTTI")).toBeUndefined();
    expect(tipoPerServizio("CATEGORIA", "RICAVO")).toBe("RICAVO");
    expect(tipoPerServizio("CATEGORIA", "TUTTI")).toBeUndefined();
  });
});

describe("statisticheVoci: barre e mesi", () => {
  it("larghezza della barra: proporzionale, mai fuori scala, un filo visibile se c'è un importo", () => {
    expect(larghezzaBarra(50, 100)).toBe(50);
    expect(larghezzaBarra(200, 100)).toBe(100);
    expect(larghezzaBarra(1, 100000)).toBe(2);
    expect(larghezzaBarra(0, 100)).toBe(0);
    expect(larghezzaBarra(-5, 100)).toBe(0);
    expect(larghezzaBarra(5, 0)).toBe(0);
  });
  it("vociDelMese: solo le voci con un importo nel mese, dalla più alta, a parità per nome, «Senza» in fondo", () => {
    const ott = vociDelMese(dati, 1);
    expect(ott.righe.map((r) => r.voce.nome)).toEqual(["Alfa", "Bel Fungo"]);
    expect(ott.totaleCent).toBe(100000);
    const set = vociDelMese(dati, 0);
    expect(set.righe.map((r) => r.voce.nome)).toEqual(["Bel Fungo", "Senza fornitore"]);
    expect(vociDelMese(dati, 7).righe).toEqual([]);
  });
  it("totaliPerMese e massimoMese", () => {
    expect(totaliPerMese(dati)).toEqual([30500, 100000, 1000]);
    expect(massimoMese(dati.voci[0]!)).toBe(50000);
  });
});

describe("meseInEvidenza: il mese a cui portare lo scorrimento all'apertura", () => {
  const mesi = ["2026-01", "2026-02", "2026-03", "2026-10", "2026-11", "2026-12"];
  it("il mese corrente, se e' nel periodo", () => {
    expect(meseInEvidenza(mesi, [1, 1, 1, 1, 1, 1], "2026-11-04")).toBe(4);
  });
  it("altrimenti l'ultimo mese con dati", () => {
    expect(meseInEvidenza(["2025-01", "2025-02", "2025-03"], [5, 7, 0], "2026-11-04")).toBe(1);
  });
  it("senza dati l'ultimo mese; senza mesi -1", () => {
    expect(meseInEvidenza(["2025-01", "2025-02"], [0, 0], "2026-11-04")).toBe(1);
    expect(meseInEvidenza([], [], "2026-11-04")).toBe(-1);
  });
});
