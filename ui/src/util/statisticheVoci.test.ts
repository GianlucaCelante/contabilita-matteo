import { describe, expect, it } from "vitest";
import type { StatisticheVoci, VoceStatistica } from "../api/tipi";
import { basePositiva, larghezzaBarra, massimoMese, meseBreve, meseInEvidenza, mesiConDati, nomeMeseDi, piuAnni, quotaVoce, sommaRicavi, tipoPerServizio, totaliPerMese, vociDelMese } from "./statisticheVoci";

const voce = (id: number | null, nome: string, perMese: number[], movimentiPerMese: number[] = perMese.map((x) => (x !== 0 ? 1 : 0))): VoceStatistica => ({
  id,
  nome,
  pagataCent: null,
  fattureCent: null,
  pagataPerMese: null,
  fatturePerMese: null,
  totaleCent: perMese.reduce((t, x) => t + x, 0),
  movimenti: movimentiPerMese.reduce((t, x) => t + x, 0),
  regolareCent: 0,
  extraCent: 0,
  perMese,
  movimentiPerMese,
});
const dati: StatisticheVoci = {
  da: "2026-09-01",
  a: "2026-11-30",
  raggruppa: "FORNITORE",
  tipo: "COSTO_VARIABILE",
  mesi: ["2026-09", "2026-10", "2026-11"],
  totaleCent: 0,
  movimenti: 4,
  voci: [voce(1, "Bel Fungo", [30000, 50000, 0]), voce(2, "Alfa", [0, 50000, 1000]), voce(null, "Senza fornitore", [500, 0, 0])],
};

describe("statisticheVoci: mesi e tipo", () => {
  it("nomi dei mesi", () => {
    expect(nomeMeseDi("2026-10")).toBe("ottobre");
    expect(nomeMeseDi("2026-10", true)).toBe("ottobre 2026");
    expect(meseBreve("2026-10")).toBe("ott");
    expect(meseBreve("2026-10", true)).toBe("ott 26");
    expect(piuAnni(["2026-11", "2026-12"])).toBe(false);
    expect(piuAnni(["2026-12", "2027-01"])).toBe(true);
  });
  it("il tipo da mandare: scontato per fornitori e dipendenti, scelto per le categorie, «Tutti» = assente", () => {
    expect(tipoPerServizio("FORNITORE", "RICAVO")).toBe("COSTO_VARIABILE");
    // dipendenti: solo retribuzioni, il tipo non si manda (il servizio lo ignora)
    expect(tipoPerServizio("DIPENDENTE", "TUTTI")).toBeUndefined();
    expect(tipoPerServizio("CATEGORIA", "RICAVO")).toBe("RICAVO");
    expect(tipoPerServizio("CATEGORIA", "TUTTI")).toBeUndefined();
  });
});

describe("statisticheVoci: barre e mesi", () => {
  it("larghezza della barra: proporzionale, mai fuori scala, un filo visibile se c'è un importo", () => {
    expect(larghezzaBarra(50, 100)).toBe(50);
    expect(larghezzaBarra(200, 100)).toBe(100);
    expect(larghezzaBarra(1, 100000)).toBe(2);
    expect(larghezzaBarra(0, 100)).toBe(0);
    expect(larghezzaBarra(-5, 100)).toBe(0);
    expect(larghezzaBarra(5, 0)).toBe(0);
  });
  it("vociDelMese: solo le voci con un importo nel mese, dalla più alta, a parità per nome, «Senza» in fondo", () => {
    const ott = vociDelMese(dati, 1);
    expect(ott.righe.map((r) => r.voce.nome)).toEqual(["Alfa", "Bel Fungo"]);
    expect(ott.totaleCent).toBe(100000);
    const set = vociDelMese(dati, 0);
    expect(set.righe.map((r) => r.voce.nome)).toEqual(["Bel Fungo", "Senza fornitore"]);
    expect(vociDelMese(dati, 7).righe).toEqual([]);
  });
  it("vociDelMese: i movimenti di ogni riga sono quelli del mese, non del periodo; una voce a zero con movimenti resta", () => {
    const d: StatisticheVoci = { ...dati, voci: [voce(1, "Bel Fungo", [30000, 50000, 0], [2, 5, 0]), voce(2, "Pari", [0, 0, 0], [0, 2, 0])] };
    const ott = vociDelMese(d, 1);
    expect(ott.righe.map((r) => [r.voce.nome, r.movimenti])).toEqual([["Bel Fungo", 5], ["Pari", 2]]);
    expect(vociDelMese(d, 0).righe.map((r) => r.movimenti)).toEqual([2]);
  });
  it("totaliPerMese e massimoMese", () => {
    expect(totaliPerMese(dati)).toEqual([30500, 100000, 1000]);
    expect(massimoMese(dati.voci[0]!)).toBe(50000);
  });
});

describe("meseInEvidenza: il mese a cui portare lo scorrimento all'apertura", () => {
  const mesi = ["2026-01", "2026-02", "2026-03", "2026-10", "2026-11", "2026-12"];
  it("il mese corrente, se e' nel periodo", () => {
    expect(meseInEvidenza(mesi, [1, 1, 1, 1, 1, 1], "2026-11-04")).toBe(4);
  });
  it("altrimenti l'ultimo mese con dati", () => {
    expect(meseInEvidenza(["2025-01", "2025-02", "2025-03"], [5, 7, 0], "2026-11-04")).toBe(1);
  });
  it("senza dati l'ultimo mese; senza mesi -1", () => {
    expect(meseInEvidenza(["2025-01", "2025-02"], [0, 0], "2026-11-04")).toBe(1);
    expect(meseInEvidenza([], [], "2026-11-04")).toBe(-1);
  });
});

import { cosaSomma, indirizzoStatisticheDelBlocco, opzioniTipoCategoria, tipoCategoriaDa } from "./statisticheVoci";

describe("indirizzoStatisticheDelBlocco", () => {
  const mese = { tipo: "mese" as const, da: "2026-10-01", a: "2026-10-31" };
  it("ricavi: categorie dei ricavi, stesso periodo", () => {
    expect(indirizzoStatisticheDelBlocco("ricavi", mese)).toBe("/statistiche/voci?v=CATEGORIA&t=RICAVO&p=mese&r=2026-10-01");
  });
  it("costi variabili: categorie dei soli costi variabili", () => {
    expect(indirizzoStatisticheDelBlocco("variabili", mese)).toBe("/statistiche/voci?v=CATEGORIA&t=COSTO_VARIABILE&p=mese&r=2026-10-01");
  });
  it("costi fissi: categorie dei soli costi fissi", () => {
    expect(indirizzoStatisticheDelBlocco("fissi", mese)).toBe("/statistiche/voci?v=CATEGORIA&t=COSTO_FISSO&p=mese&r=2026-10-01");
  });
  it("periodo libero: da e a", () => {
    expect(indirizzoStatisticheDelBlocco("ricavi", { tipo: "periodo", da: "2026-10-05", a: "2026-10-20" })).toBe(
      "/statistiche/voci?v=CATEGORIA&t=RICAVO&p=periodo&da=2026-10-05&a=2026-10-20",
    );
  });
});

describe("tipo delle categorie con i costi variabili e i costi fissi", () => {
  it("legge COSTO_VARIABILE e COSTO_FISSO dall'indirizzo, il resto torna a COSTI", () => {
    expect(tipoCategoriaDa("COSTO_VARIABILE")).toBe("COSTO_VARIABILE");
    expect(tipoCategoriaDa("COSTO_FISSO")).toBe("COSTO_FISSO");
    expect(tipoCategoriaDa("RICAVO")).toBe("RICAVO");
    expect(tipoCategoriaDa("boh")).toBe("COSTI");
    expect(tipoCategoriaDa(null)).toBe("COSTI");
  });
  it("le chip «Costi variabili» e «Costi fissi» ci sono solo quando sono il tipo scelto", () => {
    expect(opzioniTipoCategoria("COSTI").map((o) => o.etichetta)).toEqual(["Costi", "Ricavi", "Tutti"]);
    expect(opzioniTipoCategoria("COSTO_VARIABILE").map((o) => o.etichetta)).toEqual(["Costi", "Costi variabili", "Ricavi", "Tutti"]);
    expect(opzioniTipoCategoria("COSTO_VARIABILE").map((o) => o.valore)).toEqual(["COSTI", "COSTO_VARIABILE", "RICAVO", "TUTTI"]);
    expect(opzioniTipoCategoria("COSTO_FISSO").map((o) => o.etichetta)).toEqual(["Costi", "Costi fissi", "Ricavi", "Tutti"]);
  });
  it("il servizio riceve COSTO_VARIABILE e COSTO_FISSO", () => {
    expect(tipoPerServizio("CATEGORIA", "COSTO_VARIABILE")).toBe("COSTO_VARIABILE");
    expect(tipoPerServizio("CATEGORIA", "COSTO_FISSO")).toBe("COSTO_FISSO");
  });
  it("che cosa somma il totale", () => {
    expect(cosaSomma("FORNITORE", "COSTI")).toBe("Costi");
    expect(cosaSomma("DIPENDENTE", "COSTI")).toBe("Retribuzioni");
    expect(cosaSomma("CATEGORIA", "COSTO_VARIABILE")).toBe("Costi variabili");
    expect(cosaSomma("CATEGORIA", "COSTO_FISSO")).toBe("Costi fissi");
    expect(cosaSomma("CATEGORIA", "RICAVO")).toBe("Ricavi");
    expect(cosaSomma("CATEGORIA", "TUTTI")).toBe("Ricavi e costi");
  });
});

import { colonnaInEvidenza, intestazioneVoce } from "./statisticheVoci";

describe("griglia sul computer", () => {
  it("intestazione della prima colonna al singolare, intera (non «Categori»)", () => {
    expect(intestazioneVoce("CATEGORIA")).toBe("Categoria");
    expect(intestazioneVoce("FORNITORE")).toBe("Fornitore");
    expect(intestazioneVoce("DIPENDENTE")).toBe("Dipendente");
  });
  it("colonnaInEvidenza: il mese di m= se e' nel periodo, altrimenti quello di meseInEvidenza", () => {
    const mesi = ["2026-09", "2026-10", "2026-11"];
    expect(colonnaInEvidenza(mesi, [1, 1, 1], "2026-11-04", "2026-09")).toBe(0);
    expect(colonnaInEvidenza(mesi, [1, 1, 1], "2026-11-04", null)).toBe(2);
    expect(colonnaInEvidenza(mesi, [1, 1, 1], "2026-11-04", "2025-01")).toBe(2);
  });
});

import { scorrimentoIniziale } from "./statisticheVoci";

describe("scorrimentoIniziale: la griglia si apre con il mese in evidenza in vista e nessuna colonna tagliata sotto quella fissa", () => {
  // colonna fissa larga 200; poi Movim. (60), Quota (150), Totale (170) e 11 mesi da 120
  const larghezze = [60, 150, 170, ...Array.from({ length: 11 }, () => 120)];
  const colonne: { inizio: number; fine: number }[] = [];
  let x = 200;
  for (const l of larghezze) {
    colonne.push({ inizio: x, fine: x + l });
    x += l;
  }
  const contenuto = x; // 1900
  const g = (indice: number, larghezza: number) =>
    scorrimentoIniziale({ fissa: 200, larghezza, colonne, indice, massimo: Math.max(0, contenuto - larghezza), meseScelto: true });

  it("senza un mese scelto (m=) non si scorre: Movim., Quota e Totale restano in vista anche se il mese in evidenza e' fuori", () => {
    const r = scorrimentoIniziale({ fissa: 200, larghezza: 1000, colonne, indice: 13, massimo: contenuto - 1000, meseScelto: false });
    expect(r).toEqual({ scorri: 0, margine: 0 });
  });
  it("se il mese si vede gia' non si scorre", () => {
    expect(g(3, 1200)).toEqual({ scorri: 0, margine: 0 });
  });
  it("si scorre fino all'inizio di una colonna: la prima dopo quella fissa e' intera, il mese in evidenza intero a destra", () => {
    // indice 10 (agosto): finisce a 200+380+8*120 = 1540; con 1200 di larghezza serve almeno 340
    const r = g(10, 1200);
    expect(r.margine).toBe(0);
    expect(colonne.some((c) => c.inizio - 200 === r.scorri)).toBe(true);
    expect(r.scorri).toBeGreaterThanOrEqual(340);
    expect(colonne[10]!.fine - r.scorri).toBeLessThanOrEqual(1200);
    // la piu' piccola possibile: l'inizio di gennaio (580 - 200)
    expect(r.scorri).toBe(380);
  });
  it("mese in evidenza nell'ultima colonna: non si taglia, si aggiunge un margine a destra per arrivare a un inizio di colonna", () => {
    const r = g(13, 1213);
    expect(colonne[13]!.fine - r.scorri).toBeLessThanOrEqual(1213);
    expect(colonne.some((c) => c.inizio - 200 === r.scorri)).toBe(true);
    expect(r.margine).toBe(Math.max(0, r.scorri - (contenuto - 1213)));
    expect(r.margine).toBeGreaterThan(0);
    expect(r.margine).toBeLessThan(120);
  });
  it("senza mese in evidenza non si scorre", () => {
    expect(g(-1, 1000)).toEqual({ scorri: 0, margine: 0 });
  });
});

import { periodoDelDettaglio } from "./statisticheVoci";

describe("periodoDelDettaglio: il periodo con cui si apre il dettaglio di una voce", () => {
  it("con un mese (telefono, m=): quel mese, dal primo all'ultimo giorno", () => {
    expect(periodoDelDettaglio("2026-01-01", "2026-12-31", "2026-02")).toEqual({ da: "2026-02-01", a: "2026-02-28" });
    expect(periodoDelDettaglio("2026-01-01", "2026-12-31", "2028-02")).toEqual({ da: "2028-02-01", a: "2028-02-29" });
  });
  it("senza mese (griglia del computer, anche con m=): il periodo intero", () => {
    expect(periodoDelDettaglio("2026-01-01", "2026-12-31", null)).toEqual({ da: "2026-01-01", a: "2026-12-31" });
  });
});

describe("statisticheVoci: quote con le note di credito", () => {
  // Ottobre con una nota di credito: il totale netto e' piccolo (40.000), le quote sul netto sarebbero 200% e -150%.
  const ottobre = [80000, 20000, -60000];

  it("la base delle quote è la somma delle sole voci positive", () => {
    expect(basePositiva(ottobre)).toBe(100000);
    expect(basePositiva([0, -500])).toBe(0);
  });

  it("le voci positive hanno la quota sulla base; nessuna sopra 100% né negativa", () => {
    const base = basePositiva(ottobre);
    expect(ottobre.map((c) => quotaVoce(c, base))).toEqual(["80,0%", "20,0%", "—"]);
    expect(quotaVoce(100000, 100000)).toBe("100,0%");
  });

  it("voce a zero 0,0%; senza voci positive la quota è «—»", () => {
    expect(quotaVoce(0, 1000)).toBe("0,0%");
    expect(quotaVoce(0, 0)).toBe("—");
    expect(quotaVoce(-500, 0)).toBe("—");
  });

  it("vale per il mese scelto e per tutto il periodo", () => {
    const conNota: StatisticheVoci = { ...dati, voci: [voce(1, "Bel Fungo", [0, 80000, 0]), voce(2, "Alfa", [0, 20000, 0]), voce(3, "Nota", [0, -60000, 1000])] };
    const mese = vociDelMese(conNota, 1);
    expect(mese.righe.map((r) => quotaVoce(r.cent, basePositiva(mese.righe.map((x) => x.cent))))).toEqual(["80,0%", "20,0%", "—"]);
    const periodo = conNota.voci.map((v) => v.totaleCent);
    expect(periodo.map((c) => quotaVoce(c, basePositiva(periodo)))).toEqual(["80,0%", "20,0%", "—"]);
  });
});

describe("«Mese per mese» del dettaglio: dal primo all'ultimo mese con dati", () => {
  const mesi = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

  it("toglie i mesi vuoti in testa e in coda, tiene quelli vuoti in mezzo", () => {
    expect(mesiConDati(mesi, [0, 0, 500, 0, 700, 0], [0, 0, 1, 0, 2, 0])).toEqual({ mesi: ["2026-03", "2026-04", "2026-05"], importi: [500, 0, 700] });
  });

  it("un mese con movimenti a somma zero (fattura e nota di credito) conta", () => {
    expect(mesiConDati(mesi, [0, 0, 500, 0, 0, 0], [0, 2, 1, 0, 0, 0])).toEqual({ mesi: ["2026-02", "2026-03"], importi: [0, 500] });
  });

  it("niente dati: nessun mese; tutti con dati: tutti", () => {
    expect(mesiConDati(mesi, [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0])).toEqual({ mesi: [], importi: [] });
    expect(mesiConDati(["2026-10", "2026-11"], [100, 200], [1, 1])).toEqual({ mesi: ["2026-10", "2026-11"], importi: [100, 200] });
  });
});

describe("il verde è dei ricavi", () => {
  it("solo le categorie dei ricavi sommano ricavi", () => {
    expect(sommaRicavi("CATEGORIA", "RICAVO")).toBe(true);
    expect(sommaRicavi("CATEGORIA", "COSTI")).toBe(false);
    expect(sommaRicavi("CATEGORIA", "COSTO_FISSO")).toBe(false);
    // ricavi e costi sommati insieme non sono un ricavo
    expect(sommaRicavi("CATEGORIA", "TUTTI")).toBe(false);
    expect(sommaRicavi("FORNITORE", "RICAVO")).toBe(false);
    expect(sommaRicavi("DIPENDENTE", "COSTI")).toBe(false);
  });
});
