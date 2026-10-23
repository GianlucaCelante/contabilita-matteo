# API del servizio (contratto, fase 1)

Fonte di verità condivisa tra servizio (`src/`) e interfaccia (`ui/`). Base: `/api`, porta 8766. Nessun login. Le schermate sono descritte in [`interfaccia.md`](interfaccia.md).

## Convenzioni

- JSON UTF-8. Nomi dei campi in italiano, camelCase.
- **Importi in centesimi interi** (`long`, sempre positivi: il segno lo dà il tipo). Campi con suffisso `Cent`.
- Date `yyyy-MM-dd` (ISO), nessun fuso.
- Errori: stato 400 (richiesta non valida), 404, 409 (conflitto) con corpo `{"errore": "messaggio in italiano"}`.
- Enum in MAIUSCOLO.

## Enum

| Enum | Valori |
|---|---|
| `Tipo` | `RICAVO`, `COSTO_VARIABILE`, `COSTO_FISSO` |
| `Documento` | `RICAVO_FATTURATO`, `RICAVO_EXTRA`, `FATTURA`, `NOTA_DI_CREDITO`, `SCONTRINO`, `RETRIBUZIONE_REGOLARE`, `RETRIBUZIONE_EXTRA`, `NESSUNO` |
| `Origine` | `MANO`, `XML`, `RICORRENZA` |
| `Ambito` | `SOLO_QUESTO`, `QUESTO_E_PROSSIMI` |

Combinazioni valide `Tipo` → `Documento`: `RICAVO` → `RICAVO_FATTURATO` o `RICAVO_EXTRA`; `COSTO_VARIABILE` → `FATTURA`, `NOTA_DI_CREDITO` o `SCONTRINO`; `COSTO_FISSO` → `RETRIBUZIONE_REGOLARE`, `RETRIBUZIONE_EXTRA` o `NESSUNO`. Altre combinazioni: 400.

**Nota di credito** (`COSTO_VARIABILE` + `NOTA_DI_CREDITO`, come nel progetto del ristorante): l'`importoCent` resta positivo, ma la nota **riduce** i costi: nei totali di `GET /api/movimenti`, nel Riepilogo (riga «Fatture»: fatture − note) e nell'esportazione (dove i costi sono negativi e la nota è positiva). Ha fornitore, categoria e numero come una fattura; arriva dall'importazione (a mano non la offre l'interfaccia, ma l'API la accetta).

## Anagrafiche (creazione al volo)

- `GET /api/categorie?tipo=COSTO_VARIABILE` → `[{id, nome, tipo}]` (`tipo` facoltativo; la categoria ha un `Tipo`).
- `GET /api/fornitori?q=` → `[{id, nome, partitaIva}]` (`q` filtra per nome, senza distinguere maiuscole). Ordine: con `q` prima chi inizia col testo, poi chi lo contiene; dentro ogni gruppo i più usati (numero di movimenti), a parità alfabetico. Senza `q`: i più usati.
- `GET /api/dipendenti?q=` → `[{id, nome}]`.
- `POST /api/categorie` `{nome, tipo}`, `POST /api/fornitori` `{nome, partitaIva?}`, `POST /api/dipendenti` `{nome}` → 201 con l'oggetto creato; se esiste già (stesso nome senza distinguere maiuscole, e per le categorie stesso `tipo`) → 200 con quello esistente.

Anche il salvataggio di un movimento crea al volo categoria, fornitore e dipendente dal solo nome (vedi sotto): l'interfaccia non deve fare una POST separata.

## Movimenti

Oggetto `Movimento` (risposta):

```
{ id, data, tipo, documento, importoCent,
  categoria: {id, nome} | null,
  fornitore: {id, nome} | null,
  dipendente: {id, nome} | null,
  descrizione, numeroDocumento, note,
  origine,
  ricorrenza: {id, giorno, attiva, unita, intervallo, prossimaData} | null,
  allegatoNome | null }
```

Corpo di creazione/modifica (`MovimentoInput`):

```
{ data, tipo, documento, importoCent,
  categoria?: "nome", fornitore?: "nome", dipendente?: "nome",   // creati al volo se non esistono
  descrizione?, numeroDocumento?, note?,
  ricorrenza?: { giorno?: 1..31, unita?: "GIORNI"|"SETTIMANE"|"MESI"|"ANNI", intervallo?: n } | null }   // senza unita e intervallo: ogni mese
```

- `GET /api/movimenti?da=&a=&tipo=&q=&dipendente=` → `{elementi: [Movimento], totali: {ricaviCent, costiCent, saldoCent}}`, ordinati per `data` decrescente poi `id` decrescente. `da`/`a` inclusivi, facoltativi. `q` cerca in fornitore, descrizione, note. `dipendente` è l'id.
- `GET /api/movimenti/{id}` → `Movimento`.
- `POST /api/movimenti` `MovimentoInput` → 201 `Movimento` (`origine = MANO`).
- `PUT /api/movimenti/{id}?ambito=SOLO_QUESTO` `MovimentoInput` → `Movimento`. Con `ambito=QUESTO_E_PROSSIMI` su un movimento ricorrente, la modifica aggiorna anche il modello della ricorrenza (importo, categoria, fornitore, dipendente, descrizione, note, giorno): le prossime occorrenze lo useranno. Il `giorno` ricorrente si cambia solo con questo ambito.
- `DELETE /api/movimenti/{id}?ambito=SOLO_QUESTO` → 204. Con `QUESTO_E_PROSSIMI` elimina questo e ferma la ricorrenza (`attiva = false`).
- `POST /api/ricorrenze/{id}/ferma` → 204 (le occorrenze già registrate restano).
- `POST /api/ricorrenze/{id}/riattiva` → 204: una ripetizione ferma torna attiva e riparte dalla **prossima scadenza futura**, senza recuperare quelle cadute mentre era ferma. Già attiva: non fa nulla. Inesistente: 404.

### Ricorrenze

- Un movimento creato con `ricorrenza: {...}` genera una ripetizione: il movimento è la prima occorrenza, i suoi campi sono il modello. La frequenza è «ogni `intervallo` `unita`» con `unita` = `GIORNI`, `SETTIMANE`, `MESI` o `ANNI`; senza `unita` e `intervallo` vale **ogni mese** (`{giorno}` come prima). `intervallo` va da 1 a 365 (giorni), 104 (settimane), 60 (mesi), 10 (anni): 400 con «Ogni quanto: da 1 a N …».
- `giorno` (1..31) è obbligatorio per mesi e anni (nei mesi più corti diventa l'ultimo giorno del mese; per gli anni il mese è quello della data del movimento) e si ignora per giorni e settimane, che contano dalla data del movimento.
- Le occorrenze successive si registrano da sole come movimenti con `origine = RICORRENZA`, senza conferma, a ogni scadenza. Un controllo giornaliero (03:05) e uno all'avvio recuperano anche le scadenze saltate, solo fino a oggi. Idempotente: il generatore non crea un'occorrenza se per quella ripetizione e quella data ce n'è già una; una occorrenza eliminata a mano non si ricrea.
- **Frequenza e dati sono separati.** `ambito` decide solo se i dati di questo movimento (importo, voce, fornitore…) diventano il modello dei prossimi (`QUESTO_E_PROSSIMI`) o no (`SOLO_QUESTO`). La `ricorrenza` nel corpo di un `PUT` (frequenza, giorno) cambia **sempre** la ripetizione, con qualunque ambito: vale dalla prossima scadenza ancora da registrare (per mesi e anni resta lo stesso mese col nuovo giorno). `prossimaData` nella risposta è quella scadenza.
- Fermare (`ferma` o `DELETE` con `QUESTO_E_PROSSIMI`) e riattivare (`riattiva`) sono separati; la riattivazione non recupera i periodi in cui era ferma.
- `RETRIBUZIONE_EXTRA` non può essere ricorrente: 400.

## Riepilogo

`GET /api/riepilogo?da=&a=` (entrambi obbligatori) →

```
{ da, a,
  ricavi:        { fatturatiCent, extraCent, totaleCent },
  costiVariabili:{ fattureCent, scontriniCent, totaleCent },
  costiFissi:    { retribuzioneRegolareCent, retribuzioneExtraCent,
                   altreVoci: [{categoria, importoCent}], totaleCent },
  costiCent, risultatoCent }
```

`altreVoci` raggruppa i costi fissi con `documento = NESSUNO` per categoria (senza categoria: «Altre voci fisse»). `costiCent` = variabili + fissi; `risultatoCent` = ricavi − costi (può essere negativo).

## Programma, rete, impostazioni

- `GET /api/versione` → `{versione}`.
- `GET /api/impostazioni` → `{chiave: valore}`; `PUT /api/impostazioni` con una mappa parziale → la mappa aggiornata.
- `GET /api/rete` → `{porta, indirizzi: [{ip, tipo}]}` (`tipo`: `WIFI`, `CAVO`, `ALTRO`); `GET /api/rete/qr.png?ip=` → PNG con il QR di `http://ip:porta/`.
- `GET /api/programma` → `{versione, cartellaBackup, cartellaPredefinita, ultimoBackup: {quando, cartella} | null}` (`cartellaBackup` è la cartella EFFETTIVA, mai null; `cartellaPredefinita` è true se è quella di default `<cartella dati>/copie`); `PUT /api/programma/backup` `{cartella}` (vedi sotto); `POST /api/programma/backup` → `{cartella}` (copia coerente del database con `VACUUM INTO`); backup automatico alle 03:00.

## Precisazioni emerse in implementazione

- `importoCent` deve essere > 0. Limiti: nome 120 caratteri, descrizione 500, numero documento 100, note 2000.
- `PUT ...?ambito=QUESTO_E_PROSSIMI` aggiorna nel modello della ricorrenza anche `tipo` e `documento`, oltre ai campi elencati. Con `SOLO_QUESTO` su un movimento già ricorrente il campo `ricorrenza` del corpo (frequenza, giorno) si applica comunque alla ripetizione; i dati del movimento no. Un `PUT` su un movimento singolo con `ricorrenza: {giorno}` lo rende ricorrente. Un movimento già ricorrente non può diventare `RETRIBUZIONE_EXTRA` (400).
- Dopo un `POST` o `PUT` che crea o modifica una ricorrenza, le occorrenze arretrate fino a oggi si registrano subito (oltre che all'avvio e alle 03:05).
- `GET /api/movimenti`: nessuna paginazione; i totali riguardano tutto l'elenco filtrato.
- `altreVoci` è ordinato per importo decrescente, poi per nome; «Altre voci fisse» raccoglie le voci senza categoria.
- **Cartella delle copie.** Se non è configurata (`backup.cartella`), le copie vanno nella cartella predefinita `<cartella dati>/copie`, creata al bisogno: vale per il backup automatico delle 03:00, il recupero all'avvio (su installazione nuova crea subito una copia), «Fai ora», l'elenco delle copie, il ripristino e la pulizia delle ultime 10. `PUT /api/programma/backup` `{cartella}` risponde con lo stesso oggetto di `GET /api/programma`: `cartella` nulla o vuota (o uguale al percorso predefinito) torna al default; un percorso deve essere assoluto (400 «La cartella delle copie deve essere un percorso completo (per esempio D:\Copie).»), creabile e scrivibile (verificato con un file temporaneo, altrimenti 400 in italiano), e non può stare dentro la cartella dati se non è il default (400 «La cartella delle copie non può stare dentro i dati, tranne quella predefinita.»). Dopo un cambio di cartella, `ultimoBackup` continua a indicare l'ultima copia fatta nella cartella precedente. `POST /api/programma/backup`: 409 solo se una copia è già in corso, 500 con `{errore}` se fallisce. `GET /api/rete/qr.png`: 503 se non c'è nessun indirizzo.
- `PUT /api/impostazioni` accetta qualsiasi chiave tranne il prefisso interno `backup.`, che si rifiuta e non compare in `GET`.
- Un valore non valido nel corpo JSON (enum o data) risponde 400 con `Valore non valido per «campo»: …`.

## Ripristino da copia

Il ripristino avviene **a riavvio**: sostituire il file di un database SQLite aperto (pool e Hibernate) è fragile, quindi il servizio prepara l'operazione, esce con codice **75** e la applica all'avvio successivo. Il servizio Windows (WinSW, `onfailure restart`) e quello macOS (launchd, `KeepAlive`) lo riavviano da soli; lanciando il jar a mano va riavviato a mano.

- `GET /api/programma/copie` → `[{nome, quando, dimensioneByte}]`, dalla più recente. Sono le cartelle figlie dirette della cartella di backup che contengono `contabilita.db`, con nome `AAAA-MM-GG_HHMMSS[-N]` oppure `prima-del-ripristino-AAAA-MM-GG_HHMMSS[-N]` (così si può annullare un ripristino). `quando` è ISO senza fuso, ricavato dal nome. `[]` se non c'è una cartella configurata.
- `POST /api/programma/ripristina` `{copia: "<nome cartella>"}` → **202** `{riavvio: true, copiaDiSicurezza: "prima-del-ripristino-AAAA-MM-GG_HHMMSS"}`. Poi il processo esce con codice 75 (dopo circa 1,5 s, così la risposta parte).
  - 400: nome non valido (vuoto, spazi ai bordi, `.`, `..`, `/`, `\` o `:`), copia illeggibile, `PRAGMA integrity_check` non ok, tabelle `movimento` o `databasechangelog` mancanti, oppure copia di un schema più recente del programma (changeset sconosciuti).
  - 404: il nome non è tra le copie elencate.
  - 409: nessuna cartella di backup configurata, ripristino già in attesa o copia in corso.
  - 500: copia di sicurezza o scrittura del marcatore fallite.
- Prima della risposta il servizio fa una **copia di sicurezza dei dati attuali** (`prima-del-ripristino-…`, `VACUUM INTO`, non conta nelle ultime 10 copie e non viene eliminata dalla pulizia) e scrive `<cartella dati>/ripristino-in-attesa.json`: `{"copia": "<percorso assoluto del contabilita.db della copia>", "richiestoIl": "<ISO>", "copiaDiSicurezza": "<nome cartella>"}`.
- All'avvio, **prima** di Spring, `RipristinoInSospeso` copia il file in `contabilita.db.ripristino.tmp`, lo ricontrolla, sostituisce il database (spostamento atomico), toglie `-wal` e `-shm` e cancella il marcatore per ultimo (ripetibile se il processo muore a metà). Se qualcosa fallisce il database attuale non viene toccato e il marcatore diventa `ripristino-fallito.json` (stessi campi più `motivo` e `fallitoIl`); l'app parte normalmente.
- Le impostazioni stanno nel database: dopo il ripristino tornano quelle della copia (per esempio, se la copia non aveva la cartella di backup, le copie automatiche restano spente finché non si riconfigura).

## Esportazione (fase 3)

`GET /api/esporta?formato=xlsx|csv&da=&a=&includi=RICAVO,COSTO_VARIABILE,COSTO_FISSO` → il file in streaming (`Content-Disposition: attachment`, nome `contabilita-AAAA-MM-GG_AAAA-MM-GG.xlsx` / `.csv` con il periodo; `da` e `a` obbligatori, inclusivi; `includi` facoltativo, default tutti i tipi; valori non validi → 400).

- **Etichette in italiano** nel file: Tipo `Ricavo` / `Costo variabile` / `Costo fisso`; Documento `Fatturato`, `Extra`, `Fattura`, `Nota di credito`, `Scontrino`, `Retribuzione regolare`, `Retribuzione extra`, `-` (per `NESSUNO`).
- **Colonne del foglio Movimenti** (stesso ordine nel CSV): `Data`, `Tipo`, `Documento`, `Categoria`, `Fornitore`, `Dipendente`, `Descrizione`, `N. documento`, `Note`, `Importo`, `Origine` (`A mano`, `XML`, `Ricorrenza`). Ordinati per data crescente poi id. `Importo` **con segno** (ricavi positivi, costi negativi).
- **XLSX** (libreria fastexcel, scrittura in streaming come nel progetto etichette): fogli `Movimenti` (data come cella data, importo come numero in euro con formato valuta, intestazione in grassetto e riga bloccata, larghezze colonna adeguate) e `Riepilogo` (stesse voci di `GET /api/riepilogo` per il periodo: ricavi fatturati/extra/totale, costi variabili fatture/scontrini/totale, costi fissi retribuzione regolare/extra/altre voci/totale, costi, risultato; importi come numeri).
- **CSV**: solo i movimenti; separatore `;`, UTF-8 con BOM (si apre bene in Excel italiano), date `yyyy-MM-dd`, importi con virgola decimale e nessun separatore delle migliaia, campi con `;`, virgolette o a capo tra virgolette raddoppiate.
- Nessun elemento nel periodo: il file si genera comunque (solo intestazione); nessun errore.

## Importazione di fatture elettroniche (fase 4)

Gli zip si leggono dal loro indice finale (passano da un file temporaneo, cancellato subito), perché quelli esportati da Fatture in Cloud hanno nei descrittori delle voci dimensioni a zero e una lettura a flusso li rifiuta. Le voci che non sono `.xml`/`.xml.p7m` (elenchi Excel, PDF) non si decomprimono.

File accettati: `.xml` (FatturaPA, anche con più fatture in un lotto), `.xml.p7m` (fattura firmata: se ne estrae l'XML incorporato) e `.zip` con dentro file dei tipi precedenti (anche in sottocartelle). Tutto si legge **in locale**; il parser XML deve rifiutare DTD ed entità esterne (XXE); lo zip va letto con i controlli contro `zip-slip` e contro le «zip bomb» (limite al numero di file, a ~20 MB per file e ~200 MB in totale decompressi).

- `POST /api/importa/anteprima` (multipart, campo `files`, uno o più) → `{importazioneId, fatture: [FatturaLetta], errori: [{nomeFile, messaggio}]}`. **Non salva movimenti.** `importazioneId` identifica le fatture lette (in memoria, scade dopo 30 minuti).
- `FatturaLetta`: `{indice, nomeFile, fornitore: {nome, partitaIva|null}, numero, data, imponibileCent, ivaCent, totaleCent, categoriaSuggerita: "nome"|null, duplicata: bool, motivo: "testo"|null, notaDiCredito: bool, integrazione: bool}`.
  - `fornitore.nome` = `Denominazione`, oppure `Nome Cognome`, del `CedentePrestatore`; `partitaIva` = `IdFiscaleIVA/IdCodice` (con o senza `IdPaese`).
  - `numero` = `DatiGeneraliDocumento/Numero`, `data` = `DatiGeneraliDocumento/Data`, `totaleCent` = `ImportoTotaleDocumento`; se manca = imponibile + IVA. `imponibileCent` e `ivaCent` = somma di `DatiRiepilogo/ImponibileImporto` e `Imposta`. Importi decimali con punto, da convertire a centesimi senza errori di arrotondamento (`BigDecimal`).
  - `categoriaSuggerita`: l'ultima categoria usata per quel fornitore (stessa partita IVA o stesso nome senza distinguere maiuscole), altrimenti `null`.
  - `duplicata = true` se esiste già un movimento `FATTURA` con lo stesso fornitore (partita IVA, o nome se manca), stesso `numeroDocumento` e stessa data; `motivo` dice «Già registrata il gg/mm».
  - Si importano: `TD01`, `TD02`, `TD06` (parcella), `TD24`, `TD25` come **fatture** (costo variabile, importo = totale del documento); `TD04` e `TD08` come **note di credito** (riducono i costi); `TD17`, `TD18`, `TD19` (autofatture per acquisti dall'estero) come fatture al **totale lordo**, perché la fattura originale estera non arriva da SdI. `TD16` (integrazione per fornitore italiano) **non** si importa: «Integrazione TD16: non importata, la fattura originale del fornitore è già una fattura a parte.». Gli altri tipi non si importano e compaiono in `errori`. Una fattura con totale zero («Importo zero: non c'è nessun costo da registrare.») o negativo non si importa.
  - `notaDiCredito` è vero per `TD04`/`TD08`: alla conferma diventa un movimento `COSTO_VARIABILE` + `NOTA_DI_CREDITO` con fornitore, categoria (suggerita come per le fatture), numero e XML allegato. `integrazione` è vero per `TD17`/`TD18`/`TD19`. Una nota già importata (stesso fornitore, numero e data) risulta `duplicata`; un numero uguale a quello di una fattura non la rende doppia.
- `POST /api/importa/conferma` `{importazioneId, righe: [{indice, categoria|null}]}` → `{importati, ignorate: [{indice, motivo}]}`. Crea un movimento per riga: `tipo = COSTO_VARIABILE`, `documento = FATTURA`, `data`, `importoCent = totaleCent`, fornitore get-or-create (con partita IVA), `categoria` dal corpo (get-or-create, `Tipo` costo variabile; `null` ammesso), `numeroDocumento`, `origine = XML`, e l'XML originale come **allegato** (vedi sotto). Le duplicate si ignorano comunque (anche se selezionate) con motivo. `importazioneId` scaduto o sconosciuto → 404 «L'importazione è scaduta: rileggi i file.». Operazione atomica per riga: una riga che fallisce non blocca le altre.

## Allegati (fase 4)

I file allegati ai movimenti stanno in `<cartella dati>/allegati/` (mai nel database, mai in git). La colonna `allegato_nome` del movimento conserva il nome originale; il file sul disco ha un nome interno univoco (UUID più estensione), non dedotto dall'input.

- `GET /api/movimenti/{id}/allegato` → il file con il suo tipo (`application/xml`, `application/pdf`, `image/jpeg`, `image/png`), `Content-Disposition: inline; filename=<nome originale>`; 404 se non c'è.
- `POST /api/movimenti/{id}/allegato` (multipart, campo `file`; solo `image/jpeg`, `image/png`, `application/pdf`; max 8 MB; tipo verificato sui byte iniziali, non sull'estensione) → `Movimento` aggiornato; sostituisce un eventuale allegato precedente.
- `DELETE /api/movimenti/{id}/allegato` → 204.
- Eliminando un movimento si elimina anche il suo file. Il backup (`BackupService`) copia anche la cartella `allegati/` nella copia datata (incrementale: un allegato già presente con la stessa dimensione nella copia precedente diventa un collegamento fisso a quel file, senza ricopiarlo; ogni copia resta completa e cancellare la vecchia non toglie nulla; se i collegamenti non sono possibili si copia), e il ripristino la rimette a posto (se la copia la contiene).

## Fasi successive

Nessuna prevista nel contratto. Fuori ambito per ora: pizze settimanali.
