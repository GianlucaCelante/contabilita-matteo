import type { Documento, Movimento, Origine, Tipo } from "../api/tipi";

export const NOME_TIPO: Record<Tipo, string> = {
  RICAVO: "Ricavo",
  COSTO_VARIABILE: "Costo variabile",
  COSTO_FISSO: "Costo fisso",
};
// Le etichette corte della riga (e del filtro sul telefono).
export const TIPO_BREVE: Record<Tipo, string> = {
  RICAVO: "Ricavo",
  COSTO_VARIABILE: "Variabile",
  COSTO_FISSO: "Fisso",
};
export const CLASSE_TIPO: Record<Tipo, string> = {
  RICAVO: "ricavo",
  COSTO_VARIABILE: "variabile",
  COSTO_FISSO: "fisso",
};
export const NOME_DOCUMENTO: Record<Documento, string> = {
  RICAVO_FATTURATO: "Fatturato",
  RICAVO_EXTRA: "Extra",
  FATTURA: "Fattura",
  SCONTRINO: "Scontrino",
  RETRIBUZIONE_REGOLARE: "Regolare",
  RETRIBUZIONE_EXTRA: "Extra",
  NESSUNO: "",
};
export const NOME_ORIGINE: Record<Origine, string> = {
  MANO: "A mano",
  XML: "XML",
  RICORRENZA: "Ricorrente",
};

// Il nome principale di una riga: fornitore, altrimenti descrizione, dipendente, categoria.
export function nomeMovimento(m: Movimento): string {
  return m.fornitore?.nome || m.descrizione || (m.documento === "SCONTRINO" ? "Scontrini" : "") || m.dipendente?.nome || m.categoria?.nome || NOME_TIPO[m.tipo];
}

// Il sottotitolo: la categoria (se non e' gia' il nome) e il numero del documento o la nota.
export function sottotitoloMovimento(m: Movimento): string {
  const principale = nomeMovimento(m);
  const parti: string[] = [];
  if (m.categoria && m.categoria.nome !== principale) parti.push(m.categoria.nome);
  if (m.dipendente && m.dipendente.nome !== principale) parti.push(m.dipendente.nome);
  if (m.note) parti.push(m.note);
  return parti.join(" · ");
}

export function documentoConNumero(m: Movimento): string {
  const base = NOME_DOCUMENTO[m.documento];
  return m.numeroDocumento ? `${base} ${m.numeroDocumento}` : base;
}
