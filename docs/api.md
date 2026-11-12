# API del servizio (contratto, fase 1)

Fonte di verità condivisa tra servizio (`src/`) e interfaccia (`ui/`). Base: `/api`, porta 8766. La password per entrare è facoltativa (vedi «Accesso con password»): senza, nessun login. Le schermate sono descritte in [`interfaccia.md`](interfaccia.md).

## Convenzioni

- JSON UTF-8. Nomi dei campi in italiano, camelCase.
- **Importi in centesimi interi** (`long`, sempre positivi: il segno lo dà il tipo). Campi con suffisso `Cent`.
- Date `yyyy-MM-dd` (ISO), nessun fuso.
- Errori: stato 400 (richiesta non valida), 404, 409 (conflitto) con corpo `{"errore": "messaggio in italiano"}`.
- Altri 400 generali: un parametro obbligatorio che manca → «Manca il parametro «nome».»; un caricamento che non si legge (la richiesta non è multipart dove serve, o è arrivata rotta) → «Il caricamento del file non è valido: riprova.»; nessuno dei due scrive nel log a ERROR.
- **404** per un indirizzo che non esiste (un percorso `/api/…` senza rotta, un file dell'interfaccia che manca): «Indirizzo non trovato: /api/…», con il percorso chiesto, barra iniziale compresa (fino a novembre 2026 era «risorsa non trovata: api/…», in minuscolo e senza barra). Il percorso lo scrive chi chiama: nella risposta e nel log (una riga a DEBUG, non è un guasto) passa da `PerLog.pulisci`, quindi oltre 300 caratteri è troncato con «…»; a capo e spazi arrivano già codificati (`%0A`, `%20`) e restano così. I 404 delle singole rotte (movimento, sede, importazione scaduta…) hanno il loro testo.
- Altri errori, sempre con lo stesso corpo JSON: **405** «Metodo non ammesso per questo indirizzo.»; **415** «Tipo di contenuto non ammesso per questo indirizzo.» (un `Content-Type` che la rotta non legge, o che non è nemmeno un tipo valido); **406** «Formato della risposta non disponibile per questo indirizzo.» (un `Accept` che la rotta non sa soddisfare; la risposta resta JSON). Il valore mandato dal cliente non torna nella risposta e nel log va solo a DEBUG.
- **500** (guasto del servizio non previsto): sempre «Errore interno: riprova. Se continua, riavvia il programma sul computer.». Il messaggio dell'eccezione **non** torna al cliente (può contenere dati suoi o dettagli interni; fino a novembre 2026 il corpo era `errore interno: <messaggio>`): tipo, messaggio e stack vanno solo nel log, a ERROR. I 500 con un testo loro (copia di sicurezza, ripristino) restano quelli descritti più sotto.
- **Log.** Ogni valore che arriva dal cliente (nomi di file, percorsi e cartelle, campi letti da una fattura, intestazioni della richiesta, messaggi di eccezione che li riportano) si scrive nel log passando da `PerLog.pulisci`: a capo, caratteri di controllo, separatori di riga Unicode e cambi di direzione del testo diventano `_`, oltre 300 caratteri si tronca con «…». Dove al log serve lo stack, l'eccezione passa da `PerLog.conStack` (stesso stack e stesse cause, testo pulito; nel log compare come l'originale, `<tipo vero>: <messaggio>`). Vale per l'importazione, per il pacchetto `programma` (copie di sicurezza e ripristino: la cartella delle copie la sceglie il cliente), per `GestoreErrori`, per la scrittura degli allegati (`AllegatiService`) e per la generazione delle ripetizioni (`RicorrenzeService`). In più, il formato delle righe (`logging.pattern.console` e `logging.pattern.file` in `application.yml`) scrive come testo `\n` (barra e n) ogni a capo che resta **dentro il messaggio** (CR LF, CR, LF, tabulazione verticale, salto pagina, NEL, separatori di riga e di paragrafo Unicode): un evento sta su una riga sola, e nel file su Windows non si mescolano LF e CRLF (anche un messaggio su più righe di Spring, per esempio un errore all'avvio, esce su una riga con i `\n` in mezzo). Questo vale solo per il messaggio, non per le righe dell'eccezione (tipo, testo e stack) che il log scrive sotto: lì la sola protezione è `PerLog.conStack`, che va usato ogni volta che si passa un'eccezione al log (per i testi delle eccezioni il limite è 4000 caratteri invece di 300, perché i messaggi di Hibernate e di SQL sono lunghi). Il file di log ha quindi un formato esplicito: `data livello --- [thread] logger : messaggio` (prima era quello predefinito di Spring Boot, con in più il numero del processo e il nome dell'applicazione).
- Enum in MAIUSCOLO.

## Enum

| Enum | Valori |
|---|---|
| `Tipo` | `RICAVO`, `COSTO_VARIABILE`, `COSTO_FISSO` |
| `Documento` | `RICAVO_FATTURATO`, `RICAVO_EXTRA`, `FATTURA`, `NOTA_DI_CREDITO`, `SCONTRINO`, `RETRIBUZIONE_REGOLARE`, `RETRIBUZIONE_EXTRA`, `NESSUNO` |
| `Origine` | `MANO`, `XML`, `RICORRENZA` |
| `Ambito` | `SOLO_QUESTO`, `QUESTO_E_PROSSIMI` |

Combinazioni valide `Tipo` → `Documento`: `RICAVO` → `RICAVO_FATTURATO` o `RICAVO_EXTRA`; `COSTO_VARIABILE` → `FATTURA`, `NOTA_DI_CREDITO` o `SCONTRINO`; `COSTO_FISSO` → `RETRIBUZIONE_REGOLARE`, `RETRIBUZIONE_EXTRA` o `NESSUNO`. Altre combinazioni: 400.

**Retribuzione e categoria** (vale per creazione e modifica di un movimento, per le ripetizioni e per l'importazione): per un `COSTO_FISSO` il `documento` `RETRIBUZIONE_REGOLARE`/`RETRIBUZIONE_EXTRA` e una categoria con `retribuzione=true` vanno **sempre insieme**.
- `documento` `RETRIBUZIONE_*` senza categoria → 400 «Una retribuzione ha bisogno di una categoria di tipo retribuzione.»; con una categoria che non ha il flag → 400 «La categoria «X» non è una retribuzione.» (si può contrassegnare in Elenchi o scegliere un'altra). Il nome non conta: la categoria si cerca come sempre, al volo dal nome, e il flag è quello che ha già.
- `documento` `NESSUNO` con una categoria `retribuzione=true` → 400 «La categoria «X» è una retribuzione: scegli Regolare o Extra.».
- Una categoria creata al volo dal solo nome in un movimento ha sempre `retribuzione=false`: per una nuova retribuzione l'interfaccia crea prima la categoria con `POST /api/categorie {…, retribuzione: true}`.
- Il controllo vale anche per la **modifica con ambito `QUESTO_E_PROSSIMI`** e per i movimenti creati dalle ripetizioni: se la categoria di una ripetizione perde il flag mentre ha retribuzioni, `PUT /api/categorie/{id}` risponde già 409 (vedi Anagrafiche), quindi non si arriva a un modello incoerente.
- I dati già presenti prima della migrazione non si rivalidano; la migrazione porta le retribuzioni senza categoria alla categoria «Retribuzione» (vedi Anagrafiche).

**Nota di credito** (`COSTO_VARIABILE` + `NOTA_DI_CREDITO`, come nel progetto del ristorante): l'`importoCent` resta positivo, ma la nota **riduce** i costi: nei totali di `GET /api/movimenti`, nel Riepilogo (riga «Fatture»: fatture − note) e nell'esportazione (dove i costi sono negativi e la nota è positiva). Ha fornitore, categoria e numero come una fattura; arriva dall'importazione oppure **a mano** da «Nuovo movimento» (scelta «Nota di credito» del campo Documento, per la nota di carta): stesso `POST /api/movimenti`, `origine: MANO`, e da lì in poi è uguale a quella importata. È ammessa **solo** per `COSTO_VARIABILE` (ricavo e costo fisso: 400); non ha `pagata` e l'interfaccia non la fa ripetere.

## Anagrafiche (creazione al volo)

- `GET /api/categorie?tipo=COSTO_VARIABILE` → `[{id, nome, tipo, retribuzione}]` (`tipo` facoltativo; la categoria ha un `Tipo`). **Non esistono categorie predefinite né «di sistema»**: sono tutte dell'utente, si rinominano e si eliminano (vedi sotto); il campo `personalizzata` è stato tolto. `retribuzione` (booleano) è vero solo per le categorie di `COSTO_FISSO` che l'utente ha contrassegnato come **retribuzione**: i movimenti di quella categoria hanno `documento` `RETRIBUZIONE_REGOLARE` o `RETRIBUZIONE_EXTRA` e un dipendente facoltativo; l'interfaccia, scelta una categoria con `retribuzione`, chiede Regolare/Extra e Dipendente. Il nome della categoria si può cambiare (è solo un nome): quello che conta è il flag. Un database nuovo parte **senza categorie**; un database esistente, alla migrazione, mantiene le sue categorie e ne contrassegna come retribuzione quella di `COSTO_FISSO` che si chiama `Retribuzione` (senza distinguere maiuscole); se non c'è **e** ci sono retribuzioni (movimenti o ripetizioni con documento `RETRIBUZIONE_*`) senza categoria, ne crea una con quel nome (con il flag) e le assegna a quella; in un database senza retribuzioni non crea nulla.
- `PUT /api/categorie/{id}` `{nome?, retribuzione?}` (almeno uno dei due) → `{id, nome, tipo, retribuzione}`: rinomina e/o cambia il flag. Cambiano anche i movimenti che la usano, perché puntano alla categoria. Errori: nome vuoto o oltre 120 caratteri → 400; categoria inesistente → 404; nome già usato da un'altra categoria dello stesso `tipo` (senza distinguere maiuscole) → 409 «Esiste già una categoria con questo nome.»; `retribuzione=true` su una categoria che non è di `COSTO_FISSO` → 400; `retribuzione=false` su una categoria usata da movimenti con `documento` `RETRIBUZIONE_*` → 409 «Questa categoria ha già delle retribuzioni.». `DELETE` vedi «Gestione di categorie, fornitori e dipendenti».
- `GET /api/fornitori?q=` → `[{id, nome, partitaIva}]` (`q` filtra per nome, senza distinguere maiuscole). Ordine: con `q` prima chi inizia col testo, poi chi lo contiene; dentro ogni gruppo i più usati (numero di movimenti), a parità alfabetico. Senza `q`: i più usati.
- `GET /api/dipendenti?q=` → `[{id, nome}]`.
- `POST /api/categorie` `{nome, tipo, retribuzione?}` (`retribuzione=true` solo con `tipo` `COSTO_FISSO`, altrimenti 400; se la categoria esiste già il flag non cambia), `POST /api/fornitori` `{nome, partitaIva?}`, `POST /api/dipendenti` `{nome}` → 201 con l'oggetto creato; se esiste già (stesso nome senza distinguere maiuscole, e per le categorie stesso `tipo`) → 200 con quello esistente.

Anche il salvataggio di un movimento crea al volo categoria, fornitore e dipendente dal solo nome (vedi sotto): l'interfaccia non deve fare una POST separata.

## Sedi

Ogni movimento e ogni ripetizione appartiene a **una sede**. Un database nuovo, o uno di prima delle sedi, ha la sede `Sede principale` (id 1, con dentro tutti i movimenti e le ripetizioni che già c'erano). Una sede non si cancella: se serve non usarla più, si **archivia** (resta nei dati e nei filtri, sparisce dalle scelte).

Oggetto `Sede`: `{id, nome, archiviata, personale, ordine, movimenti}`, dove `movimenti` è il numero di movimenti della sede e `personale` dice se è una **sede personale** (vedi sotto; `false` per tutte le sedi che c'erano prima).

- `GET /api/sedi` → `[Sede]`: prima le non archiviate, per `ordine` (poi `id`); in fondo le archiviate.
- `POST /api/sedi` `{nome, personale?}` → 201 con la `Sede` creata (`ordine` = in coda alle altre; `personale` facoltativo, predefinito `false`); se esiste già (stesso nome senza distinguere maiuscole, anche archiviata) → 200 con quella esistente, **com'è** (il `personale` del corpo non la cambia). Nome vuoto → 400 «Il nome della sede è obbligatorio.»; più di 120 caratteri → 400.
- `PUT /api/sedi/{id}` `{nome?, archiviata?, personale?}` → `Sede` aggiornata. Si manda quello che cambia (un corpo vuoto non cambia niente). `nome` vuoto → 400; nome di un'altra sede → 409 «Esiste già una sede con questo nome.»; `archiviata: true` sull'**ultima sede attiva** → 409 «Non si può archiviare l'ultima sede attiva.»; `archiviata: false` la riattiva. Il locale deve avere sempre **almeno una sede attiva non personale**: `personale: true` sull'ultima sede attiva non personale → 409 «L'ultima sede attiva del locale non può diventare personale.»; `archiviata: true` sull'ultima sede attiva non personale quando le altre attive sono personali → 409 «Non si può archiviare l'ultima sede attiva del locale (le altre sono personali).». `personale: false` la fa tornare normale. Tutto o niente: con un 409 non cambia nemmeno il nome. Sede inesistente → 404 «Sede non trovata.».
- Non esiste `DELETE`: una sede con movimenti non si cancella (405).

**Quale sede.** Dove si indica `sedeId` (creazione di un movimento, conferma di un'importazione): se manca e c'è **una sola sede attiva** si usa quella; se manca e ce ne sono più → 400 «Scegli la sede: ce n'è più di una.»; sede inesistente → 400 «Sede non trovata.»; sede archiviata → 400 «La sede «…» è archiviata.» (su una sede archiviata non si registra più niente).

**Filtro `sedi`.** I `GET` che lo accettano (`/api/movimenti`, `/api/riepilogo`, `/api/statistiche`, `/api/statistiche/serie`, `/api/statistiche/voci`, `/api/esporta`) prendono `sedi=1,2`, un elenco di id separati da virgola. Con `sedi` vale l'elenco dato, **sedi personali comprese**. Assente o vuoto = **tutte le sedi non personali**, archiviate comprese (prima delle sedi personali era «tutte»: senza sedi personali non cambia niente). Un id inesistente non dà risultati; un valore che non è un numero → 400 «sedi: valore non valido: …». Il filtro vale per elenco e totali dei movimenti, riepilogo (anche `perSede`), statistiche per voce ed esportazione (movimenti, riepilogo, colonne per sede, fogli delle statistiche). (`POST /api/movimenti/dividi?sedi=` non è un filtro: vedi Movimenti.)

**Sede personale** (novembre 2026). Il cliente registra le spese dei titolari in una sede dedicata, con `personale: true`. Una sede personale:
- **non ha pizze e ordini**: non compare in `GET /api/statistiche/settimana`, né in `perSede`, `sediMancanti` e totali di `GET /api/statistiche`, né in `GET /api/statistiche/serie`, né nei fogli «Statistiche» e «Pizze per giorno» dell'Excel, **nemmeno se scelta esplicitamente** con `sedi` (scelta da sola, le statistiche sono vuote; anche i suoi eventuali ricavi lì non contano). `PUT /api/statistiche/settimana` e `PUT /api/statistiche/giorni` con una sede personale → 400 «La sede «…» è personale: non ha pizze e ordini.» (tutto o niente);
- **resta fuori dai totali del locale** finché non la si sceglie: vedi il filtro `sedi` qui sopra;
- non entra in «dividi» senza `sedi` (vedi Movimenti); con `sedi` esplicito sì;
- si registrano movimenti come in ogni altra sede (`sedeId`; la regola «Quale sede» conta anche le sedi personali tra le attive).

Segnare personale una sede che ha già **dati di pizze e ordini** è permesso: i dati restano nel database ma non contano finché la sede è personale; togliendo il flag tornano a contare.

## Movimenti

Oggetto `Movimento` (risposta):

```
{ id, data, tipo, documento, importoCent,
  categoria: {id, nome} | null,
  fornitore: {id, nome} | null,
  dipendente: {id, nome} | null,
  sede: {id, nome},
  descrizione, numeroDocumento, note,
  origine,
  pagata,                                                        // boolean: solo per le fatture ricevute, vedi «Fatture ricevute»; per ogni altro documento è sempre false
  ricorrenza: {id, giorno, attiva, unita, intervallo, prossimaData} | null,
  allegatoNome | null,
  divisione: "testo" | null }                                    // l'id comune delle parti di un movimento diviso fra sedi; vedi «Movimenti divisi»
```

Corpo di creazione/modifica (`MovimentoInput`):

```
{ data, tipo, documento, importoCent,
  categoria?: "nome", fornitore?: "nome", dipendente?: "nome",   // creati al volo se non esistono
  sedeId?: n,                                                    // vedi «Quale sede» in Sedi; in modifica, se manca, il movimento resta dov'è
  descrizione?, numeroDocumento?, note?,
  pagata?: boolean,                                              // solo FATTURA: predefinito false in creazione (le fatture importate da XML nascono invece pagate), invariato in modifica se manca; per gli altri documenti si ignora
  ricorrenza?: { giorno?: 1..31, unita?: "GIORNI"|"SETTIMANE"|"MESI"|"ANNI", intervallo?: n } | null }   // senza unita e intervallo: ogni mese
```

- `GET /api/movimenti?da=&a=&tipo=&q=&dipendente=&sedi=&categorie=` → `{elementi: [Movimento], totali: {ricaviCent, costiCent, saldoCent}}`, ordinati per `data` decrescente poi `id` decrescente. `da`/`a` inclusivi, facoltativi. `q` cerca nel nome del fornitore, nel nome del dipendente, in descrizione e note (senza distinguere maiuscole). `dipendente` è l'id. `sedi` è il filtro per sede (vedi Sedi); anche i `totali` riguardano solo le sedi scelte.
  `tipo` è un `Tipo` (`RICAVO`, `COSTO_VARIABILE`, `COSTO_FISSO`) oppure `COSTI` = costi variabili + costi fissi (i ricavi restano fuori, anche dai `totali`: `ricaviCent` 0). Assente o vuoto = tutti; un altro valore (anche `costi` in minuscolo) → 400 «tipo: valore non valido: …». `COSTI` lo usa «Vedi in Movimenti» dal dettaglio di una categoria (o di «Senza categoria») con «Costi».
  `categorie` filtra per categoria: id separati da virgola (es. `GET /api/movimenti?categorie=3,7`), in AND con gli altri filtri e con i `totali` calcolati sul filtrato. Assente o vuoto = nessun filtro; un id inesistente non dà risultati (elenco vuoto, totali a 0); un valore che non è un numero → 400 «categorie: valore non valido: …». I movimenti **senza categoria** (per esempio le retribuzioni) sono esclusi quando il filtro è attivo.
  `retribuzione=true` tiene solo i movimenti con `documento` `RETRIBUZIONE_REGOLARE`/`RETRIBUZIONE_EXTRA` (serve all'elenco di «Senza dipendente», che riguarda solo le retribuzioni). `pagata=true|false` tiene solo le **fatture** (`documento` `FATTURA`) pagate o da pagare (valore non valido → 400).
  **Filtri per voce** (servono a vedere «cosa compone» una riga delle statistiche per voce, e valgono in AND con gli altri): `fornitore` = id del fornitore (come `dipendente`); `senza` = `FORNITORE`, `DIPENDENTE` o `CATEGORIA` tiene solo i movimenti **senza** quella voce (la riga «Senza …» delle statistiche; `categorie` e `senza=CATEGORIA` insieme → 400). Id non numerico o `senza` non valido → 400 come per `categorie`. Con questi filtri, `elementi` e `totali` sono coerenti con le righe di `GET /api/statistiche/voci` dello stesso periodo: per una voce, la somma degli importi degli `elementi` (note di credito in negativo, ricavi positivi) è il `totaleCent` della sua riga.
- `GET /api/movimenti/{id}` → `Movimento`.
- `POST /api/movimenti` `MovimentoInput` → 201 `Movimento` (`origine = MANO`). `sedeId` come in «Quale sede».
- `POST /api/movimenti/dividi` `MovimentoInput` **senza** `sedeId` → 201 con la **lista** dei `Movimento` creati («dividi»): un movimento per ogni sede **attiva e non personale** (oppure solo per quelle di `?sedi=1,3`: almeno due, attive, anche personali, altrimenti 400), in ordine di `ordine`, con `importoCent` diviso in parti uguali. I centesimi di resto vanno uno ciascuno alle prime sedi, quindi la somma delle parti è esattamente l'importo originale (1000 su 3 sedi → 334 + 333 + 333). Gli altri campi (data, tipo, documento, categoria, fornitore, descrizione…) sono uguali in tutti. È una sola operazione: se qualcosa non va non si crea nessun movimento. Con una sola sede attiva crea un solo movimento con tutto l'importo; se l'importo ha meno centesimi delle sedi, le ultime sedi restano senza movimento (non esistono movimenti da zero). Con `ricorrenza` nel corpo (costo fisso) ogni sede ottiene **la sua** ripetizione con la sua parte, quindi anche i mesi dopo escono divisi (una ripetizione per sede, da modificare sede per sede); `sedeId` nel corpo → 400 «Per dividere fra più sedi non indicare la sede.»; gli altri controlli sono quelli di `POST /api/movimenti`. Le parti create hanno lo stesso **`divisione`** (vedi «Movimenti divisi» qui sotto).
- `PUT /api/movimenti/{id}?ambito=SOLO_QUESTO` `MovimentoInput` → `Movimento`. Con `sedeId` il movimento cambia sede (non verso una archiviata); senza resta nella sua. Con `ambito=QUESTO_E_PROSSIMI` su un movimento ricorrente, la modifica aggiorna anche il modello della ricorrenza (importo, categoria, fornitore, dipendente, sede, descrizione, note, giorno): le prossime occorrenze lo useranno. Il `giorno` ricorrente si cambia solo con questo ambito.
- `DELETE /api/movimenti/{id}?ambito=SOLO_QUESTO` → 204. Con `QUESTO_E_PROSSIMI` elimina questo e ferma la ricorrenza (`attiva = false`).
- `POST /api/ricorrenze/{id}/ferma` → 204 (le occorrenze già registrate restano).
- `POST /api/ricorrenze/{id}/riattiva` → 204: una ripetizione ferma torna attiva e riparte dalla **prossima scadenza futura**, senza recuperare quelle cadute mentre era ferma. Già attiva: non fa nulla. Inesistente: 404.

### Movimenti divisi (`divisione`, novembre 2026)

`POST /api/movimenti/dividi` crea un movimento per sede. Prima erano movimenti indipendenti; ora hanno un **identificativo comune**, il campo `divisione` del `Movimento` (colonna `divisione`, migrazione v13, solo additiva).

- **Chi lo ha.** Tutte le parti create dallo stesso «dividi» hanno lo stesso valore (un testo opaco: nel servizio un UUID; va solo confrontato per uguaglianza). È `null` per ogni altro movimento: creato con `POST /api/movimenti`, importato, e **tutti quelli che c'erano prima della v13** (la migrazione non tocca i dati: non prova a indovinare quali vecchi movimenti erano parti della stessa fattura). Se «dividi» crea **una parte sola** (una sola sede attiva, o un importo di un centesimo) non c'è niente di diviso: `null`.
- **Ripetizione divisa.** Con `ricorrenza` nel corpo ogni sede ha la sua ripetizione, e le ripetizioni nate dallo stesso «dividi» sono legate (colonna `ricorrenza.divisione`, non esposta). Le parti generate a ogni scadenza hanno **il loro id comune, uno per scadenza**: `<divisione della ripetizione>:<data della scadenza>` (per esempio `…:2026-02-10`), uguale per tutte le sedi e diverso da un mese all'altro; le prime parti (quelle create da «dividi») hanno l'id senza data. Se la ripetizione di una sede cambia giorno o frequenza, le sue scadenze cadono in altre date e non stanno più insieme a quelle delle altre sedi. Un movimento diviso che diventa ripetuto dopo (`PUT` con `ricorrenza`) lega la sua ripetizione allo stesso modo.
- **Modifica.** `divisione` non è nel `MovimentoInput` e **non cambia mai**: resta quello anche se di una parte si cambiano importo, data, fornitore, documento o sede (un `divisione` nel corpo di un `PUT` si ignora), e anche con `PUT …/pagata`. Le parti possono quindi diventare diverse fra loro (date o fornitori diversi, due parti nella stessa sede): chi legge decide che cosa farne (vedi sotto).
- **Eliminazione.** Eliminare una parte non tocca le altre, che tengono il loro id: una divisione può restare con una parte sola. Non c'è un'eliminazione «di tutte le parti».
- **Chi lo usa.** Le Fatture ricevute dell'interfaccia uniscono le parti con lo stesso `divisione` in una fattura sola (per i movimenti senza id resta l'euristica di prima: vedi `interfaccia.md`). Le statistiche per voce contano le parti una volta sola (vedi «Statistiche per voce», `movimenti`). `GET /api/movimenti` resta un elenco di movimenti: una riga per parte, e i `totali` sommano le parti delle sedi del filtro. L'esportazione non ha la colonna (CSV e Excel non cambiano).

### Ricorrenze

- Un movimento creato con `ricorrenza: {...}` genera una ripetizione: il movimento è la prima occorrenza, i suoi campi sono il modello. La frequenza è «ogni `intervallo` `unita`» con `unita` = `GIORNI`, `SETTIMANE`, `MESI` o `ANNI`; senza `unita` e `intervallo` vale **ogni mese** (`{giorno}` come prima). `intervallo` va da 1 a 365 (giorni), 104 (settimane), 60 (mesi), 10 (anni): 400 con «Ogni quanto: da 1 a N …».
- `giorno` (1..31) è obbligatorio per mesi e anni (nei mesi più corti diventa l'ultimo giorno del mese; per gli anni il mese è quello della data del movimento) e si ignora per giorni e settimane, che contano dalla data del movimento.
- **La ripetizione ha la sede** del movimento da cui nasce, e le occorrenze generate hanno la stessa sede. Cambiare la sede con `ambito=QUESTO_E_PROSSIMI` la cambia anche alle occorrenze future.
- Le occorrenze successive si registrano da sole come movimenti con `origine = RICORRENZA`, senza conferma, a ogni scadenza. Un controllo giornaliero (03:05) e uno all'avvio recuperano anche le scadenze saltate, solo fino a oggi. Idempotente: il generatore non crea un'occorrenza se per quella ripetizione e quella data ce n'è già una; una occorrenza eliminata a mano non si ricrea.
- **Frequenza e dati sono separati.** `ambito` decide solo se i dati di questo movimento (importo, voce, fornitore…) diventano il modello dei prossimi (`QUESTO_E_PROSSIMI`) o no (`SOLO_QUESTO`). La `ricorrenza` nel corpo di un `PUT` (frequenza, giorno) cambia **sempre** la ripetizione, con qualunque ambito: vale dalla prossima scadenza ancora da registrare (per mesi e anni resta lo stesso mese col nuovo giorno). `prossimaData` nella risposta è quella scadenza.
- Fermare (`ferma` o `DELETE` con `QUESTO_E_PROSSIMI`) e riattivare (`riattiva`) sono separati; la riattivazione non recupera i periodi in cui era ferma.
- `RETRIBUZIONE_EXTRA` non può essere ricorrente: 400.

## Riepilogo

`GET /api/riepilogo?da=&a=&sedi=` (`da` e `a` obbligatori; `sedi` facoltativo, assente = tutte le sedi non personali, vedi Sedi) →

```
{ da, a,
  ricavi:        { voci: [{id, categoria, importoCent}], fatturatiCent, extraCent, totaleCent },
  costiVariabili:{ voci: [{id, categoria, importoCent}], fattureCent, scontriniCent, totaleCent },
  costiFissi:    { voci: [{id, categoria, importoCent}], retribuzioneRegolareCent, retribuzioneExtraCent, totaleCent },
  costiCent, risultatoCent,
  perSede:       [{sede: {id, nome}, ricaviCent, costiCent, risultatoCent}] }
```

**Una riga per ogni categoria** (cambio di novembre 2026: non esistono più categorie «predefinite»). In ognuna delle tre sezioni `voci` ha una riga per ogni categoria che nel periodo ha movimenti di quel tipo (`id` della categoria, `categoria` = il suo nome), più, se ci sono movimenti senza categoria, una riga `{id: null, categoria: "Senza categoria", importoCent}`. `voci` è ordinato per importo decrescente, poi per nome, con «Senza categoria» sempre in fondo; la somma delle `voci` è `totaleCent` della sezione. Le note di credito riducono la riga della loro categoria (l'importo conta in negativo; una riga può risultare negativa). `altreVoci` non esiste più.

**Le somme per documento sono «di cui»**: `fatturatiCent`/`extraCent` (ricavi per `documento`), `fattureCent` (fatture − note di credito)/`scontriniCent` (costi variabili) e `retribuzioneRegolareCent`/`retribuzioneExtraCent` (costi fissi) sommano **tutti** i movimenti del tipo con quel documento, qualunque sia la loro categoria, e **non** vanno aggiunte al totale: sono un dettaglio del totale. Nei costi fissi, i movimenti con `documento` `NESSUNO` contano solo in `voci`. Un valore a zero significa che non ci sono movimenti con quel documento.

Esempio (marzo 2026, importi inventati): ricavi `{voci: [{id: 3, categoria: "Sala", importoCent: 100000}, {id: 9, categoria: "Delivery", importoCent: 42000}], fatturatiCent: 120000, extraCent: 22000, totaleCent: 142000}`, costi variabili `{voci: [{id: 5, categoria: "Imballaggi", importoCent: 5000}, {id: 6, categoria: "Bibite", importoCent: 900}, {id: null, categoria: "Senza categoria", importoCent: 21500}], fattureCent: 20000, scontriniCent: 7400, totaleCent: 27400}` (Imballaggi = fattura 8000 − nota di credito 3000). Le sedi: la ripartizione per categoria si calcola solo sul totale delle sedi scelte, non per sede. `costiCent` = variabili + fissi; `risultatoCent` = ricavi − costi (può essere negativo). Con `sedi` tutti i campi riguardano solo le sedi scelte. `perSede` ha una riga per ogni sede scelta (nell'ordine di `GET /api/sedi`): le non archiviate compaiono anche con tutto a zero se nel periodo non hanno movimenti, le archiviate solo se ne hanno; `costiCent` per sede conta le note di credito come riduzione, come il resto. La somma delle righe di `perSede` è uguale ai totali `ricavi.totaleCent`, `costiCent`, `risultatoCent`. I campi di prima non sono cambiati.

## Statistiche

Pizze e ordini si caricano **a mano, per ogni sede, in due modi**: **giorno per giorno** (anche solo alcuni giorni: i giorni di chiusura si lasciano vuoti) oppure con il **totale della settimana** (come prima di novembre 2026; i dati settimanali già inseriti restano e valgono). Servono a ricavare lo **scontrino medio** e le **pizze per ordine**, per sede e in generale, e il grafico giornaliero, settimanale e mensile. La settimana è la settimana ISO **lunedì–domenica** e si identifica con la data del **lunedì** (`yyyy-MM-dd`). Tutte le date sono ISO, gli importi in centesimi.

**Regole (valgono per tutti gli endpoint qui sotto, servizio e demo).**

1. **Un solo modo per (sede, settimana).** Due tabelle: `dati_giorno` (una riga per sede e giorno) e `dati_settimana` (il totale settimanale, una riga per sede e settimana). Per una **(sede, settimana)** vale **un solo modo alla volta**: salvare dei giorni (con i numeri) **cancella** il totale settimanale di quella sede in quella settimana, e salvare il totale settimanale **cancella** i giorni di quella sede in quella settimana, nella stessa transazione del salvataggio (l'interfaccia chiede conferma prima di sovrascrivere). Così non resta nessun dato nascosto: cancellando i giorni la settimana resta senza dati. La regola è sede per sede: nella stessa settimana una sede può avere i giorni e un'altra il totale. (Se per qualche ragione ci fossero entrambi, per esempio scrivendo nel database a mano, in lettura valgono i giorni.) La settimana a giorni è la somma dei giorni; un totale settimanale **conta nel giorno del suo lunedì** (quindi nella settimana e nel mese di quel lunedì, come prima).
2. **I ricavi** sono i movimenti di tipo `RICAVO` della sede, per data del movimento. Hanno tre nomi diversi:
   - `ricaviTotaliCent`: **tutti** i ricavi (fatturati + extra) del periodo, con o senza dati di pizze e ordini — sono il «ricavo totale» del grafico e dei totali;
   - `ricaviExtraCent`: i soli ricavi con documento `RICAVO_EXTRA` («Extra», «Incassi extra» nell'interfaccia; già compresi in `ricaviTotaliCent`);
   - `ricaviConDatiCent`: i ricavi **usati per lo scontrino**: la somma, sulle coppie **(sede, giorno) con dati e `ordini` > 0**, dei ricavi di quella sede in quel giorno; per un totale settimanale con `ordini` > 0, i ricavi della sede in **tutta la settimana** lunedì–domenica (come prima). I ricavi dei giorni senza dati (o con 0 ordini) non ci entrano: non si dividono i ricavi di 7 giorni per gli ordini di 3.
   - `ricaviCent` resta per compatibilità con il significato di prima, che cambia da endpoint a endpoint: in `GET /api/statistiche/settimana` = `ricaviTotaliCent`; in `GET /api/statistiche` = `ricaviConDatiCent`. Nel codice nuovo si usano i tre nomi espliciti.
3. **Scontrino medio** = `ricaviConDatiCent ÷ ordini`, arrotondato al centesimo (mezzo centesimo lontano da zero: 10000 / 3 → 3333, −5 / 2 → −3); `null` se gli ordini sono 0, se il dato manca **o se i ricavi usati per lo scontrino sono 0** anche con ordini > 0 (novembre 2026: niente scontrini da 0 €; l'interfaccia mostra «—»). Vale in tutte le risposte (settimana per sede e per giorno, statistiche di un periodo, serie: totale, intervalli e `perSede`) e nei fogli Excel «Statistiche» e «Pizze per giorno» (cella vuota). **Pizze per ordine** = `pizze ÷ ordini`, a 2 decimali (17 / 7 → 2.43); `null` se gli ordini sono 0 o il dato manca. Con 0 ordini le pizze sono per forza 0, quindi le somme di pizze e ordini sono le stesse con o senza i giorni a 0.
4. **Mancante.** Una (sede, settimana) è «mancante» (`sediMancanti`, `completa: false`) solo se **non ha nessun dato in nessuno dei due modi** (nessun giorno inserito né il totale settimanale). Bastano alcuni giorni: i giorni di chiusura non generano avvisi. Le sedi archiviate e le sedi personali non sono mai mancanti.
5. **Numeri inseriti** (giorno o settimana): interi da 0 a 1.000.000, pizze e ordini **entrambi o nessuno** (nessuno = cancella il dato), con `ordini` = 0 anche `pizze` = 0 (`0` e `0` è ammesso: il giorno c'è ma non ha venduto; conta come inserito, senza medie). Sede esistente, non archiviata e non personale (vedi Sedi). **Niente giorni futuri** (novembre 2026): un giorno con i numeri dopo oggi → 400 «Non si possono inserire pizze e ordini per un giorno futuro.» in `PUT /api/statistiche/giorni` e `PUT /api/statistiche/settimana-completa` (tutto o niente; oggi va bene). Cancellare un giorno futuro (numeri `null`) resta permesso, per pulire dati di prima. Il totale settimanale (`PUT /api/statistiche/settimana`, `totali` della settimana completa) non ha questo limite: si può inserire anche per la settimana in corso.

### Salvare i giorni

`PUT /api/statistiche/giorni`

```
{ "voci": [ {"sedeId": 1, "data": "2026-03-02", "pizze": 7, "ordini": 3},
            {"sedeId": 1, "data": "2026-03-03", "pizze": 0, "ordini": 0},
            {"sedeId": 2, "data": "2026-03-02", "pizze": null, "ordini": null} ] }
```

- Per ogni voce: **upsert** del dato di quella sede in quel giorno. I giorni e le sedi non nominati non cambiano. Una voce con `pizze` **e** `ordini` assenti o `null` **cancella** quel giorno (cancellare un giorno che non c'è non è un errore).
- Tutte le `data` devono stare nella **stessa settimana** lunedì–domenica (anche di sedi diverse). Risposta 200: quella settimana dopo il salvataggio, come `GET /api/statistiche/settimana`.
- **Cambio di modo:** una voce con i numeri cancella, nella stessa transazione, il totale settimanale della sua sede in quella settimana, se c'era (regola 1). Una voce che cancella un giorno (numeri `null`) non tocca il totale. Se una voce non è valida non si salva e non si cancella niente.
- Tutto o niente. Errori 400 `{"errore": "..."}`: `voci` assente o vuota → «Indica almeno una voce.»; voce senza `sedeId` → «Ogni voce deve avere la sede.»; senza `data` → «Ogni voce deve avere il giorno (yyyy-MM-dd).»; data non valida → «Il giorno non è una data valida (yyyy-MM-dd): …»; giorni di settimane diverse → «Tutti i giorni devono essere della stessa settimana (da lunedì a domenica).»; sede inesistente → «Sede non trovata.»; archiviata → «La sede «…» è archiviata.»; personale → «La sede «…» è personale: non ha pizze e ordini.»; stessa sede e giorno due volte → «Sede «…», gg/mm/aaaa: il giorno compare più volte.»; i numeri come in regola 5, con i messaggi di prima preceduti da «Sede «…», gg/mm/aaaa: » (per esempio «Sede «Via Roma», 02/03/2026: con 0 ordini le pizze devono essere 0.»).

### Salvare il totale di una settimana

`PUT /api/statistiche/settimana` è il secondo modo di inserimento, a pieno titolo (stesso corpo, stessa risposta e stessi errori di prima).

```
{ "settimana": "2026-03-04",
  "voci": [ {"sedeId": 1, "pizze": 7, "ordini": 3},
            {"sedeId": 2, "pizze": null, "ordini": null} ] }
```

- `settimana`: un giorno qualsiasi della settimana, normalizzato al lunedì. Per ogni voce: upsert del totale di quella sede e settimana; `pizze` e `ordini` entrambi assenti o `null` lo **cancellano** (senza toccare i giorni). Le sedi non nominate non cambiano.
- **Cambio di modo (novità):** una voce con i numeri **cancella i giorni** di quella sede in quella settimana, nella stessa transazione (regola 1). Non c'è più il 400 per le settimane con i giorni. Tutto o niente: se una voce non è valida non si salva e non si cancella niente.
- Errori di prima: `settimana` mancante o non valida → «Indica la settimana (un giorno qualsiasi, yyyy-MM-dd).» / «La settimana non è una data valida (yyyy-MM-dd): …»; `voci` assente o vuota → «Indica almeno una voce.»; voce senza `sedeId` → «Ogni voce deve avere la sede.»; stessa sede due volte → «La sede N compare più volte.»; sede inesistente → «Sede non trovata.»; archiviata → «La sede «…» è archiviata.»; personale → «La sede «…» è personale: non ha pizze e ordini.»; numeri come in regola 5 («Sede «…»: … deve essere un numero intero.», «… non può essere negativo.», «… è troppo grande …», «indica sia le pizze sia gli ordini (o nessuno dei due per cancellare il dato).», «con 0 ordini le pizze devono essere 0.»).

### Salvare una settimana intera

`PUT /api/statistiche/settimana-completa` (novembre 2026) salva **in una sola volta** una settimana di più sedi in modi diversi: alcune giorno per giorno, altre con il totale della settimana. `/giorni` e `/settimana` restano come sono.

```
{ "settimana": "2026-03-04",
  "giorni": [ {"sedeId": 1, "data": "2026-03-02", "pizze": 7, "ordini": 3},
              {"sedeId": 1, "data": "2026-03-03", "pizze": null, "ordini": null} ],
  "totali": [ {"sedeId": 2, "pizze": 70, "ordini": 30} ] }
```

- `settimana`: un giorno qualsiasi, normalizzato al lunedì (obbligatorio). `giorni` e `totali` facoltativi, ma **almeno una voce** in tutto. Le voci sono quelle di `PUT /api/statistiche/giorni` e di `PUT /api/statistiche/settimana`, con gli stessi effetti: upsert, numeri `null` = cancella, e **un modo per (sede, settimana)** (regola 1: un giorno con i numeri cancella il totale della sua sede, un totale con i numeri cancella i giorni della sua sede). I giorni devono stare nella settimana indicata.
- Una sede **non può avere i numeri sia in `giorni` sia in `totali`** → 400 «Sede «…»: scegli un solo modo per la settimana, giorno per giorno o totale della settimana.». Con i numeri in un modo e solo cancellazioni (`null`) nell'altro va bene.
- **Tutto o niente, in una sola transazione**: si controlla tutto (prima `settimana`, poi le voci di `giorni`, poi quelle di `totali`, poi il doppio modo) e solo dopo si scrive; se una voce qualsiasi non è valida (anche di un'altra sede) non si salva e non si cancella niente per nessuna sede. Risposta 200: la settimana dopo il salvataggio, come `GET /api/statistiche/settimana`.
- Errori 400, con gli stessi messaggi dei due endpoint: «Indica la settimana (un giorno qualsiasi, yyyy-MM-dd).», «La settimana non è una data valida (yyyy-MM-dd): …», «Indica almeno una voce.», «Ogni voce deve avere la sede.», «Ogni voce deve avere il giorno (yyyy-MM-dd).», «Il giorno non è una data valida (yyyy-MM-dd): …», «Tutti i giorni devono essere della stessa settimana (da lunedì a domenica).» (anche per un giorno fuori dalla settimana indicata), «Sede non trovata.», «La sede «…» è archiviata.», «La sede «…» è personale: non ha pizze e ordini.», «Sede «…», gg/mm/aaaa: il giorno compare più volte.», «La sede N compare più volte.» (nei totali), i numeri della regola 5 con il prefisso «Sede «…», gg/mm/aaaa: » (giorni) o «Sede «…»: » (totali).

### Leggere una settimana

`GET /api/statistiche/settimana?data=yyyy-MM-dd` (`data` = un giorno qualsiasi della settimana; assente = oggi) →

```
{ "settimana": "2026-03-02", "fine": "2026-03-08",
  "sedi": [
    { "sede": {"id": 1, "nome": "Sede principale"},
      "pizze": 9, "ordini": 4, "ricaviCent": 22000,
      "scontrinoMedioCent": 2000, "pizzePerOrdine": 2.25, "completa": true,
      "ricaviTotaliCent": 22000, "ricaviExtraCent": 3000, "ricaviConDatiCent": 8000,
      "fonte": "GIORNI", "giorniInseriti": 2,
      "giorni": [
        { "data": "2026-03-02", "pizze": 9, "ordini": 4, "ricaviTotaliCent": 8000, "ricaviExtraCent": 2000,
          "scontrinoMedioCent": 2000, "pizzePerOrdine": 2.25 },
        { "data": "2026-03-03", "pizze": 0, "ordini": 0, "ricaviTotaliCent": 4000, "ricaviExtraCent": 0,
          "scontrinoMedioCent": null, "pizzePerOrdine": null },
        { "data": "2026-03-04", "pizze": null, "ordini": null, "ricaviTotaliCent": 9000, "ricaviExtraCent": 0,
          "scontrinoMedioCent": null, "pizzePerOrdine": null },
        … fino a domenica 2026-03-08 (sempre 7 elementi) ] },
    { "sede": {"id": 2, "nome": "Sede Mare"},
      "pizze": 10, "ordini": 4, "ricaviCent": 5000, "scontrinoMedioCent": 1250, "pizzePerOrdine": 2.5, "completa": true,
      "ricaviTotaliCent": 5000, "ricaviExtraCent": 0, "ricaviConDatiCent": 5000,
      "fonte": "SETTIMANA", "giorniInseriti": 0,
      "giorni": [ … 7 giorni con pizze e ordini null … ] } ] }
```

- `sedi` ha tutte le sedi non archiviate e non personali (nell'ordine di `GET /api/sedi`) più le archiviate non personali **solo se** in quella settimana hanno dati (giorni o totale settimanale) o ricavi.
- `pizze`, `ordini`: la somma dei giorni inseriti, oppure il totale settimanale (regola 1); `null` se la settimana è mancante. `scontrinoMedioCent` = `ricaviConDatiCent ÷ ordini`.
- `ricaviCent` = `ricaviTotaliCent`: tutti i ricavi della sede da lunedì a domenica (0 se non ce ne sono), come prima.
- `completa`: c'è almeno un giorno o il totale settimanale (regola 4); se `false`, `pizze`, `ordini` e le due medie sono `null`, `fonte` è `null`, `ricaviConDatiCent` è 0.
- `fonte`: il **modo in uso** per quella sede in quella settimana: `"GIORNI"`, `"SETTIMANA"` (totale settimanale) o `null` (nessun dato). `giorniInseriti`: quanti giorni della settimana hanno un dato (0 con `fonte` `SETTIMANA`). Con `fonte` `SETTIMANA`, `pizze` e `ordini` sono il totale salvato (il campo `settimanale` della prima stesura non c'è più: era superfluo).
- `giorni`: sempre 7 elementi, da lunedì a domenica. `pizze`/`ordini` `null` = giorno non inserito (sempre così quando la settimana usa il totale settimanale); `ricaviTotaliCent` e `ricaviExtraCent` sono i ricavi della sede in quel giorno (anche se il giorno non è inserito); le medie del giorno sono `null` se il giorno non è inserito o ha 0 ordini.

### Statistiche di un periodo

`GET /api/statistiche?da=&a=&sedi=1,2` (`da` e `a` obbligatori, `da` ≤ `a`; `sedi` facoltativo, come nel filtro di Sedi: assente = le non personali; le sedi personali qui non contano mai; stessi errori 400 del riepilogo). Si considerano, **come prima**, le settimane **il cui lunedì cade in [da, a]**, ognuna intera da lunedì a domenica (anche i giorni dopo `a`): `settimaneTotali` = quante sono; nessun lunedì nel periodo → elenchi vuoti e medie `null`. Per un grafico che segue esattamente le date (giorni, mesi) c'è `GET /api/statistiche/serie`: sullo stesso periodo i due totali possono differire.

```
{ "da": "2026-03-02", "a": "2026-03-16",
  "totale": { "pizze": 17, "ordini": 7, "ricaviCent": 15000,
              "scontrinoMedioCent": 2143, "pizzePerOrdine": 2.43,
              "settimaneConDati": 2, "settimaneTotali": 3,
              "ricaviConDatiCent": 15000, "ricaviTotaliCent": 26000, "ricaviExtraCent": 0 },
  "perSede": [
    { "sede": {"id": 1, "nome": "Sede principale"}, "pizze": 7, "ordini": 3, "ricaviCent": 10000,
      "scontrinoMedioCent": 3333, "pizzePerOrdine": 2.33, "settimaneConDati": 2,
      "ricaviConDatiCent": 10000, "ricaviTotaliCent": 12000, "ricaviExtraCent": 0 },
    { "sede": {"id": 2, "nome": "Sede Mare"}, "pizze": 10, "ordini": 4, "ricaviCent": 5000,
      "scontrinoMedioCent": 1250, "pizzePerOrdine": 2.5, "settimaneConDati": 1,
      "ricaviConDatiCent": 5000, "ricaviTotaliCent": 5000, "ricaviExtraCent": 0 },
    { "sede": {"id": 3, "nome": "Sede Monti"}, "pizze": 0, "ordini": 0, "ricaviCent": 0,
      "scontrinoMedioCent": null, "pizzePerOrdine": null, "settimaneConDati": 0,
      "ricaviConDatiCent": 0, "ricaviTotaliCent": 9000, "ricaviExtraCent": 0 } ],
  "settimane": [
    { "settimana": "2026-03-02", "pizze": 17, "ordini": 7, "ricaviCent": 15000, "scontrinoMedioCent": 2143,
      "sediMancanti": [ {"id": 3, "nome": "Sede Monti"} ],
      "ricaviConDatiCent": 15000, "ricaviTotaliCent": 24000, "ricaviExtraCent": 0 },
    { "settimana": "2026-03-09", "pizze": 0, "ordini": 0, "ricaviCent": 0, "scontrinoMedioCent": null,
      "sediMancanti": [ {"id": 2, "nome": "Sede Mare"}, {"id": 3, "nome": "Sede Monti"} ],
      "ricaviConDatiCent": 0, "ricaviTotaliCent": 2000, "ricaviExtraCent": 0 },
    { "settimana": "2026-03-16", "pizze": 0, "ordini": 0, "ricaviCent": 0, "scontrinoMedioCent": null,
      "sediMancanti": [ {"id": 1, "nome": "Sede principale"}, {"id": 2, "nome": "Sede Mare"}, {"id": 3, "nome": "Sede Monti"} ],
      "ricaviConDatiCent": 0, "ricaviTotaliCent": 0, "ricaviExtraCent": 0 } ] }
```

**Regola per non falsare le medie.** Per ogni (sede, settimana) si prendono i numeri secondo la regola 1 (giorni o totale settimanale). `pizze`, `ordini` e `ricaviConDatiCent` (= `ricaviCent`) in `totale`, `perSede` e `settimane` sommano **solo le coppie (sede, settimana) con dati e `ordini` > 0**, e dentro una settimana a giorni solo i ricavi dei giorni con dati e ordini (regola 2). Quindi `scontrinoMedioCent` = `ricaviConDatiCent ÷ ordini` di quella stessa riga, `pizzePerOrdine` = `pizze ÷ ordini`. `ricaviTotaliCent` e `ricaviExtraCent` invece sommano **tutti** i ricavi delle sedi del filtro in quelle settimane (lunedì–domenica), con o senza dati. Nell'esempio: la sede 3 ha 9000 di ricavi il 4 marzo ma nessun dato, quindi non pesa sul 2143 del totale (15000 ÷ 7), compare in `sediMancanti` ed entra solo in `ricaviTotaliCent`.

- `settimaneConDati` (totale) = settimane con almeno una sede con dati; (per sede) = settimane in cui quella sede ha dati (giorni o totale settimanale), anche con 0 ordini.
- `settimane` è in ordine cronologico, con **tutte** le settimane del periodo (anche senza dati: somme a 0, medie `null`). `sediMancanti` elenca le sedi **non archiviate e non personali**, comprese nel filtro `sedi`, senza **nessun** giorno né totale settimanale in quella settimana (regola 4).
- `perSede` ha una riga per ogni sede del filtro (nell'ordine di `GET /api/sedi`): le non archiviate sempre (a zero se senza dati), le archiviate solo se nel periodo hanno dati o ricavi. La somma delle righe dà il `totale` (anche per `ricaviTotaliCent` e `ricaviExtraCent`).

### Serie per il grafico

`GET /api/statistiche/serie?da=&a=&passo=GIORNO|SETTIMANA|MESE&sedi=1,2` → i numeri intervallo per intervallo, per il monitoraggio **giornaliero** (`GIORNO`), **settimanale** (`SETTIMANA`), **mensile** (`MESE`) e **annuale diviso mese per mese** (`MESE` con `da`–`a` su un anno: 12 intervalli).

```
{ "da": "2026-03-01", "a": "2026-04-30", "passo": "MESE",
  "totale": { "inizio": "2026-03-01", "fine": "2026-04-30", "pizze": 37, "ordini": 15,
              "ricaviTotaliCent": 32000, "ricaviExtraCent": 1000, "ricaviConDatiCent": 28000,
              "scontrinoMedioCent": 1867, "pizzePerOrdine": 2.47, "conDati": true, "daTotaleSettimanale": true },
  "intervalli": [
    { "inizio": "2026-03-01", "fine": "2026-03-31", "pizze": 31, "ordini": 13,
      "ricaviTotaliCent": 25000, "ricaviExtraCent": 1000, "ricaviConDatiCent": 23000,
      "scontrinoMedioCent": 1769, "pizzePerOrdine": 2.38, "conDati": true, "daTotaleSettimanale": true },
    { "inizio": "2026-04-01", "fine": "2026-04-30", "pizze": 6, "ordini": 2,
      "ricaviTotaliCent": 7000, "ricaviExtraCent": 0, "ricaviConDatiCent": 5000,
      "scontrinoMedioCent": 2500, "pizzePerOrdine": 3.0, "conDati": true, "daTotaleSettimanale": false } ],
  "perSede": [
    { "sedeId": 1, "nome": "Via Roma", "archiviata": false, "inizio": "2026-03-01", "fine": "2026-04-30",
      "pizze": 28, "ordini": 11, "ricaviTotaliCent": 24000, "ricaviExtraCent": 1000, "ricaviConDatiCent": 21000,
      "scontrinoMedioCent": 1909, "pizzePerOrdine": 2.55, "conDati": true, "daTotaleSettimanale": true },
    { "sedeId": 2, "nome": "Mare", "archiviata": false, "inizio": "2026-03-01", "fine": "2026-04-30",
      "pizze": 9, "ordini": 4, "ricaviTotaliCent": 8000, "ricaviExtraCent": 0, "ricaviConDatiCent": 7000,
      "scontrinoMedioCent": 1750, "pizzePerOrdine": 2.25, "conDati": true, "daTotaleSettimanale": false } ] }
```

- `da`, `a`, `passo` obbligatori, `da` ≤ `a`; `sedi` come negli altri `GET` (vedi Sedi: assente = le non personali, archiviate comprese; le sedi personali qui non contano mai). Errori 400: «Servono entrambe le date: da e a.», «La data iniziale non può essere dopo quella finale.», «Indica il passo: GIORNO, SETTIMANA o MESE.», «passo: valore non valido: … (GIORNO, SETTIMANA o MESE).», `sedi` non valido come nel riepilogo.
- **Intervalli**: `GIORNO` = un giorno; `SETTIMANA` = settimane ISO lunedì–domenica; `MESE` = mesi di calendario. In ordine cronologico, senza buchi, **tagliati al periodo**: il primo inizia da `da` e l'ultimo finisce ad `a` anche se la settimana o il mese continuano (dal mercoledì 4 marzo, la prima settimana è 4–8 marzo). `inizio` e `fine` sono compresi.
- **Al massimo 400 intervalli** (più di un anno giorno per giorno); oltre → 400 «Troppi intervalli (N): al massimo 400. Scegli un passo più lungo o un periodo più breve.» (si controlla prima di leggere i dati).
- Per ogni intervallo, sommando le sedi del filtro: `pizze`, `ordini` dei giorni inseriti con data nell'intervallo, più i **totali settimanali il cui lunedì** cade nell'intervallo (regola 1); `ricaviTotaliCent`, `ricaviExtraCent` = i ricavi con data nell'intervallo; `ricaviConDatiCent` come in regola 2 (per un totale settimanale: i ricavi di tutta la sua settimana, anche se finisce fuori dall'intervallo o dal periodo, per questo può superare `ricaviTotaliCent`); `scontrinoMedioCent` = `ricaviConDatiCent ÷ ordini` (`null` se non calcolabile), `pizzePerOrdine`; `conDati` = c'è almeno un dato inserito (un giorno, anche 0/0, o un totale settimanale) nell'intervallo, per distinguere «zero» da «non inserito».
- `totale`: le stesse grandezze per tutto il periodo [`da`, `a`] (lo scontrino del totale è calcolato sul totale, non come media degli intervalli).
- `daTotaleSettimanale` (in ogni intervallo, in `totale` e in `perSede`): `true` se fra i dati dell'intervallo c'è almeno un **totale settimanale** (dati inseriti come «Totale della settimana», non giorno per giorno), che conta tutto nel giorno del suo lunedì (regola 1). Serve al grafico Giorno per segnalare che quel lunedì porta i numeri di tutta la settimana. Un totale il cui lunedì è fuori dal periodo non conta e non accende il segnale.
- `perSede` (novembre 2026): una riga per sede, con **gli stessi campi di `totale`** (`inizio` = `da`, `fine` = `a`) più `sedeId`, `nome`, `archiviata`, calcolata sulle **date esatte** [`da`, `a`] come il totale (a differenza di `perSede` di `GET /api/statistiche`, che usa le settimane il cui lunedì cade nel periodo: sullo stesso periodo i due possono differire). Le sedi sono quelle del filtro, nell'ordine di `GET /api/sedi` (attive per `ordine`, poi archiviate); le sedi attive compaiono sempre, anche a zero (`conDati: false`, medie `null`); le archiviate solo se nel periodo hanno ricavi o dati; le sedi personali mai. La somma di `pizze`, `ordini`, `ricaviTotaliCent`, `ricaviExtraCent` e `ricaviConDatiCent` delle righe è il valore di `totale` (scontrino e pizze per ordine no: sono rapporti).

## Gestione di categorie, fornitori e dipendenti (richieste del cliente, novembre 2026)

Stesso contratto per le tre anagrafiche; `{anagrafica}` = `categorie`, `fornitori` o `dipendenti`.

- Le tre `GET` elencano anche `usi`: quanti **movimenti** usano la voce (intero ≥ 0). Il resto della forma non cambia.
- `PUT /api/categorie/{id}` `{nome}`, `PUT /api/fornitori/{id}` `{nome, partitaIva?}`, `PUT /api/dipendenti/{id}` `{nome}` → l'oggetto aggiornato (con `usi`). Si rinomina **qualunque** voce (non ci sono voci «di sistema»; per le categorie, `PUT` accetta anche `retribuzione`, vedi Anagrafiche). Cambiano anche movimenti e ripetizioni che la usano, perché puntano alla voce. Errori: nome vuoto o oltre 120 caratteri → 400; inesistente → 404; nome già usato da un'altra voce (stessa anagrafica, per le categorie stesso `tipo`, senza distinguere maiuscole) → 409 «Esiste già …». Cambiare solo la grafia della stessa voce è permesso. Cade il vecchio 409 «Questa categoria è predefinita e non si rinomina.».
- `DELETE /api/{anagrafica}/{id}` → 204. **Senza parametri elimina la voce e lascia i movimenti e le ripetizioni che la usavano senza quella voce** (campo `null`; categoria, fornitore e dipendente sono sempre facoltativi sui movimenti, quindi non c'è nessun blocco). Parametro facoltativo:
  - `sostituisciCon={idAltra}`: prima di eliminare sposta su `idAltra` tutti i movimenti **e le ripetizioni** che usano la voce (è il modo di **unire** due voci scritte male). L'altra voce deve esistere (404), essere diversa (400) e, per le categorie, avere lo stesso `tipo` (400).
  - Inesistente → 404. Tutto o niente (una transazione).
- I totali del Riepilogo non cambiano per un'eliminazione (cambia solo il dettaglio per voce): nelle statistiche per voce i movimenti rimasti senza voce stanno nella riga «Senza fornitore» / «Senza dipendente» / «Senza categoria» (`id: null`). L'interfaccia, prima di eliminare una voce usata, dice «usata da N movimenti: resteranno senza».

## Statistiche per voce (costi e ricavi)

`GET /api/statistiche/voci?da=&a=&raggruppa=FORNITORE|DIPENDENTE|CATEGORIA&tipo=&sedi=` (`da`, `a`, `raggruppa` obbligatori; `da` ≤ `a`; `sedi` come nel Riepilogo; `tipo` facoltativo: `RICAVO`, `COSTO_VARIABILE`, `COSTO_FISSO` o `COSTI` = variabili + fissi; assente = tutti i tipi per `CATEGORIA`, `COSTO_VARIABILE` per `FORNITORE`). Valori non validi → 400 come nel Riepilogo. **Con `raggruppa=DIPENDENTE` si considerano solo le retribuzioni**, cioè i movimenti con `documento` `RETRIBUZIONE_REGOLARE` o `RETRIBUZIONE_EXTRA`, e `tipo` non si usa (si ignora): un costo fisso come l'affitto non è una retribuzione e non compare nemmeno in «Senza dipendente» (la riga `id: null` è quella delle retribuzioni senza dipendente).

Si considerano i movimenti nel periodo (per data) del filtro; l'importo di una voce è l'importo del movimento, tranne le **note di credito**, che lo riducono (anche sotto zero). I movimenti senza la voce scelta (nessun fornitore, nessun dipendente, nessuna categoria) vanno in una riga con `id: null`, solo se ci sono movimenti.

```
{ "da": "2026-09-01", "a": "2026-11-30", "raggruppa": "FORNITORE", "tipo": "COSTI",
  "mesi": ["2026-09", "2026-10", "2026-11"],
  "totaleCent": 123456, "movimenti": 42,
  "voci": [
    { "id": 7, "nome": "Bel Fungo", "totaleCent": 80000, "movimenti": 9,
      "regolareCent": 0, "extraCent": 0,
      "pagataCent": 50000, "fattureCent": 70000,
      "perMese": [30000, 50000, 0],
      "movimentiPerMese": [4, 5, 0],
      "pagataPerMese": [30000, 20000, 0],
      "fatturePerMese": [30000, 40000, 0] } ] }
```

- `pagataCent`: solo con `raggruppa=FORNITORE`: la somma delle fatture (`documento` `FATTURA`) della voce già segnate come pagate (`pagata=true`). Con gli altri `raggruppa` è `null`.

- `fattureCent`: solo con `raggruppa=FORNITORE`: la somma delle fatture della voce meno le note di credito (`FATTURA` − `NOTA_DI_CREDITO`), **senza gli scontrini**, che sono già pagati alla cassa. Quanto resta da pagare è `fattureCent − pagataCent` (non `totaleCent − pagataCent`, che conterebbe anche gli scontrini); le note di credito riducono `fattureCent` ma non sono «pagate», quindi il risultato può essere negativo (credito). Con gli altri `raggruppa` è `null`.

- `pagataPerMese`, `fatturePerMese`: solo con `raggruppa=FORNITORE`: `pagataCent` e `fattureCent` divisi per mese, con lo stesso numero di elementi e lo stesso ordine di `mesi` (la somma degli elementi è il rispettivo totale; quanto resta da pagare di un mese è `fatturePerMese[i] − pagataPerMese[i]`). Con gli altri `raggruppa` sono `null`.

- `mesi`: tutti i mesi di calendario (`yyyy-MM`) toccati dal periodo, in ordine; `perMese` ha lo stesso numero di elementi, nello stesso ordine, e la somma dei suoi elementi è `totaleCent` (il movimento sta nel mese della sua data; contano solo le date tra `da` e `a`).
- `movimentiPerMese` (interi, per **tutti** i `raggruppa`): quanti movimenti della voce in ogni mese, con lo stesso numero di elementi e lo stesso ordine di `mesi`; la somma è `movimenti` (le note di credito contano come movimenti). Serve a dire «N movimenti» del mese scelto.
- **Un movimento diviso fra sedi vale 1** (novembre 2026). Nei conteggi (`movimenti` e `movimentiPerMese` di ogni voce, `movimenti` in cima) le parti con lo stesso `divisione` (vedi «Movimenti divisi») che cadono **nella stessa voce e nello stesso mese** contano **una volta**: una fattura divisa fra tre sedi è 1 movimento, non 3. Vale anche se il filtro `sedi` ne prende solo alcune parti: conta 1, e gli importi sono la somma delle sole parti delle sedi scelte. **Gli importi non cambiano** (`totaleCent`, `perMese`, `fattureCent`, `pagataCent`, `fatturePerMese`, `pagataPerMese` sommano le parti, sede per sede: sono importi, non conteggi). Se le parti finiscono in voci o mesi diversi (una parte modificata) contano una volta in ciascuno. I movimenti senza `divisione` contano uno per uno, come prima. Di conseguenza `movimenti` può essere minore del numero di righe di `GET /api/movimenti` con gli stessi filtri (che elenca le parti); le somme degli importi restano uguali.
- `regolareCent`/`extraCent`: solo con `raggruppa=DIPENDENTE` (somma di `RETRIBUZIONE_REGOLARE` e `RETRIBUZIONE_EXTRA`; gli altri documenti contano nel totale ma in nessuno dei due); altrimenti 0.
- `voci` ordinate per `totaleCent` decrescente, a parità per nome. Una voce senza movimenti nel periodo non compare. La riga `id: null` va in fondo.
- `totaleCent` = somma di `voci[].totaleCent`; `movimenti` = somma di `voci[].movimenti` (i movimenti considerati, con le parti di una divisione contate una volta per voce e mese).
- `tipo`: il tipo **effettivo** usato: per `FORNITORE` quello chiesto o `COSTO_VARIABILE`; per `CATEGORIA` quello chiesto o `null` (= tutti i tipi); per `DIPENDENTE` sempre `null` (solo retribuzioni). Servizio e demo uguali.

## Fatture da fare (promemoria mensile)

Serve per ricordarsi quali **fatture emettere** (e se sono state pagate) ogni mese: l'utente crea le sue «caselle» (per esempio una per cliente o per tipo di fattura) e ogni mese ne segna lo stato. Non è collegato ai movimenti e non entra nei totali.

`StatoFattura`: `DA_FARE` (predefinito), `EMESSA`, `PAGATA`.

- `GET /api/fatture/caselle` → `[{id, nome, dalMese, giornoScadenza}]` nell'ordine di creazione. `dalMese` (`yyyy-MM`) è il mese in cui la casella è stata creata: **i mesi precedenti non contano** (niente arretrati «in ritardo» alla creazione). `giornoScadenza` (1–31 o `null`) è il giorno del mese entro cui fare la fattura; nei mesi più corti vale l'ultimo giorno.
- `POST /api/fatture/caselle` `{nome, giornoScadenza?, dalMese?}` → 201 con la casella; se esiste già (senza distinguere maiuscole) → 200 con quella. `dalMese` assente = il mese corrente. Nome vuoto o oltre 120 caratteri, `giornoScadenza` fuori da 1–31, `dalMese` non `yyyy-MM` → 400.
- `PUT /api/fatture/caselle/{id}` `{nome?, giornoScadenza?, dalMese?}` (almeno un campo; `giornoScadenza: null` toglie la scadenza) → la casella (404; 400 valore non valido; 409 «Esiste già una casella con questo nome.»).
- `DELETE /api/fatture/caselle/{id}` → 204; elimina anche i suoi stati mensili (404 se non esiste). L'interfaccia avvisa.
- `GET /api/fatture?da=yyyy-MM&a=yyyy-MM` (`da` ≤ `a`, al massimo 24 mesi, altrimenti 400) →

```
{ "mesi": ["2026-10", "2026-11"],
  "caselle": [
    { "id": 1, "nome": "Fatture Euro Service", "dalMese": "2026-10", "giornoScadenza": 28,
      "mesi": [ { "mese": "2026-10", "attiva": true, "stato": "PAGATA", "importoCent": 125000, "nota": "N. 45", "scadenza": "2026-10-28" },
                { "mese": "2026-11", "attiva": true, "stato": "DA_FARE", "importoCent": null, "nota": null, "scadenza": "2026-11-28" } ] } ],
  "daFare": 1 }
```

  Ogni casella ha un elemento per ciascun mese richiesto (stato `DA_FARE` se nulla è stato salvato). `attiva` è falsa per i mesi precedenti a `dalMese` in cui non è salvato nessuno stato (l'interfaccia li mostra neutri, «—», non «in ritardo»); un mese con uno stato salvato è sempre attivo. `scadenza` (`yyyy-MM-dd`) è la data limite del mese se la casella ha `giornoScadenza`, altrimenti `null`. `daFare` = numero di coppie (casella, mese) **attive** in `DA_FARE` nell'intervallo.
- `GET /api/fatture/promemoria` → `{daFare, inScadenza: [{casellaId, nome, mese, scadenza, giorniMancanti}]}` per il **mese corrente** del servizio (indipendente dal periodo che l'utente guarda): `daFare` = caselle attive in `DA_FARE` questo mese; `inScadenza` = quelle tra loro con `scadenza` e `giorniMancanti` (= scadenza − oggi, negativo se scaduta) **≤ 3**, ordinate per `giorniMancanti` crescente. Serve alla scheda del Riepilogo («Fattura a Rossi: scade tra 3 giorni»); non è una notifica: l'app non manda avvisi a schermo spento.
- `PUT /api/fatture/caselle/{id}/mesi/{mese}` `{stato, importoCent?, nota?}` → `{mese, stato, importoCent, nota}`. `importoCent` ≥ 0 (centesimi), `nota` fino a 200 caratteri; stato non valido, mese non `yyyy-MM`, importo negativo → 400; casella inesistente → 404. Se `stato` è `DA_FARE` e non ci sono né importo né nota, lo stato salvato si cancella (si torna al predefinito).
- Le caselle si salvano nel database e quindi nella copia di sicurezza; l'esportazione non le contiene.

### Fatture ricevute (pagate / da pagare)

Le fatture **ricevute dai fornitori** (movimenti `COSTO_VARIABILE` con `documento` `FATTURA`, a mano o importate da XML) hanno il campo `pagata`, per controllare a fine mese quello che è stato davvero pagato. Le caselle qui sopra restano per le fatture **da emettere**: sono due cose diverse e l'interfaccia le tiene in due schede.
- `pagata` esiste solo per `FATTURA`: per ogni altro documento è sempre `false` e il campo in ingresso si ignora. Le fatture create a mano nascono **da pagare** (`false`, salvo `pagata: true` nel corpo); quelle **importate da XML nascono pagate** (`true`: sono lo storico; le note di credito importate restano `false`); la migrazione segna come **pagate** quelle già presenti (si presume pagate, per non riempire di arretrati chi usa già l'app).
- `PUT /api/movimenti/{id}/pagata` `{pagata: boolean}` → il `Movimento` aggiornato. 404 se non esiste; 400 «Solo una fattura si segna come pagata.» se il `documento` non è `FATTURA`; `pagata` mancante o non booleano → 400. Cambia solo questo campo (non `modificatoIl` di altro).
- `GET /api/movimenti?pagata=true|false` (vedi Movimenti) filtra le fatture; le note di credito non hanno stato.
- `GET /api/statistiche/voci?raggruppa=FORNITORE` dà `fattureCent` e `pagataCent` per fornitore, anche per mese (`fatturePerMese`, `pagataPerMese`; vedi «Statistiche per voce»): è il confronto «totale delle fatture del fornitore nel mese / quanto già pagato», e quanto resta da pagare è `fattureCent − pagataCent`.

## Accesso con password

Facoltativa: finché non è impostata l'app è aperta (come prima). Impostata, ogni `/api/**` risponde `401 {"errore":"Accesso richiesto."}` a chi non ha la sessione. Restano aperti `/api/accesso` e `/api/versione`; l'interfaccia (file statici) è pubblica, i dati no.

- `GET /api/accesso` → `{protetta, autenticato}` (`autenticato` è vero anche senza password).
- `POST /api/accesso {password}` → 200 `{protetta:true, autenticato:true}` e cookie `contabilita_sessione` (HttpOnly, SameSite=Lax, «di sessione»: sparisce chiudendo il browser; la sessione cade comunque dopo 30 minuti senza richieste, ogni richiesta la rinnova: la password si chiede ad ogni accesso); 401 «Password sbagliata.»; 429 dopo 5 errori di fila, per 30 secondi.
- `DELETE /api/accesso` → 204, chiude la sessione.
- `PUT /api/accesso/password {attuale, nuova}` → imposta, cambia o toglie (`nuova` vuota) la password. Con una password già impostata serve `attuale` (403 se sbagliata); `nuova` ha 4–200 caratteri (400). Le altre sessioni cadono; chi cambia riceve il cookie nuovo.
- La password è salvata solo come impronta PBKDF2-SHA256 con sale (chiave interna `accesso.password`, invisibile e non scrivibile da `/api/impostazioni`). Le sessioni stanno in memoria: riavviando il servizio si rientra con la password.

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
- `voci` (in ogni sezione del Riepilogo) è ordinato per importo decrescente, poi per nome; «Senza categoria» raccoglie i movimenti senza categoria e sta sempre in fondo.
- **Cartella delle copie.** Se non è configurata (`backup.cartella`), le copie vanno nella cartella predefinita `<cartella dati>/copie`, creata al bisogno: vale per il backup automatico delle 03:00, il recupero all'avvio (su installazione nuova crea subito una copia), «Fai ora», l'elenco delle copie, il ripristino e la pulizia delle ultime 10. `PUT /api/programma/backup` `{cartella}` risponde con lo stesso oggetto di `GET /api/programma`: `cartella` nulla o vuota (o uguale al percorso predefinito) torna al default; un percorso deve essere assoluto (400 «La cartella delle copie deve essere un percorso completo (per esempio D:\Copie).»), creabile e scrivibile (verificato con un file temporaneo, altrimenti 400 in italiano), e non può stare dentro la cartella dati se non è il default (400 «La cartella delle copie non può stare dentro i dati, tranne quella predefinita.»). Dopo un cambio di cartella, `ultimoBackup` continua a indicare l'ultima copia fatta nella cartella precedente. `POST /api/programma/backup`: 409 solo se una copia è già in corso, 500 con `{errore}` se fallisce. Nel log la cartella delle copie, i nomi delle copie e i messaggi di errore che li riportano passano da `PerLog.pulisci` (vedi Convenzioni, «Log»); nelle risposte e nei file `ripristino-*.json` restano come sono. `GET /api/rete/qr.png`: 503 se non c'è nessun indirizzo.
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

`GET /api/esporta?formato=xlsx|csv&da=&a=&includi=RICAVO,COSTO_VARIABILE,COSTO_FISSO&sedi=&statistiche=true|false&colonnePerSede=true|false` → il file in streaming (`Content-Disposition: attachment`, nome `fuorigioco-AAAA-MM-GG_AAAA-MM-GG.xlsx` / `.csv` con il periodo; `da` e `a` obbligatori, inclusivi; `includi` facoltativo, default tutti i tipi; valori non validi → 400). `statistiche` (default `true`) e `colonnePerSede` (default `false`) valgono solo per l'XLSX; il CSV le ignora.

**Controlli sui parametri**, tutti 400 `{"errore": …}`, in quest'ordine (il primo che fallisce risponde; il servizio finto della demo fa lo stesso, `parametriEsporta` ed `esportaFile` in `ui/src/demo/backend.ts`):

1. un valore che non si legge, nell'ordine `da`, `a`, `statistiche`, `colonnePerSede` → «`<nome>`: valore non valido: `<valore>`» (per esempio «da: valore non valido: marzo»). Le date sono ISO `AAAA-MM-GG` e devono esistere (`2026-02-30` no); i sì/no sono `true`/`on`/`yes`/`1` e `false`/`off`/`no`/`0`, senza badare alle maiuscole. Un valore vuoto (`da=`) vale come assente, e così una data di soli spazi;
2. `sedi` → «sedi: valore non valido: …»;
3. `formato` assente, vuoto o diverso da `xlsx`/`csv` scritti in minuscolo → «formato: deve essere xlsx o csv»;
4. `da` o `a` assente → «Servono entrambe le date: da e a.»;
5. `da` dopo `a` → «La data iniziale non può essere dopo quella finale.» (lo stesso giorno va bene);
6. `includi` → «includi: valore non valido: …».

Test: `EsportaApiTest.iControlliDeiParametriHannoUnOrdineEDeiTestiPrecisi` (servizio) e `ui/src/demo/esporta.test.ts` (demo), con gli stessi casi.

- **Etichette in italiano** nel file: Tipo `Ricavo` / `Costo variabile` / `Costo fisso`; Documento `Fatturato`, `Extra`, `Fattura`, `Nota di credito`, `Scontrino`, `Retribuzione regolare`, `Retribuzione extra`, `-` (per `NESSUNO`).
- **Colonne del foglio Movimenti** (stesso ordine nel CSV): `Data`, `Tipo`, `Documento`, `Categoria`, `Fornitore`, `Dipendente`, `Descrizione`, `N. documento`, `Note`, `Importo`, `Origine` (`A mano`, `Fattura elettronica` per i movimenti importati, cioè `origine = XML`, `Ricorrenza`; fino a novembre 2026 il file diceva `XML`, che per il cliente è gergo), `Sede` (il nome; ultima colonna, dopo `Origine`, così le colonne di prima non si spostano). `sedi` filtra come negli altri `GET` (vedi Sedi: assente = tutte le sedi non personali, archiviate comprese; esplicito = l'elenco dato, personali comprese): vale per i movimenti e per il foglio `Riepilogo` (e le sue colonne per sede); i fogli delle statistiche non hanno mai le sedi personali. Ordinati per data crescente poi id. `Importo` **con segno** (ricavi positivi, costi negativi).
- **XLSX** (libreria fastexcel, scrittura in streaming come nel progetto etichette): fogli `Movimenti` (data come cella data, importo come numero in euro con formato valuta, intestazione in grassetto e riga bloccata, larghezze colonna adeguate: la colonna `Origine` è larga 20, per «Fattura elettronica») e `Riepilogo` (stesse righe di `GET /api/riepilogo` per il periodo: per ogni sezione una riga per categoria (`voci`, «Senza categoria» in fondo) e il totale della sezione; poi, come dettaglio «di cui», fatturati/extra, fatture/scontrini e retribuzione regolare/extra, che non si sommano ai totali; infine costi e risultato; importi come numeri). Le righe di categoria stanno prima del totale della loro sezione, le righe «di cui» subito dopo. Testi esatti: prima riga «Riepilogo dal AAAA-MM-GG al AAAA-MM-GG», una riga vuota, intestazione «Voce | Importo»; le righe fisse si chiamano «Totale ricavi», «Ricavi fatturati», «Ricavi extra», «Totale costi variabili», «Fatture», «Scontrini», «Totale costi fissi», «Retribuzione regolare», «Retribuzione extra», «Costi», «Risultato» (le righe per documento ci sono sempre, anche a zero, e non hanno la dicitura «di cui»); i costi sono positivi. Il servizio finto della demo scrive lo stesso foglio (`RIEPILOGO_FILE` e `righeFoglioRiepilogo` in `ui/src/api/esporta.ts`).
- **`colonnePerSede=true`** (solo XLSX, foglio `Riepilogo`): ogni importo è ripetuto in una colonna per ogni sede del filtro `sedi`, nell'ordine delle sedi (le archiviate solo se hanno movimenti nel periodo; ogni colonna è il Riepilogo calcolato con il filtro di quella sola sede), più una colonna finale `Totale` (il Riepilogo complessivo, cioè la somma delle colonne per sede). Intestazione: `Voce`, `<nome sede 1>`, …, `<nome sede N>`, `Totale`. Le righe sono quelle del Riepilogo complessivo: una categoria presente solo in alcune sedi compare con 0 nelle altre. Con una sola sede nel filtro/periodo, o con `false`, resta la sola colonna `Importo` di prima.
- **Foglio `Statistiche`** (solo XLSX, dopo `Riepilogo`, **presente solo se** `statistiche` non è `false` e nel periodo c'è almeno un dato di pizze/ordini, giorni o totali settimanali; vedi «Statistiche»): colonne `Settimana` (il lunedì, come data), `Sede`, `Pizze`, `Ordini` (la somma dei giorni, oppure il totale settimanale: regola 1), `Ricavi` (tutti i ricavi della sede in quella settimana, in euro), `Scontrino medio` (in euro, = ricavi dei giorni con dati ÷ ordini; vuoto se gli ordini sono 0 o se quei ricavi sono 0, regola 3), e in fondo, nuove, `Ricavi extra`, `Ricavi dei giorni con dati` (quelli dello scontrino) e `Giorni inseriti` (un numero, oppure il testo «Totale settimanale» per le settimane inserite con il totale). Una riga per ogni sede con dati in ogni settimana il cui lunedì cade in [`da`, `a`], per settimana e poi nell'ordine delle sedi (prima: per inserimento); segue il filtro `sedi`.
- **Foglio `Pizze per giorno`** (solo XLSX, ultimo, presente solo se c'è il foglio `Statistiche` e in quelle settimane c'è almeno un giorno inserito): colonne `Data`, `Sede`, `Pizze`, `Ordini`, `Ricavi` (della sede in quel giorno), `Ricavi extra`, `Scontrino medio` (vuoto con 0 ordini, e vuoto anche quando il giorno ha ordini ma 0 incassi: come «—» nell'interfaccia, non 0); una riga per giorno inserito, per data e poi nell'ordine delle sedi. Il CSV non contiene nessuno dei due fogli.
- **CSV**: solo i movimenti; separatore `;`, UTF-8 con BOM (si apre bene in Excel italiano), date `yyyy-MM-dd`, importi con virgola decimale e nessun separatore delle migliaia, campi con `;`, virgolette o a capo tra virgolette raddoppiate.
- Nessun elemento nel periodo: il file si genera comunque (solo intestazione); nessun errore.

## Importazione di fatture elettroniche (fase 4)

Gli zip si leggono dal loro indice finale (passano da un file temporaneo, cancellato subito), perché quelli esportati da Fatture in Cloud hanno nei descrittori delle voci dimensioni a zero e una lettura a flusso li rifiuta. Le voci che non sono `.xml`/`.xml.p7m` (elenchi Excel, PDF) non si decomprimono.

File accettati: `.xml` (FatturaPA, anche con più fatture in un lotto; tracciato ordinario `FatturaElettronica` FPR12/FPA12 e tracciato **semplificato** `FatturaElettronicaSemplificata` FSM10), `.xml.p7m` (fattura firmata: se ne estrae l'XML incorporato) e `.zip` con dentro file dei tipi precedenti (anche in sottocartelle). Tutto si legge **in locale**; il parser XML deve rifiutare DTD ed entità esterne (XXE); lo zip va letto con i controlli contro `zip-slip` e contro le «zip bomb» (limite al numero di file, al più 20 MB per file e 200 MB in totale decompressi; tutti e due si abbassano con la memoria del programma, vedi «Quanto si legge in una volta»).

**Quanto si legge in una volta (novembre 2026).** Tutto quello che un'anteprima legge resta in memoria fino alla conferma, e mentre si legge ci sono insieme il caricamento, i file estratti dagli zip e le anteprime di prima (quelle che il nuovo carico farebbe comunque uscire si tolgono prima di leggere: vedi «Far posto prima di leggere» qui sotto). Per questo un'anteprima accetta al massimo `letturaMassima` byte, contati due volte: sulla **somma dei file caricati** (prima ancora di portarli in memoria) e sulla **somma dei file letti**, cioè gli `.xml`/`.p7m` caricati più quelli estratti da tutti gli zip della stessa richiesta (prima il totale valeva per ogni zip, quindi tre zip insieme potevano estrarre il triplo).

- `letturaMassima` = il **minimo** fra la proprietà `contabilita.importa.lettura-massima` (predefinita `200MB`, che è anche il massimo: il limite fisso di `LettoreFile`) e il **25% della memoria massima della JVM** (`ImportazioneService.limiteLettura`, stessa regola del tetto delle anteprime qui sotto, che è il 40%). L'installer avvia il servizio con **`-Xmx512m`** (`installer/Contabilita.xml` e il plist del Mac; erano 256 MB): quindi **128 MB**. Con 256 MB sarebbero 64 MB. Quando la memoria abbassa il valore configurato, all'avvio il log lo dice.
- Perché tutte e due le cose (più memoria e limiti che la seguono): con 256 MB i limiti scritti (120 MB di caricamento, 200 MB estratti, 96 MB di anteprime) non potevano stare insieme, e una sola anteprima grande finiva la memoria; abbassare solo i limiti avrebbe rifiutato archivi normali (un anno di fatture), alzare solo la memoria avrebbe lasciato limiti che non dipendono da lei. `-Xmx` è un tetto: la JVM prende solo la memoria che usa.
- Caricamento oltre il limite → **400** «I file scelti sono troppo grandi tutti insieme (massimo N MB per volta): scegline meno e riprova.» (niente si legge). Con la memoria dell'installer questo 400 **non si vede**: `letturaMassima` (128 MB) è più alta del limite del multipart, che scatta prima. Lo si vede solo con meno memoria (sotto i 480 MB di `-Xmx`) o abbassando la proprietà.
- Caricamento oltre i limiti del multipart (`spring.servlet.multipart`: **120 MB per file e 120 MB per richiesta**, uguali apposta; il primo era 100 MB) → **400** «Il caricamento è troppo grande (massimo 120 MB per volta): scegli meno file, o file più piccoli, e riprova.». Il numero è `max-request-size`, letto dalla configurazione; il testo vale per un file come per tanti (prima era «Il file è troppo grande.», al singolare e senza massimo) e per ogni caricamento, allegati compresi (che hanno poi il loro limite di 8 MB). I due limiti non si possono allineare a `letturaMassima`: sono fissi nella configurazione, lei segue la memoria.
- File letti oltre il limite → il file (o lo zip) che lo farebbe superare non si legge e finisce in `errori`: «I file scelti sono troppo grandi tutti insieme (massimo N MB per volta): «nome» non è stato letto. Leggi meno file per volta.»; quelli letti prima restano nell'anteprima, e un file più piccolo che viene dopo e ci sta si legge. Uno zip che supera il limite **da solo** dà il messaggio degli zip («Il contenuto dello zip è troppo grande (massimo N MB in totale): non è stato letto.»), un file singolo oltre il limite per file «Il file «nome» è troppo grande per essere letto (massimo N MB).» (N = il più piccolo fra il limite per file, qui sotto, e `letturaMassima`).
- **Limite per file (novembre 2026).** Un XML si apre tutto in memoria (un DOM) e, aperto, occupa molte volte i suoi byte: i 20 MB fissi di prima non seguivano la memoria (un file da 20 MB poteva chiedere centinaia di MB). Ora un file, caricato da solo o estratto da uno zip, si legge se pesa al più il **minimo fra 20 MB e (25% della memoria massima della JVM) / 8** (`ImportazioneService.limiteFile`, stessa funzione di calcolo e stessa parte di `letturaMassima`; dal megabyte in su in MB interi, per difetto, così il numero detto al cliente è quello vero). Con la memoria dell'installer (**`-Xmx512m`**) sono **16 MB**; con 256 MB sarebbero 8; i 20 MB valgono da 640 MB in su. Quando la memoria lo abbassa, all'avvio il log lo dice («Importazione: un file si legge se pesa al massimo 16 MB invece di 20 MB, perché la memoria del programma è 512 MB.»).
  - Il fattore **8** (`FATTORE_DOM`) viene da una misura con Java 17 su file da 10 MB: una fattura con tante righe (elementi brevi) occupa, aperta e visitata, circa **6 volte** i suoi byte; un allegato in base64 circa **1 volta**; un file fatto apposta di soli elementi minimi (`<a>1</a>`) circa **26 volte**. 8 copre il caso peggiore misurato fra le fatture vere (6) con un terzo di margine.
  - **Cosa il fattore 8 non copre.** Primo: è stata misurata la memoria che resta occupata a file aperto, **non il picco durante l'apertura** (il parser, mentre lavora, usa altra memoria che poi lascia): quel picco non è misurato. Secondo: **non copre un file costruito apposta**: 16 MB di soli elementi minimi chiedono circa 416 MB, che in 512 MB non stanno insieme al resto; la lettura finirebbe la memoria. Si è accettato perché il programma è locale e lo usa una persona sola, che quel file dovrebbe fabbricarselo; e con i 20 MB fissi di prima lo stesso file ne chiedeva circa 520.
  - Da dove vengono i 16 MB: 512 MB × 25% = 128 MB è la parte di memoria di una lettura; diviso 8 fa 16 MB. Perché non un fattore più prudente (con 16 il limite sarebbe 8 MB): un file vero di quella taglia è quasi certamente una fattura con un PDF allegato, cioè il caso che costa meno (circa 1 volta i suoi byte), e un limite di 8 MB l'avrebbe respinto senza motivo. Resta un limite **più stretto di prima**: un file fra 16 e 20 MB, che con i 20 MB fissi si leggeva, con la memoria dell'installer ora è rifiutato col messaggio qui sotto. Quanto spesso un cliente abbia fatture così grandi non è stato misurato.
  - Messaggi, in `errori`: file singolo «Il file «nome» è troppo grande per essere letto (massimo N MB).» (gli altri file della stessa richiesta si leggono); dentro uno zip «Il file «nome» nello zip è troppo grande per essere letto (massimo N MB).», con `nomeFile` = `archivio.zip › percorso`. **La voce troppo grande si scarta da sola e le altre voci dello zip si leggono** (prima lo zip intero era rifiutato: con 16 MB l'archivio di un anno sarebbe saltato per una sola fattura con un PDF grande). Se la dimensione dichiarata nell'indice dello zip è già oltre il limite, la voce non si decomprime affatto e non pesa sul totale; se la dimensione manca o è falsa ce ne si accorge decomprimendo, e i byte decompressi fin lì contano nel totale. Il limite sul **totale estratto** resta com'era e rifiuta tutto lo zip, così come il numero massimo di file: uno zip fatto di sole voci enormi finisce comunque rifiutato intero.
  - Costo del DOM, cosa si è guardato e cosa resta: il DOM vive solo per il tempo di leggere **un** file (`ParserFatturaPa.leggi` restituisce i dati e lo lascia; se ne apre uno alla volta) e Xerces lo costruisce già in forma compatta (i nodi si espandono solo dove li si visita). I byte del file invece restano, perché sono l'allegato della conferma: byte e DOM insieme ci sono solo durante la lettura di quel file. Per non pagare affatto il DOM servirebbe riscrivere il parser a flusso (SAX/StAX), saltando gli allegati: non fatto, non è una modifica piccola né senza rischi per i tracciati già provati. Resta anche che, per i `.p7m`, l'XML estratto dalla firma è una seconda copia dei byte che vive fino alla fine della lettura del file caricato (di uno zip: di tutti i suoi `.p7m`) e non è contata in `letturaMassima`.
- **Far posto prima di leggere (novembre 2026).** Prima le anteprime vecchie uscivano solo a lettura finita, quindi nel momento peggiore stavano in memoria insieme a caricamento e file estratti. Ora `ImportaController`, **prima di portare in memoria i file caricati**, chiama `ImportazioneService.faiPostoPerLaLettura` con nome e dimensione dichiarata di ogni file (`MultipartFile.getSize`): si tolgono le anteprime **più vecchie per ordine d'arrivo**, una alla volta, finché quelle che restano più il carico in arrivo stanno nel tetto in byte (`ImportazioneService.daScartarePrima`).
  - È la stessa scelta che si farebbe dopo: se la lettura riesce e pesa quanto dichiarato, far posto prima o dopo toglie **le stesse** anteprime (c'è un test che lo confronta). Cambia solo il momento.
  - **Se la lettura poi fallisce** (file che non sono fatture, zip rovinato), le anteprime tolte sono perse per niente: chi le conferma riceve il solito 404 «L'importazione è scaduta: rileggi i file.» e le rilegge. Si è scelto così perché l'alternativa (tenerle finché non si sa com'è andata) è proprio il picco di memoria da evitare, e finire la memoria ferma tutto il programma, non una sola anteprima. Per perdere il meno possibile: contano solo i byte che **possono** entrare in memoria (`LettoreFile.pesoAtteso`: zero per un tipo non supportato e per un `.xml`/`.p7m` oltre il limite per file, che si rifiutano senza leggerli); un caricamento rifiutato con 400 non arriva nemmeno qui; vale **solo il tetto in byte**, non quello delle 20 importazioni (venti anteprime leggere non pesano: quello lo decide l'inserimento); ci si ferma appena il carico ci sta; un carico che non pesa niente non toglie niente, nemmeno se si è già oltre il tetto.
  - Uno zip conta per i suoi byte **compressi**: estratto pesa di solito di più, e il resto del posto lo fa l'inserimento, come prima. Può anche pesare meno (uno zip pieno di PDF, che non si leggono): in quel caso si è tolto più del necessario.
  - Resta vero quanto sotto: **mai alla conferma**, e l'anteprima appena inserita non esce mai per l'inserimento stesso. Con due letture nello stesso momento, però, il posto fatto per la seconda può togliere la prima appena inserita un po' prima di quando l'avrebbe tolta comunque l'inserimento della seconda (e per niente, se la seconda fallisce).
- Non è una garanzia assoluta. La lettura di un file costa più dei suoi byte (vedi «Limite per file»: il fattore copre le fatture vere, non ogni file possibile). E il limite è **per anteprima, non in comune**: due anteprime lette nello stesso momento (due persone, o due schede) possono occupare ognuna fino a `letturaMassima`, più i rispettivi caricamenti; non c'è una coda né un semaforo, perché il programma lo usa una persona alla volta, e il tetto delle anteprime tenute in memoria vale solo dopo, quando sono pronte. I limiti rendono impossibile il caso in cui i soli file di **una** lettura non stanno in memoria.
- All'avvio, se il limite configurato non vale, il log dice quale vale e perché: «…perché la memoria del programma è N MB.», oppure, se la proprietà supera i 200 MB e la memoria basta, «…perché 200 MB è il massimo che il programma legge in una volta.» (`ImportazioneService.avvisoLimiteLettura`).

- `POST /api/importa/anteprima` (multipart, campo `files`, uno o più) → `{importazioneId, fatture: [FatturaLetta], errori: [{nomeFile, messaggio}]}`. **Non salva movimenti.** `importazioneId` identifica le fatture lette (in memoria, scade dopo 30 minuti). In memoria restano al massimo 20 importazioni e, in tutto, al massimo **96 MB di file originali** (i file letti, che la conferma allega ai movimenti; un file con più fatture conta una volta sola). Il tetto è il **minimo** fra la proprietà `contabilita.importa.memoria-massima` (predefinita `96MB`) e il **40% della memoria massima della JVM**: dipende quindi dall'`-Xmx` con cui l'installer avvia il servizio (`installer/Contabilita.xml`, oggi `-Xmx512m`, cioè circa 204 MB; con i 256 MB di prima erano circa 102), e oltre quel valore alzare la proprietà serve solo se si alza anche l'`-Xmx`; un tetto più alto della memoria non scatterebbe mai (si finirebbe la memoria prima). Quando la memoria abbassa il tetto configurato, all'avvio il log lo dice: oltre uno dei due tetti si scartano le **più vecchie per ordine d'arrivo**, finché si rientra, e solo quando ne arriva una nuova (mai alla conferma), così quella appena letta si può sempre confermare. Le più vecchie escono in due tempi: **prima di leggere** il nuovo carico, quanto basta a fargli posto secondo la dimensione dichiarata dei file (vedi «Far posto prima di leggere»), e **all'inserimento** dell'anteprima pronta, per il resto. Un'importazione che supera il tetto in byte **da sola** non si rifiuta: resta, da sola (tutte le altre si scartano), e si toglie quando arriva la successiva; quanto può pesare lo limita `letturaMassima` (vedi «Quanto si legge in una volta»: 128 MB con la memoria dell'installer, quindi può succedere, perché è più dei 96 MB del tetto). Chi conferma un'importazione scartata riceve il solito 404 «L'importazione è scaduta: rileggi i file.».
- `FatturaLetta`: `{indice, nomeFile, fornitore: {nome, partitaIva|null}, numero, data, imponibileCent, ivaCent, totaleCent, categoriaSuggerita: "nome"|null, duplicata: bool, motivo: "testo"|null, notaDiCredito: bool, integrazione: bool, tipoDocumento: "TD01", notaDiDebito: bool}`.
  - `fornitore.nome` = `Denominazione`, oppure `Nome Cognome`, del `CedentePrestatore`; `partitaIva` = `IdFiscaleIVA/IdCodice` (con o senza `IdPaese`). Nel tracciato ordinario stanno in `CedentePrestatore/DatiAnagrafici` (il nome in `Anagrafica`); nel semplificato sono figli diretti di `CedentePrestatore`.
  - `numero` = `DatiGeneraliDocumento/Numero`, `data` = `DatiGeneraliDocumento/Data`, `totaleCent` = `ImportoTotaleDocumento`; se manca = imponibile + IVA. `imponibileCent` e `ivaCent` = somma di `DatiRiepilogo/ImponibileImporto` e `Imposta`. Importi decimali con punto, da convertire a centesimi senza errori di arrotondamento (`BigDecimal`).
  - **Tracciato semplificato** (`TD07`, `TD08`, `TD09`): numero, data e tipo stanno negli stessi campi, ma il totale del documento non è scritto e non ci sono `DettaglioLinee`/`DatiRiepilogo`. Ogni `DatiBeniServizi` (uno o più) ha un `Importo` **IVA compresa** e `DatiIVA` con `Imposta` oppure `Aliquota`. Quindi `totaleCent` = somma degli `Importo`; `ivaCent` = somma delle `Imposta`, e dove c'è solo l'`Aliquota` lo scorporo `Importo × aliquota / (100 + aliquota)` al centesimo (se ci sono tutte e due vale l'`Imposta` scritta; una riga senza `DatiIVA`, cioè con `Natura`, non ha IVA); `imponibileCent` = totale − IVA. Senza righe o con una riga senza `Importo` la fattura non si legge («Nella fattura manca il totale.»): un totale non si inventa. Un'`Imposta` negativa o più grande dell'`Importo` della sua riga → «L'IVA della fattura non è coerente con il totale.»; un'`Aliquota` che non è un numero fra 0 e 100 → «L'aliquota IVA della fattura non è valida: «…».». Anche dentro un `.p7m`.
  - `categoriaSuggerita`: l'ultima categoria usata per quel fornitore (stessa partita IVA o stesso nome senza distinguere maiuscole), altrimenti `null`.
  - `duplicata = true` se esiste già un movimento con lo stesso **documento** (`FATTURA`, oppure `NOTA_DI_CREDITO` per una nota di credito), lo stesso fornitore (partita IVA, o nome se manca), stesso `numeroDocumento` e stessa data; `motivo` dice «Già registrata il gg/mm». La **stessa chiave** (documento, fornitore, numero, data) vale fra le fatture lette nella stessa anteprima: la seconda uguale ha `motivo` «Duplicata nello stesso gruppo di file». Quindi una nota di credito e una fattura con lo stesso fornitore, numero e data **non** sono doppie, né contro i movimenti registrati né nello stesso gruppo di file (fino a novembre 2026 nel gruppo lo erano: la chiave non guardava il documento).
  - **Limite: le note di debito.** Una nota di debito è un movimento `FATTURA` come gli altri, e il tipo del file (`TD05`/`TD09`) **non si conserva** nel movimento: contro i movimenti registrati non si può distinguerla da una fattura. Quindi una nota di debito con lo stesso numero **e** la stessa data di una fattura dello stesso fornitore risulta doppia, sia contro il registrato sia nello stesso gruppo (apposta uguale: se il gruppo le distinguesse, l'anteprima darebbe per buona una riga che la conferma poi scarta). Nella pratica hanno numeri diversi. Per toglierlo servirebbe una colonna nuova sul movimento con il tipo del file: non c'è, per scelta.
  - Si importano: `TD01`, `TD02` (acconto su fattura), `TD03` (acconto su parcella), `TD06` (parcella), `TD07` (fattura semplificata), `TD24`, `TD25` come **fatture** (costo variabile, importo = totale del documento, `pagata = true`); un acconto è un costo come gli altri: il saldo arriva dopo come fattura a parte, con un altro numero, per il solo resto; `TD05` (nota di debito) e `TD09` (nota di debito semplificata) si importano allo stesso modo, come **fatture** pagate (novembre 2026; prima si scartavano): con una nota di debito il fornitore chiede di più rispetto a una fattura già emessa, quindi è un costo in più, per l'importo della nota (`notaDiCredito` e `integrazione` sono `false`; nel file l'importo è positivo, e una nota con importo zero o negativo non si importa, come una fattura); `TD04` e `TD08` (nota di credito semplificata, in tutti e due i tracciati) come **note di credito** (riducono i costi); `TD17`, `TD18`, `TD19` (autofatture per acquisti dall'estero) come fatture al **totale lordo**, perché la fattura originale estera non arriva da SdI. `TD16` (integrazione per fornitore italiano) **non** si importa: «Autofattura di integrazione: non importata, la fattura originale del fornitore è già una fattura a parte.». Gli altri tipi non si importano e compaiono in `errori` col nome al posto del codice: «Tipo di documento non gestito (autofattura): non importato.» (`TD20`/`TD21`/`TD27`/`TD29` autofattura, `TD22`/`TD23` estrazione di beni da un deposito IVA, `TD26` cessione di beni ammortizzabili, `TD28` acquisto da San Marino; un codice sconosciuto → «Tipo di documento non gestito: non importato.»; senza tipo → «Nella fattura manca il tipo di documento: non importata.»). Una fattura con totale zero («Importo zero: non c'è nessun costo da registrare.») o negativo non si importa.
  - I messaggi di `errori` li legge il cliente: italiano semplice, senza «XML», «FatturaPA», «DOCTYPE», codici `TD…`, nomi dei campi del tracciato o numeri di riga (resta l'estensione `.xml` dove serve a capire quale file). Il dettaglio tecnico (campo mancante, riga, errore del parser, codice del tipo) va **solo nel log** del servizio, una riga `Importazione, <file>: …` per scarto. Nome del file, voce dello zip e ogni altro valore che arriva dal cliente (numero e tipo della fattura, valori riportati nel dettaglio) si scrivono nel log passando da `PerLog.pulisci`: a capo, caratteri di controllo, separatori di riga Unicode e cambi di direzione del testo diventano `_`, e oltre 300 caratteri il valore si tronca con «…»; così con un nome di file non si può scrivere una riga di log finta. Nella risposta (`errori[].nomeFile`) il nome resta com'è. Un file che non si riesce a leggere → «Il file non è una fattura elettronica valida.»; un file che è un altro documento → «Il file non è una fattura elettronica.»; un file con una dichiarazione DOCTYPE (DTD o entità, rifiutata per sicurezza) → «Il file contiene istruzioni non ammesse e non è stato letto.»; dati mancanti → «Nella fattura manca il nome del fornitore.», «Il file non contiene nessuna fattura.», «Nella fattura mancano numero e data.», «Manca il numero della fattura.», «La data della fattura manca o non è valida: «…».»; un importo scritto male → «Il totale della fattura non è un importo valido: «…».» (anche «L'imponibile…», «L'IVA…»); zip oltre i limiti → «Lo zip contiene troppi file (massimo N): non è stato letto.», «Il file «…» nello zip è troppo grande (massimo N MB una volta estratto): lo zip non è stato letto.», «Il contenuto dello zip è troppo grande (massimo N MB in totale): non è stato letto.»; un `.p7m` senza fattura dentro → «Nel file firmato (.p7m) non ho trovato una fattura elettronica. Chiedi al fornitore il file non firmato (.xml), oppure aprilo con il programma di firma e salva la fattura (.xml).»; un tipo di file non ammesso → «Tipo di file non supportato: servono file .xml, .xml.p7m o uno .zip.».
  - `notaDiCredito` è vero per `TD04`/`TD08`: alla conferma diventa un movimento `COSTO_VARIABILE` + `NOTA_DI_CREDITO` con fornitore, categoria (suggerita come per le fatture), numero e XML allegato. `integrazione` è vero per `TD17`/`TD18`/`TD19`. `tipoDocumento` è il codice letto dal file (`TD01`, `TD05`…), sempre presente perché senza tipo la fattura non si importa: serve all'interfaccia per distinguere, e **non** si mostra al cliente (vale la regola dei messaggi: niente codici). `notaDiDebito` è vero per `TD05`/`TD09`: la riga si importa come una fattura (`notaDiCredito` e `integrazione` falsi), il campo dice solo che cos'è, e l'interfaccia la segna «Nota di debito». Una nota già importata (stesso fornitore, numero e data) risulta `duplicata`; un numero uguale a quello di una fattura non la rende doppia.
- `POST /api/importa/conferma` `{importazioneId, righe: [{indice, categoria|null}], sedeId?}` → `{importati, ignorate: [{indice, motivo}]}`. Crea un movimento per riga: `tipo = COSTO_VARIABILE`, `documento = FATTURA` (`NOTA_DI_CREDITO` per le note di credito; le note di debito sono `FATTURA`), `data`, `importoCent = totaleCent`, fornitore get-or-create (con partita IVA), `categoria` dal corpo (get-or-create, `Tipo` costo variabile; `null` ammesso), `numeroDocumento`, `origine = XML`, `pagata = true` per le fatture (sono lo storico; le note di credito restano `false`), `sedeId` (la stessa per tutte le righe, regola di «Quale sede» in Sedi: un errore risponde 400 prima di salvare qualunque riga) e l'XML originale come **allegato** (vedi sotto). Il calcolo dei duplicati non dipende dalla sede. Le duplicate si ignorano comunque (anche se selezionate) con motivo. `importazioneId` scaduto o sconosciuto → 404 «L'importazione è scaduta: rileggi i file.». Operazione atomica per riga: una riga che fallisce non blocca le altre.

## Allegati (fase 4)

I file allegati ai movimenti stanno in `<cartella dati>/allegati/` (mai nel database, mai in git). La colonna `allegato_nome` del movimento conserva il nome originale; il file sul disco ha un nome interno univoco (UUID più estensione), non dedotto dall'input.

- `GET /api/movimenti/{id}/allegato` → il file con il suo tipo (`application/xml`, `application/pdf`, `image/jpeg`, `image/png`), `Content-Disposition: inline; filename=<nome originale>`; 404 se non c'è.
- `POST /api/movimenti/{id}/allegato` (multipart, campo `file`; solo `image/jpeg`, `image/png`, `application/pdf`; max 8 MB; tipo verificato sui byte iniziali, non sull'estensione) → `Movimento` aggiornato; sostituisce un eventuale allegato precedente.
- `DELETE /api/movimenti/{id}/allegato` → 204.
- Eliminando un movimento si elimina anche il suo file. Il backup (`BackupService`) copia anche la cartella `allegati/` nella copia datata (incrementale: un allegato già presente con la stessa dimensione nella copia precedente diventa un collegamento fisso a quel file, senza ricopiarlo; ogni copia resta completa e cancellare la vecchia non toglie nulla; se i collegamenti non sono possibili si copia), e il ripristino la rimette a posto (se la copia la contiene).

## Fasi successive

Nessuna prevista nel contratto.
