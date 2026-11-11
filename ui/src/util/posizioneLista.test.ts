import { describe, expect, it } from "vitest";
import { cambioDiVista, inMovimenti, ricordaLoScorrimento } from "./posizioneLista";

const MOVIMENTI = "/movimenti";
const VOCI = "/statistiche/voci";
const DETTAGLIO = "/statistiche/voci/dettaglio";
const FATTURE = "/statistiche/fatture";

// Come le usa il guscio: le posizioni ricordate dopo una serie di passaggi, partendo da quelle date.
function dopoIlGiro(ricordate: string[], giro: string[]): string[] {
  const restano = new Set(ricordate);
  for (let i = 1; i < giro.length; i++) {
    for (const lista of cambioDiVista(giro[i - 1] ?? "", giro[i] ?? "").dimentica) restano.delete(lista);
    // arrivati su una lista, scorrendo la si ricorda
    if (ricordaLoScorrimento(giro[i] ?? "")) restano.add(giro[i] ?? "");
  }
  return [...restano].sort();
}

describe("scorrimento ricordato delle liste", () => {
  it("le liste che lo ricordano", () => {
    for (const lista of [MOVIMENTI, VOCI, DETTAGLIO, FATTURE]) expect(ricordaLoScorrimento(lista)).toBe(true);
    for (const altra of ["/riepilogo", "/movimenti/12", "/statistiche", "/esporta"]) expect(ricordaLoScorrimento(altra)).toBe(false);
  });

  it("Movimenti: si ripristina tornando dal dettaglio, dal nuovo movimento e dall'importazione", () => {
    for (const figlia of ["/movimenti/12", "/movimenti/nuovo", "/movimenti/importa"]) {
      expect(cambioDiVista(figlia, MOVIMENTI).ripristina).toBe(true);
      expect(cambioDiVista(figlia, MOVIMENTI).dimentica).not.toContain(MOVIMENTI);
      // andando alla figlia la posizione resta
      expect(cambioDiVista(MOVIMENTI, figlia).dimentica).not.toContain(MOVIMENTI);
    }
  });

  it("statistiche: dettaglio voce e fatture ripartono da dove erano tornando da un movimento", () => {
    expect(cambioDiVista("/movimenti/7", DETTAGLIO).ripristina).toBe(true);
    expect(cambioDiVista("/movimenti/7", FATTURE).ripristina).toBe(true);
    expect(cambioDiVista("/movimenti/nuovo", DETTAGLIO).ripristina).toBe(true);
    expect(cambioDiVista("/movimenti/nuovo", VOCI).ripristina).toBe(true);
  });

  it("Per voce riparte da dove era tornando dal dettaglio della voce, che invece si dimentica", () => {
    const cambio = cambioDiVista(DETTAGLIO, VOCI);
    expect(cambio.ripristina).toBe(true);
    expect(cambio.dimentica).toContain(DETTAGLIO);
    expect(cambio.dimentica).not.toContain(VOCI);
  });

  it("entrando nel dettaglio della voce dalla lista si parte dall'alto, ma la lista resta ricordata", () => {
    const cambio = cambioDiVista(VOCI, DETTAGLIO);
    expect(cambio.ripristina).toBe(false);
    expect(cambio.dimentica).toContain(DETTAGLIO);
    expect(cambio.dimentica).not.toContain(VOCI);
  });

  it("il giro lista → dettaglio voce → movimento e ritorno non dimentica niente per strada", () => {
    expect(dopoIlGiro([], ["/statistiche", VOCI, DETTAGLIO, "/movimenti/7"])).toEqual([VOCI, DETTAGLIO].sort());
    expect(cambioDiVista("/movimenti/7", DETTAGLIO).ripristina).toBe(true);
    expect(dopoIlGiro([VOCI, DETTAGLIO], ["/movimenti/7", DETTAGLIO])).toEqual([VOCI, DETTAGLIO].sort());
  });

  it("in ogni altro caso si parte dall'alto e le liste lasciate si dimenticano", () => {
    expect(cambioDiVista("/riepilogo", MOVIMENTI).ripristina).toBe(false);
    expect(cambioDiVista("/riepilogo", MOVIMENTI).dimentica).toContain(MOVIMENTI);
    expect(cambioDiVista(MOVIMENTI, "/riepilogo")).toEqual({ ripristina: false, dimentica: [MOVIMENTI, VOCI, DETTAGLIO, FATTURE] });
    expect(cambioDiVista(VOCI, FATTURE)).toEqual({ ripristina: false, dimentica: [MOVIMENTI, VOCI, DETTAGLIO, FATTURE] });
    expect(cambioDiVista("/statistiche", VOCI).ripristina).toBe(false);
  });

  it("una posizione vecchia non torna fuori: Movimenti → movimento → statistiche → … → Movimenti riparte dall'alto", () => {
    expect(dopoIlGiro([MOVIMENTI], ["/movimenti/7", "/statistiche"])).toEqual([]);
    const giro = [MOVIMENTI, "/movimenti/7", "/statistiche", VOCI, DETTAGLIO, "/movimenti/9"];
    expect(dopoIlGiro([], giro)).not.toContain(MOVIMENTI);
  });

  it("la sezione dei Movimenti", () => {
    expect(inMovimenti("/movimenti")).toBe(true);
    expect(inMovimenti("/movimenti/nuovo")).toBe(true);
    expect(inMovimenti("/statistiche/voci")).toBe(false);
  });
});
