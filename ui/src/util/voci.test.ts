import { describe, expect, it } from "vitest";
import { avvisoEliminazione, destinazioniUnione, erroreNomeVoce, interruttoreRetribuzione, nomeTipoCategoria, testoConfermaUnione, testoMovimenti, testoNessunaDestinazione, testoUsi } from "./voci";

describe("voci: testi", () => {
  it("usi al maschile e al femminile", () => {
    expect(testoUsi("fornitori", 3)).toBe("usato da 3 movimenti");
    expect(testoUsi("categorie", 1)).toBe("usata da 1 movimento");
    expect(testoUsi("dipendenti", 0)).toBe("mai usato");
    expect(testoMovimenti(0)).toBe("Nessun movimento");
    expect(testoMovimenti(2)).toBe("2 movimenti");
  });
  it("la conferma di eliminazione dice quanti movimenti restano senza la voce", () => {
    expect(avvisoEliminazione("categorie", "Farine", 9)).toBe("«Farine» è usata da 9 movimenti in tutto: resteranno senza categoria.");
    expect(avvisoEliminazione("fornitori", "Bel Fungo", 1)).toBe("«Bel Fungo» è usato da 1 movimento in tutto: resterà senza fornitore.");
    expect(avvisoEliminazione("dipendenti", "Luca", 0)).toContain("non è usato da nessun movimento");
  });
  it("nome non valido", () => {
    expect(erroreNomeVoce("fornitori", "  ")).toBe("Scrivi il nome del fornitore.");
    expect(erroreNomeVoce("categorie", "a".repeat(121))).toContain("120");
    expect(erroreNomeVoce("categorie", "Ok")).toBeNull();
  });
  it("destinazioni dell'unione: non se stessa, per le categorie dello stesso tipo", () => {
    const lista = [
      { id: 1, tipo: "RICAVO" },
      { id: 2, tipo: "RICAVO" },
      { id: 3, tipo: "COSTO_FISSO" },
    ];
    expect(destinazioniUnione(lista, { id: 1, tipo: "RICAVO" }).map((x) => x.id)).toEqual([2]);
    expect(destinazioniUnione([{ id: 1 }, { id: 2 }], { id: 1 }).map((x) => x.id)).toEqual([2]);
  });
});

describe("voci: unione, conferma e interruttore retribuzione", () => {
  it("la conferma dell'unione dice quanti movimenti passano e che non si annulla", () => {
    expect(testoConfermaUnione("A", "B", 3)).toBe("Unire «A» in «B»? 3 movimenti passeranno a «B» e «A» sparirà. Non si può annullare.");
    expect(testoConfermaUnione("A", "B", 1)).toBe("Unire «A» in «B»? 1 movimento passerà a «B» e «A» sparirà. Non si può annullare.");
    expect(testoConfermaUnione("A", "B", 0)).toBe("Unire «A» in «B»? «A» sparirà. Non si può annullare.");
  });
  it("il tipo di una categoria a parole, per spiegare perche' si unisce solo fra uguali", () => {
    expect(nomeTipoCategoria("COSTO_FISSO")).toBe("costi fissi");
    expect(nomeTipoCategoria("COSTO_VARIABILE")).toBe("costi variabili");
    expect(nomeTipoCategoria("RICAVO")).toBe("ricavi");
  });
  it("nessun risultato nella ricerca dell'unione: dice perche' e cosa fare", () => {
    expect(testoNessunaDestinazione("categorie", "COSTO_FISSO")).toBe("Nessuna voce con questo nome tra i costi fissi. Per unire serve una voce già esistente dello stesso tipo.");
    expect(testoNessunaDestinazione("fornitori")).toBe("Nessun fornitore con questo nome. Per unire serve un fornitore già esistente.");
  });
  it("l'interruttore «retribuzione» non si spegne se la categoria ha gia' retribuzioni", () => {
    expect(interruttoreRetribuzione({ retribuzione: true, usi: 4 })).toEqual({ bloccato: true, motivo: "Non si può togliere: questa categoria ha già 4 movimenti." });
    expect(interruttoreRetribuzione({ retribuzione: true, usi: 1 }).motivo).toBe("Non si può togliere: questa categoria ha già 1 movimento.");
    expect(interruttoreRetribuzione({ retribuzione: true, usi: 0 })).toEqual({ bloccato: false });
    expect(interruttoreRetribuzione({ retribuzione: false, usi: 9 })).toEqual({ bloccato: false });
  });
});

import { frasePerRinomina } from "./voci";
describe("frasePerRinomina", () => {
  it("singolare con 1, plurale altrimenti", () => {
    expect(frasePerRinomina(1, "f")).toBe("Il nuovo nome vale anche per il movimento che la usa.");
    expect(frasePerRinomina(1, "m")).toBe("Il nuovo nome vale anche per il movimento che lo usa.");
    expect(frasePerRinomina(5, "m")).toBe("Il nuovo nome vale anche per i 5 movimenti che lo usano.");
    expect(frasePerRinomina(0, "f")).toBeUndefined();
  });
});
