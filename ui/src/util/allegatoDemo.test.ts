import { describe, expect, it } from "vitest";
import { avvisoAllegatoNonCaricato, avvisoAllegatoRifiutato, notaAllegato } from "./allegatoDemo";

describe("allegati: l'app vera e la demo", () => {
  it("nell'app vera il messaggio resta quello di prima e il campo non ha note", () => {
    expect(avvisoAllegatoNonCaricato(false)).toBe("Movimento salvato, ma l'allegato non è stato caricato: puoi aggiungerlo dal dettaglio.");
    expect(notaAllegato(false)).toBeNull();
  });
  it("nella demo dice che l'allegato non si salva, nel messaggio e già sotto il campo", () => {
    expect(avvisoAllegatoNonCaricato(true)).toBe("Movimento salvato. Nella demo l'allegato non si salva.");
    expect(notaAllegato(true)).toBe("Nella demo gli allegati non si salvano.");
  });
});

// Un file scelto e rifiutato (formato non ammesso, troppo grande, vuoto) non ferma il salvataggio: l'avviso finale lo ricorda.
describe("allegato rifiutato prima del salvataggio", () => {
  it("nell'app vera l'avviso dice che il movimento è senza allegato, quale file e dove rimediare", () => {
    expect(avvisoAllegatoRifiutato(false, "scontrino.gif", 1)).toBe("Movimento salvato. File «scontrino.gif» non accettato. Puoi aggiungerne un altro dal dettaglio.");
  });
  it("con più sedi dice anche della divisione", () => {
    expect(avvisoAllegatoRifiutato(false, "a.gif", 3)).toBe("Movimento diviso fra 3 sedi. File «a.gif» non accettato. Puoi aggiungerne un altro dal dettaglio.");
  });
  // Che nella demo gli allegati non si salvano è già scritto sotto il campo: qui basta il motivo, senza una frase in più.
  it("nella demo non rimanda al dettaglio, dove gli allegati non si salvano", () => {
    expect(avvisoAllegatoRifiutato(true, "scontrino.gif", 1)).toBe("Movimento salvato. File «scontrino.gif» non accettato.");
    expect(avvisoAllegatoRifiutato(true, "a.gif", 3)).toBe("Movimento diviso fra 3 sedi. File «a.gif» non accettato.");
  });

  // A 320 px l'avviso largo quanto lo schermo ha circa 30 caratteri per riga: le varianti della demo devono stare in tre righe anche
  // con la divisione fra sedi e con «Ora vedi settembre 2026.» in coda (25 caratteri).
  it("nella demo i testi restano corti (al massimo 67 caratteri prima di «Ora vedi …»)", () => {
    for (const testo of [avvisoAllegatoNonCaricato(true), avvisoAllegatoNonCaricato(true, 9), avvisoAllegatoRifiutato(true, "a.gif", 1), avvisoAllegatoRifiutato(true, "a.gif", 9)]) expect(testo.length).toBeLessThanOrEqual(67);
  });
});

describe("riquadro «fattura importata» del dettaglio", () => {
  it("app vera: dice che il file resta allegato", async () => {
    const { testiFatturaImportata } = await import("./allegatoDemo");
    expect(testiFatturaImportata(false, "2026-11-11T10:30:00")).toEqual({ titolo: "Importata dal file della fattura elettronica", sotto: "Importata l'11/11 · il file resta allegato" });
  });
  it("demo: gli allegati non si salvano, quindi non lo promette", async () => {
    const { testiFatturaImportata } = await import("./allegatoDemo");
    expect(testiFatturaImportata(true, "2026-11-11T10:30:00")).toEqual({ titolo: "Importata dal file della fattura elettronica", sotto: "Importata l'11/11" });
  });
});

describe("riquadro «fattura importata»: l'articolo davanti al giorno", () => {
  it("«l'» davanti a 1, 8 e 11; «il» per gli altri", async () => {
    const { testiFatturaImportata } = await import("./allegatoDemo");
    const sotto = (giorno: string) => testiFatturaImportata(true, `2026-11-${giorno}T09:00:00`).sotto;
    expect(sotto("03")).toBe("Importata il 03/11");
    expect(sotto("08")).toBe("Importata l'8/11");
    expect(sotto("01")).toBe("Importata l'1/11");
    expect(sotto("11")).toBe("Importata l'11/11");
    expect(sotto("18")).toBe("Importata il 18/11");
    expect(sotto("30")).toBe("Importata il 30/11");
  });
});
