import { describe, expect, it } from "vitest";
import type { Sede } from "../api/tipi";
import {
  alternaSede,
  anteprimaDivisione,
  coloreDiPosizione,
  coloreSede,
  conPiuSedi,
  conPiuSediDelLocale,
  dividiImporto,
  etichettaSedi,
  idSelezionati,
  leggiScelta,
  letteraSede,
  lettereSedi,
  localePoiPersonali,
  PALETTE_SEDI,
  parametroSedi,
  rapportoContrasto,
  salvaScelta,
  sedePreselezionata,
  sediDelLocale,
  sediSelezionabili,
  senzaSede,
  sediIncluse,
  soloSede,
} from "./sedi";

const sede = (id: number, nome: string, extra: Partial<Sede> = {}): Sede => ({ id, nome, archiviata: false, personale: false, ordine: id, movimenti: 0, ...extra });
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

describe("sede personale (spese dei titolari)", () => {
  // Una sede vera e una personale; poi due vere, una personale e una vera archiviata.
  const VERA_E_PERSONALE = [sede(1, "Via Roma"), sede(5, "Casa", { personale: true })];
  const QUATTRO = [sede(1, "Via Roma"), sede(2, "Lungomare"), sede(5, "Casa", { personale: true }), sede(7, "Vecchia", { archiviata: true })];

  it("le sedi del locale sono le attive non personali; il selettore compare con due attive qualsiasi", () => {
    expect(sediDelLocale(VERA_E_PERSONALE).map((s) => s.id)).toEqual([1]);
    expect(conPiuSedi(VERA_E_PERSONALE)).toBe(true);
    expect(conPiuSediDelLocale(VERA_E_PERSONALE)).toBe(false);
    expect(conPiuSediDelLocale(QUATTRO)).toBe(true);
  });

  it("nelle scelte le personali vengono dopo le sedi del locale", () => {
    const misto = [sede(5, "Casa", { personale: true, ordine: 0 }), sede(1, "Via Roma"), sede(2, "Lungomare")];
    expect(localePoiPersonali(misto).map((s) => s.id)).toEqual([1, 2, 5]);
  });

  it("di partenza e con «Tutte le sedi» la personale resta fuori, e il filtro si omette", () => {
    expect(idSelezionati(VERA_E_PERSONALE, null)).toEqual([1]);
    expect(parametroSedi(VERA_E_PERSONALE, null)).toBeUndefined();
    expect(etichettaSedi(VERA_E_PERSONALE, null)).toBe("Tutte le sedi");
    expect(sediIncluse(VERA_E_PERSONALE, null)).toBeNull();
    expect(idSelezionati(QUATTRO, null)).toEqual([1, 2]);
    expect(parametroSedi(QUATTRO, null)).toBeUndefined();
  });

  it("la sola personale scelta: filtro esplicito, mai «Tutte le sedi», nessuna preselezione", () => {
    const solo = soloSede(VERA_E_PERSONALE, 5);
    expect(solo).toEqual([5]);
    expect(parametroSedi(VERA_E_PERSONALE, solo)).toBe("5");
    expect(etichettaSedi(VERA_E_PERSONALE, solo)).toBe("Casa");
    expect(sediIncluse(VERA_E_PERSONALE, solo)).toBe("Casa");
    expect(sedePreselezionata(VERA_E_PERSONALE, solo)).toBeNull();
  });

  it("accesa la personale insieme a tutto il locale: resta esplicita, con le archiviate del locale per non perdere il passato", () => {
    const conCasa = alternaSede(QUATTRO, null, 5);
    expect(conCasa).toEqual([1, 2, 5]);
    expect(idSelezionati(QUATTRO, conCasa)).toEqual([1, 2, 5]);
    expect(parametroSedi(QUATTRO, conCasa)).toBe("1,2,5,7");
    expect(etichettaSedi(QUATTRO, conCasa)).toBe("Tutte le sedi + Casa");
    expect(sediIncluse(QUATTRO, conCasa)).toBe("Tutte le sedi + Casa");
    // Spenta di nuovo la personale si torna a «tutte».
    expect(alternaSede(QUATTRO, conCasa, 5)).toBeNull();
  });

  it("una sede vera più la personale, con lo stesso numero di sedi del locale, non è «tutte»", () => {
    const mista = alternaSede(QUATTRO, [1], 5);
    expect(mista).toEqual([1, 5]);
    expect(parametroSedi(QUATTRO, mista)).toBe("1,5");
    expect(etichettaSedi(QUATTRO, mista)).toBe("Via Roma + Casa");
    expect(sedePreselezionata(QUATTRO, [2])).toBe(2);
    expect(sedePreselezionata(QUATTRO, [5])).toBeNull();
  });

  it("con una sede vera e la personale accesa: l'unica vera si può spegnere, la personale da sola resta", () => {
    expect(alternaSede(VERA_E_PERSONALE, [1, 5], 1)).toEqual([5]);
    expect(alternaSede(VERA_E_PERSONALE, [5], 5)).toEqual([5]);
  });

  it("scelte salvate prima della sede personale restano valide; quelle non più valide tornano al locale", () => {
    expect(idSelezionati(QUATTRO, [2])).toEqual([2]);
    expect(idSelezionati(QUATTRO, [1, 2])).toEqual([1, 2]);
    expect(parametroSedi(QUATTRO, [1, 2])).toBeUndefined();
    expect(idSelezionati(QUATTRO, [7, 9])).toEqual([1, 2]);
    expect(leggiScelta(finto({ "contabilita.sedi.v1": JSON.stringify({ scelte: null }) }))).toBeNull();
    expect(leggiScelta(finto({ "contabilita.sedi.v1": JSON.stringify({ scelte: [1, 2] }) }))).toEqual([1, 2]);
  });

  it("oltre tre sedi il titolo conta sulle attive", () => {
    const sei = [1, 2, 3, 4].map((i) => sede(i, `Sede ${i}`)).concat([sede(5, "Casa", { personale: true })]);
    expect(sediIncluse(sei, [1, 2, 3, 5])).toBe("4 sedi su 5");
  });
});

describe("sedi personali archiviate", () => {
  // 1 e 2 del locale, 5 personale attiva, 6 personale archiviata con movimenti, 8 personale archiviata vuota, 7 del locale archiviata.
  const SEDI = [
    sede(1, "Via Roma"),
    sede(2, "Lungomare"),
    sede(5, "Casa", { personale: true }),
    sede(6, "Casa vecchia", { personale: true, archiviata: true, movimenti: 4 }),
    sede(8, "Vuota", { personale: true, archiviata: true }),
    sede(7, "Vecchia", { archiviata: true, movimenti: 9 }),
  ];

  it("si possono scegliere le attive e le personali archiviate con movimenti (in fondo)", () => {
    expect(sediSelezionabili(SEDI).map((s) => s.id)).toEqual([1, 2, 5, 6]);
  });

  it("una personale archiviata scelta da sola: filtro esplicito con il suo id", () => {
    const solo = soloSede(SEDI, 6);
    expect(solo).toEqual([6]);
    expect(idSelezionati(SEDI, solo)).toEqual([6]);
    expect(parametroSedi(SEDI, solo)).toBe("6");
    expect(etichettaSedi(SEDI, solo)).toBe("Casa vecchia");
  });

  it("accese tutte le personali attive, il filtro porta anche le personali archiviate", () => {
    expect(parametroSedi(SEDI, [5])).toBe("5,6,8");
    expect(parametroSedi(SEDI, [1, 2, 5])).toBe("1,2,5,7,6,8");
    // la personale archiviata gia' scelta non si ripete
    expect(parametroSedi(SEDI, [5, 6])).toBe("5,6,8");
  });

  it("con una sola sede attiva e una personale archiviata con movimenti il selettore serve", () => {
    const due = [sede(1, "Via Roma"), sede(6, "Casa vecchia", { personale: true, archiviata: true, movimenti: 4 })];
    expect(conPiuSedi(due)).toBe(false);
    expect(sediSelezionabili(due).length).toBe(2);
    expect(parametroSedi(due, [6])).toBe("6");
    expect(parametroSedi(due, null)).toBeUndefined();
  });
});

describe("una sede che diventa personale esce dalla scelta salvata", () => {
  it("si toglie l'id; se non resta niente si torna a «tutte»", () => {
    expect(senzaSede([1, 3], 3)).toEqual([1]);
    expect(senzaSede([3], 3)).toBeNull();
    expect(senzaSede(null, 3)).toBeNull();
    expect(senzaSede([1, 2], 3)).toEqual([1, 2]);
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
