import { beforeEach, describe, expect, it } from "vitest";
import type { ElencoMovimenti, StatisticheVoci } from "../api/tipi";
import { elementiDellaVoce, filtroDellaVoce, sommaConSegno } from "../util/dettaglioVoce";
import { rispondi } from "./backend";
import { ricomincia } from "./stato";

// Il servizio finto rispetta i «Filtri per voce» di docs/api.md («Movimenti») e la lista che compone una riga delle
// statistiche per voce ha la stessa somma della riga.
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const P = "da=2000-01-01&a=2099-12-31";

beforeEach(() => ricomincia());

describe("demo: filtri per voce dei movimenti", () => {
  it("fornitore: tiene solo i movimenti di quel fornitore", () => {
    const tutti = (get("/movimenti", P).corpo as ElencoMovimenti).elementi;
    const f = tutti.find((m) => m.fornitore)!.fornitore!;
    const r = get("/movimenti", `${P}&fornitore=${f.id}`).corpo as ElencoMovimenti;
    expect(r.elementi.length).toBeGreaterThan(0);
    expect(r.elementi.every((m) => m.fornitore?.id === f.id)).toBe(true);
    expect(r.elementi.length).toBe(tutti.filter((m) => m.fornitore?.id === f.id).length);
  });

  it("tipo=COSTI: costi variabili e fissi senza ricavi, anche nei totali; un tipo non valido è 400", () => {
    const tutti = (get("/movimenti", P).corpo as ElencoMovimenti).elementi;
    const r = get("/movimenti", `${P}&tipo=COSTI`).corpo as ElencoMovimenti;
    const costi = tutti.filter((m) => m.tipo !== "RICAVO");
    expect(tutti.some((m) => m.tipo === "RICAVO")).toBe(true);
    expect(r.elementi.map((m) => m.id)).toEqual(costi.map((m) => m.id));
    expect(r.totali.ricaviCent).toBe(0);
    expect(r.totali.saldoCent).toBe(-r.totali.costiCent);
    expect(get("/movimenti", `${P}&tipo=BOH`)).toMatchObject({ stato: 400, corpo: { errore: "tipo: valore non valido: BOH" } });
    expect(get("/movimenti", `${P}&tipo=costi`).stato).toBe(400);
    // come il servizio: spazi intorno ignorati, solo spazi = tutti
    expect((get("/movimenti", `${P}&tipo=COSTI%20`).corpo as ElencoMovimenti).elementi.map((m) => m.id)).toEqual(costi.map((m) => m.id));
    expect((get("/movimenti", `${P}&tipo=%20`).corpo as ElencoMovimenti).elementi).toHaveLength(tutti.length);
  });

  it("fornitore inesistente: elenco vuoto; non numerico: 400", () => {
    expect((get("/movimenti", `${P}&fornitore=99999`).corpo as ElencoMovimenti).elementi).toEqual([]);
    expect(get("/movimenti", `${P}&fornitore=abc`).stato).toBe(400);
  });

  it("senza: tiene solo i movimenti senza quella voce", () => {
    for (const s of ["FORNITORE", "DIPENDENTE", "CATEGORIA"] as const) {
      const r = (get("/movimenti", `${P}&senza=${s}`).corpo as ElencoMovimenti).elementi;
      const campo = s === "FORNITORE" ? "fornitore" : s === "DIPENDENTE" ? "dipendente" : "categoria";
      expect(r.length).toBeGreaterThan(0);
      expect(r.every((m) => m[campo] === null)).toBe(true);
    }
  });

  it("retribuzione=true: solo le retribuzioni; non valido: 400", () => {
    const r = (get("/movimenti", `${P}&retribuzione=true`).corpo as ElencoMovimenti).elementi;
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => m.documento === "RETRIBUZIONE_REGOLARE" || m.documento === "RETRIBUZIONE_EXTRA")).toBe(true);
    expect(get("/movimenti", `${P}&retribuzione=boh`).stato).toBe(400);
    const tutti = (get("/movimenti", P).corpo as ElencoMovimenti).elementi;
    expect((get("/movimenti", `${P}&retribuzione=false`).corpo as ElencoMovimenti).elementi.length).toBe(tutti.length);
  });

  it("senza non valido: 400; categorie con senza=CATEGORIA: 400", () => {
    expect(get("/movimenti", `${P}&senza=BOH`).stato).toBe(400);
    expect(get("/movimenti", `${P}&senza=CATEGORIA&categorie=1`).stato).toBe(400);
    expect(get("/movimenti", `${P}&senza=FORNITORE&categorie=1`).stato).toBe(200);
  });
});

describe("demo: la lista di una voce compone il totale della riga", () => {
  const casi = [
    { raggruppa: "FORNITORE", tipo: "COSTI" },
    { raggruppa: "DIPENDENTE", tipo: "COSTI" },
    { raggruppa: "CATEGORIA", tipo: "COSTI" },
    { raggruppa: "CATEGORIA", tipo: "RICAVO" },
    { raggruppa: "CATEGORIA", tipo: "TUTTI" },
  ] as const;

  for (const c of casi) {
    it(`${c.raggruppa} / ${c.tipo}: somma dell'elenco = totale di ogni riga (anche Senza)`, () => {
      const da = "2020-01-01";
      const a = "2099-12-31";
      const tipoServizio = c.raggruppa === "FORNITORE" ? "COSTO_VARIABILE" : c.raggruppa === "DIPENDENTE" ? "" : c.tipo === "TUTTI" ? "" : c.tipo;
      const stat = get("/statistiche/voci", `da=${da}&a=${a}&raggruppa=${c.raggruppa}${tipoServizio ? `&tipo=${tipoServizio}` : ""}`).corpo as StatisticheVoci;
      expect(stat.voci.length).toBeGreaterThan(0);
      for (const v of stat.voci) {
        const { filtro, soloCosti } = filtroDellaVoce({ raggruppa: c.raggruppa, id: v.id, tipo: c.tipo, da, a });
        const q = new URLSearchParams(Object.entries(filtro).map(([k, x]) => [k, String(x)]));
        const r = get("/movimenti", q.toString());
        expect(r.stato).toBe(200);
        const elementi = elementiDellaVoce((r.corpo as ElencoMovimenti).elementi, soloCosti);
        expect(sommaConSegno(elementi), v.nome).toBe(v.totaleCent);
        expect(elementi.length, v.nome).toBe(v.movimenti);
      }
    });
  }
});
