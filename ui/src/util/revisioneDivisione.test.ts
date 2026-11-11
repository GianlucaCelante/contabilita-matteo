import { describe, expect, it } from "vitest";
import type { Movimento, Sede } from "../api/tipi";
import { aiutoRipetizioneDivisa } from "./ripetizione";
import { sedeDellImportazione, sediDopoSalvataggio } from "./sedeDopoSalvataggio";
import { sediAttive } from "./sedi";

const sede = (id: number, nome: string, extra: Partial<Sede> = {}): Sede => ({ id, nome, archiviata: false, personale: false, ordine: id, movimenti: 0, ...extra });

describe("sedeDellImportazione: la sede in cui le fatture finiscono davvero", () => {
  const roma = sede(1, "Via Roma");
  const mare = sede(2, "Lungomare");
  it("la sede scelta nella schermata, se c'è", () => {
    expect(sedeDellImportazione([roma, mare], 2)).toBe(2);
    expect(sedeDellImportazione([roma], 1)).toBe(1);
  });
  it("senza scelta e con una sola sede attiva: quella (il servizio usa lei)", () => {
    expect(sedeDellImportazione(sediAttive([roma, sede(3, "Vecchia", { archiviata: true })]), null)).toBe(1);
  });
  it("senza scelta e con più sedi attive (o nessuna) non si sa: null", () => {
    expect(sedeDellImportazione([roma, mare], null)).toBeNull();
    expect(sedeDellImportazione([], null)).toBeNull();
  });
  it("una sola sede attiva più una personale archiviata con movimenti: il selettore c'è, e la sede dell'importazione si accende", () => {
    const casaVecchia = sede(4, "Casa", { personale: true, archiviata: true, movimenti: 3 });
    const sedi = [roma, casaVecchia];
    // si sta guardando solo la personale archiviata; le fatture vanno su Via Roma, l'unica attiva (nessuna sede da scegliere)
    const dove = sedeDellImportazione(sediAttive(sedi), null);
    expect(dove).toBe(1);
    expect(sediDopoSalvataggio(sedi, [4], [dove!])).toEqual({ daAggiungere: [1], aggiunte: ["Via Roma"], nonMostrate: [] });
    // e se si stava già guardando Via Roma non c'è niente da dire
    expect(sediDopoSalvataggio(sedi, [1], [dove!])).toEqual({ daAggiungere: [], aggiunte: [], nonMostrate: [] });
  });
});

describe("aiutoRipetizioneDivisa: l'avvertenza nel riquadro della ripetizione", () => {
  const ricorrenza = { id: 1, giorno: 5, attiva: true, unita: "MESI", intervallo: 1, prossimaData: "2026-12-05" } as NonNullable<Movimento["ricorrenza"]>;
  it("parte di un movimento diviso con la ripetizione attiva: lo dice", () => {
    expect(aiutoRipetizioneDivisa({ divisione: "abc:2026-11-05", ricorrenza })).toBe("È una parte di un movimento diviso: cambiando giorno o frequenza si separa dalle altre sedi.");
  });
  it("non diviso, non ripetuto o con la ripetizione ferma (la frequenza non si cambia): niente", () => {
    expect(aiutoRipetizioneDivisa({ divisione: null, ricorrenza })).toBeNull();
    expect(aiutoRipetizioneDivisa({ divisione: "abc", ricorrenza: null })).toBeNull();
    expect(aiutoRipetizioneDivisa({ divisione: "abc", ricorrenza: { ...ricorrenza, attiva: false } })).toBeNull();
  });
});
