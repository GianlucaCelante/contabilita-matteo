import { beforeEach, describe, expect, it } from "vitest";
import type { Categoria, Movimento } from "../api/tipi";
import { rispondi } from "./backend";
import { ricomincia } from "./stato";

// Retribuzione e categoria (docs/api.md): per un COSTO_FISSO il documento RETRIBUZIONE_* e una categoria con retribuzione=true vanno sempre insieme.
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const invia = (metodo: string, percorso: string, corpo?: unknown, q = "") => rispondi(metodo, percorso, new URLSearchParams(q), corpo);
const base = { data: "2019-03-05", sedeId: 1, tipo: "COSTO_FISSO", importoCent: 10000 };
const categorie = () => get("/categorie", "tipo=COSTO_FISSO").corpo as Categoria[];
const messaggio = (r: { corpo?: unknown }) => {
  const c = (r.corpo ?? {}) as { messaggio?: string; message?: string; errore?: string };
  return c.messaggio ?? c.message ?? c.errore;
};

beforeEach(() => ricomincia());

describe("demo: retribuzione e categoria", () => {
  it("retribuzione senza categoria: 400", () => {
    for (const documento of ["RETRIBUZIONE_REGOLARE", "RETRIBUZIONE_EXTRA"]) {
      const r = invia("POST", "/movimenti", { ...base, documento });
      expect(r.stato).toBe(400);
      expect(messaggio(r)).toBe("Una retribuzione ha bisogno di una categoria di tipo retribuzione.");
    }
  });

  it("retribuzione con una categoria senza flag (o nuova, creata al volo): 400, e la categoria al volo non nasce", () => {
    const esistente = invia("POST", "/movimenti", { ...base, documento: "RETRIBUZIONE_REGOLARE", categoria: "Affitto" });
    expect(esistente.stato).toBe(400);
    expect(messaggio(esistente)).toBe("La categoria «Affitto» non è una retribuzione.");
    const nuova = invia("POST", "/movimenti", { ...base, documento: "RETRIBUZIONE_EXTRA", categoria: "Mance" });
    expect(nuova.stato).toBe(400);
    expect(messaggio(nuova)).toBe("La categoria «Mance» non è una retribuzione.");
    expect(categorie().map((c) => c.nome)).not.toContain("Mance");
  });

  it("documento NESSUNO con una categoria retribuzione: 400", () => {
    const r = invia("POST", "/movimenti", { ...base, documento: "NESSUNO", categoria: "Retribuzione" });
    expect(r.stato).toBe(400);
    expect(messaggio(r)).toBe("La categoria «Retribuzione» è una retribuzione: scegli Regolare o Extra.");
  });

  it("casi felici: retribuzione con categoria con flag (anche con altre maiuscole); costo fisso ordinario senza flag", () => {
    expect(invia("POST", "/movimenti", { ...base, documento: "RETRIBUZIONE_REGOLARE", categoria: "retribuzione", dipendente: "Luca" }).stato).toBe(201);
    expect(invia("POST", "/movimenti", { ...base, documento: "RETRIBUZIONE_EXTRA", categoria: "Retribuzione" }).stato).toBe(201);
    expect(invia("POST", "/movimenti", { ...base, documento: "NESSUNO", categoria: "Affitto" }).stato).toBe(201);
    expect(invia("POST", "/movimenti", { ...base, documento: "NESSUNO" }).stato).toBe(201);
    expect(invia("POST", "/movimenti", { ...base, documento: "NESSUNO", categoria: "Nuova spesa" }).stato).toBe(201);
    expect(categorie().find((c) => c.nome === "Nuova spesa")?.retribuzione).toBe(false);
  });

  it("una categoria con flag creata con POST /categorie si puo' usare subito", () => {
    expect(invia("POST", "/categorie", { nome: "Stipendi", tipo: "COSTO_FISSO", retribuzione: true }).stato).toBe(201);
    expect(invia("POST", "/movimenti", { ...base, documento: "RETRIBUZIONE_REGOLARE", categoria: "Stipendi" }).stato).toBe(201);
  });

  it("la regola vale per ogni categoria con flag (il nome non conta)", () => {
    invia("POST", "/categorie", { nome: "Paghe", tipo: "COSTO_FISSO", retribuzione: true });
    const r = invia("POST", "/movimenti", { ...base, documento: "NESSUNO", categoria: "Paghe" });
    expect(r.stato).toBe(400);
    expect(messaggio(r)).toBe("La categoria «Paghe» è una retribuzione: scegli Regolare o Extra.");
  });

  it("modifica (PUT): stessi controlli, anche con ambito QUESTO_E_PROSSIMI; un rifiuto non cambia nulla", () => {
    const m = invia("POST", "/movimenti", { ...base, documento: "NESSUNO", categoria: "Affitto", ricorrenza: { unita: "MESI", intervallo: 1, giorno: 5 } }).corpo as Movimento;
    for (const ambito of ["SOLO_QUESTO", "QUESTO_E_PROSSIMI"]) {
      const senza = invia("PUT", `/movimenti/${m.id}`, { ...base, documento: "RETRIBUZIONE_REGOLARE" }, `ambito=${ambito}`);
      expect(senza.stato).toBe(400);
      expect(messaggio(senza)).toBe("Una retribuzione ha bisogno di una categoria di tipo retribuzione.");
      const noFlag = invia("PUT", `/movimenti/${m.id}`, { ...base, documento: "RETRIBUZIONE_REGOLARE", categoria: "Luce" }, `ambito=${ambito}`);
      expect(noFlag.stato).toBe(400);
      expect(messaggio(noFlag)).toBe("La categoria «Luce» non è una retribuzione.");
      const conFlag = invia("PUT", `/movimenti/${m.id}`, { ...base, documento: "NESSUNO", categoria: "Retribuzione" }, `ambito=${ambito}`);
      expect(conFlag.stato).toBe(400);
      expect(messaggio(conFlag)).toBe("La categoria «Retribuzione» è una retribuzione: scegli Regolare o Extra.");
    }
    expect((get(`/movimenti/${m.id}`).corpo as Movimento).categoria?.nome).toBe("Affitto");
    expect(invia("PUT", `/movimenti/${m.id}`, { ...base, documento: "RETRIBUZIONE_REGOLARE", categoria: "Retribuzione" }, "ambito=QUESTO_E_PROSSIMI").stato).toBe(200);
  });

  it("ripetizione e divisione fra sedi: stessi controlli, tutto o niente", () => {
    const rip = invia("POST", "/movimenti", { ...base, documento: "RETRIBUZIONE_REGOLARE", categoria: "Affitto", ricorrenza: { unita: "MESI", intervallo: 1, giorno: 5 } });
    expect(rip.stato).toBe(400);
    const conta = () => (get("/movimenti", "da=2019-01-01&a=2019-12-31").corpo as { elementi: unknown[] }).elementi.length;
    const prima = conta();
    const dividi = invia("POST", "/movimenti/dividi", { ...base, sedeId: undefined, documento: "RETRIBUZIONE_REGOLARE", categoria: "Luce" });
    expect(dividi.stato).toBe(400);
    expect(conta()).toBe(prima);
  });

  it("i movimenti di partenza rispettano la regola", () => {
    const flag = new Set(categorie().filter((c) => c.retribuzione).map((c) => c.nome));
    const tutti = (get("/movimenti", "da=2000-01-01&a=2100-01-01").corpo as { elementi: Movimento[] }).elementi;
    for (const m of tutti.filter((x) => x.tipo === "COSTO_FISSO")) {
      const retribuzione = m.documento.startsWith("RETRIBUZIONE_");
      expect(flag.has(m.categoria?.nome ?? "")).toBe(retribuzione);
    }
  });
});
