import type { Categoria, Tipo } from "../api/tipi";

// Il nome di una categoria: stessa regola del servizio (docs/api.md, «Anagrafiche»). Le categorie sono tutte dell'utente.

export const MASSIMO_NOME_CATEGORIA = 120;

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
