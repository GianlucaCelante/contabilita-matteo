import { beforeEach, describe, expect, it } from "vitest";
import type { ElencoMovimenti, Movimento, Riepilogo, Sede } from "../api/tipi";
import { rispondi } from "./backend";
import { ricomincia } from "./stato";

// Il servizio finto della demo deve rispettare il contratto delle sedi di docs/api.md.
const get = (percorso: string, q = "") => rispondi("GET", percorso, new URLSearchParams(q), undefined);
const corpoInput = { data: "2026-01-10", tipo: "COSTO_VARIABILE", documento: "SCONTRINO", importoCent: 1000, descrizione: "Prova" };

beforeEach(() => ricomincia());

describe("demo: sedi", () => {
  it("parte con tre sedi attive, con il numero di movimenti", () => {
    const sedi = get("/sedi").corpo as Sede[];
    expect(sedi.map((s) => s.nome)).toEqual(["Via Roma", "Lungomare", "Mercato"]);
    expect(sedi.every((s) => !s.archiviata && s.movimenti > 100)).toBe(true);
  });

  it("aggiunge una sede (201), e con lo stesso nome restituisce quella che c'è (200)", () => {
    const nuova = rispondi("POST", "/sedi", new URLSearchParams(), { nome: "Porto" });
    expect(nuova.stato).toBe(201);
    expect((nuova.corpo as Sede).ordine).toBe(4);
    expect(rispondi("POST", "/sedi", new URLSearchParams(), { nome: "porto" }).stato).toBe(200);
    expect(rispondi("POST", "/sedi", new URLSearchParams(), { nome: "  " })).toMatchObject({ stato: 400, corpo: { errore: "Il nome della sede è obbligatorio." } });
  });

  it("l'ultima sede attiva non si archivia, le altre sì, e si riattivano", () => {
    const put = (id: number, c: object) => rispondi("PUT", `/sedi/${id}`, new URLSearchParams(), c);
    expect(put(2, { archiviata: true }).stato).toBe(200);
    expect(put(3, { archiviata: true }).stato).toBe(200);
    expect(put(1, { archiviata: true })).toMatchObject({ stato: 409, corpo: { errore: "Non si può archiviare l'ultima sede attiva." } });
    expect(put(2, { archiviata: false }).stato).toBe(200);
    expect(put(2, { nome: "Via Roma" })).toMatchObject({ stato: 409 });
    expect(rispondi("DELETE", "/sedi/1", new URLSearchParams(), undefined).stato).toBe(405);
  });
});

describe("demo: movimenti, riepilogo ed esportazione per sede", () => {
  it("i movimenti portano la sede e il filtro la rispetta", () => {
    const tutti = get("/movimenti", "da=2026-01-01&a=2026-12-31").corpo as { elementi: Movimento[] };
    expect(tutti.elementi.every((m) => m.sede.id >= 1)).toBe(true);
    const mercato = get("/movimenti", "sedi=3").corpo as { elementi: Movimento[] };
    expect(mercato.elementi.length).toBeGreaterThan(0);
    expect(mercato.elementi.every((m) => m.sede.nome === "Mercato")).toBe(true);
    expect(get("/movimenti", "sedi=abc")).toMatchObject({ stato: 400, corpo: { errore: "sedi: valore non valido: abc" } });
  });

  it("il filtro per categorie: id separati da virgola, in AND con gli altri filtri, totali coerenti", () => {
    const periodo = "da=2020-01-01&a=2099-12-31";
    const tutti = (get("/movimenti", periodo).corpo as { elementi: Movimento[] }).elementi;
    const conCategoria = [...new Map(tutti.filter((m) => m.categoria).map((m) => [m.categoria!.id, m.categoria!])).values()];
    expect(conCategoria.length).toBeGreaterThan(2);
    const x = conCategoria[0]!;
    const y = conCategoria[1]!;
    const uno = get("/movimenti", `${periodo}&categorie=${x.id}`).corpo as ElencoMovimenti;
    expect(uno.elementi.length).toBeGreaterThan(0);
    expect(uno.elementi.every((m) => m.categoria?.id === x.id)).toBe(true);
    const due = get("/movimenti", `${periodo}&categorie=${x.id},${y.id}`).corpo as ElencoMovimenti;
    expect(due.elementi.every((m) => m.categoria?.id === x.id || m.categoria?.id === y.id)).toBe(true);
    expect(due.elementi.length).toBe(tutti.filter((m) => m.categoria?.id === x.id || m.categoria?.id === y.id).length);
    expect(due.elementi.length).toBeGreaterThan(uno.elementi.length);
    // I totali seguono l'elenco filtrato.
    expect(due.totali.ricaviCent + due.totali.costiCent).toBeGreaterThan(0);
    expect(due.totali.saldoCent).toBe(due.totali.ricaviCent - due.totali.costiCent);
    expect(due.totali).not.toEqual((get("/movimenti", periodo).corpo as ElencoMovimenti).totali);
    // Senza categoria (retribuzioni) fuori; AND con tipo, sede e ricerca.
    expect(due.elementi.some((m) => !m.categoria)).toBe(false);
    const altroTipo = conCategoria.find((c) => tutti.find((m) => m.categoria?.id === c.id)!.tipo !== tutti.find((m) => m.categoria?.id === x.id)!.tipo)!;
    const tipoX = tutti.find((m) => m.categoria?.id === x.id)!.tipo;
    const incrocio = get("/movimenti", `${periodo}&categorie=${altroTipo.id}&tipo=${tipoX}`).corpo as ElencoMovimenti;
    expect(incrocio.elementi).toEqual([]);
    expect(incrocio.totali).toEqual({ ricaviCent: 0, costiCent: 0, saldoCent: 0 });
    const sede = uno.elementi[0]!.sede.id;
    const inSede = get("/movimenti", `${periodo}&categorie=${x.id}&sedi=${sede}`).corpo as ElencoMovimenti;
    expect(inSede.elementi.length).toBe(uno.elementi.filter((m) => m.sede.id === sede).length);
    // Valori non validi o assenti: nessun filtro.
    expect((get("/movimenti", `${periodo}&categorie=abc,0`).corpo as ElencoMovimenti).elementi.length).toBe(tutti.length);
    expect((get("/movimenti", `${periodo}&categorie=999999`).corpo as ElencoMovimenti).elementi).toEqual([]);
  });

  it("perSede ha una riga per sede scelta e la somma è uguale ai totali", () => {
    const periodo = "da=2020-01-01&a=2099-12-31";
    const r = get("/riepilogo", periodo).corpo as Riepilogo;
    expect(r.perSede?.map((x) => x.sede.nome)).toEqual(["Via Roma", "Lungomare", "Mercato"]);
    expect(r.perSede!.reduce((s, x) => s + x.ricaviCent, 0)).toBe(r.ricavi.totaleCent);
    expect(r.perSede!.reduce((s, x) => s + x.costiCent, 0)).toBe(r.costiCent);
    expect(r.perSede!.reduce((s, x) => s + x.risultatoCent, 0)).toBe(r.risultatoCent);
    const due = get("/riepilogo", `${periodo}&sedi=1,3`).corpo as Riepilogo;
    expect(due.perSede?.map((x) => x.sede.id)).toEqual([1, 3]);
    expect(due.ricavi.totaleCent).toBe(r.perSede![0]!.ricaviCent + r.perSede![2]!.ricaviCent);
  });

  it("con più sedi la sede va indicata (400), con una sede sola no", () => {
    expect(rispondi("POST", "/movimenti", new URLSearchParams(), corpoInput)).toMatchObject({ stato: 400, corpo: { errore: "Scegli la sede: ce n'è più di una." } });
    expect(rispondi("POST", "/movimenti", new URLSearchParams(), { ...corpoInput, sedeId: 99 })).toMatchObject({ stato: 400, corpo: { errore: "Sede non trovata." } });
    const ok = rispondi("POST", "/movimenti", new URLSearchParams(), { ...corpoInput, sedeId: 2 });
    expect(ok.stato).toBe(201);
    expect((ok.corpo as Movimento).sede).toEqual({ id: 2, nome: "Lungomare" });
    rispondi("PUT", "/sedi/2", new URLSearchParams(), { archiviata: true });
    rispondi("PUT", "/sedi/3", new URLSearchParams(), { archiviata: true });
    const unica = rispondi("POST", "/movimenti", new URLSearchParams(), corpoInput);
    expect(unica.stato).toBe(201);
    expect((unica.corpo as Movimento).sede.id).toBe(1);
    expect(rispondi("POST", "/movimenti", new URLSearchParams(), { ...corpoInput, sedeId: 2 })).toMatchObject({ stato: 400, corpo: { errore: "La sede «Lungomare» è archiviata." } });
  });

  it("dividi crea un movimento per sede con il resto ai primi (1000 -> 334 + 333 + 333)", () => {
    const r = rispondi("POST", "/movimenti/dividi", new URLSearchParams(), corpoInput);
    expect(r.stato).toBe(201);
    const creati = r.corpo as Movimento[];
    expect(creati.map((m) => m.importoCent)).toEqual([334, 333, 333]);
    expect(creati.map((m) => m.sede.nome)).toEqual(["Via Roma", "Lungomare", "Mercato"]);
    expect(creati.every((m) => m.descrizione === "Prova" && m.data === "2026-01-10")).toBe(true);
  });

  it("dividi con sedi=1,3 divide solo fra quelle (1000 -> 500 + 500) e rifiuta meno di due sedi o sedi archiviate", () => {
    const r = rispondi("POST", "/movimenti/dividi", new URLSearchParams("sedi=3,1"), corpoInput);
    expect(r.stato).toBe(201);
    const creati = r.corpo as Movimento[];
    expect(creati.map((m) => m.importoCent)).toEqual([500, 500]);
    expect(creati.map((m) => m.sede.nome)).toEqual(["Via Roma", "Mercato"]);
    const prima = (get("/movimenti").corpo as { elementi: Movimento[] }).elementi.length;
    expect(rispondi("POST", "/movimenti/dividi", new URLSearchParams("sedi=1"), corpoInput)).toMatchObject({ stato: 400, corpo: { errore: "Per dividere scegli almeno due sedi." } });
    expect(rispondi("POST", "/movimenti/dividi", new URLSearchParams("sedi=1,99"), corpoInput)).toMatchObject({ stato: 400, corpo: { errore: "Sede non trovata." } });
    rispondi("PUT", "/sedi/2", new URLSearchParams(), { archiviata: true });
    expect(rispondi("POST", "/movimenti/dividi", new URLSearchParams("sedi=1,2"), corpoInput)).toMatchObject({ stato: 400, corpo: { errore: "La sede «Lungomare» è archiviata." } });
    expect((get("/movimenti").corpo as { elementi: Movimento[] }).elementi.length).toBe(prima);
  });

  it("dividi rifiuta la sede e non crea niente", () => {
    const prima = (get("/movimenti").corpo as { elementi: Movimento[] }).elementi.length;
    expect(rispondi("POST", "/movimenti/dividi", new URLSearchParams(), { ...corpoInput, sedeId: 1 })).toMatchObject({ stato: 400, corpo: { errore: "Per dividere fra più sedi non indicare la sede." } });
    expect((get("/movimenti").corpo as { elementi: Movimento[] }).elementi.length).toBe(prima);
  });

  it("l'importazione vuole la sede e l'esportazione la rispetta", () => {
    rispondi("POST", "/importa/anteprima", new URLSearchParams(), ["fatture.zip"]);
    const senza = rispondi("POST", "/importa/conferma", new URLSearchParams(), { importazioneId: "x", righe: [{ indice: 0, categoria: null }] });
    expect(senza).toMatchObject({ stato: 400, corpo: { errore: "Scegli la sede: ce n'è più di una." } });
    const con = rispondi("POST", "/importa/conferma", new URLSearchParams(), { importazioneId: "x", righe: [{ indice: 0, categoria: null }], sedeId: 3 });
    expect((con.corpo as { importati: number }).importati).toBe(1);
    const csv = get("/esporta", "formato=csv&da=2020-01-01&a=2099-12-31&includi=RICAVO,COSTO_VARIABILE,COSTO_FISSO&sedi=3").testo?.contenuto as string;
    const righe = csv.split("\r\n");
    expect(righe[0]!.endsWith(";Sede")).toBe(true);
    expect(righe.slice(1).every((r) => r.endsWith(";Mercato"))).toBe(true);
    expect(righe.length).toBeGreaterThan(50);
  });
});

describe("demo: opzioni dell'esportazione Excel", () => {
  const xlsx = (q: string) => new TextDecoder("latin1").decode(get("/esporta", `formato=xlsx&includi=RICAVO,COSTO_VARIABILE,COSTO_FISSO&da=2026-10-01&a=2026-10-31&${q}`).testo!.contenuto as Uint8Array);

  it("colonnePerSede=true scrive una colonna per sede e «Totale» nel Riepilogo", () => {
    const con = xlsx("colonnePerSede=true");
    for (const nome of ["Via Roma", "Lungomare", "Mercato", "Totale"]) expect(con).toContain(`<t>${nome}</t>`);
    expect(xlsx("colonnePerSede=false")).not.toContain("<t>Totale</t>");
    expect(xlsx("")).not.toContain("<t>Totale</t>");
  });

  it("con una sede sola la colonna è una più «Totale»", () => {
    const uno = xlsx("colonnePerSede=true&sedi=3");
    expect(uno).toContain("<t>Totale</t>");
    expect(uno).not.toContain("<t>Lungomare</t>");
  });

  it("statistiche=false toglie il foglio Statistiche, il predefinito lo tiene", () => {
    expect(xlsx("")).toContain("Statistiche");
    expect(xlsx("statistiche=true")).toContain("Statistiche");
    expect(xlsx("statistiche=false")).not.toContain("Statistiche");
  });
});
