// Lo stile comune delle schede di Impostazioni (Sedi, Elenchi, Password, Dal telefono, Dati e copie): stessi titoli, stessi
// paragrafi introduttivi, stessa interlinea e pulsanti tutti alti 44 px con gli stessi angoli e lo stesso testo.

// Titolo della scheda: sotto ha sempre 8 px, con o senza paragrafo introduttivo.
export const TITOLO_SCHEDA = "m-0 mb-2 text-[20px] font-bold leading-tight";
// Paragrafo sotto il titolo della scheda.
export const TESTO_INTRO = "m-0 mb-4 max-w-[60ch] text-[14px] leading-[1.45] text-tenue";
// Testo corrente dentro una scheda (messaggi, spiegazioni).
export const TESTO_SCHEDA = "m-0 text-[14px] leading-[1.45] text-tenue";
// Una riga con un titolo e una riga di dettaglio sotto.
export const TITOLO_RIGA = "text-[16px] font-bold leading-snug";
export const DETTAGLIO_RIGA = "text-[13px] leading-[1.4] text-spento";
// Pulsante dentro una riga: 44 px di altezza, angoli 10 px, testo 14 px.
export const BOTTONE_RIGA = "btn !min-h-[44px] !rounded-[10px] !px-4 !text-[14px] shrink-0";
// Pulsante unico di una riga a una colonna: tutti larghi uguale, per non farli ballare da una riga all'altra.
export const BOTTONE_RIGA_LARGO = `${BOTTONE_RIGA} !w-[112px]`;
