import { describe, expect, it } from "vitest";
import { navigazioneCoperta, type Rettangolo } from "./barreFisse";

const r = (left: number, top: number, width: number, height: number): Rettangolo => ({ left, top, width, height });

// s36: sul telefono la barra «Annulla | Salva» dei moduli sta sopra la barra di navigazione. Le voci coperte restavano nella pagina:
// toccando dove c'è «Riepilogo» si prendeva «Annulla» (in Pizze e ordini: Statistiche). Coperta, la barra di navigazione si nasconde.
describe("navigazioneCoperta", () => {
  // Misure vere a 390×844: la barra di navigazione e la barra fissa di Pizze e ordini.
  const nav = r(0, 779, 390, 65);
  const azioni = r(0, 763, 390, 81);

  it("la barra Annulla/Salva del telefono copre la barra di navigazione", () => {
    expect(navigazioneCoperta(nav, [azioni])).toBe(true);
  });
  it("senza barre fisse, o con la barra di navigazione che non c'è (tastiera aperta), niente da nascondere", () => {
    expect(navigazioneCoperta(nav, [])).toBe(false);
    expect(navigazioneCoperta(null, [azioni])).toBe(false);
    expect(navigazioneCoperta(r(0, 0, 0, 0), [azioni])).toBe(false);
  });
  it("una barra che sta sopra la navigazione (i totali di Movimenti, la barra dell'importazione) non la copre", () => {
    expect(navigazioneCoperta(nav, [r(0, 707, 390, 72)])).toBe(false);
    // un pixel di bordo sovrapposto non basta
    expect(navigazioneCoperta(nav, [r(0, 708, 390, 72)])).toBe(false);
  });
  it("conta la barra che copre il centro delle voci, anche se non arriva fino in fondo", () => {
    expect(navigazioneCoperta(nav, [r(0, 760, 390, 60)])).toBe(true);
    expect(navigazioneCoperta(nav, [r(0, 760, 390, 40)])).toBe(false);
  });
  it("sul computer la barra laterale non è toccata da una barra in fondo al contenuto", () => {
    expect(navigazioneCoperta(r(0, 0, 88, 800), [r(88, 720, 1192, 80)])).toBe(false);
  });
  it("basta una barra fra tante", () => {
    expect(navigazioneCoperta(nav, [r(0, 600, 390, 50), azioni])).toBe(true);
  });
});
