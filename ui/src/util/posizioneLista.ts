// Dove eri nella lista dei Movimenti, per ritrovarla uguale quando esci dal dettaglio (o da «Nuovo movimento»):
// la posizione di scorrimento e il testo cercato. Si azzera quando si va in un'altra sezione.
export const posizioneLista = { scroll: 0, ricerca: "" };

export function azzeraPosizioneLista() {
  posizioneLista.scroll = 0;
  posizioneLista.ricerca = "";
}

// Il percorso della lista e quello delle sue pagine (dettaglio, nuovo, importa).
export const inMovimenti = (percorso: string) => percorso === "/movimenti" || percorso.startsWith("/movimenti/");
