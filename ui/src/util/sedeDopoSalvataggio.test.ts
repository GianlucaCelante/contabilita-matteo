import { describe, expect, it } from "vitest";
import type { Sede } from "../api/tipi";
import { avvisoImportazione, avvisoMovimentoSalvato, type EsitoSalvataggio } from "./avvisoSalvataggio";
import { fraseOraVedi, sceltaConSedi, sediDopoSalvataggio } from "./sedeDopoSalvataggio";
import { idSelezionati } from "./sedi";

// Dopo «Nuovo movimento» o «Importa» su una sede che il selettore non sta mostrando: la selezione segue il movimento, come il periodo
// («Ora vedi novembre 2026, con Lungomare.»). Una sede personale non si accende mai da sola: l'avviso dice dov'e' il movimento.

const sede = (id: number, nome: string, extra: Partial<Sede> = {}): Sede => ({ id, nome, archiviata: false, personale: false, ordine: id, movimenti: 0, ...extra });
const roma = sede(1, "Via Roma");
const mare = sede(2, "Lungomare");
const mercato = sede(3, "Mercato");
const casa = sede(4, "Casa", { personale: true });
const sedi = [roma, mare, mercato, casa];
const vuoto = { daAggiungere: [], aggiunte: [], nonMostrate: [] };

describe("sediDopoSalvataggio: quali sedi accendere e quali solo nominare", () => {
  it("il movimento è su una sede già selezionata: non cambia niente", () => {
    expect(sediDopoSalvataggio(sedi, [1, 2], [2])).toEqual(vuoto);
    expect(sediDopoSalvataggio(sedi, [1], [1])).toEqual(vuoto);
  });

  it("su una sede del locale non selezionata: si aggiunge alla selezione", () => {
    expect(sediDopoSalvataggio(sedi, [1], [2])).toEqual({ daAggiungere: [2], aggiunte: ["Lungomare"], nonMostrate: [] });
  });

  it("«Tutte le sedi» (il locale): le sedi del locale ci sono già; una personale non si accende, si nomina soltanto", () => {
    const tutte = idSelezionati(sedi, null);
    expect(tutte).toEqual([1, 2, 3]);
    expect(sediDopoSalvataggio(sedi, tutte, [3])).toEqual(vuoto);
    expect(sediDopoSalvataggio(sedi, tutte, [4])).toEqual({ daAggiungere: [], aggiunte: [], nonMostrate: ["Casa"] });
  });

  it("la personale già accesa a mano: niente da dire", () => {
    expect(sediDopoSalvataggio(sedi, [1, 4], [4])).toEqual(vuoto);
  });

  it("divisione fra più sedi: si aggiungono quelle del locale che mancano, nell'ordine del selettore, una volta sola; la personale si nomina", () => {
    expect(sediDopoSalvataggio(sedi, [1], [3, 1, 2, 3])).toEqual({ daAggiungere: [2, 3], aggiunte: ["Lungomare", "Mercato"], nonMostrate: [] });
    expect(sediDopoSalvataggio(sedi, [1], [1, 2, 4])).toEqual({ daAggiungere: [2], aggiunte: ["Lungomare"], nonMostrate: ["Casa"] });
  });

  it("senza selettore (una sola sede sceglibile) o con sedi non ancora arrivate: niente", () => {
    expect(sediDopoSalvataggio([roma], [1], [1])).toEqual(vuoto);
    expect(sediDopoSalvataggio([], [], [1])).toEqual(vuoto);
    // una sede che non c'è nell'elenco (dati non aggiornati) si ignora
    expect(sediDopoSalvataggio(sedi, [1], [99])).toEqual(vuoto);
  });
});

describe("sceltaConSedi: la selezione da salvare", () => {
  it("aggiunge le sedi a quelle selezionate; se diventa tutto il locale torna «tutte» (null)", () => {
    expect(sceltaConSedi(sedi, [1], [2])).toEqual([1, 2]);
    expect(sceltaConSedi(sedi, [1, 2], [3])).toBeNull();
    expect(sceltaConSedi(sedi, [3], [1, 2])).toBeNull();
  });
  it("con una personale accesa a mano la selezione resta esplicita", () => {
    expect(sceltaConSedi(sedi, [1, 4], [2])).toEqual([1, 2, 4]);
    expect(sceltaConSedi(sedi, [1, 2, 4], [3])).toEqual([1, 2, 3, 4]);
  });
});

describe("fraseOraVedi: una frase sola per periodo e sedi", () => {
  const aggiunta = { daAggiungere: [2], aggiunte: ["Lungomare"], nonMostrate: [] };
  it("niente da dire: stringa vuota", () => {
    expect(fraseOraVedi(null, vuoto, "uno")).toBe("");
    expect(fraseOraVedi(null, null, "uno")).toBe("");
  });
  it("solo il periodo: come prima", () => {
    expect(fraseOraVedi("novembre 2026", vuoto, "uno")).toBe(" Ora vedi novembre 2026.");
  });
  it("periodo e sede aggiunta: «Ora vedi novembre 2026, con Lungomare.»", () => {
    expect(fraseOraVedi("novembre 2026", aggiunta, "uno")).toBe(" Ora vedi novembre 2026, con Lungomare.");
  });
  it("solo la sede aggiunta: «Ora vedi anche Lungomare.»; più sedi con «e»", () => {
    expect(fraseOraVedi(null, aggiunta, "uno")).toBe(" Ora vedi anche Lungomare.");
    expect(fraseOraVedi(null, { daAggiungere: [2, 3], aggiunte: ["Lungomare", "Mercato"], nonMostrate: [] }, "parte")).toBe(" Ora vedi anche Lungomare e Mercato.");
    expect(fraseOraVedi(null, { daAggiungere: [1, 2, 3], aggiunte: ["Via Roma", "Lungomare", "Mercato"], nonMostrate: [] }, "parte")).toBe(" Ora vedi anche Via Roma, Lungomare e Mercato.");
  });
  it("sede personale non accesa: dice dov'è, secondo che cosa si è salvato", () => {
    const personale = { daAggiungere: [], aggiunte: [], nonMostrate: ["Casa"] };
    expect(fraseOraVedi(null, personale, "uno")).toBe(" È su Casa (personale), che ora non stai guardando.");
    expect(fraseOraVedi(null, personale, "parte")).toBe(" Una parte è su Casa (personale), che ora non stai guardando.");
    expect(fraseOraVedi(null, personale, "piu")).toBe(" Sono su Casa (personale), che ora non stai guardando.");
    expect(fraseOraVedi("ottobre 2026", personale, "uno")).toBe(" Ora vedi ottobre 2026. È su Casa (personale), che ora non stai guardando.");
  });
  it("divisione con una sede aggiunta e una personale", () => {
    expect(fraseOraVedi("ottobre 2026", { daAggiungere: [2], aggiunte: ["Lungomare"], nonMostrate: ["Casa"] }, "parte")).toBe(
      " Ora vedi ottobre 2026, con Lungomare. Una parte è su Casa (personale), che ora non stai guardando.",
    );
  });
});

describe("gli avvisi usano la stessa frase", () => {
  const base: EsitoSalvataggio = { demo: false, movimenti: 1, allegato: "nessuno", rifiutato: null, dataSePeriodoCambiato: null };
  const aggiunta = { daAggiungere: [2], aggiunte: ["Lungomare"], nonMostrate: [] };
  const personale = { daAggiungere: [], aggiunte: [], nonMostrate: ["Casa"] };
  it("nuovo movimento: tutte le varianti dicono della sede", () => {
    expect(avvisoMovimentoSalvato({ ...base, sedi: aggiunta }).testo).toBe("Movimento salvato. Ora vedi anche Lungomare.");
    expect(avvisoMovimentoSalvato({ ...base, sedi: aggiunta, dataSePeriodoCambiato: "2026-10-03" }).testo).toBe("Movimento salvato. Ora vedi ottobre 2026, con Lungomare.");
    expect(avvisoMovimentoSalvato({ ...base, sedi: personale }).testo).toBe("Movimento salvato. È su Casa (personale), che ora non stai guardando.");
    expect(avvisoMovimentoSalvato({ ...base, movimenti: 3, sedi: { daAggiungere: [2], aggiunte: ["Lungomare"], nonMostrate: ["Casa"] } }).testo).toBe(
      "Movimento diviso fra 3 sedi. Ora vedi anche Lungomare. Una parte è su Casa (personale), che ora non stai guardando.",
    );
    expect(avvisoMovimentoSalvato({ ...base, allegato: "nonCaricato", demo: true, sedi: aggiunta }).testo).toBe("Movimento salvato. Nella demo l'allegato non si salva. Ora vedi anche Lungomare.");
    expect(avvisoMovimentoSalvato({ ...base, rifiutato: "a.gif", sedi: aggiunta }).testo).toMatch(/ Ora vedi anche Lungomare\.$/);
    // senza `sedi` (o vuoto) resta com'era
    expect(avvisoMovimentoSalvato(base).testo).toBe("Movimento salvato.");
  });
  it("importazione", () => {
    const e = { importati: 3, cosa: "fatture" as const, nonAggiunte: 0, motivo: null };
    expect(avvisoImportazione({ ...e, oraVedi: "ottobre 2026", sedi: aggiunta })).toBe("Importate 3 fatture. Ora vedi ottobre 2026, con Lungomare.");
    expect(avvisoImportazione({ ...e, oraVedi: null, sedi: aggiunta })).toBe("Importate 3 fatture. Ora vedi anche Lungomare.");
    expect(avvisoImportazione({ ...e, oraVedi: null, sedi: personale })).toBe("Importate 3 fatture. Sono su Casa (personale), che ora non stai guardando.");
    expect(avvisoImportazione({ ...e, importati: 1, oraVedi: null, sedi: personale })).toBe("Importato 1 documento. È su Casa (personale), che ora non stai guardando.");
  });
});
