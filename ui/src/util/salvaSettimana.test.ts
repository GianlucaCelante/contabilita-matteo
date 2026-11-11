import { describe, expect, it, vi } from "vitest";
import { salvaPiano } from "./pizzeOrdini";

// PizzeOrdini salva con salvaPiano(lunedi, piano, api): una sola chiamata all'endpoint unico, mai /giorni o /settimana.
describe("salvataggio della settimana", () => {
  it("una sola chiamata a salvaSettimanaCompletaStatistiche, con giorni e totali insieme", async () => {
    const servizio = {
      salvaSettimanaCompletaStatistiche: vi.fn().mockResolvedValue({}),
      salvaGiorniStatistiche: vi.fn().mockResolvedValue({}),
      salvaSettimanaStatistiche: vi.fn().mockResolvedValue({}),
    };
    const piano = {
      giorni: [{ sedeId: 1, data: "2026-11-03", pizze: 9, ordini: 4 }],
      settimana: [{ sedeId: 2, pizze: 70, ordini: 30 }],
      errori: [],
      sovrascritture: [],
    };
    await salvaPiano("2026-11-02", piano, servizio);
    expect(servizio.salvaSettimanaCompletaStatistiche).toHaveBeenCalledTimes(1);
    expect(servizio.salvaSettimanaCompletaStatistiche).toHaveBeenCalledWith({ settimana: "2026-11-02", giorni: piano.giorni, totali: piano.settimana });
    expect(servizio.salvaGiorniStatistiche).not.toHaveBeenCalled();
    expect(servizio.salvaSettimanaStatistiche).not.toHaveBeenCalled();
  });

  it("un errore del servizio passa così com'è (niente «i giorni sono salvati»)", async () => {
    const servizio = { salvaSettimanaCompletaStatistiche: vi.fn().mockRejectedValue(new Error("La sede «Casa» è personale: non ha pizze e ordini.")) };
    await expect(salvaPiano("2026-11-02", { giorni: [], settimana: [{ sedeId: 5, pizze: 1, ordini: 1 }] }, servizio)).rejects.toThrow(
      "La sede «Casa» è personale: non ha pizze e ordini.",
    );
    expect(servizio.salvaSettimanaCompletaStatistiche).toHaveBeenCalledTimes(1);
  });
});
