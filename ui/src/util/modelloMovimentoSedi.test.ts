import { describe, expect, it } from "vitest";
import { alternaSede, campiVuoti, preparaInput, sediDelleDivisione, type CampiForm } from "./modelloMovimento";

const valido = (extra: Partial<CampiForm> = {}): CampiForm => ({ ...campiVuoti(), importo: "86,00", fornitore: "Molino Bianchi", categoria: "Farine", ...extra });

describe("la sede nel modulo del movimento", () => {
  it("con una sola sede attiva la sede non si chiede e non si manda: il modulo è quello di prima", () => {
    const { errori, input } = preparaInput(valido(), true, false);
    expect(errori.sedeId).toBeUndefined();
    expect(input).not.toBeNull();
    expect(input).not.toHaveProperty("sedeId");
  });

  it("con più sedi attive e nessuna scelta c'è un messaggio in italiano e niente da salvare", () => {
    const { errori, input } = preparaInput(valido(), true, true);
    expect(errori.sedeId).toBe("Scegli una o più sedi.");
    expect(input).toBeNull();
  });

  it("con la sede scelta, l'id va nel corpo", () => {
    const { errori, input } = preparaInput(valido({ sedeId: 2 }), true, true);
    expect(errori.sedeId).toBeUndefined();
    expect(input?.sedeId).toBe(2);
  });

  it("«Tutte, dividi» vale come scelta e non manda nessuna sede", () => {
    const { errori, input } = preparaInput(valido({ dividi: true }), true, true);
    expect(errori.sedeId).toBeUndefined();
    expect(input).not.toBeNull();
    expect(input).not.toHaveProperty("sedeId");
  });

  it("due sedi su tre valgono come scelta e non mandano nessuna sede", () => {
    const { errori, input } = preparaInput(valido({ dividi: true, sediDivise: [1, 3] }), true, true);
    expect(errori.sedeId).toBeUndefined();
    expect(input).not.toHaveProperty("sedeId");
  });

  it("un movimento diviso porta la ripetizione: ogni sede ripete la sua parte", () => {
    const campi = valido({ tipo: "COSTO_FISSO", voceFissa: "AFFITTO", fornitore: "", categoria: "", ripeti: true, giorno: "5", dividi: true });
    const { input } = preparaInput(campi, true, true);
    expect(input?.ricorrenza).toMatchObject({ unita: "MESI", intervallo: 1, giorno: 5 });
  });
});

describe("la scelta di una o più sedi", () => {
  const attive = [1, 2, 3];
  const vuoto = { sedeId: null, dividi: false, sediDivise: [] as number[] };

  it("la prima pillola sceglie una sede, la stessa toccata di nuovo la toglie", () => {
    const una = alternaSede(vuoto, 2, attive);
    expect(una).toEqual({ sedeId: 2, dividi: false, sediDivise: [] });
    expect(alternaSede({ ...una }, 2, attive)).toEqual({ sedeId: null, dividi: false, sediDivise: [] });
  });

  it("una seconda pillola porta a dividere fra due sedi, in ordine di sede", () => {
    const due = alternaSede({ ...vuoto, sedeId: 3 }, 1, attive);
    expect(due).toEqual({ sedeId: null, dividi: true, sediDivise: [1, 3] });
  });

  it("con tutte le sedi scelte l'elenco resta vuoto (= tutte) e togliendone una si torna a due", () => {
    const tutte = alternaSede({ sedeId: null, dividi: true, sediDivise: [1, 3] }, 2, attive);
    expect(tutte).toEqual({ sedeId: null, dividi: true, sediDivise: [] });
    expect(alternaSede({ ...tutte }, 3, attive)).toEqual({ sedeId: null, dividi: true, sediDivise: [1, 2] });
  });

  it("togliendo una di due sedi resta una sede sola, non più divisa", () => {
    expect(alternaSede({ sedeId: null, dividi: true, sediDivise: [1, 3] }, 1, attive)).toEqual({ sedeId: 3, dividi: false, sediDivise: [] });
  });

  it("le sedi della divisione: quelle scelte oppure tutte le attive", () => {
    expect(sediDelleDivisione({ sediDivise: [1, 3] }, attive)).toEqual([1, 3]);
    expect(sediDelleDivisione({ sediDivise: [] }, attive)).toEqual([1, 2, 3]);
  });
});
