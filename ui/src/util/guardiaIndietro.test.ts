import { describe, expect, it } from "vitest";
import { creaGuardiaIndietro } from "./guardiaIndietro";

describe("guardia del passo indietro (doppio clic su «Annulla» o sulla freccia)", () => {
  it("finche' il passo indietro non e' avvenuto, i clic successivi non fanno altri passi", () => {
    const finestra = new EventTarget();
    const guardia = creaGuardiaIndietro(finestra);
    let passi = 0;
    expect(guardia.vai(() => passi++)).toBe(true);
    expect(guardia.vai(() => passi++)).toBe(false);
    expect(guardia.vai(() => passi++)).toBe(false);
    expect(passi).toBe(1);
  });
  it("quando la cronologia si muove (popstate) si sblocca: se l'uscita e' stata fermata si puo' riprovare", () => {
    const finestra = new EventTarget();
    const guardia = creaGuardiaIndietro(finestra);
    let passi = 0;
    guardia.vai(() => passi++);
    finestra.dispatchEvent(new Event("popstate"));
    expect(guardia.vai(() => passi++)).toBe(true);
    expect(passi).toBe(2);
  });
  it("un popstate senza passo in corso non cambia niente", () => {
    const finestra = new EventTarget();
    const guardia = creaGuardiaIndietro(finestra);
    finestra.dispatchEvent(new Event("popstate"));
    let passi = 0;
    expect(guardia.vai(() => passi++)).toBe(true);
    expect(guardia.vai(() => passi++)).toBe(false);
    expect(passi).toBe(1);
  });
});
