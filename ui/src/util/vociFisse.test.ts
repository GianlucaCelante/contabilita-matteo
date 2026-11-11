import { describe, expect, it } from "vitest";
import type { Movimento } from "../api/tipi";
import { campiDaVoceFissa, campiVuoti, chiedeFornitore, daMovimento, documentoDi, opzioniVoce, preparaInput, ripetibile, voceFissaNuova } from "./modelloMovimento";

// La voce fissa e' una categoria dei costi fissi scelta o scritta dall'utente: nessun nome e' scritto nel codice. L'unica particolarita'
// e' il flag `retribuzione` della categoria (docs/api.md, «Anagrafiche»).
const categorie = [
  { nome: "Affitto", retribuzione: false },
  { nome: "Commercialista", retribuzione: false },
  { nome: "Paghe", retribuzione: true },
];
const vuoto = { categoria: "", eRetribuzione: false };

describe("opzioniVoce", () => {
  const nomi = ["Paghe", "affitto", "Commercialista", "Affitto", " ", "Assicurazioni"];
  it("senza doppioni (maiuscole a parte) né vuote, in ordine alfabetico", () => {
    expect(opzioniVoce("", nomi)).toEqual(["affitto", "Assicurazioni", "Commercialista", "Paghe"]);
  });
  it("campo vuoto o con un nome già completo: si vedono tutte le voci, così si può cambiare scelta", () => {
    const tutte = opzioniVoce("", nomi);
    expect(opzioniVoce("Paghe", nomi)).toEqual(tutte);
    expect(opzioniVoce("commercialista", nomi)).toEqual(tutte);
  });
  it("mentre si scrive, restano le voci che contengono il testo", () => {
    expect(opzioniVoce("ass", nomi)).toEqual(["Assicurazioni"]);
    expect(opzioniVoce("zz", nomi)).toEqual([]);
  });
  it("senza categorie non c'è nessuna voce (niente è scritto nel codice)", () => {
    expect(opzioniVoce("", [])).toEqual([]);
  });
});

describe("campiDaVoceFissa: il flag è della categoria scelta", () => {
  it("una categoria che c'è usa il suo flag, comunque sia scritto il nome", () => {
    expect(campiDaVoceFissa("paghe", vuoto, categorie)).toEqual({ categoria: "paghe", eRetribuzione: true });
    expect(campiDaVoceFissa("Affitto", { categoria: "Paghe", eRetribuzione: true }, categorie)).toEqual({ categoria: "Affitto", eRetribuzione: false });
  });
  it("mentre si scrive gli spazi restano: dopo «Affitto» si può scrivere «Affitto capannone»", () => {
    expect(campiDaVoceFissa("Affitto ", { categoria: "Affitto", eRetribuzione: false }, categorie).categoria).toBe("Affitto ");
    expect(campiDaVoceFissa("Affitto c", vuoto, categorie).categoria).toBe("Affitto c");
    // lo spazio iniziale non cambia nemmeno la scelta: « Paghe» e' ancora la categoria Paghe
    expect(campiDaVoceFissa(" Paghe", vuoto, categorie)).toEqual({ categoria: " Paghe", eRetribuzione: true });
  });
  it("un nome nuovo tiene l'interruttore solo se anche il testo di prima era nuovo", () => {
    expect(campiDaVoceFissa("Stipendi", { categoria: "Stipen", eRetribuzione: true }, categorie)).toEqual({ categoria: "Stipendi", eRetribuzione: true });
    // passando da una categoria con il flag a un nome nuovo, l'interruttore riparte spento
    expect(campiDaVoceFissa("Paghe extra", { categoria: "Paghe", eRetribuzione: true }, categorie)).toEqual({ categoria: "Paghe extra", eRetribuzione: false });
    expect(campiDaVoceFissa("", { categoria: "Paghe", eRetribuzione: true }, categorie)).toEqual({ categoria: "", eRetribuzione: false });
  });
  it("voceFissaNuova: il nome non vuoto non è fra le categorie (senza badare alle maiuscole e ai bordi)", () => {
    expect(voceFissaNuova({ categoria: "Stipendi" }, categorie)).toBe(true);
    expect(voceFissaNuova({ categoria: " paghe " }, categorie)).toBe(false);
    expect(voceFissaNuova({ categoria: "  " }, categorie)).toBe(false);
  });
});

describe("voce fissa nel salvataggio", () => {
  const fisso = { ...campiVuoti(), tipo: "COSTO_FISSO" as const, importo: "150" };
  it("senza voce non si salva", () => {
    const r = preparaInput({ ...fisso, categoria: "  " }, false);
    expect(r.input).toBeNull();
    expect(r.errori.categoria).toBeTruthy();
  });
  it("«Affitto » con lo spazio finale si salva come «Affitto» (gli spazi ai bordi si tolgono solo al salvataggio)", () => {
    const r = preparaInput({ ...fisso, ...campiDaVoceFissa("Affitto ", vuoto, categorie) }, false);
    expect(r.errori).toEqual({});
    expect(r.input?.categoria).toBe("Affitto");
    expect(r.input?.documento).toBe("NESSUNO");
  });
  it("una categoria senza flag: documento NESSUNO, niente dipendente, fornitore facoltativo", () => {
    const c = { ...fisso, ...campiDaVoceFissa(" Commercialista ", vuoto, categorie), dipendente: "Mario", fornitore: "Studio Rossi", retribuzione: "EXTRA" as const };
    expect(documentoDi(c)).toBe("NESSUNO");
    expect(chiedeFornitore(c)).toBe("facoltativo");
    const r = preparaInput(c, false);
    expect(r.input).toMatchObject({ categoria: "Commercialista", documento: "NESSUNO", fornitore: "Studio Rossi" });
    expect(r.input?.dipendente).toBeUndefined();
  });
  it("una categoria con il flag retribuzione: Regolare/Extra e dipendente, nessun fornitore", () => {
    const base = { ...fisso, ...campiDaVoceFissa("Paghe", vuoto, categorie), dipendente: " Luca Ferri ", fornitore: "ignorato" };
    expect(chiedeFornitore(base)).toBe("no");
    const regolare = preparaInput({ ...base, retribuzione: "REGOLARE" }, false);
    expect(regolare.input).toMatchObject({ categoria: "Paghe", documento: "RETRIBUZIONE_REGOLARE", dipendente: "Luca Ferri" });
    expect(regolare.input?.fornitore).toBeUndefined();
    expect(preparaInput({ ...base, retribuzione: "EXTRA" }, false).input?.documento).toBe("RETRIBUZIONE_EXTRA");
  });
  it("un nome nuovo con l'interruttore «È una retribuzione» acceso diventa una retribuzione (la categoria si crea col flag al salvataggio)", () => {
    const c = { ...fisso, categoria: "Stipendi", eRetribuzione: true, retribuzione: "EXTRA" as const };
    expect(preparaInput(c, false).input).toMatchObject({ categoria: "Stipendi", documento: "RETRIBUZIONE_EXTRA" });
    expect(preparaInput({ ...c, eRetribuzione: false }, false).input).toMatchObject({ categoria: "Stipendi", documento: "NESSUNO" });
  });
  it("la retribuzione extra non si ripete, quella regolare sì; le altre voci fisse sì", () => {
    const paga = { ...fisso, categoria: "Paghe", eRetribuzione: true };
    expect(ripetibile({ ...paga, retribuzione: "REGOLARE" })).toBe(true);
    expect(ripetibile({ ...paga, retribuzione: "EXTRA" })).toBe(false);
    expect(ripetibile({ ...fisso, categoria: "Affitto" })).toBe(true);
  });
});

describe("daMovimento: il flag si legge dal documento", () => {
  const base: Movimento = {
    id: 1,
    data: "2026-10-05",
    tipo: "COSTO_FISSO",
    documento: "NESSUNO",
    importoCent: 1000,
    categoria: { id: 3, nome: "Paghe" },
    fornitore: null,
    dipendente: null,
    sede: { id: 1, nome: "A" },
    descrizione: null,
    numeroDocumento: null,
    note: null,
    origine: "MANO",
    pagata: false,
    ricorrenza: null,
    allegatoNome: null,
    creatoIl: "2026-10-05T09:00:00",
    modificatoIl: null,
    divisione: null,
  };
  it("RETRIBUZIONE_EXTRA e RETRIBUZIONE_REGOLARE accendono il flag; il nome della categoria non conta", () => {
    expect(daMovimento({ ...base, documento: "RETRIBUZIONE_EXTRA" })).toMatchObject({ eRetribuzione: true, retribuzione: "EXTRA", categoria: "Paghe" });
    expect(daMovimento({ ...base, documento: "RETRIBUZIONE_REGOLARE" })).toMatchObject({ eRetribuzione: true, retribuzione: "REGOLARE" });
    expect(daMovimento({ ...base, categoria: { id: 4, nome: "Retribuzione" } })).toMatchObject({ eRetribuzione: false, categoria: "Retribuzione" });
  });
});
