import { describe, expect, it } from "vitest";
import { intervalloContiene, intervalloDi } from "./formato";

describe("intervalloContiene: il periodo mostrato include oggi?", () => {
  it("settimana, mese e anno che contengono la data", () => {
    expect(intervalloContiene(intervalloDi("settimana", "2026-10-21"), "2026-10-25")).toBe(true); // domenica della stessa settimana
    expect(intervalloContiene(intervalloDi("mese", "2026-10-01"), "2026-10-31")).toBe(true);
    expect(intervalloContiene(intervalloDi("anno", "2026-03-03"), "2026-12-31")).toBe(true);
  });
  it("gli estremi sono compresi, il giorno dopo e quello prima no", () => {
    const sett = intervalloDi("settimana", "2026-10-21"); // 19–25 ottobre
    expect(intervalloContiene(sett, "2026-10-19")).toBe(true);
    expect(intervalloContiene(sett, "2026-10-18")).toBe(false);
    expect(intervalloContiene(sett, "2026-10-26")).toBe(false);
  });
  it("un altro mese o un altro anno no", () => {
    expect(intervalloContiene(intervalloDi("mese", "2026-09-15"), "2026-10-23")).toBe(false);
    expect(intervalloContiene(intervalloDi("anno", "2025-06-01"), "2026-10-23")).toBe(false);
  });
});
