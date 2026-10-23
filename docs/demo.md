# Demo per GitHub Pages

Una versione dell'app che gira **tutta nel browser**, con dati di prova inventati (nessun dato vero, nessun servizio). Serve per far vedere design e funzioni, anche da iPhone.

- Si costruisce con `npm run build:demo` (in `ui/`): modalità `demo` di Vite (`ui/.env.demo`, `VITE_DEMO=1`), cartella `ui/dist-demo/` (ignorata da git), percorsi relativi e router con `#` perché la pagina sta in una sottocartella di GitHub Pages.
- Il «servizio» finto è in `ui/src/demo/`: `installa.ts` intercetta le chiamate `/api/...`, `backend.ts` le gestisce con gli stessi contratti di [`api.md`](api.md), `stato.ts` genera i dati di prova (circa cinque mesi, rigenerati ogni giorno) e li ricorda nel browser (`localStorage`), `xlsx.ts` costruisce il file Excel.
- L'app vera non cambia: il codice della demo non entra nella build normale.
- **Non disponibili nella demo** (rispondono con un messaggio): allegati, copie di sicurezza e ripristino. L'importazione non legge i file scelti: mostra sempre le stesse fatture di esempio (pulsante «Prova con fatture di esempio»).

## Pubblicare

La demo sta nel ramo `gh-pages` (solo i file costruiti), servito da GitHub Pages: `https://gianlucacelante.github.io/contabilita-matteo/`.

```
cd ui && npm run build:demo
# poi copiare il contenuto di ui/dist-demo nel ramo gh-pages (radice) e fare il push
```
