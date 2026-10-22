import { describe, expect, it } from "vitest";
import { riconosciTipo } from "./immagini";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const blob = (byte: number[]) => new Blob([new Uint8Array(byte)]);

describe("riconosciTipo", () => {
  it("riconosce un PNG vero", async () => {
    expect(await riconosciTipo(blob([...PNG, 0, 0, 0, 13]))).toBe("image/png");
  });
  it("riconosce un JPEG vero", async () => {
    expect(await riconosciTipo(blob([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toBe("image/jpeg");
  });
  it("riconosce un PDF vero", async () => {
    expect(await riconosciTipo(new Blob(["%PDF-1.7\n1 0 obj"]))).toBe("application/pdf");
  });
  it("rifiuta un testo con nome .png", async () => {
    const falso = new File(["questo non e un png"], "falso.png", { type: "image/png" });
    expect(await riconosciTipo(falso)).toBeNull();
  });
  it("rifiuta un file vuoto", async () => {
    expect(await riconosciTipo(new Blob([]))).toBeNull();
  });
  it("rifiuta un file di 3 byte", async () => {
    expect(await riconosciTipo(blob([0x89, 0x50, 0x4e]))).toBeNull();
  });
  it("rifiuta un PNG troncato dopo 4 byte", async () => {
    expect(await riconosciTipo(blob(PNG.slice(0, 4)))).toBeNull();
  });
});
