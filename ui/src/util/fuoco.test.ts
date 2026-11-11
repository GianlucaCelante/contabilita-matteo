import { describe, expect, it } from "vitest";
import { chiHaAperto, origineInEredita, controlloDellErrore, esitoRigaAttesa, fuocoPerso, vicinoDi, vicinoRimasto } from "./fuoco";

describe("dove va il fuoco quando una riga sparisce", () => {
  it("sulla successiva; se era l'ultima sulla precedente; se era l'unica da nessuna parte", () => {
    expect(vicinoDi(["a", "b", "c"], "b")).toBe("c");
    expect(vicinoDi(["a", "b", "c"], "c")).toBe("b");
    expect(vicinoDi(["a", "b", "c"], "a")).toBe("b");
    expect(vicinoDi(["a"], "a")).toBeNull();
    expect(vicinoDi(["a", "b"], "x")).toBeNull();
    expect(vicinoDi([], "a")).toBeNull();
  });
});

describe("la riga che deve sparire dopo un salvataggio", () => {
  it("sparita: si sposta il fuoco; ancora lì mentre salva: si aspetta", () => {
    expect(esitoRigaAttesa(false, true)).toBe("sposta");
    expect(esitoRigaAttesa(false, false)).toBe("sposta");
    expect(esitoRigaAttesa(true, true)).toBe("aspetta");
  });
  it("ancora lì a salvataggio finito (errore di rete): non si aspetta più, il fuoco non salterà dopo", () => {
    expect(esitoRigaAttesa(true, false)).toBe("annulla");
  });
});

describe("fuoco perso", () => {
  it("su niente, sul body o sul contenuto principale è perso; su un controllo no", () => {
    expect(fuocoPerso(null)).toBe(true);
    expect(fuocoPerso({ tagName: "BODY", id: "" })).toBe(true);
    expect(fuocoPerso({ tagName: "MAIN", id: "contenuto" })).toBe(true);
    expect(fuocoPerso({ tagName: "BUTTON", id: "" })).toBe(false);
    expect(fuocoPerso({ tagName: "INPUT", id: "x" })).toBe(false);
  });
});

// Un nodo finto: risponde a matches e querySelector con quello che gli si dice.
function nodo(nome: string, selettori: string[] = [], figli: Record<string, unknown> = {}) {
  return { nome, matches: (s: string) => selettori.includes(s), querySelector: (s: string) => (figli[s] ?? null) as never };
}

describe("il controllo che prende il fuoco dopo un errore di validazione", () => {
  it("un campo (anche il campo Categoria, che è un combobox) prende il fuoco lui stesso", () => {
    const campo = nodo("categoria");
    expect(controlloDellErrore(campo)).toBe(campo);
  });
  it("un gruppo di scelte: la scelta attiva, altrimenti la prima", () => {
    const attiva = nodo("attiva");
    const prima = nodo("prima");
    const gruppo = '[role="radiogroup"], [role="group"]';
    expect(controlloDellErrore(nodo("g", [gruppo], { '[aria-checked="true"]': attiva, "button": prima }))).toBe(attiva);
    expect(controlloDellErrore(nodo("g", [gruppo], { "button": prima }))).toBe(prima);
    const vuoto = nodo("g", [gruppo]);
    expect(controlloDellErrore(vuoto)).toBe(vuoto);
  });
});

// Elenco Movimenti con «Da pagare» acceso: la fattura segnata pagata esce dall'elenco insieme al badge che aveva il fuoco.
describe("la riga vicina che c'è ancora dopo il salvataggio", () => {
  it("la prima dopo quella sparita che è rimasta; se non ce ne sono, la più vicina prima; altrimenti nessuna", () => {
    expect(vicinoRimasto([1, 2, 3, 4], 2, [1, 3, 4])).toBe(3);
    expect(vicinoRimasto([1, 2, 3, 4], 2, [1, 4])).toBe(4);
    expect(vicinoRimasto([1, 2, 3, 4], 4, [1, 2, 3])).toBe(3);
    expect(vicinoRimasto([1, 2, 3, 4], 3, [1, 2])).toBe(2);
    expect(vicinoRimasto([1, 2, 3, 4], 3, [1])).toBe(1);
    expect(vicinoRimasto([7], 7, [])).toBeNull();
    expect(vicinoRimasto([1, 2], 9, [1, 2])).toBeNull();
  });
  it("non conta le righe arrivate dopo, che prima non c'erano", () => {
    expect(vicinoRimasto([1, 2, 3], 2, [8, 9])).toBeNull();
  });
});

// AzioniVoce: matita -> «scelta» -> «Elimina» -> Annulla -> Chiudi. Ogni fase è una finestra diversa: la seconda si apre quando il
// pulsante premuto (dentro la prima) non c'è già più, e il fuoco alla fine andava sul contenuto invece che sulla matita.
describe("chi ha aperto una finestra", () => {
  it("chi ha il fuoco; se nessuno, il controllo premuto un attimo prima", () => {
    expect(chiHaAperto("matita", null, null)).toBe("matita");
    expect(chiHaAperto(null, "matita", null)).toBe("matita");
    expect(chiHaAperto("campo", "matita", "altro")).toBe("campo");
  });
  it("una finestra che prende il posto di un'altra (cambio di fase) eredita chi aveva aperto la prima", () => {
    expect(chiHaAperto(null, null, "matita")).toBe("matita");
    expect(chiHaAperto(null, "pulsante", "matita")).toBe("pulsante");
  });
  it("nessuno: il fuoco, alla chiusura, andrà sul contenuto", () => {
    expect(chiHaAperto(null, null, null)).toBeNull();
  });
});

// Due finestre annidate che si chiudono nello stesso aggiornamento: l'origine dell'interna è un pulsante dell'esterna, già staccato.
describe("l'origine lasciata in eredità quando si chiudono più finestre insieme", () => {
  const connesso = (n: string) => !n.startsWith("staccato");
  it("la prima ancora in pagina vince: quella scritta dopo non la sostituisce", () => {
    expect(origineInEredita("matita", "staccato-interno", connesso)).toBe("matita");
    expect(origineInEredita("matita", "altro", connesso)).toBe("matita");
  });
  it("se quella già scritta non è più in pagina (o non c'è) vale la nuova", () => {
    expect(origineInEredita("staccato-interno", "matita", connesso)).toBe("matita");
    expect(origineInEredita(null, "matita", connesso)).toBe("matita");
    expect(origineInEredita(null, null, connesso)).toBeNull();
  });
});
