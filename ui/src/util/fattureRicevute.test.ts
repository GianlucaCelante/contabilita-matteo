import { describe, expect, it } from "vitest";
import type { Movimento } from "../api/tipi";
import { aiutoPagata, filtraDaPagare, mostraPagato, pagatoDaPagare, pagatoDaPagareDeiMovimenti, raggruppaPerFornitore, riepilogoRicevute, testoNumeroFatture } from "./fattureRicevute";

let n = 0;
function m(fornitore: string | null, importoCent: number, extra: Partial<Movimento> = {}): Movimento {
  n++;
  return {
    id: n,
    data: `2026-10-${String(10 + (n % 15)).padStart(2, "0")}`,
    tipo: "COSTO_VARIABILE",
    documento: "FATTURA",
    importoCent,
    categoria: null,
    fornitore: fornitore ? { id: fornitore.length, nome: fornitore } : null,
    dipendente: null,
    sede: { id: 1, nome: "Via Roma" },
    descrizione: null,
    numeroDocumento: `FT-${n}`,
    note: null,
    origine: "XML",
    pagata: false,
    ricorrenza: null,
    allegatoNome: null,
    creatoIl: "2026-10-01T09:00:00",
    modificatoIl: null,
    divisione: null,
    ...extra,
  };
}

const dati: Movimento[] = [
  m("Bel Fungo", 10000, { pagata: true }),
  m("Bel Fungo", 5000),
  m("Bel Fungo", 2000, { documento: "NOTA_DI_CREDITO" }),
  m("Euro Service", 30000),
  m("Euro Service", 1000, { documento: "SCONTRINO" }), // non e' una fattura ricevuta
  m(null, 700, { pagata: true }),
  m("Ricavo", 9999, { tipo: "RICAVO", documento: "RICAVO_FATTURATO" }),
];

describe("fatture ricevute: raggruppa per fornitore", () => {
  const gruppi = raggruppaPerFornitore(dati);
  it("tiene solo fatture e note di credito dei costi variabili; senza fornitore in fondo", () => {
    expect(gruppi.map((g) => g.nome)).toEqual(["Euro Service", "Bel Fungo", "Senza fornitore"]);
    expect(gruppi.flatMap((g) => g.voci).every((v) => v.documento === "FATTURA" || v.documento === "NOTA_DI_CREDITO")).toBe(true);
  });
  it("totale = fatture - note di credito; pagato + da pagare = totale", () => {
    const bel = gruppi.find((g) => g.nome === "Bel Fungo")!;
    expect(bel.totaleCent).toBe(13000);
    expect(bel.pagataCent).toBe(10000);
    expect(bel.daPagareCent).toBe(3000);
    for (const g of gruppi) expect(g.pagataCent + g.daPagareCent).toBe(g.totaleCent);
  });
  it("conta le fatture da pagare e quelle pagate (le note di credito non hanno stato)", () => {
    const bel = gruppi.find((g) => g.nome === "Bel Fungo")!;
    expect(bel.nDaPagare).toBe(1);
    expect(bel.nPagate).toBe(1);
    expect(bel.voci).toHaveLength(3);
  });
  it("l'elenco di un fornitore e' per data, dalla piu' vecchia", () => {
    for (const g of gruppi) expect(g.voci.map((v) => v.data)).toEqual([...g.voci.map((v) => v.data)].sort());
  });
});

describe("fatture ricevute: riepilogo e filtro", () => {
  it("il riepilogo somma i fornitori: da pagare + pagate = totale", () => {
    const gruppi = raggruppaPerFornitore(dati);
    const r = riepilogoRicevute(gruppi);
    expect(r).toEqual({ daPagareCent: 3000 + 30000, nDaPagare: 2, pagateCent: 10000 + 700, nPagate: 2, totaleCent: 13000 + 30000 + 700 });
    expect(r.daPagareCent + r.pagateCent).toBe(r.totaleCent);
  });
  it("il credito verso un fornitore (solo note di credito) non riduce quanto si deve agli altri", () => {
    const gruppi = raggruppaPerFornitore([m("Bel Fungo", 8906), m("Molino", 12078, { documento: "NOTA_DI_CREDITO" }), m("Euro Service", 25620, { pagata: true })]);
    const r = riepilogoRicevute(gruppi);
    expect(r.daPagareCent).toBe(8906);
    expect(r.nDaPagare).toBe(1);
    expect(r.pagateCent).toBe(25620);
    // Solo la nota di credito: niente da pagare (non un importo negativo).
    expect(riepilogoRicevute(raggruppaPerFornitore([m("Molino", 12078, { documento: "NOTA_DI_CREDITO" })])).daPagareCent).toBe(0);
  });
  it("«Solo da pagare» toglie i fornitori a posto e le fatture pagate; le note restano con chi ha ancora da pagare", () => {
    const f = filtraDaPagare(raggruppaPerFornitore(dati));
    expect(f.map((g) => g.nome)).toEqual(["Euro Service", "Bel Fungo"]);
    const bel = f.find((g) => g.nome === "Bel Fungo")!;
    expect(bel.voci.map((v) => v.documento).sort()).toEqual(["FATTURA", "NOTA_DI_CREDITO"]);
    expect(bel.voci.some((v) => v.pagata)).toBe(false);
    // i totali del fornitore restano quelli veri
    expect(bel.totaleCent).toBe(13000);
  });
  it("il testo per il numero di fatture", () => {
    expect(testoNumeroFatture(0)).toBe("nessuna fattura");
    expect(testoNumeroFatture(1)).toBe("1 fattura");
    expect(testoNumeroFatture(4)).toBe("4 fatture");
  });
});

describe("fatture ricevute: pagato e da pagare nelle statistiche per voce", () => {
  const voce = (fattureCent: number | null, pagataCent: number | null, fatturePerMese: number[] | null = null, pagataPerMese: number[] | null = null) => ({
    fattureCent,
    pagataCent,
    fatturePerMese,
    pagataPerMese,
  });
  it("da pagare = fatture - pagato (gli scontrini non contano: non sono in fattureCent)", () => {
    expect(pagatoDaPagare(voce(80000, 50000))).toEqual({ pagatoCent: 50000, daPagareCent: 30000 });
    expect(pagatoDaPagare(voce(1000, 1000))).toEqual({ pagatoCent: 1000, daPagareCent: 0 });
  });
  it("una nota di credito piu' grande delle fatture da pagare da' un credito (negativo)", () => {
    expect(pagatoDaPagare(voce(-500, 0))).toEqual({ pagatoCent: 0, daPagareCent: -500 });
  });
  it("niente per le voci che non sono fornitori o senza fatture (solo scontrini)", () => {
    expect(pagatoDaPagare(voce(null, null))).toBeNull();
    expect(pagatoDaPagare(voce(80000, null))).toBeNull();
    expect(pagatoDaPagare(voce(0, 0))).toBeNull();
  });
  it("con un mese scelto usa i valori di quel mese", () => {
    const v = voce(90000, 50000, [30000, 60000, 0], [30000, 20000, 0]);
    expect(pagatoDaPagare(v, 0)).toEqual({ pagatoCent: 30000, daPagareCent: 0 });
    expect(pagatoDaPagare(v, 1)).toEqual({ pagatoCent: 20000, daPagareCent: 40000 });
    // mese senza fatture, mese fuori dal periodo, voce senza i valori per mese
    expect(pagatoDaPagare(v, 2)).toBeNull();
    expect(pagatoDaPagare(v, 9)).toBeNull();
    expect(pagatoDaPagare(voce(90000, 50000), 0)).toBeNull();
  });
});

describe("fatture ricevute: pagato e da pagare da un elenco di movimenti", () => {
  it("fatture - note di credito - pagate; scontrini e ricavi non contano", () => {
    expect(pagatoDaPagareDeiMovimenti(dati.filter((x) => x.fornitore?.nome === "Bel Fungo"))).toEqual({ pagatoCent: 10000, daPagareCent: 3000 });
    expect(pagatoDaPagareDeiMovimenti(dati.filter((x) => x.fornitore?.nome === "Euro Service"))).toEqual({ pagatoCent: 0, daPagareCent: 30000 });
  });
  it("niente senza fatture", () => {
    expect(pagatoDaPagareDeiMovimenti([])).toBeNull();
    expect(pagatoDaPagareDeiMovimenti([m("Solo scontrini", 1000, { documento: "SCONTRINO" })])).toBeNull();
  });
});

describe("voceDaPagare", () => {
  it("positivo: Da pagare; negativo: credito verso il fornitore in positivo; zero: niente", async () => {
    const { voceDaPagare } = await import("./fattureRicevute");
    expect(voceDaPagare(3000)).toEqual({ etichetta: "Da pagare", importoCent: 3000, credito: false });
    expect(voceDaPagare(-1693)).toEqual({ etichetta: "Credito verso il fornitore", importoCent: 1693, credito: true });
    expect(voceDaPagare(0)).toBeNull();
  });
});

describe("«Pagato» solo se c'e' un pagamento", () => {
  it("con pagato a zero la voce non si mostra (resta «Da pagare»)", () => {
    expect(mostraPagato(0)).toBe(false);
    expect(mostraPagato(12000)).toBe(true);
  });
});


describe("aiutoPagata: la riga sotto l'interruttore della fattura", () => {
  it("in Nuovo movimento dice dove si segna pagata dopo", () => {
    expect(aiutoPagata(false, false)).toBe("Da pagare: la segni pagata quando paghi, da Statistiche › Fatture › Ricevute.");
    expect(aiutoPagata(false, true)).toBe("Segnata come pagata.");
  });
  it("nel dettaglio l'interruttore è lì: niente rimando a un'altra schermata", () => {
    expect(aiutoPagata(true, false)).toBe("Da pagare.");
    expect(aiutoPagata(true, true)).toBe("Segnata come pagata.");
  });
});

describe("fatture ricevute: una fattura divisa fra sedi è una fattura sola", () => {
  const roma = { id: 1, nome: "Via Roma" };
  const mare = { id: 2, nome: "Lungomare" };
  const parte = (sede: { id: number; nome: string }, extra: Partial<Movimento> = {}) => m("Manutentore", 15000, { numeroDocumento: "MAN-1", data: "2026-11-05", sede, origine: "MANO", ...extra });

  it("stesso fornitore, numero, data e documento in sedi diverse: una riga col totale, contata una volta", async () => {
    const { testoDivisa } = await import("./fattureRicevute");
    const [g] = raggruppaPerFornitore([parte(roma), parte(mare)]);
    expect(g!.fatture).toHaveLength(1);
    const f = g!.fatture[0]!;
    expect(f.parti.map((p) => p.sede.nome)).toEqual(["Via Roma", "Lungomare"]);
    expect(f.importoCent).toBe(30000);
    expect(f.pagata).toBe(false);
    expect(testoDivisa(f)).toBe("divisa fra Via Roma e Lungomare");
    expect([g!.nDaPagare, g!.nPagate, g!.totaleCent, g!.daPagareCent]).toEqual([1, 0, 30000, 30000]);
    expect(riepilogoRicevute([g!])).toMatchObject({ nDaPagare: 1, nPagate: 0, daPagareCent: 30000 });
  });

  it("tre sedi: «divisa fra A, B e C»; una fattura non divisa non ha testo", async () => {
    const { testoDivisa } = await import("./fattureRicevute");
    const [g] = raggruppaPerFornitore([parte(roma), parte(mare), parte({ id: 3, nome: "Mercato" })]);
    expect(testoDivisa(g!.fatture[0]!)).toBe("divisa fra Via Roma, Lungomare e Mercato");
    const [solo] = raggruppaPerFornitore([parte(roma)]);
    expect(testoDivisa(solo!.fatture[0]!)).toBeNull();
  });

  it("è pagata solo se lo sono tutte le parti; pagata in parte conta fra quelle da pagare", () => {
    const [tutta] = raggruppaPerFornitore([parte(roma, { pagata: true }), parte(mare, { pagata: true })]);
    expect([tutta!.fatture[0]!.pagata, tutta!.nPagate, tutta!.nDaPagare, tutta!.pagataCent]).toEqual([true, 1, 0, 30000]);
    const [meta] = raggruppaPerFornitore([parte(roma, { pagata: true }), parte(mare)]);
    expect([meta!.fatture[0]!.pagata, meta!.fatture[0]!.pagataInParte, meta!.nPagate, meta!.nDaPagare, meta!.pagataCent, meta!.daPagareCent]).toEqual([false, true, 0, 1, 15000, 15000]);
  });

  it("«Segna tutte pagate» e «Solo da pagare» riguardano tutte le parti ancora da pagare", async () => {
    const { fattureDaPagare } = await import("./fattureRicevute");
    const a = parte(roma, { pagata: true });
    const b = parte(mare);
    const [g] = raggruppaPerFornitore([a, b, m("Manutentore", 5000, { pagata: true })]);
    expect(fattureDaPagare(g!).map((x) => x.id)).toEqual([b.id]);
    const [solo] = filtraDaPagare([g!]);
    expect(solo!.fatture).toHaveLength(1);
    expect(solo!.fatture[0]!.parti).toHaveLength(2);
    expect(solo!.voci).toHaveLength(2);
  });

  it("non si uniscono: senza numero, date diverse, stessa sede due volte, senza fornitore, fattura e nota di credito", () => {
    const conta = (voci: Movimento[]) => raggruppaPerFornitore(voci).reduce((s, g) => s + g.fatture.length, 0);
    expect(conta([parte(roma, { numeroDocumento: null }), parte(mare, { numeroDocumento: null })])).toBe(2);
    expect(conta([parte(roma), parte(mare, { data: "2026-11-06" })])).toBe(2);
    expect(conta([parte(roma), parte(roma)])).toBe(2);
    expect(conta([parte(roma, { fornitore: null }), parte(mare, { fornitore: null })])).toBe(2);
    expect(conta([parte(roma), parte(mare, { documento: "NOTA_DI_CREDITO" })])).toBe(2);
  });

  it("una fattura sola per riga negli altri casi: l'elenco di prima non cambia", () => {
    const g = raggruppaPerFornitore(dati).find((x) => x.nome === "Bel Fungo")!;
    expect(g.fatture.map((f) => f.parti.length)).toEqual([1, 1, 1]);
    expect(g.fatture.map((f) => f.id)).toEqual(g.voci.map((v) => v.id));
  });
});

describe("conferma di «Segna tutte pagate»", () => {
  it("senza note di credito: quante fatture e quanto in tutto", async () => {
    const { testoConfermaTutte } = await import("./fattureRicevute");
    const [g] = raggruppaPerFornitore([m("Euro Service", 15000), m("Euro Service", 15000)]);
    expect(testoConfermaTutte(g!, "novembre 2026")).toBe("2 fatture da pagare, €\u00a0300,00 in tutto, a novembre 2026. Puoi ripensarci fattura per fattura.");
  });
  it("con una nota di credito: il totale delle fatture, la nota e quanto resta da dare", async () => {
    const { testoConfermaTutte } = await import("./fattureRicevute");
    const [g] = raggruppaPerFornitore([m("Euro Service", 15000), m("Euro Service", 15000), m("Euro Service", 12000, { documento: "NOTA_DI_CREDITO" })]);
    expect(testoConfermaTutte(g!, "novembre 2026")).toBe(
      "2 fatture da pagare, €\u00a0300,00 in tutto, a novembre 2026. Tolta la nota di credito di €\u00a0120,00, al fornitore restano da dare €\u00a0180,00. Puoi ripensarci fattura per fattura.",
    );
  });
  it("note di credito più grandi delle fatture: non resta niente da dare", async () => {
    const { testoConfermaTutte } = await import("./fattureRicevute");
    const [g] = raggruppaPerFornitore([m("Euro Service", 15000), m("Euro Service", 10000, { documento: "NOTA_DI_CREDITO" }), m("Euro Service", 10000, { documento: "NOTA_DI_CREDITO" })]);
    expect(testoConfermaTutte(g!, "novembre 2026")).toBe(
      "1 fattura da pagare, €\u00a0150,00 in tutto, a novembre 2026. Tolte le note di credito (€\u00a0200,00), al fornitore non resta niente da dare. Puoi ripensarci fattura per fattura.",
    );
  });
});

describe("fatture ricevute: una fattura importata non è mai una divisione", () => {
  const roma = { id: 1, nome: "Via Roma" };
  const mare = { id: 2, nome: "Lungomare" };
  it("importata da XML in una sede e registrata a mano in un'altra: due righe separate, non un totale doppio", async () => {
    const { testoDivisa } = await import("./fattureRicevute");
    const xml = m("Manutentore", 30000, { numeroDocumento: "MAN-9", data: "2026-11-05", sede: roma, origine: "XML" });
    const mano = m("Manutentore", 30000, { numeroDocumento: "MAN-9", data: "2026-11-05", sede: mare, origine: "MANO" });
    const [g] = raggruppaPerFornitore([xml, mano]);
    expect(g!.fatture).toHaveLength(2);
    expect(g!.fatture.map((f) => [f.parti.length, f.importoCent, f.parti[0]!.sede.nome, testoDivisa(f)])).toEqual([
      [1, 30000, "Via Roma", null],
      [1, 30000, "Lungomare", null],
    ]);
    expect(g!.nDaPagare).toBe(2);
  });
});

describe("segnare più parti: riuscito solo in parte", () => {
  it("tutte riuscite: nessun errore, chiamate nell'ordine", async () => {
    const { segnaInSerie } = await import("./fattureRicevute");
    const fatte: number[] = [];
    await segnaInSerie([1, 2, 3], async (x) => void fatte.push(x));
    expect(fatte).toEqual([1, 2, 3]);
  });
  it("la prima fallisce: resta l'errore di prima (non è cambiato niente)", async () => {
    const { segnaInSerie, SegnataInParte } = await import("./fattureRicevute");
    const errore = new Error("rete");
    const esito = await segnaInSerie([1, 2], () => Promise.reject(errore)).catch((e: unknown) => e);
    expect(esito).toBe(errore);
    expect(esito).not.toBeInstanceOf(SegnataInParte);
  });
  it("una riesce e la dopo fallisce: SegnataInParte, e ci si ferma lì", async () => {
    const { segnaInSerie, SegnataInParte } = await import("./fattureRicevute");
    const fatte: number[] = [];
    const esito = await segnaInSerie([1, 2, 3], async (x) => {
      if (x === 2) throw new Error("rete");
      fatte.push(x);
    }).catch((e: unknown) => e);
    expect(esito).toBeInstanceOf(SegnataInParte);
    expect(fatte).toEqual([1]);
  });
  it("i testi dell'avviso", async () => {
    const { avvisoErroreSegna, SegnataInParte } = await import("./fattureRicevute");
    expect(avvisoErroreSegna(new SegnataInParte(), false)).toBe("Segnata solo in parte: riprova.");
    expect(avvisoErroreSegna(new SegnataInParte(), true)).toBe("Segnate solo in parte: riprova.");
    expect(avvisoErroreSegna(new Error("x"), false)).toBeNull();
  });
});

describe("il badge di una fattura: quali parti cambiare", () => {
  const sede = (id: number) => ({ id, nome: `Sede ${id}` });
  const fattura = (pagate: boolean[]) =>
    raggruppaPerFornitore(pagate.map((pagata, i) => m("Manutentore", 10000, { numeroDocumento: "MAN-7", data: "2026-11-05", origine: "MANO", sede: sede(i + 1), pagata })))[0]!.fatture[0]!;
  it("da pagare: tutte le parti diventano pagate", async () => {
    const { partiDaSegnare } = await import("./fattureRicevute");
    const f = fattura([false, false]);
    expect(partiDaSegnare(f)).toEqual({ pagata: true, parti: f.parti });
  });
  it("pagata in parte: diventa pagata, e si chiama solo la parte che manca", async () => {
    const { partiDaSegnare } = await import("./fattureRicevute");
    const f = fattura([true, false, true]);
    const esito = partiDaSegnare(f);
    expect(esito.pagata).toBe(true);
    expect(esito.parti.map((p) => p.sede.id)).toEqual([2]);
  });
  it("pagata: tutte le parti tornano da pagare", async () => {
    const { partiDaSegnare } = await import("./fattureRicevute");
    const f = fattura([true, true]);
    expect(partiDaSegnare(f)).toEqual({ pagata: false, parti: f.parti });
  });
});
