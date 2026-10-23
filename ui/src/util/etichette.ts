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
  NOTA_DI_CREDITO: "Nota di credito",
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

// Quando non c'e' fornitore ne' descrizione il titolo dice cosa e' la riga (come nel mockup).
const TITOLO_SENZA_NOME: Partial<Record<Documento, string>> = {
  RICAVO_FATTURATO: "Incassi fatturati",
  RICAVO_EXTRA: "Incassi extra",
  SCONTRINO: "Scontrini",
};
const SOTTOTITOLO_SENZA_NOME: Partial<Record<Documento, string>> = {
  RICAVO_EXTRA: "Non fatturati",
  SCONTRINO: "Totale inserito a mano",
};

// Il nome principale di una riga: fornitore, altrimenti descrizione, poi il titolo del tipo di documento, dipendente, categoria.
export function nomeMovimento(m: Movimento): string {
  return m.fornitore?.nome || m.descrizione || TITOLO_SENZA_NOME[m.documento] || m.dipendente?.nome || m.categoria?.nome || NOME_TIPO[m.tipo];
}

// Il sottotitolo: la spiegazione del titolo generico, la categoria (se non e' gia' il nome) e la nota.
export function sottotitoloMovimento(m: Movimento): string {
  const principale = nomeMovimento(m);
  const parti: string[] = [];
  if (!m.fornitore?.nome && !m.descrizione) {
    const spiegazione = SOTTOTITOLO_SENZA_NOME[m.documento];
    if (spiegazione) parti.push(spiegazione);
  }
  if (m.categoria && m.categoria.nome !== principale) parti.push(m.categoria.nome);
  if (m.dipendente && m.dipendente.nome !== principale) parti.push(m.dipendente.nome);
  if (m.note) parti.push(m.note);
  return parti.join(" · ");
}

// Il movimento fa salire il saldo: un ricavo, oppure una nota di credito ricevuta (riduce i costi).
export function aumentaIlSaldo(m: Movimento): boolean {
  return m.tipo === "RICAVO" || m.documento === "NOTA_DI_CREDITO";
}

export function documentoConNumero(m: Movimento): string {
  const base = NOME_DOCUMENTO[m.documento];
  return m.numeroDocumento ? `${base} ${m.numeroDocumento}` : base;
}

// Il sottotitolo di riga sul telefono: il documento si accorcia con i puntini se e' troppo lungo, il tipo resta sempre intero.
export function sottotitoloTelefono(m: Movimento): { documento: string; tipo: string } {
  return { documento: documentoConNumero(m), tipo: TIPO_BREVE[m.tipo] };
}
