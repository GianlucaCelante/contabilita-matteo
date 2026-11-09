import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoAperta, PASSWORD_DEMO, rispondiAccesso } from "./accesso";

// Il cancello della demo: password «123», solo nel browser.
describe("demo: password", () => {
  beforeEach(() => {
    // l'ambiente dei test non ha il browser: una memoria di sessione finta
    const memoria = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
      removeItem: (k: string) => void memoria.delete(k),
    });
  });

  it("all'inizio chiede la password", () => {
    expect(rispondiAccesso("GET", "/accesso", undefined)?.corpo).toEqual({ protetta: true, autenticato: false });
    expect(demoAperta()).toBe(false);
  });

  it("con quella sbagliata resta chiusa, con 123 si entra, e si esce", () => {
    expect(rispondiAccesso("POST", "/accesso", { password: "sbagliata" })?.stato).toBe(401);
    expect(demoAperta()).toBe(false);
    expect(PASSWORD_DEMO).toBe("123");
    expect(rispondiAccesso("POST", "/accesso", { password: "123" })?.stato).toBe(200);
    expect(demoAperta()).toBe(true);
    expect(rispondiAccesso("GET", "/accesso", undefined)?.corpo).toEqual({ protetta: true, autenticato: true });
    expect(rispondiAccesso("DELETE", "/accesso", undefined)?.stato).toBe(204);
    expect(demoAperta()).toBe(false);
  });

  it("la password della demo non si cambia; le altre API non sono sue", () => {
    expect(rispondiAccesso("PUT", "/accesso/password", { attuale: "123", nuova: "abcd" })?.stato).toBe(403);
    expect(rispondiAccesso("GET", "/sedi", undefined)).toBeNull();
  });
});
