import { describe, expect, it } from "vitest";
import { urlEsportazione } from "./esporta";

const base = { da: "2026-10-01", a: "2026-10-31", tipi: ["RICAVO" as const, "COSTO_FISSO" as const] };

describe("urlEsportazione", () => {
  it("senza opzioni non manda niente in più (valgono i predefiniti del servizio)", () => {
    expect(urlEsportazione({ ...base, formato: "xlsx" })).toBe("/api/esporta?formato=xlsx&da=2026-10-01&a=2026-10-31&includi=RICAVO%2CCOSTO_FISSO");
  });

  it("per l'Excel manda colonnePerSede e statistiche, anche a false", () => {
    const q = new URLSearchParams(urlEsportazione({ ...base, formato: "xlsx", sedi: "1,2", colonnePerSede: true, statistiche: false }).split("?")[1]);
    expect(q.get("colonnePerSede")).toBe("true");
    expect(q.get("statistiche")).toBe("false");
    expect(q.get("sedi")).toBe("1,2");
  });

  it("per il CSV le opzioni dell'Excel non partono", () => {
    const url = urlEsportazione({ ...base, formato: "csv", colonnePerSede: true, statistiche: false });
    expect(url).not.toContain("colonnePerSede");
    expect(url).not.toContain("statistiche");
  });
});
