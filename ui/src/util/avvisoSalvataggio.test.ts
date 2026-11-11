import { describe, expect, it } from "vitest";
import { avvisoImportazione, avvisoMovimentoSalvato, type EsitoSalvataggio } from "./avvisoSalvataggio";

const base: EsitoSalvataggio = { demo: false, movimenti: 1, allegato: "nessuno", rifiutato: null, dataSePeriodoCambiato: null };
const avviso = (parziale: Partial<EsitoSalvataggio>) => avvisoMovimentoSalvato({ ...base, ...parziale });

describe("avviso dopo il salvataggio di un nuovo movimento", () => {
  it("normale: «Movimento salvato.», non è un errore", () => {
    expect(avviso({})).toEqual({ testo: "Movimento salvato.", errore: false });
    expect(avviso({ allegato: "caricato" })).toEqual({ testo: "Movimento salvato.", errore: false });
  });

  it("più sedi: dice della divisione", () => {
    expect(avviso({ movimenti: 3 })).toEqual({ testo: "Movimento diviso fra 3 sedi.", errore: false });
  });

  it("allegato non caricato: in rosso nell'app vera, informazione nella demo", () => {
    expect(avviso({ allegato: "nonCaricato" })).toEqual({ testo: "Movimento salvato, ma l'allegato non è stato caricato: puoi aggiungerlo dal dettaglio.", errore: true });
    expect(avviso({ allegato: "nonCaricato", demo: true })).toEqual({ testo: "Movimento salvato. Nella demo l'allegato non si salva.", errore: false });
  });

  it("allegato non caricato con più sedi: dice anche della divisione", () => {
    expect(avviso({ allegato: "nonCaricato", movimenti: 2 }).testo).toBe("Movimento diviso fra 2 sedi, ma l'allegato non è stato caricato: puoi aggiungerlo dal dettaglio.");
    expect(avviso({ allegato: "nonCaricato", movimenti: 2, demo: true }).testo).toBe("Movimento diviso fra 2 sedi. Nella demo l'allegato non si salva.");
  });

  it("allegato rifiutato e nessun file buono al suo posto: in rosso nell'app vera", () => {
    expect(avviso({ rifiutato: "a.gif" })).toEqual({ testo: "Movimento salvato. File «a.gif» non accettato. Puoi aggiungerne un altro dal dettaglio.", errore: true });
    expect(avviso({ rifiutato: "a.gif", demo: true })).toEqual({ testo: "Movimento salvato. File «a.gif» non accettato.", errore: false });
    expect(avviso({ rifiutato: "a.gif", movimenti: 3 }).testo).toMatch(/^Movimento diviso fra 3 sedi\. File «a\.gif» non accettato\. /);
  });

  it("demo: la variante più lunga (divisione, allegato, «Ora vedi …») resta corta", () => {
    expect(avviso({ demo: true, movimenti: 2, allegato: "nonCaricato", dataSePeriodoCambiato: "2026-09-10" }).testo).toBe("Movimento diviso fra 2 sedi. Nella demo l'allegato non si salva. Ora vedi settembre 2026.");
    expect(avviso({ demo: true, movimenti: 3, rifiutato: "a.gif", dataSePeriodoCambiato: "2026-09-10" }).testo).toBe("Movimento diviso fra 3 sedi. File «a.gif» non accettato. Ora vedi settembre 2026.");
  });

  it("un file rifiutato e poi sostituito da uno buono non genera il promemoria", () => {
    expect(avviso({ rifiutato: "a.gif", allegato: "caricato" }).testo).toBe("Movimento salvato.");
    expect(avviso({ rifiutato: "a.gif", allegato: "nonCaricato" }).testo).toMatch(/l'allegato non è stato caricato/);
  });

  // Il bug: «Ora vedi …» mancava nell'avviso «allegato non caricato» dell'app vera.
  it("se il periodo mostrato è cambiato, TUTTE le varianti finiscono con «Ora vedi <mese>.»", () => {
    const varianti: Partial<EsitoSalvataggio>[] = [];
    for (const demo of [false, true])
      for (const movimenti of [1, 3])
        for (const [allegato, rifiutato] of [["nessuno", null], ["caricato", null], ["nonCaricato", null], ["nessuno", "a.gif"]] as const)
          varianti.push({ demo, movimenti, allegato, rifiutato });
    expect(varianti).toHaveLength(16);
    for (const v of varianti) {
      const senza = avviso(v);
      const con = avviso({ ...v, dataSePeriodoCambiato: "2026-10-05" });
      expect(con.testo).toBe(`${senza.testo} Ora vedi ottobre 2026.`);
      expect(con.errore).toBe(senza.errore);
    }
  });
});

describe("avviso dopo l'importazione delle fatture", () => {
  it("dice quanti documenti e, se il periodo è cambiato, cosa si vede ora", () => {
    expect(avvisoImportazione({ importati: 9, cosa: "documenti", nonAggiunte: 0, motivo: null, oraVedi: "novembre 2026" })).toBe("Importati 9 documenti. Ora vedi novembre 2026.");
    expect(avvisoImportazione({ importati: 3, cosa: "fatture", nonAggiunte: 0, motivo: null, oraVedi: null })).toBe("Importate 3 fatture.");
    expect(avvisoImportazione({ importati: 1, cosa: "fatture", nonAggiunte: 0, motivo: null, oraVedi: "da ottobre a novembre 2026" })).toBe("Importato 1 documento. Ora vedi da ottobre a novembre 2026.");
  });
  it("con righe non aggiunte lo dice, col motivo", () => {
    expect(avvisoImportazione({ importati: 2, cosa: "fatture", nonAggiunte: 1, motivo: "Già registrata", oraVedi: null })).toBe("Importate 2 fatture; 1 non è stata aggiunta (Già registrata).");
    expect(avvisoImportazione({ importati: 2, cosa: "documenti", nonAggiunte: 2, motivo: null, oraVedi: "ottobre 2026" })).toBe("Importati 2 documenti; 2 non sono state aggiunte (già presenti). Ora vedi ottobre 2026.");
  });
});
