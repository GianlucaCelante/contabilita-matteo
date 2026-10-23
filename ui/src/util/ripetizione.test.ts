import { describe, expect, it } from "vitest";
import type { Movimento } from "../api/tipi";
import { descriviFrequenza, MASSIMO_INTERVALLO, usaIlGiornoDelMese } from "./ripetizione";
import { campiVuoti, daMovimento, preparaInput, testoRipetizione, type CampiForm } from "./modelloMovimento";

describe("descriviFrequenza", () => {
  it("ogni mese: il giorno scelto", () => {
    expect(descriviFrequenza({ unita: "MESI", intervallo: 1, giorno: 10 })).toBe("Ogni mese, il giorno 10");
  });
  it("ogni N mesi o anni: il giorno scelto, al plurale", () => {
    expect(descriviFrequenza({ unita: "MESI", intervallo: 3, giorno: 31 })).toBe("Ogni 3 mesi, il giorno 31");
    expect(descriviFrequenza({ unita: "ANNI", intervallo: 1, giorno: 29 })).toBe("Ogni anno, il giorno 29");
    expect(descriviFrequenza({ unita: "ANNI", intervallo: 2, giorno: 15 })).toBe("Ogni 2 anni, il giorno 15");
  });
  it("giorni e settimane non hanno un giorno del mese", () => {
    expect(descriviFrequenza({ unita: "GIORNI", intervallo: 1, giorno: 5 })).toBe("Ogni giorno");
    expect(descriviFrequenza({ unita: "GIORNI", intervallo: 10, giorno: 5 })).toBe("Ogni 10 giorni");
    expect(descriviFrequenza({ unita: "SETTIMANE", intervallo: 1, giorno: 5 })).toBe("Ogni settimana");
    expect(descriviFrequenza({ unita: "SETTIMANE", intervallo: 2, giorno: 5 })).toBe("Ogni 2 settimane");
  });
  it("solo mesi e anni usano il giorno del mese, e i massimi sono quelli del servizio", () => {
    expect(["GIORNI", "SETTIMANE", "MESI", "ANNI"].map((u) => usaIlGiornoDelMese(u as "MESI"))).toEqual([false, false, true, true]);
    expect(MASSIMO_INTERVALLO).toEqual({ GIORNI: 365, SETTIMANE: 104, MESI: 60, ANNI: 10 });
  });
});

const fisso = (extra: Partial<CampiForm> = {}): CampiForm => ({
  ...campiVuoti(),
  tipo: "COSTO_FISSO",
  voceFissa: "AFFITTO",
  data: "2026-10-05",
  importo: "950",
  ripeti: true,
  giorno: "5",
  ...extra,
});

describe("preparaInput: la ripetizione", () => {
  it("ogni mese manda il giorno, con frequenza esplicita (così cambiare da personalizzata a mensile funziona)", () => {
    const { errori, input } = preparaInput(fisso(), true);
    expect(errori).toEqual({});
    expect(input?.ricorrenza).toEqual({ unita: "MESI", intervallo: 1, giorno: 5 });
  });
  it("personalizzata in settimane o giorni: niente giorno del mese", () => {
    expect(preparaInput(fisso({ frequenza: "PERSONALIZZATA", unita: "SETTIMANE", intervallo: "2" }), true).input?.ricorrenza).toEqual({ unita: "SETTIMANE", intervallo: 2 });
    expect(preparaInput(fisso({ frequenza: "PERSONALIZZATA", unita: "GIORNI", intervallo: "10", giorno: "" }), true).input?.ricorrenza).toEqual({ unita: "GIORNI", intervallo: 10 });
  });
  it("personalizzata in mesi o anni: il giorno serve", () => {
    expect(preparaInput(fisso({ frequenza: "PERSONALIZZATA", unita: "MESI", intervallo: "3", giorno: "31" }), true).input?.ricorrenza).toEqual({ unita: "MESI", intervallo: 3, giorno: 31 });
    const senza = preparaInput(fisso({ frequenza: "PERSONALIZZATA", unita: "ANNI", intervallo: "1", giorno: "" }), true);
    expect(senza.input).toBeNull();
    expect(senza.errori.giorno).toBeTruthy();
  });
  it("«ogni quanto» deve essere un intero da 1 al massimo dell'unità", () => {
    for (const intervallo of ["", "0", "-2", "2,5", "abc", "366"]) {
      const r = preparaInput(fisso({ frequenza: "PERSONALIZZATA", unita: "GIORNI", intervallo }), true);
      expect(r.input).toBeNull();
      expect(r.errori.intervallo).toBe("Ogni quanto: da 1 a 365 giorni.");
    }
    expect(preparaInput(fisso({ frequenza: "PERSONALIZZATA", unita: "ANNI", intervallo: "11", giorno: "5" }), true).errori.intervallo).toBe("Ogni quanto: da 1 a 10 anni.");
  });
  it("senza ripetizione, o fuori dal modulo di nuovo movimento, non si manda niente e non si controlla niente", () => {
    expect(preparaInput(fisso({ ripeti: false, frequenza: "PERSONALIZZATA", intervallo: "abc" }), true).input?.ricorrenza).toBeUndefined();
    expect(preparaInput(fisso({ frequenza: "PERSONALIZZATA", intervallo: "abc" }), false).input?.ricorrenza).toBeUndefined();
  });
});

const movimentoConRipetizione = (ricorrenza: Record<string, unknown>) =>
  ({
    id: 1,
    data: "2026-10-05",
    tipo: "COSTO_FISSO",
    documento: "NESSUNO",
    importoCent: 95000,
    categoria: { id: 1, nome: "Affitto" },
    fornitore: null,
    dipendente: null,
    descrizione: null,
    numeroDocumento: null,
    note: null,
    origine: "MANO",
    ricorrenza: { id: 3, attiva: true, ...ricorrenza },
    allegatoNome: null,
  }) as unknown as Movimento;

describe("daMovimento: la ripetizione di un movimento esistente", () => {
  it("ogni mese resta «Ogni mese» con il suo giorno", () => {
    const c = daMovimento(movimentoConRipetizione({ giorno: 10, unita: "MESI", intervallo: 1 }));
    expect(c).toMatchObject({ ripeti: true, frequenza: "MESE", unita: "MESI", intervallo: "1", giorno: "10" });
  });
  it("ogni 2 settimane è personalizzata", () => {
    const c = daMovimento(movimentoConRipetizione({ giorno: 5, unita: "SETTIMANE", intervallo: 2 }));
    expect(c).toMatchObject({ frequenza: "PERSONALIZZATA", unita: "SETTIMANE", intervallo: "2" });
  });
  it("ogni 3 mesi è personalizzata", () => {
    expect(daMovimento(movimentoConRipetizione({ giorno: 31, unita: "MESI", intervallo: 3 }))).toMatchObject({ frequenza: "PERSONALIZZATA", intervallo: "3", giorno: "31" });
  });
  it("una ripetizione ferma non è «attiva» nel modulo", () => {
    expect(daMovimento(movimentoConRipetizione({ giorno: 10, unita: "MESI", intervallo: 1, attiva: false })).ripeti).toBe(false);
  });
});

describe("testoRipetizione (riquadro «Dove finisce»)", () => {
  it("dice la frequenza scelta", () => {
    expect(testoRipetizione(fisso({ giorno: "10" }))).toBe("Ogni mese, il giorno 10");
    expect(testoRipetizione(fisso({ frequenza: "PERSONALIZZATA", unita: "SETTIMANE", intervallo: "2" }))).toBe("Ogni 2 settimane");
  });
  it("non c'è senza ripetizione", () => {
    expect(testoRipetizione(fisso({ ripeti: false }))).toBeNull();
  });
});
