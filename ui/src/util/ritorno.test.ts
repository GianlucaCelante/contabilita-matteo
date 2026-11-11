import { describe, expect, it } from "vitest";
import { comeTornare, daDoveTornare, seguePeriodoSalvato, senzaPeriodo, statoDaInoltrare } from "./ritorno";

describe("come tornare indietro (Annulla, freccia, salvataggio)", () => {
  const da = "/statistiche/voci/dettaglio?raggruppa=FORNITORE&id=3";
  it("arrivati da dentro l'app sulla pagina da cui si torna: un passo indietro nella cronologia", () => {
    expect(comeTornare("k3x9", { da }, da)).toEqual({ indietro: true });
    expect(comeTornare("k3x9", { da: "/movimenti?p=mese" }, "/movimenti?p=mese")).toEqual({ indietro: true });
  });
  it("con modifiche non salvate non si fa mai il passo indietro: si va all'indirizzo, cosi' la conferma di uscita compare sempre", () => {
    // la voce precedente potrebbe non essere del router (indirizzo scritto a mano): li' un passo indietro non si puo' fermare
    expect(comeTornare("k3x9", { da }, da, true)).toEqual({ indietro: false, a: da });
    expect(comeTornare("k3x9", { da }, da, false)).toEqual({ indietro: true });
  });
  it("con modifiche e la voce precedente sicuramente del router (indice della voce >= 2) si torna indietro: la conferma la ferma", () => {
    // indice 1 non basta: una voce scritta a mano non ha indice e la spinta dopo di lei prende 1 (null + 1)
    expect(comeTornare("k3x9", { da }, da, true, 2)).toEqual({ indietro: true });
    expect(comeTornare("k3x9", { da }, da, true, 5)).toEqual({ indietro: true });
    expect(comeTornare("k3x9", { da }, da, true, 1)).toEqual({ indietro: false, a: da });
    expect(comeTornare("k3x9", { da }, da, true, null)).toEqual({ indietro: false, a: da });
    // senza le condizioni di sempre (state.da diverso) niente passo indietro, anche con l'indice
    expect(comeTornare("k3x9", { da: "/altro" }, da, true, 4)).toEqual({ indietro: false, a: da });
  });
  it("aperto da un link diretto (prima voce della cronologia): si va all'indirizzo sostituendo la voce", () => {
    expect(comeTornare("default", null, "/movimenti")).toEqual({ indietro: false, a: "/movimenti" });
    // anche se lo stato c'e' (non succede, ma la chiave dice che prima non c'e' niente dell'app)
    expect(comeTornare("default", { da }, da)).toEqual({ indietro: false, a: da });
  });
  it("senza state.da non si sa cosa c'e' prima: si va all'indirizzo", () => {
    // per esempio Nuovo movimento da link diretto, poi «Importa»: la chiave e' nuova ma lo stato non c'e'
    expect(comeTornare("k3x9", null, "/movimenti")).toEqual({ indietro: false, a: "/movimenti" });
    expect(comeTornare("k3x9", {}, "/movimenti")).toEqual({ indietro: false, a: "/movimenti" });
    expect(comeTornare("k3x9", { da: "https://altrove.example" }, "/movimenti")).toEqual({ indietro: false, a: "/movimenti" });
  });
  it("se si torna altrove (il periodo e' stato spostato dopo un salvataggio) si va all'indirizzo, non indietro", () => {
    expect(comeTornare("k3x9", { da: "/movimenti?p=mese&r=2026-10-01" }, "/movimenti")).toEqual({ indietro: false, a: "/movimenti" });
  });
  it("dopo un salvataggio: se la destinazione e' proprio la voce precedente si torna indietro (niente due voci uguali di fila)", () => {
    // periodo spostato ma l'indirizzo di partenza non aveva il periodo: senzaPeriodo non cambia niente, la lista legge quello salvato
    const da = "/movimenti?tipo=RICAVO";
    expect(comeTornare("k3x9", { da }, senzaPeriodo(da))).toEqual({ indietro: true });
    // periodo nell'indirizzo: si va all'indirizzo senza periodo, sostituendo la voce
    const conPeriodo = "/movimenti?p=mese&r=2026-10-01&tipo=RICAVO";
    expect(comeTornare("k3x9", { da: conPeriodo }, senzaPeriodo(conPeriodo))).toEqual({ indietro: false, a: "/movimenti?tipo=RICAVO" });
  });
});

describe("lo stato che passa fra «A mano» e «Importa»", () => {
  it("inoltra solo un indirizzo di ritorno valido", () => {
    expect(statoDaInoltrare({ da: "/riepilogo?p=anno" })).toEqual({ da: "/riepilogo?p=anno" });
    expect(statoDaInoltrare({ da: "//altrove.example" })).toBeUndefined();
    expect(statoDaInoltrare(null)).toBeUndefined();
    expect(statoDaInoltrare({ lista: "/statistiche/voci" })).toBeUndefined();
  });
});

describe("ritorno al punto di partenza", () => {
  it("si torna all'indirizzo passato in state.da", () => {
    expect(daDoveTornare({ da: "/statistiche/voci/dettaglio?raggruppa=FORNITORE&id=3" })).toBe("/statistiche/voci/dettaglio?raggruppa=FORNITORE&id=3");
    expect(daDoveTornare({ da: "/riepilogo" })).toBe("/riepilogo");
  });
  it("senza un indirizzo interno valido si torna ai Movimenti (o al predefinito)", () => {
    expect(daDoveTornare(null)).toBe("/movimenti");
    expect(daDoveTornare(undefined)).toBe("/movimenti");
    expect(daDoveTornare({})).toBe("/movimenti");
    expect(daDoveTornare({ da: 5 })).toBe("/movimenti");
    expect(daDoveTornare({ da: "https://altrove.example" })).toBe("/movimenti");
    expect(daDoveTornare({ da: "//altrove.example" })).toBe("/movimenti");
    expect(daDoveTornare("testo", "/riepilogo")).toBe("/riepilogo");
  });
  it("Movimenti e Riepilogo seguono il periodo salvato, le statistiche no", () => {
    expect(seguePeriodoSalvato("/movimenti")).toBe(true);
    expect(seguePeriodoSalvato("/movimenti?p=mese&r=2026-10-01&fornitore=3")).toBe(true);
    expect(seguePeriodoSalvato("/riepilogo?p=anno")).toBe(true);
    expect(seguePeriodoSalvato("/statistiche/voci/dettaglio?da=2026-01-01&a=2026-12-31")).toBe(false);
    expect(seguePeriodoSalvato("/movimenti/12")).toBe(false);
  });
  it("toglie il periodo dall'indirizzo e lascia gli altri filtri", () => {
    expect(senzaPeriodo("/movimenti?p=periodo&da=2026-01-01&a=2026-03-31&tipo=COSTO_VARIABILE&fornitore=3")).toBe("/movimenti?tipo=COSTO_VARIABILE&fornitore=3");
    expect(senzaPeriodo("/movimenti?p=mese&r=2026-10-01")).toBe("/movimenti");
    expect(senzaPeriodo("/riepilogo")).toBe("/riepilogo");
  });
});
