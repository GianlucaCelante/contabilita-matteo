import type { Categoria, Tipo } from "../api/tipi";

// Il filtro per categoria della lista Movimenti: gli id si scrivono nell'indirizzo («?categorie=3,7») e nel
// parametro del servizio nello stesso modo. Qui la logica pura, senza schermo.

type RifCategoria = Pick<Categoria, "id" | "nome" | "tipo">;

// «3,7» -> [3, 7]. Ignora i valori non numerici, i doppioni e gli zeri/negativi.
export function leggiIdCategorie(testo: string | null | undefined): number[] {
  if (!testo) return [];
  const visti = new Set<number>();
  for (const pezzo of testo.split(",")) {
    const t = pezzo.trim();
    if (!/^\d+$/.test(t)) continue;
    const n = Number(t);
    if (Number.isSafeInteger(n) && n > 0) visti.add(n);
  }
  return [...visti];
}

// [7, 3] -> «3,7» (ordinati, cosi' due scelte uguali danno lo stesso indirizzo e la stessa chiave di cache).
export function scriviIdCategorie(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}

// Le scelte che valgono davvero: la categoria esiste ancora (una salvata e poi eliminata si ignora) e, se in alto e' scelto
// un tipo, e' di quel tipo. Prima che l'elenco delle categorie arrivi (`tutte` indefinito) si tengono tutte.
export function idValidi(ids: readonly number[], tutte: readonly RifCategoria[] | undefined, tipo: Tipo | ""): number[] {
  if (!tutte) return [...ids];
  const per = new Map(tutte.map((c) => [c.id, c]));
  return ids.filter((id) => {
    const c = per.get(id);
    return !!c && (!tipo || c.tipo === tipo);
  });
}

// L'etichetta del pulsante: «Categoria», «Categoria: Ingredienti», «Categorie (2)».
export function etichettaFiltroCategorie(scelte: readonly RifCategoria[], quanteScelte: number = scelte.length): string {
  if (quanteScelte <= 0) return "Categoria";
  const [prima] = scelte;
  if (quanteScelte === 1 && scelte.length === 1 && prima) return `Categoria: ${prima.nome}`;
  return `Categorie (${quanteScelte})`;
}

export const GRUPPI_CATEGORIE: { tipo: Tipo; titolo: string }[] = [
  { tipo: "RICAVO", titolo: "Ricavi" },
  { tipo: "COSTO_VARIABILE", titolo: "Costi variabili" },
  { tipo: "COSTO_FISSO", titolo: "Costi fissi" },
];

// Le categorie da proporre nel foglio: filtrate per il testo cercato (senza badare alle maiuscole) e, se in alto e'
// scelto un tipo, solo quelle di quel tipo; raggruppate per tipo, in ordine alfabetico, senza gruppi vuoti.
export function gruppiCategorie<T extends RifCategoria>(tutte: readonly T[], tipo: Tipo | "", testo: string): { tipo: Tipo; titolo: string; categorie: T[] }[] {
  const cerca = testo.trim().toLowerCase();
  return GRUPPI_CATEGORIE.filter((g) => !tipo || g.tipo === tipo)
    .map((g) => ({
      ...g,
      categorie: tutte
        .filter((c) => c.tipo === g.tipo && c.nome.toLowerCase().includes(cerca))
        .sort((a, b) => a.nome.localeCompare(b.nome, "it")),
    }))
    .filter((g) => g.categorie.length > 0);
}

// Aggiunge o toglie una categoria dalla scelta.
export function alternaCategoria(ids: readonly number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
