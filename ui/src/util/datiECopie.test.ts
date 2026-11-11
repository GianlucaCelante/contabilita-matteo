import { describe, expect, it } from "vitest";
import { COPIE_NELLA_DEMO, doveSonoIDati } from "./datiECopie";

describe("Impostazioni › Dati e copie: testi veri anche nella demo", () => {
  it("l'app vera non cambia", () => {
    expect(doveSonoIDati(false)).toBe("Solo su questo computer, mai online");
  });
  it("la demo parla di «dispositivo» (si apre anche dal telefono), non di computer", () => {
    expect(doveSonoIDati(true)).toBe("Solo su questo dispositivo, mai online");
  });
  it("la demo non promette copie notturne: dice che lì non si fanno", () => {
    expect(COPIE_NELLA_DEMO).toMatch(/^Nella demo non si fanno\./);
    expect(COPIE_NELLA_DEMO).toContain("Nell'app vera se ne fa una ogni notte alle 03:00");
    expect(COPIE_NELLA_DEMO).not.toMatch(/predefinit/);
  });
});
