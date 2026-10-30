import { describe, expect, it } from "vitest";
import type { Sede } from "../api/tipi";
import {
  alternaSede,
  anteprimaDivisione,
  coloreDiPosizione,
  coloreSede,
  conPiuSedi,
  dividiImporto,
  etichettaSedi,
  idSelezionati,
  leggiScelta,
  letteraSede,
  lettereSedi,
  PALETTE_SEDI,
  parametroSedi,
  rapportoContrasto,
  salvaScelta,
  sedePreselezionata,
  sediIncluse,
  soloSede,
} from "./sedi";

const sede = (id: number, nome: string, extra: Partial<Sede> = {}): Sede => ({ id, nome, archiviata: false, ordine: id, movimenti: 0, ...extra });
const TRE = [sede(1, "Via Roma"), sede(2, "Lungomare"), sede(3, "Mercato")];
const UNA = [sede(1, "Sede principale")];

// Un magazzino finto, come localStorage.
function finto(iniziale: Record<string, string> = {}) {
  const dati = { ...iniziale };
  return {
    dati,
    getItem: (k: string) => dati[k] ?? null,
    setItem: (k: string, v: string) => {
      dati[k] = v;
    },
  };
}

describe("palette e lettera delle sedi", () => {
  it("la palette segue l'ordine: verde, ambra, blu, rosa, e poi ricomincia", () => {
    expect(PALETTE_SEDI.map((c) => c.sfondo)).toEqual(["#E3EAD1", "#F7EBD3", "#DCE9F1", "#F2DDE6"]);
    expect(coloreDiPosizione(0)).toEqual(PALETTE_SEDI[0]);
    expect(coloreDiPosizione(3)).toEqual(PALETTE_SEDI[3]);
    expect(coloreDiPosizione(4)).toEqual(PALETTE_SEDI[0]);
    expect(coloreDiPosizione(9)).toEqual(PALETTE_SEDI[1]);
  });

  it("ogni coppia di colori ha un contrasto di almeno 4,5:1 (AA)", () => {
    for (const c of PALETTE_SEDI) expect(rapportoContrasto(c.sfondo, c.testo)).toBeGreaterThanOrEqual(4.5);
  });

  it("il colore dipende dall'ordine della sede, non dalla posizione nell'elenco", () => {
    const sparse = [sede(7, "Porto", { ordine: 3 }), sede(1, "Via Roma", { ordine: 1 }), sede(4, "Mercato", { ordine: 2 })];
    expect(coloreSede(sparse, 1)).toEqual(PALETTE_SEDI[0]);
    expect(coloreSede(sparse, 4)).toEqual(PALETTE_SEDI[1]);
    expect(coloreSede(sparse, 7)).toEqual(PALETTE_SEDI[2]);
  });

  it("archiviare una sede non sposta i colori delle altre", () => {
    const con = [sede(1, "Via Roma"), sede(2, "Lungomare", { archiviata: true }), sede(3, "Mercato")];
    expect(coloreSede(con, 3)).toEqual(PALETTE_SEDI[2]);
  });

  it("la lettera è l'iniziale in maiuscolo", () => {
    expect(letteraSede("Via Roma")).toBe("V");
    expect(letteraSede("  lungomare")).toBe("L");
    expect(letteraSede("")).toBe("?");
  });

  it("due sedi con la stessa iniziale si distinguono; la prima tiene la lettera sola", () => {
    const l = lettereSedi([sede(1, "Via Roma"), sede(2, "Via Milano"), sede(3, "Mercato")]);
    expect(l.get(1)).toBe("V");
    expect(l.get(2)).toBe("VM");
    expect(l.get(3)).toBe("M");
    const tutte = [...lettereSedi([sede(1, "Porto"), sede(2, "Porto Nuovo"), sede(3, "Piazza")]).values()];
    expect(new Set(tutte).size).toBe(3);
  });
});

describe("regola «una sola sede = invariato»", () => {
  it("con una sede sola non c'è selettore, né filtro, né titolo, né preselezione", () => {
    expect(conPiuSedi(UNA)).toBe(false);
    expect(parametroSedi(UNA, null)).toBeUndefined();
    expect(sediIncluse(UNA, null)).toBeNull();
    expect(sedePreselezionata(UNA, null)).toBeNull();
  });

  it("una sede archiviata non conta: una attiva più una archiviata è ancora «una sola»", () => {
    const sedi = [sede(1, "Via Roma"), sede(2, "Vecchia", { archiviata: true })];
    expect(conPiuSedi(sedi)).toBe(false);
    expect(parametroSedi(sedi, null)).toBeUndefined();
    expect(sediIncluse(sedi, null)).toBeNull();
  });

  it("con due sedi attive le novità compaiono", () => {
    expect(conPiuSedi(TRE.slice(0, 2))).toBe(true);
  });
});

describe("selezione delle sedi", () => {
  it("di partenza sono selezionate tutte le attive e il filtro per il servizio non c'è", () => {
    expect(idSelezionati(TRE, null)).toEqual([1, 2, 3]);
    expect(parametroSedi(TRE, null)).toBeUndefined();
    expect(etichettaSedi(TRE, null)).toBe("Tutte le sedi");
    expect(sediIncluse(TRE, null)).toBeNull();
  });

  it("«Solo» sceglie una sede: filtro, etichetta, titolo e preselezione del movimento", () => {
    const solo = soloSede(TRE, 2);
    expect(solo).toEqual([2]);
    expect(parametroSedi(TRE, solo)).toBe("2");
    expect(etichettaSedi(TRE, solo)).toBe("Lungomare");
    expect(sediIncluse(TRE, solo)).toBe("Lungomare");
    expect(sedePreselezionata(TRE, solo)).toBe(2);
  });

  it("la vista mista elenca le sedi nell'ordine e non preseleziona nessuna sede", () => {
    const mista = alternaSede(TRE, null, 2);
    expect(mista).toEqual([1, 3]);
    expect(parametroSedi(TRE, mista)).toBe("1,3");
    expect(etichettaSedi(TRE, mista)).toBe("Via Roma + Mercato");
    expect(sediIncluse(TRE, mista)).toBe("Via Roma + Mercato");
    expect(sedePreselezionata(TRE, mista)).toBeNull();
    expect(sedePreselezionata(TRE, null)).toBeNull();
  });

  it("riaccendendo tutte le sedi si torna a «tutte»", () => {
    expect(alternaSede(TRE, [1, 3], 2)).toBeNull();
  });

  it("l'ultima sede selezionata non si spegne", () => {
    expect(alternaSede(TRE, [2], 2)).toEqual([2]);
  });

  it("oltre tre sedi il titolo conta invece di elencare", () => {
    const cinque = [1, 2, 3, 4, 5].map((i) => sede(i, `Sede ${i}`));
    expect(sediIncluse(cinque, [1, 2, 3, 4])).toBe("4 sedi su 5");
  });

  it("una scelta salvata con sedi che non ci sono più si corregge da sola", () => {
    expect(idSelezionati(TRE, [9])).toEqual([1, 2, 3]);
    expect(idSelezionati(TRE, [2, 9])).toEqual([2]);
    const archiviata = [sede(1, "Via Roma"), sede(2, "Lungomare", { archiviata: true }), sede(3, "Mercato")];
    expect(idSelezionati(archiviata, [2, 3])).toEqual([3]);
  });

  it("una sede aggiunta dopo entra in «tutte»", () => {
    expect(idSelezionati([...TRE, sede(4, "Porto")], null)).toEqual([1, 2, 3, 4]);
  });
});

describe("la scelta delle sedi si ricorda", () => {
  it("senza niente di salvato, o senza magazzino, vale «tutte»", () => {
    expect(leggiScelta(finto())).toBeNull();
    expect(leggiScelta(null)).toBeNull();
  });

  it("quello che si salva si ritrova, anche «tutte»", () => {
    const m = finto();
    salvaScelta(m, [1, 3]);
    expect(leggiScelta(m)).toEqual([1, 3]);
    salvaScelta(m, null);
    expect(leggiScelta(m)).toBeNull();
  });

  it("dati rovinati valgono «tutte», senza errori", () => {
    const CHIAVE = "contabilita.sedi.v1";
    expect(leggiScelta(finto({ [CHIAVE]: "{non json" }))).toBeNull();
    expect(leggiScelta(finto({ [CHIAVE]: "42" }))).toBeNull();
    expect(leggiScelta(finto({ [CHIAVE]: JSON.stringify({ scelte: "uno" }) }))).toBeNull();
    expect(leggiScelta(finto({ [CHIAVE]: JSON.stringify({ scelte: [1, "x", -2, 3.5, 2] }) }))).toEqual([1, 2]);
  });

  it("se il browser non lascia scrivere (modalità privata) non succede niente", () => {
    const rotto = {
      getItem: () => {
        throw new Error("bloccato");
      },
      setItem: () => {
        throw new Error("bloccato");
      },
    };
    expect(leggiScelta(rotto)).toBeNull();
    expect(() => salvaScelta(rotto, [1])).not.toThrow();
  });
});

describe("divisione dell'importo fra le sedi", () => {
  it("i centesimi di resto vanno uno ciascuno alle prime sedi", () => {
    expect(dividiImporto(1000, 3)).toEqual([334, 333, 333]);
    expect(dividiImporto(1001, 3)).toEqual([334, 334, 333]);
    expect(dividiImporto(900, 3)).toEqual([300, 300, 300]);
    expect(dividiImporto(1000, 1)).toEqual([1000]);
  });

  it("la somma delle parti è sempre l'importo", () => {
    for (const importo of [1, 2, 99, 1000, 12345, 100001]) {
      for (const n of [1, 2, 3, 4, 7]) {
        expect(dividiImporto(importo, n).reduce((s, p) => s + p, 0)).toBe(importo);
      }
    }
  });

  it("con meno centesimi che sedi le ultime restano a zero", () => {
    expect(dividiImporto(2, 3)).toEqual([1, 1, 0]);
  });

  it("valori impossibili non danno parti", () => {
    expect(dividiImporto(1000, 0)).toEqual([]);
    expect(dividiImporto(-5, 3)).toEqual([]);
    expect(dividiImporto(10.5, 3)).toEqual([]);
  });

  it("l'anteprima del modulo scrive le parti in italiano", () => {
    expect(anteprimaDivisione(100000, 3)).toBe("333,34 / 333,33 / 333,33 €");
    expect(anteprimaDivisione(33400 + 33300 + 33300, 3)).toBe("333,34 / 333,33 / 333,33 €");
    expect(anteprimaDivisione(1000, 3)).toBe("3,34 / 3,33 / 3,33 €");
    expect(anteprimaDivisione(123456, 2)).toBe("617,28 / 617,28 €");
  });

  it("l'anteprima non mostra le sedi che resterebbero senza movimento", () => {
    expect(anteprimaDivisione(2, 3)).toBe("0,01 / 0,01 €");
    expect(anteprimaDivisione(0, 3)).toBe("");
  });
});
