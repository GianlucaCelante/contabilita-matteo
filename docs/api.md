# API del servizio (contratto, fase 1)

Fonte di verità condivisa tra servizio (`src/`) e interfaccia (`ui/`). Base: `/api`, porta 8766. La password per entrare è facoltativa (vedi «Accesso con password»): senza, nessun login. Le schermate sono descritte in [`interfaccia.md`](interfaccia.md).

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

**Retribuzione e categoria** (vale per creazione e modifica di un movimento, per le ripetizioni e per l'importazione): per un `COSTO_FISSO` il `documento` `RETRIBUZIONE_REGOLARE`/`RETRIBUZIONE_EXTRA` e una categoria con `retribuzione=true` vanno **sempre insieme**.
- `documento` `RETRIBUZIONE_*` senza categoria → 400 «Una retribuzione ha bisogno di una categoria di tipo retribuzione.»; con una categoria che non ha il flag → 400 «La categoria «X» non è una retribuzione.» (si può contrassegnare in Elenchi o scegliere un'altra). Il nome non conta: la categoria si cerca come sempre, al volo dal nome, e il flag è quello che ha già.
- `documento` `NESSUNO` con una categoria `retribuzione=true` → 400 «La categoria «X» è una retribuzione: scegli Regolare o Extra.».
- Una categoria creata al volo dal solo nome in un movimento ha sempre `retribuzione=false`: per una nuova retribuzione l'interfaccia crea prima la categoria con `POST /api/categorie {…, retribuzione: true}`.
- Il controllo vale anche per la **modifica con ambito `QUESTO_E_PROSSIMI`** e per i movimenti creati dalle ripetizioni: se la categoria di una ripetizione perde il flag mentre ha retribuzioni, `PUT /api/categorie/{id}` risponde già 409 (vedi Anagrafiche), quindi non si arriva a un modello incoerente.
- I dati già presenti prima della migrazione non si rivalidano; la migrazione porta le retribuzioni senza categoria alla categoria «Retribuzione» (vedi Anagrafiche).

**Nota di credito** (`COSTO_VARIABILE` + `NOTA_DI_CREDITO`, come nel progetto del ristorante): l'`importoCent` resta positivo, ma la nota **riduce** i costi: nei totali di `GET /api/movimenti`, nel Riepilogo (riga «Fatture»: fatture − note) e nell'esportazione (dove i costi sono negativi e la nota è positiva). Ha fornitore, categoria e numero come una fattura; arriva dall'importazione (a mano non la offre l'interfaccia, ma l'API la accetta).

## Anagrafiche (creazione al volo)

- `GET /api/categorie?tipo=COSTO_VARIABILE` → `[{id, nome, tipo, retribuzione}]` (`tipo` facoltativo; la categoria ha un `Tipo`). **Non esistono categorie predefinite né «di sistema»**: sono tutte dell'utente, si rinominano e si eliminano (vedi sotto); il campo `personalizzata` è stato tolto. `retribuzione` (booleano) è vero solo per le categorie di `COSTO_FISSO` che l'utente ha contrassegnato come **retribuzione**: i movimenti di quella categoria hanno `documento` `RETRIBUZIONE_REGOLARE` o `RETRIBUZIONE_EXTRA` e un dipendente facoltativo; l'interfaccia, scelta una categoria con `retribuzione`, chiede Regolare/Extra e Dipendente. Il nome della categoria si può cambiare (è solo un nome): quello che conta è il flag. Un database nuovo parte **senza categorie**; un database esistente, alla migrazione, mantiene le sue categorie e ne contrassegna come retribuzione quella di `COSTO_FISSO` che si chiama `Retribuzione` (senza distinguere maiuscole); se non c'è **e** ci sono retribuzioni (movimenti o ripetizioni con documento `RETRIBUZIONE_*`) senza categoria, ne crea una con quel nome (con il flag) e le assegna a quella; in un database senza retribuzioni non crea nulla.
- `PUT /api/categorie/{id}` `{nome?, retribuzione?}` (almeno uno dei due) → `{id, nome, tipo, retribuzione}`: rinomina e/o cambia il flag. Cambiano anche i movimenti che la usano, perché puntano alla categoria. Errori: nome vuoto o oltre 120 caratteri → 400; categoria inesistente → 404; nome già usato da un'altra categoria dello stesso `tipo` (senza distinguere maiuscole) → 409 «Esiste già una categoria con questo nome.»; `retribuzione=true` su una categoria che non è di `COSTO_FISSO` → 400; `retribuzione=false` su una categoria usata da movimenti con `documento` `RETRIBUZIONE_*` → 409 «Questa categoria ha già delle retribuzioni.». `DELETE` vedi «Gestione di categorie, fornitori e dipendenti».
- `GET /api/fornitori?q=` → `[{id, nome, partitaIva}]` (`q` filtra per nome, senza distinguere maiuscole). Ordine: con `q` prima chi inizia col testo, poi chi lo contiene; dentro ogni gruppo i più usati (numero di movimenti), a parità alfabetico. Senza `q`: i più usati.
- `GET /api/dipendenti?q=` → `[{id, nome}]`.
- `POST /api/categorie` `{nome, tipo, retribuzione?}` (`retribuzione=true` solo con `tipo` `COSTO_FISSO`, altrimenti 400; se la categoria esiste già il flag non cambia), `POST /api/fornitori` `{nome, partitaIva?}`, `POST /api/dipendenti` `{nome}` → 201 con l'oggetto creato; se esiste già (stesso nome senza distinguere maiuscole, e per le categorie stesso `tipo`) → 200 con quello esistente.

Anche il salvataggio di un movimento crea al volo categoria, fornitore e dipendente dal solo nome (vedi sotto): l'interfaccia non deve fare una POST separata.

## Sedi

Ogni movimento e ogni ripetizione appartiene a **una sede**. Un database nuovo, o uno di prima delle sedi, ha la sede `Sede principale` (id 1, con dentro tutti i movimenti e le ripetizioni che già c'erano). Una sede non si cancella: se serve non usarla più, si **archivia** (resta nei dati e nei filtri, sparisce dalle scelte).

Oggetto `Sede`: `{id, nome, archiviata, ordine, movimenti}`, dove `movimenti` è il numero di movimenti della sede.

- `GET /api/sedi` → `[Sede]`: prima le non archiviate, per `ordine` (poi `id`); in fondo le archiviate.
- `POST /api/sedi` `{nome}` → 201 con la `Sede` creata (`ordine` = in coda alle altre); se esiste già (stesso nome senza distinguere maiuscole, anche archiviata) → 200 con quella esistente. Nome vuoto → 400 «Il nome della sede è obbligatorio.»; più di 120 caratteri → 400.
- `PUT /api/sedi/{id}` `{nome?, archiviata?}` → `Sede` aggiornata. Si manda quello che cambia (un corpo vuoto non cambia niente). `nome` vuoto → 400; nome di un'altra sede → 409 «Esiste già una sede con questo nome.»; `archiviata: true` sull'**ultima sede attiva** → 409 «Non si può archiviare l'ultima sede attiva.»; `archiviata: false` la riattiva. Sede inesistente → 404 «Sede non trovata.».
- Non esiste `DELETE`: una sede con movimenti non si cancella (405).

**Quale sede.** Dove si indica `sedeId` (creazione di un movimento, conferma di un'importazione): se manca e c'è **una sola sede attiva** si usa quella; se manca e ce ne sono più → 400 «Scegli la sede: ce n'è più di una.»; sede inesistente → 400 «Sede non trovata.»; sede archiviata → 400 «La sede «…» è archiviata.» (su una sede archiviata non si registra più niente).

**Filtro `sedi`.** I `GET` che lo accettano (`/api/movimenti`, `/api/riepilogo`, `/api/esporta`) prendono `sedi=1,2`, un elenco di id separati da virgola. Assente o vuoto = **tutte** le sedi, archiviate comprese; un id inesistente non dà risultati; un valore che non è un numero → 400 «sedi: valore non valido: …».

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
  allegatoNome | null }
```

Corpo di creazione/modifica (`MovimentoInput`):

```
{ data, tipo, documento, importoCent,
  categoria?: "nome", fornitore?: "nome", dipendente?: "nome",   // creati al volo se non esistono
  sedeId?: n,                                                    // vedi «Quale sede» in Sedi; in modifica, se manca, il movimento resta dov'è
  descrizione?, numeroDocumento?, note?,
  pagata?: boolean,                                              // solo FATTURA: predefinito false in creazione, invariato in modifica se manca; per gli altri documenti si ignora
  ricorrenza?: { giorno?: 1..31, unita?: "GIORNI"|"SETTIMANE"|"MESI"|"ANNI", intervallo?: n } | null }   // senza unita e intervallo: ogni mese
```

- `GET /api/movimenti?da=&a=&tipo=&q=&dipendente=&sedi=&categorie=` → `{elementi: [Movimento], totali: {ricaviCent, costiCent, saldoCent}}`, ordinati per `data` decrescente poi `id` decrescente. `da`/`a` inclusivi, facoltativi. `q` cerca in fornitore, descrizione, note. `dipendente` è l'id. `sedi` è il filtro per sede (vedi Sedi); anche i `totali` riguardano solo le sedi scelte.
  `categorie` filtra per categoria: id separati da virgola (es. `GET /api/movimenti?categorie=3,7`), in AND con gli altri filtri e con i `totali` calcolati sul filtrato. Assente o vuoto = nessun filtro; un id inesistente non dà risultati (elenco vuoto, totali a 0); un valore che non è un numero → 400 «categorie: valore non valido: …». I movimenti **senza categoria** (per esempio le retribuzioni) sono esclusi quando il filtro è attivo.
  `retribuzione=true` tiene solo i movimenti con `documento` `RETRIBUZIONE_REGOLARE`/`RETRIBUZIONE_EXTRA` (serve all'elenco di «Senza dipendente», che riguarda solo le retribuzioni). `pagata=true|false` tiene solo le **fatture** (`documento` `FATTURA`) pagate o da pagare (valore non valido → 400).
  **Filtri per voce** (servono a vedere «cosa compone» una riga delle statistiche per voce, e valgono in AND con gli altri): `fornitore` = id del fornitore (come `dipendente`); `senza` = `FORNITORE`, `DIPENDENTE` o `CATEGORIA` tiene solo i movimenti **senza** quella voce (la riga «Senza …» delle statistiche; `categorie` e `senza=CATEGORIA` insieme → 400). Id non numerico o `senza` non valido → 400 come per `categorie`. Con questi filtri, `elementi` e `totali` sono coerenti con le righe di `GET /api/statistiche/voci` dello stesso periodo: per una voce, la somma degli importi degli `elementi` (note di credito in negativo, ricavi positivi) è il `totaleCent` della sua riga.
- `GET /api/movimenti/{id}` → `Movimento`.
- `POST /api/movimenti` `MovimentoInput` → 201 `Movimento` (`origine = MANO`). `sedeId` come in «Quale sede».
- `POST /api/movimenti/dividi` `MovimentoInput` **senza** `sedeId` → 201 con la **lista** dei `Movimento` creati («dividi»): un movimento per ogni sede **attiva** (oppure solo per quelle di `?sedi=1,3`: almeno due, attive, altrimenti 400), in ordine di `ordine`, con `importoCent` diviso in parti uguali. I centesimi di resto vanno uno ciascuno alle prime sedi, quindi la somma delle parti è esattamente l'importo originale (1000 su 3 sedi → 334 + 333 + 333). Gli altri campi (data, tipo, documento, categoria, fornitore, descrizione…) sono uguali in tutti. È una sola operazione: se qualcosa non va non si crea nessun movimento. Con una sola sede attiva crea un solo movimento con tutto l'importo; se l'importo ha meno centesimi delle sedi, le ultime sedi restano senza movimento (non esistono movimenti da zero). Con `ricorrenza` nel corpo (costo fisso) ogni sede ottiene **la sua** ripetizione con la sua parte, quindi anche i mesi dopo escono divisi (una ripetizione per sede, da modificare sede per sede); `sedeId` nel corpo → 400 «Per dividere fra più sedi non indicare la sede.»; gli altri controlli sono quelli di `POST /api/movimenti`.
- `PUT /api/movimenti/{id}?ambito=SOLO_QUESTO` `MovimentoInput` → `Movimento`. Con `sedeId` il movimento cambia sede (non verso una archiviata); senza resta nella sua. Con `ambito=QUESTO_E_PROSSIMI` su un movimento ricorrente, la modifica aggiorna anche il modello della ricorrenza (importo, categoria, fornitore, dipendente, sede, descrizione, note, giorno): le prossime occorrenze lo useranno. Il `giorno` ricorrente si cambia solo con questo ambito.
- `DELETE /api/movimenti/{id}?ambito=SOLO_QUESTO` → 204. Con `QUESTO_E_PROSSIMI` elimina questo e ferma la ricorrenza (`attiva = false`).
- `POST /api/ricorrenze/{id}/ferma` → 204 (le occorrenze già registrate restano).
- `POST /api/ricorrenze/{id}/riattiva` → 204: una ripetizione ferma torna attiva e riparte dalla **prossima scadenza futura**, senza recuperare quelle cadute mentre era ferma. Già attiva: non fa nulla. Inesistente: 404.

### Ricorrenze

- Un movimento creato con `ricorrenza: {...}` genera una ripetizione: il movimento è la prima occorrenza, i suoi campi sono il modello. La frequenza è «ogni `intervallo` `unita`» con `unita` = `GIORNI`, `SETTIMANE`, `MESI` o `ANNI`; senza `unita` e `intervallo` vale **ogni mese** (`{giorno}` come prima). `intervallo` va da 1 a 365 (giorni), 104 (settimane), 60 (mesi), 10 (anni): 400 con «Ogni quanto: da 1 a N …».
- `giorno` (1..31) è obbligatorio per mesi e anni (nei mesi più corti diventa l'ultimo giorno del mese; per gli anni il mese è quello della data del movimento) e si ignora per giorni e settimane, che contano dalla data del movimento.
- **La ripetizione ha la sede** del movimento da cui nasce, e le occorrenze generate hanno la stessa sede. Cambiare la sede con `ambito=QUESTO_E_PROSSIMI` la cambia anche alle occorrenze future.
- Le occorrenze successive si registrano da sole come movimenti con `origine = RICORRENZA`, senza conferma, a ogni scadenza. Un controllo giornaliero (03:05) e uno all'avvio recuperano anche le scadenze saltate, solo fino a oggi. Idempotente: il generatore non crea un'occorrenza se per quella ripetizione e quella data ce n'è già una; una occorrenza eliminata a mano non si ricrea.
- **Frequenza e dati sono separati.** `ambito` decide solo se i dati di questo movimento (importo, voce, fornitore…) diventano il modello dei prossimi (`QUESTO_E_PROSSIMI`) o no (`SOLO_QUESTO`). La `ricorrenza` nel corpo di un `PUT` (frequenza, giorno) cambia **sempre** la ripetizione, con qualunque ambito: vale dalla prossima scadenza ancora da registrare (per mesi e anni resta lo stesso mese col nuovo giorno). `prossimaData` nella risposta è quella scadenza.
- Fermare (`ferma` o `DELETE` con `QUESTO_E_PROSSIMI`) e riattivare (`riattiva`) sono separati; la riattivazione non recupera i periodi in cui era ferma.
- `RETRIBUZIONE_EXTRA` non può essere ricorrente: 400.

## Riepilogo

`GET /api/riepilogo?da=&a=&sedi=` (`da` e `a` obbligatori; `sedi` facoltativo, assente = tutte le sedi) →

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

Pizze e ordini si caricano **a mano, una volta a settimana per ogni sede**; servono a ricavare lo **scontrino medio** (ricavi ÷ ordini) e le **pizze per ordine**, per sede e in generale. La settimana è la settimana ISO **lunedì–domenica** e si identifica con la data del **lunedì** (`yyyy-MM-dd`). Tutte le date sono ISO, gli importi in centesimi. I ricavi sono i movimenti di tipo `RICAVO` (qualunque documento) della sede, per data del movimento. Per sede e settimana c'è al più un dato.

- **Scontrino medio** = `ricaviCent / ordini`, arrotondato al centesimo (mezzo centesimo in su: 10000 / 3 → 3333); `null` se gli ordini sono 0 o il dato manca.
- **Pizze per ordine** = `pizze / ordini`, numero decimale arrotondato a 2 decimali (17 / 7 → 2.43); `null` se gli ordini sono 0 o il dato manca.

### Salvare una settimana

`PUT /api/statistiche/settimana`

```
{ "settimana": "2026-03-04",
  "voci": [ {"sedeId": 1, "pizze": 7, "ordini": 3},
            {"sedeId": 2, "pizze": null, "ordini": null} ] }
```

- `settimana`: **un giorno qualsiasi** della settimana, normalizzato al lunedì (`2026-03-04` e `2026-03-08` → `2026-03-02`).
- Per ogni voce: **upsert** del dato di quella sede in quella settimana (se esiste si aggiorna). Le sedi non nominate non cambiano.
- Una voce con `pizze` **e** `ordini` entrambi assenti o `null` **cancella** il dato di quella sede e settimana (cancellare un dato che non c'è non è un errore).
- Risposta 200: la settimana dopo il salvataggio, come `GET /api/statistiche/settimana` (sotto).
- Tutto o niente: se una voce non è valida non si salva nessuna voce. Errori 400 `{"errore": "..."}`:
  - `settimana` mancante o non valida → «Indica la settimana (un giorno qualsiasi, yyyy-MM-dd).» / «La settimana non è una data valida (yyyy-MM-dd): …»;
  - `voci` assente o vuota → «Indica almeno una voce.»; voce senza `sedeId` → «Ogni voce deve avere la sede.»; stessa sede due volte → «La sede N compare più volte.»;
  - sede inesistente → «Sede non trovata.»; sede archiviata → «La sede «…» è archiviata.»;
  - `pizze`/`ordini` non interi («… deve essere un numero intero.»), negativi («… non può essere negativo.») o oltre 1.000.000 («… è troppo grande …»);
  - uno solo dei due indicato → «indica sia le pizze sia gli ordini (o nessuno dei due per cancellare il dato).»;
  - `ordini` = 0 con `pizze` > 0 → «con 0 ordini le pizze devono essere 0.» (`0` e `0` è ammesso: la sede c'è ma non ha venduto; resta `completa`, senza medie).

### Leggere una settimana

`GET /api/statistiche/settimana?data=yyyy-MM-dd` (`data` = un giorno qualsiasi della settimana; assente = oggi) →

```
{ "settimana": "2026-03-02", "fine": "2026-03-08",
  "sedi": [
    { "sede": {"id": 1, "nome": "Sede principale"},
      "pizze": 7, "ordini": 3, "ricaviCent": 10000,
      "scontrinoMedioCent": 3333, "pizzePerOrdine": 2.33, "completa": true },
    { "sede": {"id": 2, "nome": "Sede Mare"},
      "pizze": null, "ordini": null, "ricaviCent": 1234,
      "scontrinoMedioCent": null, "pizzePerOrdine": null, "completa": false } ] }
```

`sedi` ha tutte le sedi non archiviate (nell'ordine di `GET /api/sedi`) più le archiviate **solo se** in quella settimana hanno dati o ricavi. `ricaviCent` è la somma dei ricavi della sede da lunedì a domenica (0 se non ce ne sono). `completa` = i dati di quella sede e settimana sono stati inseriti; se `false`, `pizze`, `ordini` e le due medie sono `null`. Con `ordini` = 0 le medie sono `null`.

### Statistiche di un periodo

`GET /api/statistiche?da=&a=&sedi=1,2` (`da` e `a` obbligatori, `da` ≤ `a`; `sedi` facoltativo, assente = tutte; stessi errori 400 del riepilogo). Si considerano le settimane **il cui lunedì cade in [da, a]** (`settimaneTotali` = quante sono; nessun lunedì nel periodo → elenchi vuoti e medie `null`).

```
{ "da": "2026-03-02", "a": "2026-03-16",
  "totale": { "pizze": 17, "ordini": 7, "ricaviCent": 15000,
              "scontrinoMedioCent": 2143, "pizzePerOrdine": 2.43,
              "settimaneConDati": 2, "settimaneTotali": 3 },
  "perSede": [
    { "sede": {"id": 1, "nome": "Sede principale"}, "pizze": 7, "ordini": 3, "ricaviCent": 10000,
      "scontrinoMedioCent": 3333, "pizzePerOrdine": 2.33, "settimaneConDati": 2 },
    { "sede": {"id": 2, "nome": "Sede Mare"}, "pizze": 10, "ordini": 4, "ricaviCent": 5000,
      "scontrinoMedioCent": 1250, "pizzePerOrdine": 2.5, "settimaneConDati": 1 },
    { "sede": {"id": 3, "nome": "Sede Monti"}, "pizze": 0, "ordini": 0, "ricaviCent": 0,
      "scontrinoMedioCent": null, "pizzePerOrdine": null, "settimaneConDati": 0 } ],
  "settimane": [
    { "settimana": "2026-03-02", "pizze": 17, "ordini": 7, "ricaviCent": 15000, "scontrinoMedioCent": 2143,
      "sediMancanti": [ {"id": 3, "nome": "Sede Monti"} ] },
    { "settimana": "2026-03-09", "pizze": 0, "ordini": 0, "ricaviCent": 0, "scontrinoMedioCent": null,
      "sediMancanti": [ {"id": 2, "nome": "Sede Mare"}, {"id": 3, "nome": "Sede Monti"} ] },
    { "settimana": "2026-03-16", "pizze": 0, "ordini": 0, "ricaviCent": 0, "scontrinoMedioCent": null,
      "sediMancanti": [ {"id": 1, "nome": "Sede principale"}, {"id": 2, "nome": "Sede Mare"}, {"id": 3, "nome": "Sede Monti"} ] } ] }
```

**Regola per non falsare le medie.** `pizze`, `ordini` e `ricaviCent` (in `totale`, `perSede` e `settimane`) sommano **solo le coppie (sede, settimana) con i dati inseriti e `ordini` > 0**. I ricavi di una sede in una settimana **senza dati** (o con 0 ordini) non entrano né nello scontrino medio né in `ricaviCent` di queste risposte: per vederli c'è `GET /api/statistiche/settimana` o il riepilogo. Quindi `scontrinoMedioCent` = `ricaviCent` ÷ `ordini` di quella stessa riga, e `pizzePerOrdine` = `pizze` ÷ `ordini` (`null` se `ordini` = 0). Nell'esempio: la sede 3 ha 9000 di ricavi il 4 marzo ma nessun dato, quindi non pesa sul 2143 del totale (15000 ÷ 7) e compare in `sediMancanti`; i 2000 di ricavi della sede 1 nella settimana del 9 marzo (dati `0`/`0`) sono esclusi.

- `settimaneConDati` (totale) = settimane con almeno una sede con dati; (per sede) = settimane in cui quella sede ha dati, anche con 0 ordini.
- `settimane` è in ordine cronologico, con **tutte** le settimane del periodo (anche senza dati: somme a 0, medie `null`). `sediMancanti` elenca le sedi **non archiviate**, comprese nel filtro `sedi`, senza dati in quella settimana.
- `perSede` ha una riga per ogni sede del filtro (nell'ordine di `GET /api/sedi`): le non archiviate sempre (a zero se senza dati), le archiviate solo se nel periodo hanno dati o ricavi.

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
      "pagataCent": 50000,
      "perMese": [30000, 50000, 0] } ] }
```

- `pagataCent`: solo con `raggruppa=FORNITORE`: la somma delle fatture (`documento` `FATTURA`) della voce già segnate come pagate (`pagata=true`); quanto resta da pagare è `totaleCent − pagataCent` (le note di credito riducono il totale ma non sono «pagate»). Con gli altri `raggruppa` è `null`.

- `mesi`: tutti i mesi di calendario (`yyyy-MM`) toccati dal periodo, in ordine; `perMese` ha lo stesso numero di elementi, nello stesso ordine, e la somma dei suoi elementi è `totaleCent` (il movimento sta nel mese della sua data; contano solo le date tra `da` e `a`).
- `regolareCent`/`extraCent`: solo con `raggruppa=DIPENDENTE` (somma di `RETRIBUZIONE_REGOLARE` e `RETRIBUZIONE_EXTRA`; gli altri documenti contano nel totale ma in nessuno dei due); altrimenti 0.
- `voci` ordinate per `totaleCent` decrescente, a parità per nome. Una voce senza movimenti nel periodo non compare. La riga `id: null` va in fondo.
- `totaleCent` = somma di `voci[].totaleCent`; `movimenti` = numero di movimenti considerati.

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
- `GET /api/fatture/promemoria` → `{daFare, inScadenza: [{casellaId, nome, mese, scadenza, giorniMancanti}]}` per il **mese corrente** del servizio (indipendente dal periodo che l'utente guarda): `daFare` = caselle attive in `DA_FARE` questo mese; `inScadenza` = quelle tra loro con `scadenza` e `giorniMancanti` (= scadenza − oggi, negativo se scaduta) **≤ 3**, ordinate per `giorniMancanti` crescente. Serve alla scheda della Home («Fattura a Rossi: scade tra 3 giorni»); non è una notifica: l'app non manda avvisi a schermo spento.
- `PUT /api/fatture/caselle/{id}/mesi/{mese}` `{stato, importoCent?, nota?}` → `{mese, stato, importoCent, nota}`. `importoCent` ≥ 0 (centesimi), `nota` fino a 200 caratteri; stato non valido, mese non `yyyy-MM`, importo negativo → 400; casella inesistente → 404. Se `stato` è `DA_FARE` e non ci sono né importo né nota, lo stato salvato si cancella (si torna al predefinito).
- Le caselle si salvano nel database e quindi nella copia di sicurezza; l'esportazione non le contiene.

### Fatture ricevute (pagate / da pagare)

Le fatture **ricevute dai fornitori** (movimenti `COSTO_VARIABILE` con `documento` `FATTURA`, a mano o importate da XML) hanno il campo `pagata`, per controllare a fine mese quello che è stato davvero pagato. Le caselle qui sopra restano per le fatture **da emettere**: sono due cose diverse e l'interfaccia le tiene in due schede.
- `pagata` esiste solo per `FATTURA`: per ogni altro documento è sempre `false` e il campo in ingresso si ignora. Le fatture create a mano o importate nascono **da pagare** (`false`); la migrazione segna come **pagate** quelle già presenti (si presume pagate, per non riempire di arretrati chi usa già l'app).
- `PUT /api/movimenti/{id}/pagata` `{pagata: boolean}` → il `Movimento` aggiornato. 404 se non esiste; 400 «Solo una fattura si segna come pagata.» se il `documento` non è `FATTURA`; `pagata` mancante o non booleano → 400. Cambia solo questo campo (non `modificatoIl` di altro).
- `GET /api/movimenti?pagata=true|false` (vedi Movimenti) filtra le fatture; le note di credito non hanno stato.
- `GET /api/statistiche/voci?raggruppa=FORNITORE` dà `pagataCent` per fornitore (vedi «Statistiche per voce»): è il confronto «totale delle fatture del fornitore nel mese / quanto già pagato».

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

`GET /api/esporta?formato=xlsx|csv&da=&a=&includi=RICAVO,COSTO_VARIABILE,COSTO_FISSO&sedi=&statistiche=true|false&colonnePerSede=true|false` → il file in streaming (`Content-Disposition: attachment`, nome `contabilita-AAAA-MM-GG_AAAA-MM-GG.xlsx` / `.csv` con il periodo; `da` e `a` obbligatori, inclusivi; `includi` facoltativo, default tutti i tipi; valori non validi → 400). `statistiche` (default `true`) e `colonnePerSede` (default `false`) valgono solo per l'XLSX; il CSV le ignora.

- **Etichette in italiano** nel file: Tipo `Ricavo` / `Costo variabile` / `Costo fisso`; Documento `Fatturato`, `Extra`, `Fattura`, `Nota di credito`, `Scontrino`, `Retribuzione regolare`, `Retribuzione extra`, `-` (per `NESSUNO`).
- **Colonne del foglio Movimenti** (stesso ordine nel CSV): `Data`, `Tipo`, `Documento`, `Categoria`, `Fornitore`, `Dipendente`, `Descrizione`, `N. documento`, `Note`, `Importo`, `Origine` (`A mano`, `XML`, `Ricorrenza`), `Sede` (il nome; ultima colonna, dopo `Origine`, così le colonne di prima non si spostano). `sedi` filtra come negli altri `GET` (assente = tutte): vale per i movimenti e per il foglio `Riepilogo`. Ordinati per data crescente poi id. `Importo` **con segno** (ricavi positivi, costi negativi).
- **XLSX** (libreria fastexcel, scrittura in streaming come nel progetto etichette): fogli `Movimenti` (data come cella data, importo come numero in euro con formato valuta, intestazione in grassetto e riga bloccata, larghezze colonna adeguate) e `Riepilogo` (stesse righe di `GET /api/riepilogo` per il periodo: per ogni sezione una riga per categoria (`voci`, «Senza categoria» in fondo) e il totale della sezione; poi, come dettaglio «di cui», fatturati/extra, fatture/scontrini e retribuzione regolare/extra, che non si sommano ai totali; infine costi e risultato; importi come numeri). Le righe di categoria stanno prima del totale della loro sezione, le righe «di cui» subito dopo.
- **`colonnePerSede=true`** (solo XLSX, foglio `Riepilogo`): ogni importo è ripetuto in una colonna per ogni sede del filtro `sedi`, nell'ordine delle sedi (le archiviate solo se hanno movimenti nel periodo; ogni colonna è il Riepilogo calcolato con il filtro di quella sola sede), più una colonna finale `Totale` (il Riepilogo complessivo, cioè la somma delle colonne per sede). Intestazione: `Voce`, `<nome sede 1>`, …, `<nome sede N>`, `Totale`. Le righe sono quelle del Riepilogo complessivo: una categoria presente solo in alcune sedi compare con 0 nelle altre. Con una sola sede nel filtro/periodo, o con `false`, resta la sola colonna `Importo` di prima.
- **Foglio `Statistiche`** (solo XLSX, ultimo foglio, **presente solo se** `statistiche` non è `false` e nel periodo c'è almeno un dato di pizze/ordini; vedi «Statistiche»): colonne `Settimana` (il lunedì, come data), `Sede`, `Pizze`, `Ordini`, `Ricavi` (tutti i ricavi della sede in quella settimana, in euro), `Scontrino medio` (in euro; vuoto se gli ordini sono 0). Una riga per ogni dato inserito nelle settimane il cui lunedì cade in [`da`, `a`], per settimana e poi per inserimento; segue il filtro `sedi`. Il CSV non lo contiene.
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
- `POST /api/importa/conferma` `{importazioneId, righe: [{indice, categoria|null}], sedeId?}` → `{importati, ignorate: [{indice, motivo}]}`. Crea un movimento per riga: `tipo = COSTO_VARIABILE`, `documento = FATTURA`, `data`, `importoCent = totaleCent`, fornitore get-or-create (con partita IVA), `categoria` dal corpo (get-or-create, `Tipo` costo variabile; `null` ammesso), `numeroDocumento`, `origine = XML`, `sedeId` (la stessa per tutte le righe, regola di «Quale sede» in Sedi: un errore risponde 400 prima di salvare qualunque riga) e l'XML originale come **allegato** (vedi sotto). Il calcolo dei duplicati non dipende dalla sede. Le duplicate si ignorano comunque (anche se selezionate) con motivo. `importazioneId` scaduto o sconosciuto → 404 «L'importazione è scaduta: rileggi i file.». Operazione atomica per riga: una riga che fallisce non blocca le altre.

## Allegati (fase 4)

I file allegati ai movimenti stanno in `<cartella dati>/allegati/` (mai nel database, mai in git). La colonna `allegato_nome` del movimento conserva il nome originale; il file sul disco ha un nome interno univoco (UUID più estensione), non dedotto dall'input.

- `GET /api/movimenti/{id}/allegato` → il file con il suo tipo (`application/xml`, `application/pdf`, `image/jpeg`, `image/png`), `Content-Disposition: inline; filename=<nome originale>`; 404 se non c'è.
- `POST /api/movimenti/{id}/allegato` (multipart, campo `file`; solo `image/jpeg`, `image/png`, `application/pdf`; max 8 MB; tipo verificato sui byte iniziali, non sull'estensione) → `Movimento` aggiornato; sostituisce un eventuale allegato precedente.
- `DELETE /api/movimenti/{id}/allegato` → 204.
- Eliminando un movimento si elimina anche il suo file. Il backup (`BackupService`) copia anche la cartella `allegati/` nella copia datata (incrementale: un allegato già presente con la stessa dimensione nella copia precedente diventa un collegamento fisso a quel file, senza ricopiarlo; ogni copia resta completa e cancellare la vecchia non toglie nulla; se i collegamenti non sono possibili si copia), e il ripristino la rimette a posto (se la copia la contiene).

## Fasi successive

Nessuna prevista nel contratto. Fuori ambito per ora: pizze settimanali.
