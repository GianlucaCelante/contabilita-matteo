import type { Categoria, Tipo, VoceRiepilogo } from "../api/tipi";

// Le categorie create da chi usa l'app («Tua») e il loro nome: stessa regola del servizio (docs/api.md, «Anagrafiche»).

export const MASSIMO_NOME_CATEGORIA = 120;

// «Dove conta nel riepilogo» di un costo nuovo.

// Spazi ai bordi tolti e spazi interni ridotti a uno (cosi' «Pulizia  forno» e «Pulizia forno» sono lo stesso nome).
export function normalizzaNome(nome: string): string {
  return nome.trim().replace(/\s+/g, " ");
}

// Il messaggio per un nome non valido, null se va bene (il nome si conta dopo la normalizzazione).
export function erroreNome(nome: string): string | null {
  const n = normalizzaNome(nome);
  if (!n) return "Scrivi il nome della categoria.";
  if (n.length > MASSIMO_NOME_CATEGORIA) return `Il nome può avere al massimo ${MASSIMO_NOME_CATEGORIA} caratteri.`;
  return null;
}

type RifCategoria = Pick<Categoria, "id" | "nome" | "tipo">;

// La categoria dello stesso tipo con questo nome (senza badare alle maiuscole), se c'e'. `escludiId` serve alla rinomina: una
// categoria non e' un doppione di se stessa.
export function trovaDoppione(nome: string, lista: RifCategoria[], tipo: Tipo, escludiId?: number): RifCategoria | undefined {
  const chiave = normalizzaNome(nome).toLowerCase();
  return lista.find((c) => c.tipo === tipo && c.id !== escludiId && normalizzaNome(c.nome).toLowerCase() === chiave);
}

// I nomi (minuscoli) delle categorie «Tua», per riconoscerle nei suggerimenti senza badare alle maiuscole.
export function nomiTue(lista: Pick<Categoria, "nome" | "personalizzata">[]): Set<string> {
  return new Set(lista.filter((c) => c.personalizzata).map((c) => c.nome.trim().toLowerCase()));
}

export function eTua(nome: string, tue: ReadonlySet<string> | undefined): boolean {
  return !!tue && tue.has(nome.trim().toLowerCase());
}

// Costi fissi nel Riepilogo sul telefono: le voci «Tua» hanno la loro riga, le altre (Affitto, Utenze, ...) stanno in una riga sola.
export function dividiVociFisse(voci: VoceRiepilogo[], tue: ReadonlySet<string>): { tue: VoceRiepilogo[]; altre: VoceRiepilogo[]; sommaAltre: number } {
  const proprie = voci.filter((v) => tue.has(v.categoria.trim().toLowerCase()));
  const altre = voci.filter((v) => !proprie.includes(v));
  return { tue: proprie, altre, sommaAltre: altre.reduce((s, v) => s + v.importoCent, 0) };
}
