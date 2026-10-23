import type { Documento, Movimento, MovimentoInput, Tipo } from "../api/tipi";
import { dataValida, euroPerCampo, leggiEuro, oggiIso } from "./formato";

// I campi del modulo di un movimento, come testo digitato, e il passaggio da/verso il
// contratto API (docs/api.md, MovimentoInput).

export type VoceFissa = "RETRIBUZIONE" | "AFFITTO" | "UTENZE" | "ALTRA";

export interface CampiForm {
  tipo: Tipo;
  documentoVariabile: "FATTURA" | "SCONTRINO";
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

// Il menu «Voce fissa»: dopo le voci standard ci sono quelle create da chi usa l'app (le categorie dei costi fissi),
// poi «Nuova voce…». Le categorie standard e i doppioni (senza badare alle maiuscole) non si ripetono.
export const VALORE_NUOVA_VOCE = "nuova";
const PREFISSO_VOCE = "voce:";

export function vociPersonalizzate(nomiCategorie: string[]): string[] {
  const standard = new Set(Object.values(CATEGORIA_DI_VOCE).map((n) => (n ?? "").toLowerCase()));
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

export function valoreVocePropria(nome: string): string {
  return PREFISSO_VOCE + nome;
}
export function nomeDaValoreVoce(valore: string): string | null {
  return valore.startsWith(PREFISSO_VOCE) ? valore.slice(PREFISSO_VOCE.length) : null;
}

// Il valore che il menu mostra per i campi attuali. `nuova`: chi usa l'app ha scelto «Nuova voce…» (anche se poi scrive un nome già esistente).
export function valoreMenuVoce(voce: VoceFissa, categoria: string, proprie: string[], nuova: boolean): string {
  if (voce !== "ALTRA") return voce;
  if (nuova) return VALORE_NUOVA_VOCE;
  const nome = categoria.trim().toLowerCase();
  const trovata = proprie.find((p) => p.toLowerCase() === nome);
  return trovata ? valoreVocePropria(trovata) : VALORE_NUOVA_VOCE;
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
    documentoVariabile: m.documento === "SCONTRINO" ? "SCONTRINO" : "FATTURA",
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
  if (c.tipo === "COSTO_VARIABILE") return c.documentoVariabile === "FATTURA" ? "si" : "facoltativo";
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
  let giorno: number | null = null;
  if (conRipetizione && c.ripeti && ripetibile(c)) {
    giorno = Number(c.giorno);
    if (!Number.isInteger(giorno) || giorno < 1 || giorno > 31) errori.giorno = "Il giorno va da 1 a 31.";
  }
  if (Object.keys(errori).length > 0 || cent === null) return { errori, input: null };

  const input: MovimentoInput = { data: c.data, tipo: c.tipo, documento: documentoDi(c), importoCent: cent };
  const categoria = categoriaDi(c);
  if (categoria) input.categoria = categoria;
  if (chiedeFornitore(c) !== "no" && c.fornitore.trim()) input.fornitore = c.fornitore.trim();
  if (c.tipo === "COSTO_FISSO" && c.voceFissa === "RETRIBUZIONE" && c.dipendente.trim()) input.dipendente = c.dipendente.trim();
  if (c.tipo === "COSTO_VARIABILE" && c.documentoVariabile === "FATTURA" && c.numeroDocumento.trim()) input.numeroDocumento = c.numeroDocumento.trim();
  if (chiedeDescrizione(c) && c.descrizione.trim()) input.descrizione = c.descrizione.trim();
  if (c.note.trim()) input.note = c.note.trim();
  if (giorno !== null) input.ricorrenza = { giorno };
  return { errori, input };
}

// Riga «Ogni mese, il 10» per il riquadro «Dove finisce».
export function testoRipetizione(c: CampiForm): string | null {
  if (!c.ripeti || !ripetibile(c)) return null;
  return c.giorno ? `Ogni mese, il ${c.giorno}` : "Ogni mese";
}
