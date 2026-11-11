import { describe, expect, it } from "vitest";
import type { Sede } from "../api/tipi";
import { CHIAVE_ULTIMA_SEDE, leggiUltimaSede, ricordaUltimaSede, sedeDiPartenza } from "./ultimaSede";

const sede = (id: number, nome: string, extra: Partial<Sede> = {}): Sede => ({ id, nome, archiviata: false, personale: false, ordine: id, movimenti: 0, ...extra });
// Due sedi del locale, una personale, una archiviata.
const SEDI = [sede(1, "Via Roma"), sede(2, "Lungomare"), sede(5, "Casa", { personale: true }), sede(7, "Vecchia", { archiviata: true })];

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

describe("la sede di partenza di un movimento nuovo", () => {
  it("con una sede sola selezionata vale quella, qualunque sia l'ultima usata", () => {
    expect(sedeDiPartenza(SEDI, [2], 1)).toBe(2);
    expect(sedeDiPartenza(SEDI, [2], null)).toBe(2);
  });

  it("con «Tutte le sedi» (o più sedi) parte dall'ultima usata su questo dispositivo", () => {
    expect(sedeDiPartenza(SEDI, [1, 2], 2)).toBe(2);
    expect(sedeDiPartenza(SEDI, [1, 2], 1)).toBe(1);
  });

  it("senza un'ultima sede non sceglie niente: la sede si chiede", () => {
    expect(sedeDiPartenza(SEDI, [1, 2], null)).toBeNull();
  });

  it("mai una sede personale, archiviata o che non c'è più", () => {
    expect(sedeDiPartenza(SEDI, [1, 2, 5], 5)).toBeNull();
    expect(sedeDiPartenza(SEDI, [1, 2], 7)).toBeNull();
    expect(sedeDiPartenza(SEDI, [1, 2], 99)).toBeNull();
  });

  it("con la sola personale selezionata la sede si sceglie (nessun ripiego sull'ultima)", () => {
    expect(sedeDiPartenza(SEDI, [5], 1)).toBeNull();
  });

  it("l'ultima usata vale solo se è fra le sedi che si stanno guardando", () => {
    const tre = [...SEDI, sede(3, "Mercato")];
    expect(sedeDiPartenza(tre, [1, 2], 3)).toBeNull();
    expect(sedeDiPartenza(tre, [1, 3], 3)).toBe(3);
  });

  it("con una sola sede attiva non c'è niente da scegliere", () => {
    expect(sedeDiPartenza([sede(1, "Via Roma"), sede(7, "Vecchia", { archiviata: true })], [1], 1)).toBeNull();
  });
});

describe("l'ultima sede ricordata", () => {
  it("si salva e si rilegge", () => {
    const m = finto();
    ricordaUltimaSede(m, SEDI, 2);
    expect(m.dati[CHIAVE_ULTIMA_SEDE]).toBe('{"sede":2}');
    expect(leggiUltimaSede(m)).toBe(2);
  });

  it("una sede personale, archiviata o sconosciuta non si ricorda: resta quella di prima", () => {
    const m = finto();
    ricordaUltimaSede(m, SEDI, 1);
    ricordaUltimaSede(m, SEDI, 5);
    ricordaUltimaSede(m, SEDI, 7);
    ricordaUltimaSede(m, SEDI, 99);
    expect(leggiUltimaSede(m)).toBe(1);
  });

  it("un valore rovinato o assente vale «nessuna»", () => {
    expect(leggiUltimaSede(finto())).toBeNull();
    expect(leggiUltimaSede(finto({ [CHIAVE_ULTIMA_SEDE]: "{" }))).toBeNull();
    expect(leggiUltimaSede(finto({ [CHIAVE_ULTIMA_SEDE]: '{"sede":"2"}' }))).toBeNull();
    expect(leggiUltimaSede(finto({ [CHIAVE_ULTIMA_SEDE]: '{"sede":-1}' }))).toBeNull();
    expect(leggiUltimaSede(finto({ [CHIAVE_ULTIMA_SEDE]: "null" }))).toBeNull();
  });

  it("senza magazzino, o con un magazzino che lancia, non succede niente", () => {
    expect(leggiUltimaSede(null)).toBeNull();
    expect(() => ricordaUltimaSede(null, SEDI, 1)).not.toThrow();
    const rotto = {
      getItem: () => {
        throw new Error("vietato");
      },
      setItem: () => {
        throw new Error("pieno");
      },
    };
    expect(leggiUltimaSede(rotto)).toBeNull();
    expect(() => ricordaUltimaSede(rotto, SEDI, 1)).not.toThrow();
  });
});
