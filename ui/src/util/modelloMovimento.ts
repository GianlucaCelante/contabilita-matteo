import type { Documento, Movimento, MovimentoInput, Tipo } from "../api/tipi";
import { MASSIMO_NOME_CATEGORIA } from "./categorie";
import { dataValida, euroPerCampo, leggiEuro, oggiIso } from "./formato";
import { descriviFrequenza, MASSIMO_INTERVALLO, nomeUnita, usaIlGiornoDelMese, type UnitaRipetizione } from "./ripetizione";

// I campi del modulo di un movimento, come testo digitato, e il passaggio da/verso il
// contratto API (docs/api.md, MovimentoInput).

export interface CampiForm {
  tipo: Tipo;
  documentoVariabile: "FATTURA" | "NOTA_DI_CREDITO" | "SCONTRINO";
  tipoRicavo: "RICAVO_FATTURATO" | "RICAVO_EXTRA";
  // Solo per i costi fissi: la categoria scelta (campo `categoria`) e' una retribuzione, cioe' ha il flag `retribuzione` (oppure e' un
  // nome nuovo e chi scrive ha acceso «È una retribuzione»). Allora il documento e' RETRIBUZIONE_* e si chiede il dipendente.
  eRetribuzione: boolean;
  retribuzione: "REGOLARE" | "EXTRA";
  data: string;
  // L'importo come lo scrive chi usa l'app, in euro ("1.234,56"): si converte in centesimi al salvataggio.
  importo: string;
  fornitore: string;
  categoria: string;
  dipendente: string;
  numeroDocumento: string;
  descrizione: string;
  note: string;
  // Solo per la fattura ricevuta: gia' pagata. Di partenza spento.
  pagata: boolean;
  ripeti: boolean;
  // «Ogni mese» (il caso comune: serve solo il giorno) oppure «Personalizzata» (ogni N giorni, settimane, mesi o anni).
  frequenza: "MESE" | "PERSONALIZZATA";
  intervallo: string;
  unita: UnitaRipetizione;
  // Il giorno del mese: serve per «Ogni mese» e per la personalizzata in mesi o anni.
  giorno: string;
  // La sede (con almeno due sedi attive si sceglie; null = non ancora scelta) e, solo in creazione, «dividi» fra piu' sedi:
  // `dividi` e' acceso con due o piu' sedi scelte; `sediDivise` sono i loro id, vuoto = tutte le sedi attive.
  sedeId: number | null;
  dividi: boolean;
  sediDivise: number[];
}

// Una pillola sede toccata in creazione: si possono scegliere una, due o tutte le sedi attive. Con una sola il movimento
// sta in quella sede; con due o piu' si divide l'importo (se tutte, `sediDivise` resta vuoto).
export function alternaSede(c: Pick<CampiForm, "sedeId" | "dividi" | "sediDivise">, id: number, attive: number[]): Pick<CampiForm, "sedeId" | "dividi" | "sediDivise"> {
  const scelte = c.dividi ? (c.sediDivise.length > 0 ? c.sediDivise : attive) : c.sedeId !== null ? [c.sedeId] : [];
  const nuove = attive.filter((s) => (s === id ? !scelte.includes(s) : scelte.includes(s)));
  if (nuove.length === 0) return { sedeId: null, dividi: false, sediDivise: [] };
  if (nuove.length === 1) return { sedeId: nuove[0]!, dividi: false, sediDivise: [] };
  return { sedeId: null, dividi: true, sediDivise: nuove.length === attive.length ? [] : nuove };
}

// Le sedi fra cui si divide (gli id), con «dividi» acceso: quelle scelte o, se vuoto, tutte le attive.
export function sediDelleDivisione(c: Pick<CampiForm, "sediDivise">, attive: number[]): number[] {
  return c.sediDivise.length > 0 ? c.sediDivise.filter((s) => attive.includes(s)) : attive;
}

export type Errori = Partial<Record<keyof CampiForm, string>>;

type RifVoce = { nome: string; retribuzione?: boolean | undefined };

// La categoria con questo nome fra quelle caricate (senza badare alle maiuscole e agli spazi ai bordi), se c'e'.
export function trovaPerNome<T extends { nome: string }>(testo: string, categorie: T[]): T | undefined {
  const chiave = testo.trim().toLowerCase();
  return chiave ? categorie.find((c) => c.nome.trim().toLowerCase() === chiave) : undefined;
}

// La voce fissa e' una categoria dei costi fissi scelta o scritta nel campo: nessun nome e' scritto nel codice. Dal testo ai campi.
// Mentre si scrive il testo NON si ripulisce: con «Affitto » (spazio finale) il campo deve tenere lo spazio, altrimenti dopo una
// voce scelta non si riesce a scrivere «Affitto capannone». Gli spazi ai bordi si tolgono al salvataggio (vedi `preparaInput`).
// Se il nome e' di una categoria che c'e' gia', il flag retribuzione e' il suo; se e' nuovo si tiene l'interruttore, ma solo se anche
// il testo di prima era nuovo (passando da una voce che c'e' a un nome nuovo l'interruttore riparte spento).
export function campiDaVoceFissa(
  testo: string,
  attuale: Pick<CampiForm, "categoria" | "eRetribuzione">,
  categorie: RifVoce[],
): Pick<CampiForm, "categoria" | "eRetribuzione"> {
  const trovata = trovaPerNome(testo, categorie);
  if (trovata) return { categoria: testo, eRetribuzione: !!trovata.retribuzione };
  const eraNuova = !trovaPerNome(attuale.categoria, categorie);
  return { categoria: testo, eRetribuzione: eraNuova && attuale.eRetribuzione };
}

// Vale per il modulo: il nome della voce fissa e' una categoria che non c'e' ancora (si crea al salvataggio).
export function voceFissaNuova(c: Pick<CampiForm, "categoria">, categorie: RifVoce[]): boolean {
  return c.categoria.trim() !== "" && !trovaPerNome(c.categoria, categorie);
}

// I suggerimenti: tutte le categorie se il campo e' vuoto o contiene gia' un nome completo (per poter cambiare scelta), altrimenti quelle
// che contengono il testo. Senza doppioni (senza badare alle maiuscole), in ordine alfabetico.
export function opzioniVoce(testo: string, nomiCategorie: string[]): string[] {
  const viste = new Set<string>();
  const tutte: string[] = [];
  for (const grezzo of nomiCategorie) {
    const nome = grezzo.trim();
    if (!nome || viste.has(nome.toLowerCase())) continue;
    viste.add(nome.toLowerCase());
    tutte.push(nome);
  }
  tutte.sort((a, b) => a.localeCompare(b, "it"));
  const cerca = testo.trim().toLowerCase();
  if (!cerca || viste.has(cerca)) return tutte;
  return tutte.filter((n) => n.toLowerCase().includes(cerca));
}

export function campiVuoti(): CampiForm {
  return {
    tipo: "COSTO_VARIABILE",
    documentoVariabile: "FATTURA",
    tipoRicavo: "RICAVO_FATTURATO",
    eRetribuzione: false,
    retribuzione: "REGOLARE",
    data: oggiIso(),
    importo: "",
    fornitore: "",
    categoria: "",
    dipendente: "",
    numeroDocumento: "",
    descrizione: "",
    note: "",
    pagata: false,
    ripeti: false,
    frequenza: "MESE",
    intervallo: "1",
    unita: "MESI",
    giorno: "",
    sedeId: null,
    dividi: false,
    sediDivise: [],
  };
}

export function daMovimento(m: Movimento): CampiForm {
  const base = campiVuoti();
  return {
    ...base,
    tipo: m.tipo,
    documentoVariabile: m.documento === "SCONTRINO" ? "SCONTRINO" : m.documento === "NOTA_DI_CREDITO" ? "NOTA_DI_CREDITO" : "FATTURA",
    tipoRicavo: m.documento === "RICAVO_EXTRA" ? "RICAVO_EXTRA" : "RICAVO_FATTURATO",
    eRetribuzione: m.documento === "RETRIBUZIONE_REGOLARE" || m.documento === "RETRIBUZIONE_EXTRA",
    retribuzione: m.documento === "RETRIBUZIONE_EXTRA" ? "EXTRA" : "REGOLARE",
    data: m.data,
    importo: euroPerCampo(m.importoCent),
    fornitore: m.fornitore?.nome ?? "",
    categoria: m.categoria?.nome ?? "",
    dipendente: m.dipendente?.nome ?? "",
    numeroDocumento: m.numeroDocumento ?? "",
    descrizione: m.descrizione ?? "",
    note: m.note ?? "",
    pagata: m.pagata,
    ripeti: m.ricorrenza?.attiva ?? false,
    frequenza: m.ricorrenza && !(m.ricorrenza.unita === "MESI" && m.ricorrenza.intervallo === 1) ? "PERSONALIZZATA" : "MESE",
    intervallo: String(m.ricorrenza?.intervallo ?? 1),
    unita: m.ricorrenza?.unita ?? "MESI",
    giorno: m.ricorrenza ? String(m.ricorrenza.giorno) : "",
    sedeId: m.sede?.id ?? null,
    dividi: false,
    sediDivise: [],
  };
}

export function documentoDi(c: CampiForm): Documento {
  if (c.tipo === "RICAVO") return c.tipoRicavo;
  if (c.tipo === "COSTO_VARIABILE") return c.documentoVariabile;
  if (c.eRetribuzione) return c.retribuzione === "EXTRA" ? "RETRIBUZIONE_EXTRA" : "RETRIBUZIONE_REGOLARE";
  return "NESSUNO";
}

// La ripetizione mensile e' solo dei costi fissi, e non della retribuzione extra.
export function ripetibile(c: CampiForm): boolean {
  return c.tipo === "COSTO_FISSO" && documentoDi(c) !== "RETRIBUZIONE_EXTRA";
}

// La categoria che verra' mandata (la voce fissa e' obbligatoria; per i ricavi e' facoltativa).
export function categoriaDi(c: CampiForm): string {
  return c.categoria.trim();
}

export function chiedeFornitore(c: CampiForm): "si" | "facoltativo" | "no" {
  if (c.tipo === "COSTO_VARIABILE") return c.documentoVariabile === "SCONTRINO" ? "facoltativo" : "si";
  if (c.tipo === "COSTO_FISSO" && !c.eRetribuzione) return "facoltativo";
  return "no";
}
// La descrizione (facoltativa) c'e' per ricavi, costi fissi e scontrini.
export function chiedeDescrizione(c: CampiForm): boolean {
  return c.tipo !== "COSTO_VARIABILE" || c.documentoVariabile === "SCONTRINO";
}

// Controlla i campi e, se vanno bene, prepara il corpo per il servizio.
// `conRipetizione`: se false la ripetizione non e' gestita da qui (dettaglio).
// `sedeObbligatoria`: ci sono almeno due sedi attive, quindi la sede va scelta (una o piu' d'una); con una sola il servizio usa quella.
export function preparaInput(c: CampiForm, conRipetizione: boolean, sedeObbligatoria = false): { errori: Errori; input: MovimentoInput | null } {
  const errori: Errori = {};
  if (sedeObbligatoria && c.sedeId === null && !c.dividi) errori.sedeId = "Scegli una o più sedi.";
  if (!dataValida(c.data)) errori.data = "Scrivi una data valida.";
  const cent = leggiEuro(c.importo);
  if (cent === null) errori.importo = "Scrivi un importo, per esempio 86,00.";
  else if (cent <= 0) errori.importo = "L'importo deve essere maggiore di zero.";
  if (chiedeFornitore(c) === "si" && !c.fornitore.trim()) errori.fornitore = "Scegli o crea un fornitore.";
  if (c.tipo === "COSTO_FISSO" && !c.categoria.trim()) errori.categoria = "Scegli una voce o scrivine una nuova.";
  else if (categoriaDi(c).length > MASSIMO_NOME_CATEGORIA) errori.categoria = `Il nome può avere al massimo ${MASSIMO_NOME_CATEGORIA} caratteri.`;
  let ripetizione: NonNullable<MovimentoInput["ricorrenza"]> | null = null;
  if (conRipetizione && c.ripeti && ripetibile(c)) {
    const unita = unitaDi(c);
    const intervallo = c.frequenza === "MESE" ? 1 : Number(c.intervallo.trim() === "" ? Number.NaN : c.intervallo);
    if (!Number.isInteger(intervallo) || intervallo < 1 || intervallo > MASSIMO_INTERVALLO[unita]) {
      errori.intervallo = `Ogni quanto: da 1 a ${MASSIMO_INTERVALLO[unita]} ${nomeUnita(unita, true)}.`;
    }
    ripetizione = { unita, intervallo };
    if (usaIlGiornoDelMese(unita)) {
      const giorno = c.giorno.trim() === "" ? Number.NaN : Number(c.giorno);
      if (!Number.isInteger(giorno) || giorno < 1 || giorno > 31) errori.giorno = "Il giorno va da 1 a 31.";
      else ripetizione.giorno = giorno;
    }
  }
  if (Object.keys(errori).length > 0 || cent === null) return { errori, input: null };

  const input: MovimentoInput = { data: c.data, tipo: c.tipo, documento: documentoDi(c), importoCent: cent };
  const categoria = categoriaDi(c);
  if (categoria) input.categoria = categoria;
  if (chiedeFornitore(c) !== "no" && c.fornitore.trim()) input.fornitore = c.fornitore.trim();
  if (c.tipo === "COSTO_FISSO" && c.eRetribuzione && c.dipendente.trim()) input.dipendente = c.dipendente.trim();
  if (c.tipo === "COSTO_VARIABILE" && c.documentoVariabile !== "SCONTRINO" && c.numeroDocumento.trim()) input.numeroDocumento = c.numeroDocumento.trim();
  if (chiedeDescrizione(c) && c.descrizione.trim()) input.descrizione = c.descrizione.trim();
  if (c.note.trim()) input.note = c.note.trim();
  if (c.tipo === "COSTO_VARIABILE" && c.documentoVariabile === "FATTURA") input.pagata = c.pagata;
  if (c.sedeId !== null && !c.dividi) input.sedeId = c.sedeId;
  if (ripetizione !== null) input.ricorrenza = ripetizione;
  return { errori, input };
}

// Sono cambiati dati che finirebbero nei prossimi movimenti (importo, voce, fornitore...)? Allora al salvataggio si chiede
// «solo questo o anche i prossimi». Data e numero del documento sono di questo movimento soltanto; la frequenza e' della ripetizione.
const CAMPI_DEL_MODELLO: (keyof CampiForm)[] = ["importo", "eRetribuzione", "categoria", "retribuzione", "fornitore", "dipendente", "descrizione", "note", "sedeId"];

export function modificheDelModello(prima: CampiForm, dopo: CampiForm): boolean {
  return CAMPI_DEL_MODELLO.some((k) => prima[k] !== dopo[k]);
}

// La frequenza e' cambiata davvero? Si confrontano i valori effettivi: il giorno conta solo per mesi e anni, «Ogni mese» e' sempre ogni 1 mese.
export function frequenzaCambiata(prima: CampiForm, dopo: CampiForm): boolean {
  const effettiva = (c: CampiForm) => {
    const unita = unitaDi(c);
    return { unita, intervallo: c.frequenza === "MESE" ? 1 : Number(c.intervallo), giorno: usaIlGiornoDelMese(unita) ? Number(c.giorno) : 0 };
  };
  const a = effettiva(prima);
  const b = effettiva(dopo);
  return a.unita !== b.unita || a.intervallo !== b.intervallo || a.giorno !== b.giorno;
}

// L'unita' effettiva: «Ogni mese» e' sempre in mesi.
export function unitaDi(c: Pick<CampiForm, "frequenza" | "unita">): UnitaRipetizione {
  return c.frequenza === "MESE" ? "MESI" : c.unita;
}

// Riga «Ogni mese, il giorno 10» o «Ogni 2 settimane» per il riquadro «Dove finisce».
export function testoRipetizione(c: CampiForm): string | null {
  if (!c.ripeti || !ripetibile(c)) return null;
  const intervallo = c.frequenza === "MESE" ? 1 : Number(c.intervallo);
  return descriviFrequenza({
    unita: unitaDi(c),
    intervallo: Number.isInteger(intervallo) && intervallo >= 1 ? intervallo : 1,
    giorno: Number(c.giorno) || 1,
  });
}
