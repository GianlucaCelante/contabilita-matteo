// Il nome del programma, come lo legge chi lo usa: scheda del browser, app sul telefono, file esportati.
// «Fuorigioco» sa di calcio, come la schermata della password: chi legge il nome non pensa a conti e fatture.
// Si cambia qui e nei posti che non possono importare questo file: `index.html` e `public/manifest.webmanifest`
// (nomeProgramma.test.ts li controlla), `NomeProgramma.java` per il servizio, e gli installer: l'elenco e' in
// installer/README.md, «Nome mostrato e nomi tecnici».
// I nomi tecnici NON seguono: le chiavi `contabilita.*` del browser, il package, la cartella dei dati, il servizio Windows.
export const NOME_PROGRAMMA = "Fuorigioco";

// L'inizio del nome dei file esportati («fuorigioco-2026-01-01_2026-01-31.xlsx»): senza maiuscole ne' accenti.
export const PREFISSO_FILE = "fuorigioco";
