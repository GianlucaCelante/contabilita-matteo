import type { Documento, Movimento, MovimentoInput, Tipo } from "../api/tipi";
import { dataValida, euroPerCampo, leggiEuro, oggiIso } from "./formato";
import { descriviFrequenza, MASSIMO_INTERVALLO, nomeUnita, usaIlGiornoDelMese, type UnitaRipetizione } from "./ripetizione";

// I campi del modulo di un movimento, come testo digitato, e il passaggio da/verso il
// contratto API (docs/api.md, MovimentoInput).

export type VoceFissa = "RETRIBUZIONE" | "AFFITTO" | "UTENZE" | "ALTRA";

export interface CampiForm {
  tipo: Tipo;
  documentoVariabile: "FATTURA" | "NOTA_DI_CREDITO" | "SCONTRINO";
  tipoRicavo: "RICAVO_FATTURATO" | "RICAVO_EXTRA";
  voceFissa: VoceFissa;
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
  ripeti: boolean;
  // «Ogni mese» (il caso comune: serve solo il giorno) oppure «Personalizzata» (ogni N giorni, settimane, mesi o anni).
  frequenza: "MESE" | "PERSONALIZZATA";
  intervallo: string;
  unita: UnitaRipetizione;
  // Il giorno del mese: serve per «Ogni mese» e per la personalizzata in mesi o anni.
  giorno: string;
}

export type Errori = Partial<Record<keyof CampiForm, string>>;

export const NOME_VOCE: Record<VoceFissa, string> = {
  RETRIBUZIONE: "Retribuzione",
  AFFITTO: "Affitto",
  UTENZE: "Utenze",
  ALTRA: "Altra voce fissa",
};
// Per queste voci la categoria e' la voce stessa (non si chiede).
const CATEGORIA_DI_VOCE: Partial<Record<VoceFissa, string>> = {
  RETRIBUZIONE: "Retribuzione",
  AFFITTO: "Affitto",
  UTENZE: "Utenze",
};

// La voce fissa e' un campo solo: si scrive il nome, o si sceglie fra Retribuzione, Affitto, Utenze e le voci create da chi
// usa l'app (le categorie dei costi fissi). Un nome nuovo crea una voce nuova al salvataggio.
const NOMI_STANDARD = (["RETRIBUZIONE", "AFFITTO", "UTENZE"] as const).map((v) => ({ voce: v, nome: NOME_VOCE[v] }));

// Le voci proprie: le categorie dei costi fissi senza le standard e i doppioni (senza badare alle maiuscole).
export function vociPersonalizzate(nomiCategorie: string[]): string[] {
  const standard = new Set(NOMI_STANDARD.map((s) => s.nome.toLowerCase()));
  const viste = new Set<string>();
  const risultato: string[] = [];
  for (const grezzo of nomiCategorie) {
    const nome = grezzo.trim();
    const chiave = nome.toLowerCase();
    if (!nome || standard.has(chiave) || viste.has(chiave)) continue;
    viste.add(chiave);
    risultato.push(nome);
  }
  return risultato.sort((a, b) => a.localeCompare(b, "it"));
}

// Il testo del campo «Voce fissa».
export function nomeVoce(c: Pick<CampiForm, "voceFissa" | "categoria">): string {
  return c.voceFissa === "ALTRA" ? c.categoria : NOME_VOCE[c.voceFissa];
}

// Dal testo scritto ai campi: le voci standard si riconoscono dal nome, ogni altro nome e' una voce propria.
export function campiDaNomeVoce(testo: string): Pick<CampiForm, "voceFissa" | "categoria"> {
  const standard = NOMI_STANDARD.find((s) => s.nome.toLowerCase() === testo.trim().toLowerCase());
  return standard ? { voceFissa: standard.voce, categoria: "" } : { voceFissa: "ALTRA", categoria: testo };
}

// I suggerimenti: tutte le voci se il campo e' vuoto o contiene gia' un nome completo (per poter cambiare scelta), altrimenti quelle che contengono il testo.
export function opzioniVoce(testo: string, proprie: string[]): string[] {
  const tutte = [...NOMI_STANDARD.map((s) => s.nome), ...proprie];
  const cerca = testo.trim().toLowerCase();
  if (!cerca || tutte.some((n) => n.toLowerCase() === cerca)) return tutte;
  return tutte.filter((n) => n.toLowerCase().includes(cerca));
}

export function campiVuoti(): CampiForm {
  return {
    tipo: "COSTO_VARIABILE",
    documentoVariabile: "FATTURA",
    tipoRicavo: "RICAVO_FATTURATO",
    voceFissa: "RETRIBUZIONE",
    retribuzione: "REGOLARE",
    data: oggiIso(),
    importo: "",
    fornitore: "",
    categoria: "",
    dipendente: "",
    numeroDocumento: "",
    descrizione: "",
    note: "",
    ripeti: false,
    frequenza: "MESE",
    intervallo: "1",
    unita: "MESI",
    giorno: "",
  };
}

export function daMovimento(m: Movimento): CampiForm {
  const base = campiVuoti();
  let voce: VoceFissa = "ALTRA";
  if (m.documento === "RETRIBUZIONE_REGOLARE" || m.documento === "RETRIBUZIONE_EXTRA") voce = "RETRIBUZIONE";
  else if (m.categoria?.nome.toLowerCase() === "affitto") voce = "AFFITTO";
  else if (m.categoria?.nome.toLowerCase() === "utenze") voce = "UTENZE";
  return {
    ...base,
    tipo: m.tipo,
    documentoVariabile: m.documento === "SCONTRINO" ? "SCONTRINO" : m.documento === "NOTA_DI_CREDITO" ? "NOTA_DI_CREDITO" : "FATTURA",
    tipoRicavo: m.documento === "RICAVO_EXTRA" ? "RICAVO_EXTRA" : "RICAVO_FATTURATO",
    voceFissa: voce,
    retribuzione: m.documento === "RETRIBUZIONE_EXTRA" ? "EXTRA" : "REGOLARE",
    data: m.data,
    importo: euroPerCampo(m.importoCent),
    fornitore: m.fornitore?.nome ?? "",
    categoria: m.categoria?.nome ?? "",
    dipendente: m.dipendente?.nome ?? "",
    numeroDocumento: m.numeroDocumento ?? "",
    descrizione: m.descrizione ?? "",
    note: m.note ?? "",
    ripeti: m.ricorrenza?.attiva ?? false,
    frequenza: m.ricorrenza && !(m.ricorrenza.unita === "MESI" && m.ricorrenza.intervallo === 1) ? "PERSONALIZZATA" : "MESE",
    intervallo: String(m.ricorrenza?.intervallo ?? 1),
    unita: m.ricorrenza?.unita ?? "MESI",
    giorno: m.ricorrenza ? String(m.ricorrenza.giorno) : "",
  };
}

export function documentoDi(c: CampiForm): Documento {
  if (c.tipo === "RICAVO") return c.tipoRicavo;
  if (c.tipo === "COSTO_VARIABILE") return c.documentoVariabile;
  if (c.voceFissa === "RETRIBUZIONE") return c.retribuzione === "EXTRA" ? "RETRIBUZIONE_EXTRA" : "RETRIBUZIONE_REGOLARE";
  return "NESSUNO";
}

// La ripetizione mensile e' solo dei costi fissi, e non della retribuzione extra.
export function ripetibile(c: CampiForm): boolean {
  return c.tipo === "COSTO_FISSO" && documentoDi(c) !== "RETRIBUZIONE_EXTRA";
}

// La categoria che verra' mandata (la voce fissa ha la sua; ricavi: nessuna).
export function categoriaDi(c: CampiForm): string {
  if (c.tipo === "RICAVO") return "";
  if (c.tipo === "COSTO_FISSO") return CATEGORIA_DI_VOCE[c.voceFissa] ?? c.categoria.trim();
  return c.categoria.trim();
}

export function chiedeFornitore(c: CampiForm): "si" | "facoltativo" | "no" {
  if (c.tipo === "COSTO_VARIABILE") return c.documentoVariabile === "SCONTRINO" ? "facoltativo" : "si";
  if (c.tipo === "COSTO_FISSO" && c.voceFissa !== "RETRIBUZIONE") return "facoltativo";
  return "no";
}
// La descrizione (facoltativa) c'e' per ricavi, costi fissi e scontrini.
export function chiedeDescrizione(c: CampiForm): boolean {
  return c.tipo !== "COSTO_VARIABILE" || c.documentoVariabile === "SCONTRINO";
}
export function chiedeCategoria(c: CampiForm): boolean {
  return c.tipo === "COSTO_VARIABILE" || (c.tipo === "COSTO_FISSO" && c.voceFissa === "ALTRA");
}

// Controlla i campi e, se vanno bene, prepara il corpo per il servizio.
// `conRipetizione`: se false la ripetizione non e' gestita da qui (dettaglio).
export function preparaInput(c: CampiForm, conRipetizione: boolean): { errori: Errori; input: MovimentoInput | null } {
  const errori: Errori = {};
  if (!dataValida(c.data)) errori.data = "Scrivi una data valida.";
  const cent = leggiEuro(c.importo);
  if (cent === null) errori.importo = "Scrivi un importo, per esempio 86,00.";
  else if (cent <= 0) errori.importo = "L'importo deve essere maggiore di zero.";
  if (chiedeFornitore(c) === "si" && !c.fornitore.trim()) errori.fornitore = "Scegli o crea un fornitore.";
  if (c.tipo === "COSTO_FISSO" && c.voceFissa === "ALTRA" && !c.categoria.trim()) errori.categoria = "Scegli una voce o scrivine una nuova.";
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
  if (c.tipo === "COSTO_FISSO" && c.voceFissa === "RETRIBUZIONE" && c.dipendente.trim()) input.dipendente = c.dipendente.trim();
  if (c.tipo === "COSTO_VARIABILE" && c.documentoVariabile !== "SCONTRINO" && c.numeroDocumento.trim()) input.numeroDocumento = c.numeroDocumento.trim();
  if (chiedeDescrizione(c) && c.descrizione.trim()) input.descrizione = c.descrizione.trim();
  if (c.note.trim()) input.note = c.note.trim();
  if (ripetizione !== null) input.ricorrenza = ripetizione;
  return { errori, input };
}

// Sono cambiati dati che finirebbero nei prossimi movimenti (importo, voce, fornitore...)? Allora al salvataggio si chiede
// «solo questo o anche i prossimi». Data e numero del documento sono di questo movimento soltanto; la frequenza e' della ripetizione.
const CAMPI_DEL_MODELLO: (keyof CampiForm)[] = ["importo", "voceFissa", "categoria", "retribuzione", "fornitore", "dipendente", "descrizione", "note"];

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
