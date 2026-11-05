import { describe, expect, it } from "vitest";
import type { Movimento } from "../api/tipi";
import { elementiDellaVoce, filtroDellaVoce, indirizzoDettaglioVoce, indirizzoElencoVoci, leggiDettaglioVoce, sommaConSegno, type DettaglioVoce } from "./dettaglioVoce";

const base: DettaglioVoce = { raggruppa: "FORNITORE", id: 5, tipo: "COSTI", da: "2026-10-01", a: "2026-10-31" };
const mov = (m: Partial<Movimento>) => ({ id: 1, tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 1000, ...m }) as Movimento;
const query = (url: string) => new URLSearchParams(url.split("?")[1]);

describe("indirizzo del dettaglio di una voce", () => {
  it("scrive e rilegge tutti i parametri", () => {
    const d: DettaglioVoce = { ...base, sedi: "1,2" };
    const url = indirizzoDettaglioVoce(d);
    expect(url.startsWith("/statistiche/voci/dettaglio?")).toBe(true);
    expect(leggiDettaglioVoce(query(url))).toEqual(d);
  });

  it("la riga Senza ha id senza", () => {
    const url = indirizzoDettaglioVoce({ ...base, raggruppa: "CATEGORIA", id: null, tipo: "RICAVO" });
    expect(url).toContain("id=senza");
    expect(leggiDettaglioVoce(query(url))).toMatchObject({ raggruppa: "CATEGORIA", id: null, tipo: "RICAVO" });
  });

  it("parametri mancanti o non validi: nessun dettaglio", () => {
    expect(leggiDettaglioVoce(new URLSearchParams(""))).toBeNull();
    expect(leggiDettaglioVoce(new URLSearchParams("v=FORNITORE&id=x&da=2026-10-01&a=2026-10-31"))).toBeNull();
    expect(leggiDettaglioVoce(new URLSearchParams("v=NIENTE&id=3&da=2026-10-01&a=2026-10-31"))).toBeNull();
    expect(leggiDettaglioVoce(new URLSearchParams("v=FORNITORE&id=3&da=ieri&a=2026-10-31"))).toBeNull();
    expect(leggiDettaglioVoce(new URLSearchParams("v=FORNITORE&id=3&da=2026-11-01&a=2026-10-31"))).toBeNull();
  });

  it("il tipo non valido torna al predefinito (Costi)", () => {
    expect(leggiDettaglioVoce(new URLSearchParams("v=CATEGORIA&id=3&t=boh&da=2026-10-01&a=2026-10-31"))?.tipo).toBe("COSTI");
  });

  it("l'indirizzo della lista riporta raggruppamento, tipo e periodo", () => {
    const url = indirizzoElencoVoci({ ...base, raggruppa: "CATEGORIA", tipo: "RICAVO" });
    const p = query(url);
    expect(url.startsWith("/statistiche/voci?")).toBe(true);
    expect(p.get("v")).toBe("CATEGORIA");
    expect(p.get("t")).toBe("RICAVO");
    expect([p.get("p"), p.get("da"), p.get("a")]).toEqual(["periodo", "2026-10-01", "2026-10-31"]);
  });
});

describe("filtro dei movimenti che compongono una voce", () => {
  it("fornitore: id e solo costi variabili", () => {
    expect(filtroDellaVoce(base)).toEqual({ filtro: { da: base.da, a: base.a, fornitore: 5, tipo: "COSTO_VARIABILE" }, soloCosti: false });
  });
  it("dipendente: id e solo retribuzioni (nessun tipo), qualunque sia il tipo scelto", () => {
    expect(filtroDellaVoce({ ...base, raggruppa: "DIPENDENTE", id: 2, tipo: "RICAVO" })).toEqual({ filtro: { da: base.da, a: base.a, dipendente: 2, retribuzione: true }, soloCosti: false });
  });
  it("Senza dipendente: solo le retribuzioni senza dipendente", () => {
    expect(filtroDellaVoce({ ...base, raggruppa: "DIPENDENTE", id: null }).filtro).toEqual({ da: base.da, a: base.a, senza: "DIPENDENTE", retribuzione: true });
  });
  it("categoria con Costi: nessun tipo, si tolgono i ricavi dall'elenco", () => {
    expect(filtroDellaVoce({ ...base, raggruppa: "CATEGORIA", id: 7 })).toEqual({ filtro: { da: base.da, a: base.a, categorie: "7" }, soloCosti: true });
  });
  it("categoria con Ricavi o Tutti", () => {
    expect(filtroDellaVoce({ ...base, raggruppa: "CATEGORIA", id: 7, tipo: "RICAVO" }).filtro.tipo).toBe("RICAVO");
    expect(filtroDellaVoce({ ...base, raggruppa: "CATEGORIA", id: 7, tipo: "TUTTI" })).toEqual({ filtro: { da: base.da, a: base.a, categorie: "7" }, soloCosti: false });
  });
  it("Senza: filtro senza, nessun id", () => {
    expect(filtroDellaVoce({ ...base, id: null }).filtro).toMatchObject({ senza: "FORNITORE", tipo: "COSTO_VARIABILE" });
    expect(filtroDellaVoce({ ...base, id: null }).filtro).not.toHaveProperty("fornitore");
    expect(filtroDellaVoce({ ...base, raggruppa: "CATEGORIA", id: null }).filtro).toMatchObject({ senza: "CATEGORIA" });
  });
  it("le sedi si passano se ci sono", () => {
    expect(filtroDellaVoce({ ...base, sedi: "2,3" }).filtro.sedi).toBe("2,3");
    expect(filtroDellaVoce(base).filtro).not.toHaveProperty("sedi");
  });
});

describe("elenco e somma", () => {
  it("le note di credito contano in negativo", () => {
    expect(sommaConSegno([mov({ importoCent: 1000 }), mov({ importoCent: 300, documento: "NOTA_DI_CREDITO" })])).toBe(700);
  });
  it("soloCosti toglie i ricavi", () => {
    const e = [mov({ id: 1 }), mov({ id: 2, tipo: "RICAVO" }), mov({ id: 3, tipo: "COSTO_FISSO" })];
    expect(elementiDellaVoce(e, true).map((m) => m.id)).toEqual([1, 3]);
    expect(elementiDellaVoce(e, false)).toHaveLength(3);
  });
});
