import { beforeEach, describe, expect, it } from "vitest";
import type { ElencoMovimenti, Movimento, MovimentoInput, StatisticheVoci } from "../api/tipi";
import { raggruppaPerFornitore } from "../util/fattureRicevute";
import { rispondi } from "./backend";
import { aggiungiGiorni, oggiIso } from "./date";
import { migraStato, ricomincia, stato } from "./stato";

// L'id comune dei movimenti divisi fra sedi (docs/api.md, «Movimenti», `divisione`) nel servizio finto: gli stessi casi dei test del
// servizio (DivisioneApiTest).
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const invia = (metodo: string, percorso: string, corpo?: unknown, q = "") => rispondi(metodo, percorso, new URLSearchParams(q), corpo);
const dividi = (corpo: object, q = "") => invia("POST", "/movimenti/dividi", corpo, q).corpo as Movimento[];
// Periodo lontano dai dati di prova: ci sono solo i movimenti di questi test.
const P = "da=2019-03-01&a=2019-04-30";
const elenco = (q = P) => (get("/movimenti", q).corpo as ElencoMovimenti).elementi;
const fattura = (extra: Partial<MovimentoInput> = {}): MovimentoInput => ({ data: "2019-03-10", tipo: "COSTO_VARIABILE", documento: "FATTURA", importoCent: 1000, fornitore: "Forno Prova", ...extra });

beforeEach(() => ricomincia());

describe("demo: id comune dei movimenti divisi", () => {
  it("dividi assegna lo stesso id a tutte le parti; un'altra divisione ne ha un altro; un movimento normale non lo ha", () => {
    const parti = dividi(fattura());
    expect(parti).toHaveLength(3);
    const id = parti[0]!.divisione;
    expect(typeof id).toBe("string");
    expect(id).not.toBe("");
    expect(parti.every((p) => p.divisione === id)).toBe(true);
    const altre = dividi(fattura());
    expect(altre[0]!.divisione).not.toBe(id);
    expect(altre.every((p) => p.divisione === altre[0]!.divisione)).toBe(true);
    const normale = invia("POST", "/movimenti", fattura({ sedeId: 1 })).corpo as Movimento;
    expect(normale.divisione).toBeNull();
    expect(elenco().filter((m) => m.divisione === id)).toHaveLength(3);
    expect((get(`/movimenti/${parti[1]!.id}`).corpo as Movimento).divisione).toBe(id);
  });

  it("con una parte sola non c'è divisione", () => {
    const unCent = dividi(fattura({ importoCent: 1 }));
    expect(unCent).toHaveLength(1);
    expect(unCent[0]!.divisione).toBeNull();
    invia("PUT", "/sedi/2", { archiviata: true });
    invia("PUT", "/sedi/3", { archiviata: true });
    const sola = dividi(fattura());
    expect(sola).toHaveLength(1);
    expect(sola[0]!.divisione).toBeNull();
  });

  it("i dati di prova e le fatture importate non hanno divisione (il campo c'è, null)", () => {
    const tutti = elenco("da=2000-01-01&a=2100-01-01");
    expect(tutti.length).toBeGreaterThan(100);
    expect(tutti.every((m) => m.divisione === null)).toBe(true);
  });

  it("modificare o eliminare una parte non cambia l'id", () => {
    const parti = dividi(fattura({ importoCent: 900 }));
    const id = parti[0]!.divisione;
    const modificata = invia("PUT", `/movimenti/${parti[0]!.id}`, { ...fattura({ importoCent: 450, data: "2019-03-12", sedeId: 2 }), divisione: "altro" });
    expect(modificata.stato).toBe(200);
    expect(modificata.corpo).toMatchObject({ divisione: id, importoCent: 450, sede: { id: 2 } });
    expect((invia("PUT", `/movimenti/${parti[1]!.id}/pagata`, { pagata: true }).corpo as Movimento).divisione).toBe(id);
    expect(invia("DELETE", `/movimenti/${parti[2]!.id}`).stato).toBe(204);
    expect(elenco().filter((m) => m.divisione === id).map((m) => m.id).sort()).toEqual([parti[0]!.id, parti[1]!.id]);
  });

  it("ripetizione divisa: le parti di ogni scadenza hanno il loro id comune, uno per scadenza", () => {
    const inizio = aggiungiGiorni(oggiIso(), -75).slice(0, 8) + "05";
    const creati = dividi({ data: inizio, tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent: 100001, categoria: "Affitto", ricorrenza: { giorno: 5 } }, "sedi=1,2");
    expect(creati).toHaveLength(2);
    expect(creati[0]!.divisione).toBeTruthy();
    expect(creati[1]!.divisione).toBe(creati[0]!.divisione);
    expect(creati[0]!.ricorrenza!.id).not.toBe(creati[1]!.ricorrenza!.id);
    const tutti = elenco("da=2000-01-01&a=2100-01-01").filter((m) => m.ricorrenza && creati.some((c) => c.ricorrenza!.id === m.ricorrenza!.id));
    const perData = new Map<string, Movimento[]>();
    for (const m of tutti) perData.set(m.data, [...(perData.get(m.data) ?? []), m]);
    expect(perData.size).toBeGreaterThanOrEqual(3);
    const ids = new Set<string>();
    for (const parti of perData.values()) {
      expect(parti).toHaveLength(2);
      expect(parti[0]!.divisione).toBeTruthy();
      expect(parti[1]!.divisione).toBe(parti[0]!.divisione);
      expect(new Set(parti.map((p) => p.sede.id)).size).toBe(2);
      ids.add(parti[0]!.divisione!);
    }
    expect(ids.size).toBe(perData.size);
    expect(ids.has(creati[0]!.divisione!)).toBe(true);
  });

  it("una ripetizione non divisa non ha divisione", () => {
    const inizio = aggiungiGiorni(oggiIso(), -75).slice(0, 8) + "05";
    const primo = invia("POST", "/movimenti", { data: inizio, tipo: "COSTO_FISSO", documento: "NESSUNO", importoCent: 500, categoria: "Affitto", sedeId: 1, ricorrenza: { giorno: 5 } }).corpo as Movimento;
    const suoi = elenco("da=2000-01-01&a=2100-01-01").filter((m) => m.ricorrenza?.id === primo.ricorrenza!.id);
    expect(suoi.length).toBeGreaterThanOrEqual(3);
    expect(suoi.every((m) => m.divisione === null)).toBe(true);
  });

  it("le Ricevute uniscono le parti create da «dividi» anche senza numero di documento", () => {
    dividi(fattura());
    const [g] = raggruppaPerFornitore(elenco());
    expect(g!.fatture).toHaveLength(1);
    expect(g!.fatture[0]!.parti).toHaveLength(3);
    expect(g!.nDaPagare).toBe(1);
    expect(g!.totaleCent).toBe(1000);
  });

  it("migraStato: i movimenti e le ripetizioni salvati prima ricevono divisione null, e si può ripetere", () => {
    const vecchio = JSON.parse(JSON.stringify(stato())) as { movimenti: Partial<Movimento>[]; ricorrenze: { divisione?: unknown }[] };
    for (const m of vecchio.movimenti) delete m.divisione;
    for (const r of vecchio.ricorrenze) delete r.divisione;
    const migrato = migraStato(vecchio);
    expect(migrato.movimenti.length).toBeGreaterThan(100);
    expect(migrato.movimenti.every((m) => m.divisione === null)).toBe(true);
    expect(migrato.ricorrenze.length).toBeGreaterThan(0);
    expect(migrato.ricorrenze.every((r) => r.divisione === null)).toBe(true);
    expect(migraStato(JSON.parse(JSON.stringify(migrato)))).toEqual(migrato);
    // un id gia' presente non si tocca
    const parti = dividi(fattura());
    const ancora = migraStato(JSON.parse(JSON.stringify(stato())));
    expect(ancora.movimenti.filter((m) => m.divisione === parti[0]!.divisione)).toHaveLength(3);
  });
});

describe("demo: statistiche per voce, una divisione vale 1", () => {
  const voci = (extra: string) => get("/statistiche/voci", `${P}&${extra}`).corpo as StatisticheVoci;
  const voce = (r: StatisticheVoci, nome: string) => r.voci.find((v) => v.nome === nome)!;

  it("la fattura divisa conta una volta; gli importi restano la somma delle parti delle sedi scelte", () => {
    dividi(fattura()); // 334 + 333 + 333
    invia("POST", "/movimenti", fattura({ data: "2019-03-20", importoCent: 500, sedeId: 1 }));
    invia("POST", "/movimenti", fattura({ data: "2019-04-02", importoCent: 700, sedeId: 2 }));

    const tutte = voci("raggruppa=FORNITORE");
    expect(voce(tutte, "Forno Prova")).toMatchObject({ totaleCent: 2200, movimenti: 3, movimentiPerMese: [2, 1], perMese: [1500, 700] });
    expect(tutte.movimenti).toBe(3);

    const soloMercato = voci("raggruppa=FORNITORE&sedi=3");
    expect(voce(soloMercato, "Forno Prova")).toMatchObject({ totaleCent: 333, movimenti: 1 });
    expect(soloMercato.movimenti).toBe(1);

    const due = get("/statistiche/voci", "da=2019-03-01&a=2019-03-31&raggruppa=FORNITORE&sedi=1,2").corpo as StatisticheVoci;
    expect(voce(due, "Forno Prova")).toMatchObject({ totaleCent: 334 + 333 + 500, movimenti: 2 });

    const categorie = voci("raggruppa=CATEGORIA&tipo=COSTI");
    expect(categorie.voci[0]).toMatchObject({ id: null, movimenti: 3 });
  });

  it("le parti finite in voci diverse contano una volta per voce", () => {
    const parti = dividi(fattura(), "sedi=1,2");
    invia("PUT", `/movimenti/${parti[1]!.id}`, fattura({ importoCent: 500, fornitore: "Altro Forno" }));
    const r = voci("raggruppa=FORNITORE");
    expect(voce(r, "Forno Prova").movimenti).toBe(1);
    expect(voce(r, "Altro Forno").movimenti).toBe(1);
    expect(r.movimenti).toBe(2);
  });
});
