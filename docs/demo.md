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

## Sedi nella demo

La demo parte con tre sedi inventate (Via Roma, Lungomare, Mercato) e movimenti plausibili per ciascuna, così selettore, «Per sede» e «Tutte, dividi» si vedono subito. Il servizio finto (`ui/src/demo/backend.ts`) segue il contratto delle sedi di [`api.md`](api.md): `/api/sedi`, filtro `sedi`, `perSede` nel riepilogo, `/api/movimenti/dividi` (resto ai primi), `sedeId` in creazione, modifica e importazione, colonna «Sede» nell'esportazione. Archiviando le sedi fino a lasciarne una sola l'app torna identica a prima. I dati salvati nel browser hanno la chiave `contabilita-demo-v5`: chi aveva la demo di prima riparte dai nuovi dati di prova.

## Statistiche nella demo

Il servizio finto risponde anche a `GET`/`PUT /api/statistiche/settimana` e `GET /api/statistiche`, con le regole di [`api.md`](api.md): settimana lunedì–domenica, nelle somme solo le coppie sede-settimana con dati e ordini > 0, `sediMancanti`, scontrino medio al centesimo (mezzo in su), pizze per ordine a due decimali, stessi errori 400 e tutto o niente. Dati di prova inventati: sette settimane intere per le tre sedi (una con il Lungomare mancante, cinque settimane fa) e la settimana in corso con il Mercato ancora da inserire, così il banner «Manca la settimana…» si vede subito. Gli ordini si ricavano dagli incassi e da uno scontrino tipico per sede (circa 20 € Via Roma, 24 € Lungomare, 17 € Mercato), le pizze da un numero tipico di pizze per ordine. L'Excel finto ha anche il foglio «Statistiche» (solo se nel periodo c'è almeno un dato); il CSV no.

I dati di partenza sono pensati per mostrare **risultati in positivo**: ogni sede ha un giorno di chiusura diverso (Via Roma il martedì, Lungomare il mercoledì, Mercato la domenica), le retribuzioni sono **settimanali** (il sabato, sei dipendenti) e non più mensili, e affitto e bollette cadono in giorni scelti all'indietro da oggi (almeno 18 giorni fa), così non finiscono mai nella settimana in corso né in quella scorsa. Un test (`ui/src/demo/statistiche.test.ts`) simula 62 giorni di partenza diversi e controlla che settimana in corso, settimana scorsa e mese (dall'8 del mese) siano in positivo per ogni sede. Nei primissimi giorni del mese il risultato del mese può essere piccolo o in rosso (poche vendite e una fattura bastano): per questo il test controlla il mese dall'8. A inizio settimana il risultato è piccolo ma positivo nei casi provati; la settimana in corso è più alta della media perché le paghe arrivano il sabato.

## Categorie personalizzate nella demo

Il servizio finto segue il contratto delle categorie di [`api.md`](api.md): `personalizzata` in `GET /api/categorie`, `POST` (201, o 200 se il nome esiste già nello stesso tipo), `PUT /api/categorie/{id}` che rinomina solo le personalizzate (409 per le predefinite e per un nome già usato; la rinomina segue anche movimenti e ripetizioni) e `altreVoci` per ricavi e costi variabili nel riepilogo: i movimenti con categoria personalizzata stanno solo nella riga della loro categoria, la nota di credito la riduce (anche sotto zero), i totali e `perSede` non cambiano, il filtro `sedi` vale come sempre. Una categoria nata al volo da un movimento è personalizzata. Dati di partenza (nomi inventati): ricavi **Delivery** (quasi ogni giorno) ed **Eventi** (una serata ogni due settimane), costi variabili **Imballaggi** (fornitura del sabato) e **Pulizia** (scontrini occasionali), costo fisso **Commercialista** (mensile); le categorie dei fornitori restano predefinite (l'ex «Imballaggi» dei fornitori ora è «Carta e contenitori»). Importi piccoli rispetto agli incassi: i risultati restano positivi (test in `statistiche.test.ts`). Test: `ui/src/demo/categorie.test.ts`. Chiave dei dati salvati alzata a `contabilita-demo-v5`.

L'esportazione Excel della demo rispetta le opzioni del servizio: `colonnePerSede=true` scrive nel foglio «Riepilogo» una colonna per sede più «Totale», `statistiche=false` toglie il foglio «Statistiche» (il CSV le ignora).

Il servizio finto rispetta anche il filtro `categorie` di `GET /api/movimenti` (`?categorie=3,7`: id separati da virgola, in AND con periodo, tipo, sedi e ricerca; i movimenti senza categoria restano fuori; i totali seguono l'elenco filtrato; valori non numerici ignorati). Test in `ui/src/demo/backend.test.ts`. I dati non cambiano forma: la chiave resta `contabilita-demo-v5`.
