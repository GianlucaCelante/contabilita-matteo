// Dove eri in una lista, per ritrovarla uguale quando torni dalla pagina che hai aperto da li': la posizione di scorrimento
// (una per lista, per percorso: i filtri nell'indirizzo possono cambiare mentre ci sei) e il testo cercato nei Movimenti.
// `listeDeiDettagli`: per ogni dettaglio di una voce (indirizzo completo) la lista «Per voce» da cui si e' arrivati, cosi' la freccia
// riporta a quella (stesso periodo, stesso mese scelto) anche tornando da un movimento con «Annulla», che non porta lo stato.
export const posizioneLista = { scorrimenti: new Map<string, number>(), ricerca: "", listeDeiDettagli: new Map<string, string>() };

// Il percorso della lista dei Movimenti e quello delle sue pagine (dettaglio, nuovo, importa).
export const inMovimenti = (percorso: string) => percorso === "/movimenti" || percorso.startsWith("/movimenti/");

const paginaDiMovimento = (percorso: string) => percorso.startsWith("/movimenti/");

// Le liste che ricordano lo scorrimento e, per ognuna, le pagine «figlie»: quelle da cui tornando si riparte da dove si era.
const LISTE = new Map<string, (percorso: string) => boolean>([
  ["/movimenti", paginaDiMovimento],
  ["/statistiche/voci", (p) => p === "/statistiche/voci/dettaglio" || paginaDiMovimento(p)],
  ["/statistiche/voci/dettaglio", paginaDiMovimento],
  ["/statistiche/fatture", paginaDiMovimento],
]);

export const ricordaLoScorrimento = (percorso: string) => LISTE.has(percorso);

// Cosa succede allo scorrimento passando da una vista all'altra:
// - `ripristina`: si arriva a una lista da una sua figlia, si riparte da dove si era (altrimenti dall'alto);
// - `dimentica`: le liste di cui la posizione non serve piu': tutte quelle di cui la vista nuova non e' una figlia
//   (si e' usciti dal loro giro) e quella in cui si entra da capo.
export function cambioDiVista(prima: string, dopo: string): { ripristina: boolean; dimentica: string[] } {
  const ripristina = LISTE.get(dopo)?.(prima) ?? false;
  const dimentica: string[] = [];
  for (const [lista, figlia] of LISTE) {
    if (lista === dopo ? !ripristina : !figlia(dopo)) dimentica.push(lista);
  }
  return { ripristina, dimentica };
}
