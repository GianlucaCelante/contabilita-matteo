# Interfaccia: riferimento per gli sviluppatori

Documento di riferimento per le 11 schermate approvate nel canvas di design (7 per il computer, 4 per il telefono). Descrive cosa c'è in ogni schermata, non come è fatta in HTML. I valori d'esempio sono dati di prova dei mockup, non dati reali.

Ogni sezione cita il file sorgente del canvas (`*.dc.html`). L'elenco e le posizioni delle schermate sono in `canvas.json`.

Convenzioni usate qui:

- "Obbligatorio / facoltativo": è obbligatorio ciò che nel mockup non porta la dicitura "(facoltativo)" o "(facoltativa)". Il mockup non mostra messaggi di errore né asterischi, quindi l'obbligatorietà è dedotta da questa assenza.
- "Porta a": destinazione del collegamento nel mockup. Dove un pulsante nel mockup rimanda alla stessa schermata (es. "Salva e aggiungine un altro", "Scarica il file"), è l'azione reale che andrà implementata, non una navigazione.
- Importi in euro, formato italiano (`1.234,56`), data `gg/mm/aaaa`.

---

## 1. Struttura generale

### Navigazione computer (barra laterale a sinistra, stretta, con icona e etichetta)

In ordine: **Riepilogo**, **Movimenti**, **Statistiche**, **Esporta**, **Impostazioni**. In cima c'è il logo (solo icona, non cliccabile nel mockup). Non esiste la sezione "Fissi": è stata eliminata (vedi "Incoerenze trovate" per un file residuo).

### Navigazione telefono (barra in basso)

In ordine: **Riepilogo**, **Movimenti**, **Statistiche**, **Esporta**. Non c'è Impostazioni sul telefono. Sopra la barra, nelle schermate Riepilogo e Movimenti, c'è un pulsante tondo flottante "+" che porta a Nuovo movimento (telefono).

### Filtro di periodo (ricorrente)

Selettore a segmenti: **Oggi**, Settimana, Mese, Anno, Periodo (libero). «Oggi» è un filtro vero, non un pulsante a parte: mostra il giorno corrente (etichetta «Venerdì 23 ottobre 2026»), le frecce scorrono i giorni e cliccarlo di nuovo riporta sempre a oggi. Gli altri tipi tengono il giorno a cui si era arrivati. Compare in Riepilogo, Movimenti ed Esporta sul computer; il telefono ne ha una versione ridotta (vedi sotto). Con Settimana, Mese e Anno ci sono le frecce "Periodo precedente" / "Periodo successivo" e l'etichetta del periodo corrente (es. "12 – 18 ottobre 2026").

---

## 2. Schermate computer

### 2.1 Riepilogo (computer)

File: `Main.dc.html`

**Scopo.** Colpo d'occhio su quanto si è incassato, speso e guadagnato nel periodo scelto.

**Sezioni.**

1. Intestazione: titolo "Riepilogo" e pulsante **Nuovo movimento** (porta a Nuovo movimento).
2. Selettore di periodo: Settimana (selezionato nel mockup), Mese, Anno, Periodo; frecce precedente/successivo; etichetta del periodo.
3. Riquadro del risultato: **Ricavi − Costi = Risultato della settimana** (etichetta che segue il periodo). Sotto, una barra orizzontale a tre tratti con le proporzioni (costi variabili, costi fissi, risultato) e la legenda con le percentuali sul totale dei ricavi.
4. Tre blocchi affiancati, ciascuno con righe e totale:
   - **Ricavi**: Fatturati, Extra, Totale ricavi.
   - **Costi variabili**: Fatture (con numero di documenti), Scontrini (totali inseriti), Totale variabili.
   - **Costi fissi**: Retribuzione regolare, Retribuzione extra, Affitto, Utenze, Altre voci fisse, Totale fissi.

**Campi.** Nessun campo di inserimento; solo il selettore di periodo.

**Azioni.** Nuovo movimento; cambio periodo; voci della barra laterale.

**Regole visibili.** Costi = costi variabili + costi fissi. Risultato = ricavi − costi. Le percentuali della barra sono calcolate sui ricavi (costi variabili / ricavi, costi fissi / ricavi, risultato / ricavi) e sommano 100%. Nel mockup le righe del blocco dei costi fissi sono elencate per categoria.

### 2.2 Movimenti (computer)

File: `Movimenti.dc.html`

**Scopo.** Elenco unico di tutti i movimenti (il registro), da cui si apre il dettaglio per modificare o eliminare.

**Sezioni.**

1. Intestazione: titolo "Movimenti" e pulsante **Nuovo movimento** (porta a Nuovo movimento).
2. Filtri: periodo (Settimana, Mese selezionato, Anno, Periodo); tipo (Tutti, Ricavi, Costi variabili, Costi fissi); casella di ricerca "Cerca fornitore o nota…". Accanto alla ricerca il pulsante **Categoria** (anche più categorie insieme): apre un riquadro ancorato al pulsante, con campo di ricerca e caselle raggruppate in Ricavi, Costi variabili e Costi fissi, che applica a ogni spunta e si chiude con Esc o con un clic fuori. Con una scelta il pulsante dice «Categoria: nome», con più scelte «Categorie (2)», e ha una ✕ per toglierle. Se in alto è scelto un tipo si propongono solo le categorie di quel tipo (scegliendo un tipo le categorie di altri tipi escono dal filtro). Il filtro sta nell'indirizzo (`?categorie=3,7`) e si ricorda come l'ultimo tipo scelto; una categoria che non esiste più si ignora. I movimenti senza categoria (retribuzioni) restano fuori mentre il filtro è attivo.
3. Tabella con colonne: Data, Tipo, Fornitore / descrizione (con sottotitolo, per esempio la categoria o la nota), Documento, Importo, e una colonna finale con l'origine del movimento. Le righe sono raggruppate per giorno, con l'intestazione del giorno (es. "Mercoledì 21 ottobre").
4. Piè di pagina: numero di movimenti mostrati e periodo, poi tre totali: **Ricavi**, **Costi**, **Saldo**.

**Elementi della riga.**

- Tipo: etichetta colorata Ricavo (verde chiaro), Variabile (ocra), Fisso (sabbia).
- Documento: Fattura (con numero), Scontrino, Fatturato, Extra, Regolare.
- Importo: segno "+" per i ricavi, "−" per i costi.
- Origine: "XML" (importato da fattura), "A mano", "Ricorrente" (generato dalla ripetizione).

**Azioni.** Toccando/cliccando una riga si apre il dettaglio del movimento (dove si modifica e si elimina). Nel mockup solo la riga "Retribuzione regolare, ricorrente" è un collegamento attivo (porta a Dettaglio movimento); la regola di prodotto è che lo siano tutte (vedi "Incoerenze trovate").

**Regole visibili.** I totali in fondo si riferiscono ai movimenti mostrati dai filtri. Saldo = ricavi − costi dei movimenti mostrati. Il filtro tipo ha le stesse tre famiglie del Riepilogo.

### 2.3 Nuovo movimento (computer)

File: `NuovoMovimento.dc.html` (mostrato con "Costo variabile" + "Fattura").

**Scopo.** Registrare a mano un ricavo o un costo.

**Sezioni.**

1. Intestazione: freccia indietro (porta a Movimenti) e titolo "Nuovo movimento".
2. Selettore di modalità in alto: **A mano** (attivo) / **Importa XML o ZIP** (porta a Importa fatture).
3. Modulo, a sinistra.
4. Riquadro laterale **Dove finisce**: riepilogo di dove verrà conteggiato il movimento.
5. Barra azioni in fondo.

**Campi del modulo (in questo stato).**

| Campo | Controllo | Obbligatorio | Note |
|---|---|---|---|
| Che cos'è | tre scelte esclusive: Ricavo, Costo variabile, Costo fisso | sì | Cambia i campi sottostanti |
| Documento | due scelte esclusive: Fattura, Scontrino | sì (per costo variabile) | |
| Data | campo data | sì | Formato gg/mm/aaaa |
| Importo | campo numerico con simbolo € | sì | |
| N. fattura | campo testo | solo per Fattura | Non c'è per Scontrino nel mockup (non verificabile) |
| Fornitore | campo con ricerca e creazione al volo | sì | Se il nome non esiste mostra "Nessun fornitore con questo nome" e il comando **Crea fornitore «nome»** |
| Categoria | campo con ricerca e creazione al volo | sì | Una categoria nuova è segnalata con l'etichetta "Nuova" |
| Note | campo testo | facoltativo | |
| Allegato | caricamento "Foto o PDF" | facoltativo | |

**Riquadro "Dove finisce".** Mostra Voce (es. Costi variabili), Periodo (es. "Sett. 19 – 25 ott"), Tipo (es. Fattura), poi "Costi variabili della settimana": valore **Prima** e valore **Con questo movimento**. Serve a far vedere l'effetto sul totale prima di salvare.

**Azioni.** **Annulla** (porta a Movimenti); **Salva e aggiungine un altro** (salva e riapre un modulo vuoto); **Salva** (salva e porta a Movimenti).

**Regole visibili.**

- Fornitori e categorie si creano direttamente dal campo, non da Impostazioni.
- Fattura e scontrino sono entrambi costi variabili.
- Sono previsti solo i tipi documento Fattura e Scontrino per il costo variabile; Regolare e Extra compaiono per la retribuzione (costo fisso, vedi 2.4); Fatturato e Extra compaiono come documento dei ricavi nell'elenco Movimenti (i campi del ricavo non sono mostrati in un mockup dedicato).
- I campi per il ricavo e per le altre voci fisse (affitto, utenze) non hanno un mockup proprio: non è descritto qui altro oltre a quanto sopra.

### 2.4 Nuovo movimento: retribuzione (computer)

File: `NuovoMovimentoRetribuzione.dc.html` (stato "Costo fisso" + voce "Retribuzione").

**Scopo.** Registrare una retribuzione, anche ricorrente.

Struttura come 2.3 (intestazione, selettore A mano / Importa, modulo, riquadro laterale, barra azioni).

**Campi.**

| Campo | Controllo | Obbligatorio | Note |
|---|---|---|---|
| Che cos'è | Ricavo / Costo variabile / Costo fisso | sì | Qui è "Costo fisso" |
| Voce fissa | campo unico con suggerimenti: Retribuzione, Affitto, Utenze e le voci già create (le categorie dei costi fissi); un nome nuovo si scrive nello stesso campo («Crea voce …») | sì | Le voci proprie compaiono una per una nel Riepilogo |
| Tipo di retribuzione | due scelte esclusive: **Regolare**, **Extra** | sì | Regolare = in busta; Extra = fuori busta |
| Dipendente | campo con ricerca, "(facoltativo)" | facoltativo | Se vuoto il costo conta nel totale ma non nel dettaglio per persona |
| Data | campo data | sì | |
| Importo | campo numerico con € | sì | |
| Note | campo testo, "(facoltative)" | facoltativo | |
| Ripeti ogni mese | interruttore (nel mockup acceso) con campo **il giorno** (numero, es. 10) | facoltativo | Vedi regole |

**Riquadro "Dove finisce".** Voce (Costi fissi), Categoria (Retribuzione), Tipo (Regolare), Dipendente, Ricorrenza ("Ogni mese, il 10"). Sotto: per il dipendente scelto e il mese, le righe Regolare, Extra e **Costo del mese** (somma).

**Azioni.** Annulla (porta a Movimenti); Salva e aggiungine un altro; Salva (porta a Movimenti).

**Regole visibili.**

- La ripetizione mensile registra da sola i movimenti, senza chiedere conferma; si correggono poi in Movimenti.
- La retribuzione **Extra** non è ricorrente: nel mockup l'interruttore compare con "Regolare" selezionato; con "Extra" la ripetizione non va offerta (stato non disegnato, regola di prodotto).
- Il dipendente si crea al volo dal campo (il mockup mostra il campo con un dipendente scelto; la creazione al volo non è disegnata esplicitamente).

### 2.5 Dettaglio movimento (computer)

File: `DettaglioMovimento.dc.html` (mostrato per una retribuzione regolare ricorrente).

**Scopo.** Vedere, modificare o eliminare un singolo movimento; gestire la ripetizione.

**Sezioni.**

1. Intestazione: freccia indietro (porta a Movimenti), titolo "Movimento", etichetta "Fisso · ricorrente", pulsante **Elimina** (rosso).
2. Modulo con gli stessi campi del nuovo movimento, già compilati e modificabili: Voce fissa, Tipo di retribuzione (Regolare / Extra), Dipendente, Data, Importo, Note.
3. **Riquadro «Ripetizione»** (etichetta **Attiva** o **Ferma**), senza testi esplicativi: la **frequenza** (sempre modificabile, è della ripetizione: «Ogni mese» col giorno, oppure «Personalizzata», ogni N giorni, settimane, mesi o anni) e il pulsante **«Ferma la ripetizione»**. Se oltre alla frequenza si cambiano importo, voce, fornitore, dipendente, descrizione o note, **al salvataggio** compare «Salvare le modifiche per:» con **Annulla**, **Solo questo movimento**, **Questo e i prossimi** (data, numero del documento e frequenza non fanno scattare la domanda). A ripetizione ferma il riquadro mostra «Ferma», la frequenza e **«Riattiva la ripetizione»**.
4. **Eliminare**: nessuna scelta da ricordare. In una ripetizione attiva la finestra di conferma ha due pulsanti, **Elimina solo questo** (la ripetizione continua) ed **Elimina e ferma la ripetizione**.
5. Riquadri laterali: **Prossima volta** (data e importo del prossimo movimento generato) e **Registrato** (Creato, Origine, Ultima modifica).

**Azioni.** Annulla e Salva modifiche (entrambi portano a Movimenti); Elimina (porta a Movimenti); Ferma la ripetizione (porta a Movimenti).

**Regole visibili.**

- La scelta dell'ambito vale sia per la modifica sia per l'eliminazione.
- Il giorno ricorrente è modificabile da qui.
- "Origine: Ripetizione" distingue i movimenti generati automaticamente.
- Per i movimenti non ricorrenti manca un mockup desktop; per analogia il blocco ripetizione e la scelta dell'ambito non compaiono (vedi il telefono, 3.4).

### 2.6 Importa fatture XML o ZIP (computer)

File: `ImportaFattura.dc.html`

**Scopo.** Importare le fatture ricevute (FatturaPA) invece di inserirle a mano.

**Sezioni.**

1. Intestazione come Nuovo movimento (freccia indietro verso Movimenti, titolo "Nuovo movimento", selettore **A mano** che porta a Nuovo movimento / **Importa XML o ZIP** attivo). La voce Movimenti della barra laterale è evidenziata.
2. Banner/zona di caricamento: "Trascina qui gli XML o lo ZIP delle fatture". Sottotesto: uno o più file `.xml`, oppure uno `.zip` con dentro tutti gli XML; le fatture vengono lette sul computer e non inviate da nessuna parte. Due pulsanti: **Dove trovo i file?** e **Scegli i file**.
3. Riquadro informativo **Dove trovo le fatture?** (vedi stati).
4. Anteprima con conferma: titolo tipo "3 fatture lette da fatture-ottobre.zip · controlla e conferma", e tabella.
5. Barra in fondo: "2 da importare · totale €…", pulsanti **Annulla** e **Importa 2 fatture** (il numero segue le righe selezionate); entrambi portano a Movimenti.

**Tabella di anteprima.** Colonne: casella di selezione, Fornitore (con partita IVA sotto), N. fattura, Data, Imponibile, IVA, Totale, Categoria (menu a tendina, modificabile; se altre fatture dello stesso fornitore hanno una categoria diversa compare «Usala anche per le altre N fatture di questo fornitore»). Le righe selezionate sono importate.

**Stati.**

- **Riquadro "Dove trovo i file?"**: chiuso all'apertura della schermata. Si apre e si richiude con il pulsante **Dove trovo i file?** (attributo di stato "espanso" sul pulsante). Aperto mostra: spiegazione (sul sito dell'Agenzia delle Entrate, area riservata; se non si ha l'accesso il commercialista può scaricarle), il collegamento **Apri il sito dell'Agenzia delle Entrate** (`https://www.agenziaentrate.gov.it`) e tre passi:
  1. Entrare nell'area riservata con SPID, CIE o CNS e aprire "Fatture e Corrispettivi".
  2. Scegliere le fatture "ricevute" e il periodo, poi richiedere l'esportazione di tutte le fatture.
  3. Scaricare il file `.zip` e trascinarlo nella zona di caricamento (dentro ci sono tutti gli XML).
- **Avvertenza.** I nomi esatti delle voci del portale ("Fatture e Corrispettivi", "ricevute", "esportazione", ecc.) NON sono stati verificati sul sito vivo dell'Agenzia delle Entrate. Vanno controllati prima del rilascio.
- **Riga duplicata**: una fattura già registrata è mostrata con la casella non selezionata e la nota "Già registrata il gg/mm: non verrà aggiunta"; non viene importata.
- **Riga normale**: casella selezionata, categoria proposta modificabile.
- Il mockup mostra insieme zona di caricamento e anteprima per documentare entrambi gli stati; nell'app l'anteprima compare dopo la lettura dei file.

**Regole visibili.** Formati accettati: `.xml` (anche più file) o `.zip` con tutti gli XML. Lettura locale. Anteprima con conferma prima dell'importazione. Duplicati segnalati e non importati. Categoria modificabile per ogni fattura. L'importo del movimento è il totale della fattura (imponibile + IVA); nel mockup i totali tornano.

### 2.7 Esporta (computer)

File: `Esporta.dc.html`

**Scopo.** Scaricare i dati per il commercialista o per conservarli.

**Sezioni.**

1. Colonna sinistra con i comandi:
   - **Periodo**: Settimana, Mese (selezionato), Anno, Periodo; sotto l'etichetta del periodo (es. "Ottobre 2026"). Il selettore delle date del periodo libero non è disegnato.
   - **Cosa includere**: tre caselle, tutte selezionate: Ricavi, Costi variabili, Costi fissi.
   - **Formato**: due scelte esclusive, **Excel** (`.xlsx`, con riepilogo, selezionato) e **CSV** (`.csv`, solo movimenti).
   - Pulsante **Scarica il file**.
2. Colonna destra, anteprima:
   - Niente riquadro «Il file»: il nome e i fogli del file non si ripetono (il nome lo decide il browser al download).
   - **Anteprima del foglio «Movimenti»**: tabella con colonne DATA, TIPO, FORNITORE, DOCUMENTO, IMPORTO. Date in formato `aaaa-mm-gg`; tipi in minuscolo (ricavo, variabile, fisso); importi con il segno (costi negativi) e senza simbolo di valuta.

**Regole visibili.** Excel contiene i fogli Movimenti e Riepilogo; CSV contiene solo i movimenti. Il nome del file riporta l'anno e il mese. L'anteprima mostra solo il formato Excel; per il CSV non c'è una anteprima separata.

### 2.8 Impostazioni (computer)

File: `Impostazioni.dc.html`

**Scopo.** Poche impostazioni tecniche, più la sezione «Elenchi» (vedi «Elenchi e statistiche per voce»): categorie, fornitori e dipendenti si correggono lì, nelle statistiche per voce e dalla matita dei campi del movimento, non da altre schermate di gestione.

**Sezioni (due riquadri affiancati).**

1. **Dal telefono**: codice QR e testo "Inquadra il codice o scrivi l'indirizzo, con il telefono sulla stessa rete Wi-Fi." Il mockup mostra solo il QR; l'indirizzo testuale non è disegnato ma è citato nel testo.
2. **Dati e copie**, tre righe, ciascuna con un pulsante:
   - Ultima copia di sicurezza ("Oggi alle 03:00 · automatica") con **Fai ora**.
   - Dove sono i dati ("Solo su questo computer, mai online") con **Apri cartella**.
   - Ripristina da una copia ("Sostituisce i dati attuali") con **Scegli copia**. Nel mockup il pulsante era «Scegli file»; nell'app si sceglie da un elenco (vedi sotto).

**Ripristino (implementato, non nel mockup).** «Scegli copia» apre una finestra con le copie trovate (radio con data e ora in italiano, dimensione leggibile, etichetta «fatta prima di un ripristino»; stato vuoto «Nessuna copia trovata»). Poi due passi di conferma: il testo «I dati attuali vengono sostituiti da quelli del <data>. Prima ne viene fatta una copia di sicurezza. L'app si riavvia.» e «Ultima conferma» con «Sì, sostituisci i dati». Dopo la richiesta compare «Riavvio in corso…»: interroga `GET /api/versione` una volta al secondo e ricarica la pagina quando il servizio è tornato (dopo 60 s mostra un errore con «Ricarica la pagina»).

**Regole visibili.** Copia automatica notturna; i dati restano solo sul computer; il ripristino sostituisce i dati attuali dopo una copia di sicurezza e una doppia conferma.

---

## 3. Schermate telefono

Larghezza 390, altezza 844. Barra inferiore: Riepilogo, Movimenti, Esporta.

### 3.1 Riepilogo (telefono)

File: `RiepilogoMobile.dc.html`

**Scopo.** Versione compatta del Riepilogo.

**Sezioni.**

1. Titolo "Riepilogo".
2. Selettore di periodo: **Settimana** (selezionato), **Mese**, **Anno** (manca il periodo libero); frecce e etichetta del periodo.
3. Riquadro del risultato: "Risultato della settimana" in grande, poi Ricavi e Costi in una riga e la barra delle proporzioni.
4. Tre riquadri impilati: **Ricavi** (Fatturati, Extra), **Costi variabili** (Fatture, Scontrini), **Costi fissi** (Retribuzione regolare, Retribuzione extra, "Affitto, utenze, altre" come riga unica).
5. Pulsante flottante "+" (porta a Nuovo movimento telefono) e barra inferiore.

**Differenze dal computer.** Niente periodo libero; costi fissi con una riga unica per affitto, utenze e altre voci; niente legenda con percentuali.

### 3.2 Movimenti (telefono)

File: `MovimentiMobile.dc.html`

**Sezioni.** Titolo; filtro tipo **Tutti / Ricavi / Variabili / Fissi**; casella di ricerca "Cerca fornitore o nota…" con accanto il pulsante **Categoria** (sulla stessa riga, anche a 320 px): un tocco apre un foglio dal basso "Filtra per categoria" con ricerca, caselle da 48 px per Ricavi / Costi variabili / Costi fissi e i pulsanti **Azzera** e **Applica**; chiudendo senza applicare il filtro resta com'era. Con filtro attivo il pulsante è verde, mostra «Categoria: nome» (con ellissi se lungo) o «Categorie (n)» e ha una ✕ da 44 px; elenco raggruppato per giorno. Ogni riga: nome (fornitore o descrizione), sottotitolo "documento · tipo" e importo con segno. Pulsante "+" flottante e barra inferiore.

**Azioni.** Toccando una riga si apre il dettaglio (nel mockup è attiva solo la prima riga, che porta a Dettaglio movimento telefono). "+" porta a Nuovo movimento telefono.

**Differenze dal computer.** Nessun filtro di periodo, nessun totale in fondo, nessuna colonna di origine (XML / A mano / Ricorrente).

### 3.3 Nuovo movimento (telefono)

File: `NuovoMovimentoMobile.dc.html` (stato "Costo variabile" + "Fattura").

**Campi.**

| Campo | Controllo | Obbligatorio | Note |
|---|---|---|---|
| Che cos'è | Ricavo / Costo variabile / Costo fisso | sì | |
| Documento | Fattura / Scontrino | sì (per costo variabile) | |
| Data | campo data | sì | |
| Importo | campo numerico con € | sì | |
| Fornitore | campo con ricerca | sì | |
| Categoria | campo con ricerca | sì | |
| N. fattura | testo | per Fattura | |
| Foto | pulsante **Scatta**, "(facoltativa)" | facoltativo | Allegato da fotocamera |

**Azioni.** Freccia indietro e **Annulla** (portano a Movimenti telefono); **Salva** (porta a Movimenti telefono).

**Differenze dal computer.** Nessun riquadro "Dove finisce", nessun "Salva e aggiungine un altro", nessuna importazione XML/ZIP, nessun campo Note, nessuno stato per la retribuzione o la ripetizione. La creazione al volo di fornitore/categoria non è disegnata sul telefono (stessa regola di prodotto presunta).

### 3.4 Dettaglio movimento (telefono)

File: `DettaglioMovimentoMobile.dc.html` (movimento variabile importato da XML).

**Sezioni.** Freccia indietro e titolo "Movimento" con etichetta del tipo (Variabile); campi modificabili Data, Importo, Fornitore, Categoria, N. fattura, Note; un riquadro di provenienza ("Fattura importata da XML", "Il 21/10 · il file resta allegato"); pulsante rosso **Elimina movimento**; barra con **Annulla** e **Salva modifiche**. Tutti i pulsanti portano a Movimenti telefono.

**Differenze dal computer.** Questo movimento non è ricorrente, quindi non c'è né il blocco di ripetizione né la scelta dell'ambito. Per un movimento ricorrente il telefono non ha un mockup.

---

## 4. Regole e decisioni

Regole di prodotto decise. Dove una schermata le rispecchia è indicato; le incongruenze sono nella sezione 6.

- **Ritorno alla lista.** Uscendo dal dettaglio (o da «Nuovo movimento») con Annulla, la freccia indietro, il salvataggio o il tasto indietro del browser, la lista dei Movimenti riparte dalla stessa posizione di scorrimento e con la stessa ricerca (`util/posizioneLista.ts`, ripristino in `Guscio`). Andando in un’altra sezione e tornando, riparte dall’inizio.

1. **Navigazione.** Barra laterale: Riepilogo, Movimenti, Esporta, Impostazioni. Nessuna sezione Fissi (eliminata). Barra del telefono: Riepilogo, Movimenti, Esporta. Verificato nei file (con l'eccezione descritta in 6).
2. **Un solo registro di movimenti**, con: data, importo, direzione costo/ricavo, categoria, tipo documento (fattura / scontrino / regolare / extra), fornitore, dipendente facoltativo, note, allegato facoltativo, ripetizione facoltativa.
3. **Tipi.**
   - **Ricavo**: fatturati oppure extra non fatturati.
   - **Costo variabile**: fatture e scontrini.
   - **Costo fisso**: retribuzione (regolare o extra), affitto, utenze, altre voci fisse.
4. **Retribuzione.** Regolare = in busta; Extra = fuori busta. Il campo Dipendente è facoltativo: se vuoto l'importo conta nel totale ma non nel dettaglio per persona.
5. **Creazione al volo.** Fornitori, categorie e dipendenti si creano dal campo di inserimento nel nuovo movimento (comando "Crea fornitore «…»", etichetta "Nuova" per le categorie), non da Impostazioni. In Impostazioni restano solo "Dal telefono" (QR/indirizzo) e "Dati e copie".
6. **Ripetizione mensile** ("Ripeti ogni mese, il giorno N"). Le voci ricorrenti si registrano da sole come movimenti, senza conferma, e si correggono dopo in Movimenti. La retribuzione extra NON è ricorrente (si inserisce a mano). Il giorno ricorrente è modificabile dal dettaglio. Nel dettaglio di un movimento ricorrente "Solo per questo movimento" / "Per questo e per i prossimi" vale sia per la modifica sia per l'eliminazione. È presente "Ferma la ripetizione".
7. **Dettaglio.** Toccando una riga in Movimenti si apre il dettaglio, con modifica ed elimina.
8. **Importazione fatture.** File `.xml` (FatturaPA), più file, oppure `.zip` con dentro tutti gli XML. Lettura in locale. Anteprima con conferma; duplicati segnalati e non importati; categoria modificabile. Riquadro informativo su dove scaricare le fatture dal sito dell'Agenzia delle Entrate (area riservata, SPID/CIE/CNS, "Fatture e Corrispettivi", fatture ricevute, esportazione, zip), con collegamento al sito e nota che il commercialista può scaricarle. **I nomi esatti delle voci del portale non sono stati verificati sul sito vivo.**
9. **Esporta.** Periodo, cosa includere, formato Excel (`.xlsx` con fogli Movimenti e Riepilogo) o CSV (solo movimenti), con anteprima.
10. **Riepilogo.** Periodo settimana / mese / anno / libero; ricavi − costi = risultato; barra delle proporzioni; tre blocchi (Ricavi, Costi variabili, Costi fissi).
11. **Fuori ambito.** Le pizze settimanali, per ora.

---

## 5. Stile

Stesso del progetto `etichetta-da-matteo`: palette crema / sabbia / verde. Titoli e numeri in evidenza in **Bricolage Grotesque** (500, 600, 700); testo in **Atkinson Hyperlegible** (400, 700); sostituti: Segoe UI, system-ui. I caratteri vengono caricati da Google Fonts nei mockup. Cifre tabellari per gli importi.

Elementi ricorrenti: schede bianche con angoli arrotondati (18 px) e bordo sabbia; pulsanti alti 48-52 px con angoli di 12 px; campi alti 52 px; etichette dei campi in maiuscoletto 12 px; intestazioni dei giorni in maiuscolo su fondo chiaro.

### Token colore effettivamente usati nei file

| Esadecimale | Ruolo (dedotto dall'uso) |
|---|---|
| `#EADECE` | Sfondo della pagina |
| `#FBF5EC` | Sfondo di barra laterale, pannelli e zone di caricamento |
| `#F7F0E4` | Sfondo delle intestazioni di giorno e dell'intestazione dell'anteprima |
| `#FFFFFF` | Schede, campi, pulsanti secondari, testo su fondo scuro o verde |
| `#58443C` | Testo principale; fondo del segmento selezionato nei selettori; testo dei pulsanti secondari |
| `#6F5F53` | Testo secondario, etichette, icone non attive |
| `#887868` | Bordo di campi, caselle e pallini di selezione |
| `#CFC0AA` | Bordo di selettori e pulsanti secondari |
| `#C0AF9B` | Bordo tratteggiato della zona di caricamento e dei campi allegato |
| `#DCCFBB` | Bordo di schede e barre |
| `#EDE3D5` | Linee divisorie delle righe; etichetta "Fisso" (fondo) |
| `#5E7B18` | Verde principale: pulsanti primari, collegamenti, interruttore acceso, barra del risultato |
| `#4B6313` | Verde scuro: testo su verde chiaro, stato hover dei collegamenti |
| `#E3EAD1` | Verde chiaro: voce attiva della navigazione, scelta selezionata, etichetta "Ricavo" |
| `#B9C89A` | Verde medio: tratto dei costi fissi nella barra delle proporzioni |
| `#845A08` | Ocra: testo dell'etichetta "Variabile", tratto dei costi variabili, scelta "Costo variabile" |
| `#F7EBD3` | Ocra chiaro: fondo dell'etichetta "Variabile" e della riga duplicata nell'anteprima |
| `#A3301A` | Rosso: Elimina, Ferma la ripetizione |
| `#E0B4A8` | Bordo rosso chiaro dei pulsanti distruttivi |

---

## 6. Incoerenze trovate

Controllo delle schermate rispetto alle regole di prodotto e tra loro.

1. **Mobile: la voce "Esporta" non ha una schermata.** Nella barra del telefono "Esporta" rimanda a Riepilogo o Movimenti telefono; non esiste un mockup di Esporta per il telefono (quindi le schermate del telefono sono 4, senza Esporta, mentre la regola prevede la voce nella barra).
2. **Retribuzione extra segnata come ricorrente sul telefono.** In Movimenti (telefono) sia "Retribuzione regolare" sia "Retribuzione extra" hanno il sottotitolo "Fisso · ricorrente"; la regola dice che l'extra non è ricorrente (sul computer l'extra è correttamente "A mano").
3. **Date e periodi non coerenti.** Il Riepilogo (computer e telefono) è sulla settimana "12 – 18 ottobre 2026" e include i totali dell'intero elenco di Movimenti, che però ha date dal 19 al 21 ottobre (fuori da quella settimana). Il riquadro "Dove finisce" di Nuovo movimento usa invece "Sett. 19 – 25 ott" con costi variabili di partenza uguali a quelli del Riepilogo. In più la riga "Incassi fatturati" riporta "Settimana 12–18 ottobre" ma ha data 20/10.
4. **Dettaglio e riga non corrispondono.** Il Dettaglio movimento (retribuzione regolare ricorrente) ha data 10/10/2026 e importo 1.400,00; la riga corrispondente in Movimenti ha data 19/10 e importo 1.050,00. Anche "Costo del mese" in Nuovo movimento: retribuzione (1.400 + 500 = 1.900) non coincide con i valori del Riepilogo (1.050 + 400).
5. **Righe di Movimenti non tutte cliccabili.** La regola dice che toccando una riga si apre il dettaglio; nei mockup (computer e telefono) è collegata una sola riga per schermata. Mancano inoltre mockup di dettaglio per ricavi, per costi fissi non retribuzione e per movimenti non ricorrenti sul computer.
6. **Elimina senza ambito né conferma.** Il pulsante "Elimina" del dettaglio ricorrente porta direttamente a Movimenti; la scelta dell'ambito è nel modulo, ma non c'è conferma esplicita. Sul telefono non esiste un dettaglio di movimento ricorrente (nessuna scelta dell'ambito né "Ferma la ripetizione").
7. **Ripetizione disegnata solo per la retribuzione.** L'interruttore "Ripeti ogni mese" esiste solo nel mockup della retribuzione (computer). Nuovo movimento generico e telefono non lo mostrano, mentre la regola parla di voci ricorrenti in generale (affitto, utenze). Manca anche lo stato "Extra" (senza ripetizione).
8. **Creazione al volo non disegnata per tutti i campi.** È mostrata solo per fornitore e categoria sul computer. Per il dipendente (computer) e per fornitore/categoria sul telefono il campo compare senza lo stato di creazione.
9. **Nuovo movimento telefono incompleto rispetto al computer.** Mancano Note (presenti sul computer e nel dettaglio del telefono), "Salva e aggiungine un altro" e il riquadro "Dove finisce".
10. **Impostazioni: indirizzo non visibile.** Il testo cita "l'indirizzo", ma accanto al QR non è disegnato alcun indirizzo.
11. **Esporta: periodo libero senza date e anteprima solo Excel.** Il tipo "Periodo" non ha un selettore di date; l'anteprima non mostra il CSV. L'anteprima usa date `aaaa-mm-gg` e importi senza €, e non mostra il foglio Riepilogo.
12. **Telefono: periodo libero assente.** Il Riepilogo telefono ha solo Settimana, Mese, Anno; Movimenti telefono non ha filtro di periodo né totali.
13. **File residuo.** Nella cartella del canvas esiste `CostiFissi.dc.html` (schermata dei costi fissi), ma non è elencato in `canvas.json` e la sezione Fissi è stata eliminata: va considerato scartato e non va implementato.
14. **Importazione: navigazione.** Nella schermata di importazione la voce evidenziata della barra è Movimenti (corretto), ma il titolo resta "Nuovo movimento"; il selettore A mano / Importa è l'unico punto d'accesso (nessun pulsante di importazione in Movimenti).
15. **Verifica sul portale non fatta.** Le diciture del riquadro "Dove trovo le fatture?" (Fatture e Corrispettivi, fatture ricevute, esportazione, zip) non sono state controllate sul sito dell'Agenzia delle Entrate.

---

## 7. Più sedi (vista singola o mista)

**Soglia del layout.** Barra laterale e tabelle «da computer» partono da **1024 px** (`--breakpoint-md` in `index.css`, `useSchermoGrande`); sotto, anche sul tablet in verticale, vale il layout da telefono (barra in basso, schede), che a 768 px reggeva meglio dei layout a più colonne.

Regola chiave: con **una sola sede attiva** l'interfaccia è quella di prima (nessun selettore, badge o scheda «Per sede»). Le novità compaiono solo con almeno due sedi attive. Contratto: [`api.md`](api.md), sezione «Sedi».

- **Selezione.** Stato globale (`ProviderSedi`, `useSedi`), ricordato in `localStorage` (`contabilita.sedi.v1`); di partenza tutte le attive. Riepilogo, Movimenti ed Esporta hanno il selettore: sul telefono un chip che apre un foglio dal basso (caselle, «Solo», «Tutte le sedi», collegamento a Impostazioni), sul computer una barra di pillole (l'ultima sede accesa non si spegne). Se sono selezionate tutte le attive il filtro `sedi` non si manda (il servizio include anche le archiviate).
- **Riconoscere la sede.** Una lettera in riquadro colorato (non solo il colore), palette ciclica per ordine della sede: verde `#E3EAD1`/`#4B6313`, ambra `#F7EBD3`/`#845A08`, blu `#DCE9F1`/`#2F5D7A`, rosa `#F2DDE6`/`#8A3358` (contrasto ≥ 4,5:1, verificato nei test). Due sedi con la stessa iniziale si distinguono con due lettere («VM»). Logica in `util/sedi.ts`.
- **Riepilogo.** Con almeno due sedi selezionate compare «Per sede» (ricavi, costi, risultato e barra proporzionale ai ricavi, da `perSede`). Se le sedi scelte non sono tutte, il titolo dice quali: «Risultato della settimana · Via Roma + Lungomare» (con tutte: «… · tutte le sedi»; la scheda scontrino medio ha lo stesso suffisso).
- **Movimenti.** Filtro per sedi, badge-lettera sulla riga, sede nel dettaglio (scheda «Registrato») e nel modulo.
- **Nuovo movimento / Dettaglio.** «Di quale sede (una o più)»: pillole con lettera; preselezione = la sede singola selezionata, altrimenti nessuna (messaggio «Scegli una o più sedi.»). Solo in creazione le pillole si possono scegliere insieme: una = quella sede, due o più (anche 2 su 3) = l'importo si divide fra quelle (`POST /api/movimenti/dividi?sedi=1,3`), «Tutte, dividi» le sceglie tutte in un colpo; riga di anteprima («Diviso fra Via Roma e Mercato: 500,00 / 500,00 €»). «Ripeti» vale anche con più sedi (un costo fisso condiviso, come l'affitto): ogni sede ripete la sua parte («Ogni sede ripete la sua parte: i mesi dopo escono già divisi.»). Con «Tutte, dividi» l'allegato va sul primo movimento creato. In modifica la sede si manda solo se è cambiata.
- **Importa fatture.** Scelta della sede (stessa preselezione), passata a `conferma` come `sedeId`. **Esporta**: rispetta le sedi selezionate (nessuna frase di spiegazione: lo dice il selettore); l'anteprima mostra la colonna «Sede».
- **Impostazioni → Sedi.** Elenco con numero di movimenti, rinomina, archivia (con conferma; l'ultima sede attiva non si archivia) e riattiva, aggiunta. È l'unico punto dove si aggiunge una sede: sul telefono Impostazioni si raggiunge dal foglio delle sedi.

## 8. Statistiche e «Pizze e ordini»

Matteo scrive **una volta a settimana, per sede, quante pizze e quanti ordini**; l'app calcola lo **scontrino medio** (ricavi ÷ ordini) e le **pizze per ordine**. Contratto: [`api.md`](api.md), sezione «Statistiche». Riferimento visivo: i prototipi approvati (telefono interattivo e quattro schermate per il computer). Logica pura (calcoli, validazione, settimana, grafico) in `ui/src/util/statistiche.ts`, con i test accanto.

- **Navigazione.** Nuova voce **Statistiche** (icona linea in salita) tra Movimenti ed Esporta: barra in basso del telefono (quattro voci) e barra laterale del computer. Rotte `/statistiche` e `/statistiche/pizze-ordini` (con `?s=yyyy-MM-dd`, un giorno qualsiasi della settimana); la voce resta evidenziata anche dentro «Pizze e ordini».
- **Statistiche** (`viste/Statistiche.tsx`). Stesso selettore sedi e stesso periodo (`usePeriodo`) di Riepilogo. In cima, se manca qualcosa, il banner ambra «Settimana 26 ott – 1 nov: mancano pizze e ordini di Mercato» (si guardano le ultime quattro settimane, tutte le sedi; con una sola sede niente nomi) che porta a «Pizze e ordini» di quella settimana. Poi lo **scontrino medio** in grande, tre numeri (ordini, pizze, pizze per ordine), «Ogni pizza porta in media …» (sul computer è un quarto riquadro, «Ricavo per pizza»). Lo scontrino conta solo le coppie sede-settimana con dati inseriti e ordini > 0, senza note esplicative. Con almeno due sedi selezionate: **Per sede** («Confronto tra sedi» sul computer; barra da zero, ordini, pizze, pizze a ordine) con in fondo il totale («Tutte le sedi» o «Sedi scelte»); sul computer è una tabella con intestazioni. **Ultime 8 settimane**: barre dello scontrino medio (le altezze vanno dal minimo al massimo, non da zero; i valori sono scritti; l'ultima è scura, le settimane a cui manca una sede sono a righe; l'elenco completo è per gli screen reader). Il pulsante sta nella testata («Inserisci pizze e ordini», computer) o in fondo («Inserisci dati della settimana», telefono). Il grafico non ha legenda scritta. Senza dati: «Ancora nessun dato di pizze e ordini»; un periodo senza lunedì (un solo giorno): «Il periodo non comprende una settimana intera».
- **Pizze e ordini** (`viste/PizzeOrdini.tsx`). Frecce settimana precedente/successiva (lunedì–domenica; non si va oltre la settimana in corso), una **scheda per sede** (telefono e tablet) o una **tabella dai 1024 px** con colonne Pizze, Ordini, Ricavi, Scontrino medio, Pizze / ordine, Stato e la riga «Tutte le sedi · parziale … n su m». I campi sono numerici (`inputMode="numeric"`, anche il punto delle migliaia): interi ≥ 0, entrambi o nessuno, con 0 ordini le pizze sono 0, al massimo 1.000.000; gli errori compaiono dopo il primo «Salva» e il fuoco va al primo campo sbagliato. Lo **scontrino medio si aggiorna mentre scrivi** (ricavi della settimana ÷ ordini, mezzo centesimo in su come il servizio). Stato «Completa» / «Da inserire». «Salva la settimana» manda solo le sedi cambiate a `PUT /api/statistiche/settimana`; i due campi svuotati cancellano il dato. Dopo il salvataggio si torna a Statistiche. In fondo «Settimane già inserite» (ultime 8, con «n su m» e «Modifica»). Le modifiche non salvate sono protette come nel resto dell'app (`useBloccoUscita`, `ConfermaUscita`: vale anche per le frecce della settimana). Le sedi archiviate non si compilano.
- **Riepilogo.** Sotto il risultato (e accanto a «Per sede» sul computer) la scheda **Scontrino medio** del periodo con «N ordini · M pizze» e «Vai alle statistiche»; compare solo se nel periodo ci sono ordini.
- **Una sola sede attiva.** Niente selettore, badge né «Per sede»; restano scontrino, numeri, grafico e «Pizze e ordini» con un solo gruppo di campi.
- **Esporta.** Nessuna modifica: il foglio «Statistiche» dell'Excel lo produce il servizio.

## Categorie, voce fissa e Riepilogo (senza categorie predefinite)

Richiesta del cliente (novembre 2026): «devono sparire le categorie di sistema, deve essere tutto customizzabile». **Non esistono categorie predefinite**: sono tutte dell'utente, si creano (scrivendo il nome nuovo in un movimento, «Crea categoria «…»» / «Crea voce «…»»), si rinominano, si uniscono e si eliminano (Impostazioni > Elenchi, statistiche per voce, matita dei campi: vedi «Elenchi e statistiche per voce»). Nessuna etichetta distingue più «Tua» da «di sistema»; il campo `personalizzata` e le logiche che lo usavano (`nomiTue`, `eTua`, `dividiVociFisse`) sono stati **rimossi**.

- **Voce fissa.** Nei costi fissi il campo «Voce fissa» è un Combobox sulle categorie di tipo `COSTO_FISSO`: non c'è nessun nome scritto nel codice (sono spariti Retribuzione, Affitto, Utenze e «Altra voce fissa»; `NOMI_STANDARD`, `NOME_VOCE`, `CATEGORIA_DI_VOCE` e `voceFissa` non esistono più). Il testo non si ripulisce mentre si scrive (con «Affitto » il campo tiene lo spazio, così si può scrivere «Affitto capannone»); gli spazi ai bordi si tolgono solo al salvataggio.
- **Retribuzione = un flag della categoria.** L'unica particolarità è `retribuzione` (solo categorie di costo fisso). Se la categoria scelta ha il flag (`campi.eRetribuzione`, ricavato cercando la categoria per nome fra quelle caricate) il modulo mostra, come prima, **Tipo di retribuzione** (Regolare / Extra) e **Dipendente**, senza Fornitore, il documento è `RETRIBUZIONE_REGOLARE`/`RETRIBUZIONE_EXTRA` e «Dove finisce» mostra il dipendente; altrimenti il documento è `NESSUNO`. La retribuzione extra non si ripete. Il nome non conta: «Retribuzione» si può rinominare («Paghe») ed eliminare, il modulo continua a chiedere Regolare/Extra/Dipendente finché la categoria ha il flag.
- **Come si imposta il flag.** (a) Nella finestra **Rinomina** di una categoria di costo fisso (Impostazioni > Elenchi, statistiche per voce, matita del campo) c'è l'interruttore **«È una retribuzione»** («Con dipendente, regolare ed extra.»): si salva con `PUT /api/categorie/{id} {nome?, retribuzione?}` mandando solo ciò che cambia. (b) Scrivendo nel campo Voce fissa un **nome nuovo** compare sotto il campo lo stesso interruttore (spento di partenza); al salvataggio, se acceso, la categoria si crea con `POST /api/categorie {nome, tipo:"COSTO_FISSO", retribuzione:true}` prima del movimento (`api.assicuraCategoriaRetribuzione`, in Nuovo e in Modifica). Il flag non si toglie se ci sono retribuzioni: il 409 «Questa categoria ha già delle retribuzioni.» si mostra nella finestra.
- **Contrassegno.** Una categoria con il flag ha, in Impostazioni > Elenchi, il contrassegno testuale **«Retribuzione»** accanto al nome (non solo colore) e «· Retribuzione» nel sottotitolo della scelta delle azioni.
- **Riepilogo (forma nuova).** In ciascuna delle tre sezioni (Ricavi, Costi variabili, Costi fissi) c'è **una riga per categoria** (`voci`, dall'importo più alto; «Senza categoria», in tono più chiaro, in fondo; una nota di credito può rendere negativa una riga; senza movimenti la riga «Nessun movimento»). La somma delle righe è il totale della sezione. Le somme per documento (Fatturati/Extra, Fatture/Scontrini, Retribuzione regolare/extra) sono il **«di cui»**: un blocco sotto le righe, separato da un filo tratteggiato, con l'etichetta «di cui (già nel totale)», testo più piccolo e chiaro, e **non sono aggiunte al totale**; ogni riga compare solo se è maggiore di zero. `altreVoci` non esiste più (e sparisce la riga unica «Affitto, utenze, altre» del telefono: sul telefono le righe sono le stesse del computer). Il riquadro «Dove finisce» mostra la categoria per ogni tipo.
- **Combobox: lista scorrevole.** Nessun limite a 8: l'elenco aperto mostra tutte le opzioni (fornitore, categoria, dipendente, voce fissa) in una lista con altezza massima `min(22rem, 40dvh)` (circa 5-6 righe da 48 px sul telefono, così non esce dallo schermo nemmeno a 320×568) e `overflow-y: auto`. Con le frecce la voce attiva scorre in vista (`scrollIntoView({block: "nearest"})`). Il comando «Crea …» sta **in cima** solo se la lista è lunga (più di 6 voci), altrimenti **dopo** le voci esistenti, e non è mai evidenziato di partenza (vedi «Correzioni dalla simulazione del cliente»); logica in `util/suggerimenti.ts`, `vociSuggerimenti`. Tastiera, ARIA e matita di modifica non cambiano.

## Fatture da fare

Schermata **Fatture** (`/statistiche/fatture`; la vecchia `/fatture` rimanda lì), un promemoria mensile: l'utente crea le sue caselle («Fatture eventi», «Fattura a Y», «Euro Service») e per ogni mese ne segna lo stato **Da fare → Emessa → Pagata**, con importo e nota facoltativi. Contratto in [`api.md`](api.md), «Fatture da fare»; non entra nei totali.

- **Navigazione.** Nessuna voce propria nelle barre (il telefono resta a **quattro voci**: Riepilogo, Movimenti, Statistiche, Esporta; Impostazioni solo sul computer). Si arriva da **Statistiche**, dal collegamento «Fatture · Fatture da fare e pagate, mese per mese» (con «N da fare» nel mese in corso) accanto a «Costi e ricavi per voce», o dalla scheda del Riepilogo. Dentro c'è la freccia indietro verso Statistiche e la voce Statistiche resta evidenziata.
- **Mese.** Frecce e nome del mese («Novembre 2026», «Questo mese»; si va indietro quanto si vuole, avanti solo di un mese; sui mesi diversi dall'attuale compare «Torna a questo mese»). Sopra, tre contatori: **Da fare** (in ambra se > 0), **Emesse** (con la somma da incassare), **Pagate**. Poi **una lista**: una sola scheda con una riga per casella, separate da filetti (sul computer la stessa lista, larga). A sinistra il nome (va a capo, mai troncato) e sotto, in piccolo e tenue, importo e nota («€ 1.200,00 · N. 53»); a destra il badge di stato e la matita. Sul telefono stanno 6-7 righe sopra la barra in basso.
- **Come si cambia stato.** Il **badge è anche il comando** (area di almeno 44 px): un tocco porta da Da fare a Emessa e da Emessa a Pagata; importo e nota restano. L'etichetta per gli screen reader dice cosa succede («Fatture eventi: Da fare. Segna come emessa»). **Pagata non avanza e non torna indietro con un tocco** (il badge non è più un pulsante): per tornare indietro o scrivere importo e nota c'è la matita, «Importo, nota e stato», una finestra (foglio dal basso sul telefono) con le tre scelte esplicite. In fondo alla finestra, «Rinomina o elimina la casella».
- **Stato leggibile senza colore.** Parola + icona + colore: Da fare (orologio, ambra), Emessa (aeroplanino, sabbia), Pagata (spunta, verde). Un «Da fare» di un mese **passato** è in ritardo: triangolo rosso sul badge e, sotto il nome, «In ritardo».
- **Panoramica.** Vista a griglia caselle × ultimi mesi (6 sul computer, 5 sul telefono, per tenere i riquadri sopra i 44 px a 320 px) che finisce nel mese scelto; ogni riquadro apre la finestra di quel mese. Legenda e «Ancora da fare in questi mesi: N».
- **Caselle.** «Nuova casella» (pulsante in testata sul computer, riquadro tratteggiato in fondo sul telefono). Una casella con lo stesso nome (senza badare alle maiuscole) non si crea: «Esiste già una casella con questo nome.». «Elimina la casella» chiede conferma e ricorda che spariscono gli stati di tutti i mesi. Senza caselle: stato vuoto con «Crea la prima casella».
- **Due schede.** In cima a Fatture: **Da emettere** (le caselle, quanto descritto sopra) e **Ricevute** (le fatture dei fornitori, vedi sotto). Il navigatore del mese è lo stesso per entrambe; `?scheda=ricevute` apre direttamente le Ricevute.
- **Mesi non attivi (niente arretrati).** Una casella nuova parte dal mese in cui è creata (`dalMese`): i mesi precedenti, se non hanno uno stato salvato, sono **neutri** («—», senza «In ritardo»), non entrano in «Da fare» né nei contatori né nella Panoramica, e «Ancora da fare in questi mesi: N» li ignora. Un mese con uno stato salvato è sempre attivo. Nella Panoramica la legenda ha «prima della casella».
- **Scadenza (facoltativa).** Nella finestra «Nuova casella» / «Modifica la casella» il campo «Entro il giorno [ ] del mese» (1–31, vuoto = nessuna; nei mesi corti vale l'ultimo giorno). Nella lista Mese, una casella **Da fare** con scadenza mostra sotto il nome, in piccolo, «Scade il 28» (neutro), «Scade tra 3 giorni» / «Scade domani» / «Scade oggi» (ambra, con orologio) o «Scaduta da 2 giorni» / «Scaduta ieri» (rosso, con triangolo); nei mesi passati resta il solo «In ritardo».
- **Riepilogo (Home).** La scheda discreta usa **sempre il mese corrente** (`GET /api/fatture/promemoria`), anche se il Riepilogo mostra un altro periodo: «Fatture da emettere questo mese: N» con il link a Fatture. Se qualche casella è in scadenza (entro 3 giorni o scaduta) sotto compaiono, in evidenza, al massimo due righe «Fattura a Rossi: scade tra 3 giorni» (le scadute in rosso) e «e altre N». Con zero da fare (o senza risposta) la scheda non c'è. L'app non manda notifiche a schermo spento: il promemoria si vede aprendo l'app.
- Codice: `ui/src/viste/Fatture.tsx`, `ui/src/componenti/FinestreFatture.tsx`, `SchedaFattureDaFare.tsx`, `BadgeStatoFattura.tsx`; logica pura e test in `ui/src/util/fatture.ts`.

## Fatture ricevute

La scheda **Ricevute** di Fatture serve a controllare a fine mese cosa è stato davvero pagato ai fornitori («fatture Bel Fungo di ottobre, Euro Service di novembre…»). Contratto in [`api.md`](api.md), «Fatture ricevute». Sono i movimenti `COSTO_VARIABILE` con documento `FATTURA` (a mano o importati da XML) del mese scelto, letti da `GET /api/movimenti`; nessuna chiamata nuova oltre a `PUT /api/movimenti/{id}/pagata`. Valgono tutte le sedi.

- **Riepilogo in cima.** Due riquadri: **Da pagare** (importo e numero di fatture, in ambra se > 0) e **Pagate**.
- **Per fornitore.** Una scheda per fornitore (dal totale più alto; «Senza fornitore» in fondo) con il totale del mese e, sotto, **«Pagato € X»** (spunta) e **«Da pagare € Y»** (orologio, ambra): parole e icona, non solo colore. Pagato + Da pagare = totale (le note di credito riducono il totale).
- **Aprendo il fornitore** si vede l'elenco delle sue fatture del mese: data, numero, importo e il **badge Da pagare / Pagata** (area di almeno 44 px). Un tocco sul badge segna pagata / da pagare. Le note di credito sono righe che riducono, senza badge. Il numero apre il dettaglio del movimento.
- **Segna tutte pagate** (per fornitore, solo se ce ne sono da pagare): chiede conferma con numero di fatture e importo. Filtro rapido **Solo da pagare**: nasconde i fornitori a posto e le fatture pagate.
- **Stato vuoto.** «Nessuna fattura ricevuta questo mese. Le fatture si aggiungono da Movimenti o importandole da XML.» con il pulsante «Importa fatture XML»; in fondo all'elenco un collegamento «Importa fatture XML».
- **Nel resto dell'app.** Nell'elenco **Movimenti** le sole fatture hanno un piccolo badge «Da pagare» / «Pagata»; nel **dettaglio** di una fattura c'è l'interruttore «Fattura pagata»; in **Nuovo movimento** (costo variabile, documento Fattura) «Già pagata», spento di default; le fatture importate da XML nascono **da pagare**. Nelle **statistiche per voce → Fornitori** sotto il totale una riga tenue «Pagato € X · Da pagare € Y» (sul periodo intero, non sul singolo mese scelto).
- Codice: `ui/src/componenti/FattureRicevute.tsx`, `BadgePagata.tsx`; logica pura e test in `ui/src/util/fattureRicevute.ts`.

## Elenchi e statistiche per voce

Richieste del cliente (novembre 2026): rinominare/eliminare categorie, fornitori e dipendenti (tutte le categorie si rinominano: non ce ne sono di predefinite), e vedere quanto speso o incassato per voce, mese per mese. Contratto in [`api.md`](api.md): «Gestione di categorie, fornitori e dipendenti» e «Statistiche per voce».

**Rinomina, Unisci, Elimina** (un solo componente, `AzioniVoce`: fogli dal basso sul telefono, finestre sul computer). Dove si trovano, perché sul telefono non c'è Impostazioni:
- **Statistiche per voce**: si tocca la riga di una voce, si apre il suo dettaglio (la lista dei movimenti) e lì c'è il pulsante «Modifica voce» (Rinomina / Unisci… / Elimina). Non c'è per la riga «Senza …».
- **Campi di scelta del movimento** (Fornitore, Categoria, Voce fissa, Dipendente): una piccola matita accanto a ogni voce suggerita e, quando il campo contiene già una voce esistente, nel campo stesso (raggiungibile da tastiera). Apre la scelta delle tre azioni. Se il campo conteneva proprio quella voce, si aggiorna da solo (nuovo nome; vuoto dopo un'eliminazione; nome della voce tenuta dopo un'unione). Sostituisce la vecchia matita sotto il campo categoria (`GestioneCategoria`, rimossa). Per le categorie di costo fisso la finestra Rinomina ha anche l'interruttore «È una retribuzione».
- **Computer, Impostazioni > Elenchi**: tre schede Categorie / Fornitori / Dipendenti con ricerca; le categorie sono raggruppate in Ricavi, Costi variabili e Costi fissi (voci fisse); ogni riga ha nome, numero di movimenti, il contrassegno «Retribuzione» se c'è il flag e i tre pulsanti.

Regole: **Elimina** non blocca mai; la conferma dice «usata da N movimenti: resteranno senza categoria» (o fornitore, dipendente) e, se la voce è usata, propone «Meglio unirla a un'altra voce…». **Unisci** sposta movimenti e ripetizioni sull'altra voce (per le categorie, solo dello stesso tipo) ed elimina quella di partenza. Un nome già usato (409) e gli altri errori si leggono in chiaro dentro la finestra. Dopo ogni azione si invalidano elenchi, movimenti, Riepilogo e statistiche.

**Costi e ricavi per voce** (`/statistiche/voci`, link «Costi e ricavi per voce» in cima alle Statistiche). Scelta **Fornitori / Dipendenti / Categorie** (per le categorie anche **Costi / Ricavi / Tutti**; fornitori = costi variabili, dipendenti = retribuzioni), periodo e sedi come le altre viste (predefinito: mese). In alto il totale con il numero di movimenti e di voci; per i dipendenti anche Regolare ed Extra. Per ogni voce: importo, quota %, numero di movimenti, barretta proporzionale (il numero c'è sempre, non solo il colore); la riga «Senza fornitore / dipendente / categoria» è in corsivo e in fondo.
- **Telefono (320–390 px)**: una riga per voce con nome, importo, barretta, quota %, movimenti e la freccia «›»: toccandola si apre il dettaglio della voce (la riga non si espande più). In più la fila di chip **«Guarda un mese solo»** (Tutto il periodo, ago, set, ott…): scelto un mese, la lista mostra e ordina le voci per quel mese, così «Bel Fungo, ottobre: tot» è un tocco.
- **Computer**: griglia voce × mese con la prima colonna fissa, riga dei totali per mese e, per i dipendenti, colonne Regolare ed Extra; si scorre in orizzontale se i mesi sono tanti. Il nome della voce è un collegamento (con «›») al dettaglio; non c'è una matita nella tabella: Rinomina / Unisci / Elimina stanno nel dettaglio.

**Dettaglio di una voce** (`/statistiche/voci/dettaglio?v=FORNITORE|DIPENDENTE|CATEGORIA&id=<id>|senza&t=COSTI|RICAVO|TUTTI&da=&a=&sedi=`, `StatisticheVoceDettaglio.tsx`). Tutto sta nell'indirizzo: il tasto indietro e il ricaricamento funzionano. Si apre toccando una riga della lista (anche «Senza …») con lo stesso periodo, le stesse sedi e lo stesso tipo della lista; sul telefono, con un mese scelto nei chip «Guarda un mese solo», il dettaglio è quello del mese.
- Titolo = nome della voce (si aggiorna dopo una rinomina), freccia indietro verso la lista (con il suo periodo). Scheda di riepilogo: totale del periodo e numero di movimenti, uguali alla riga da cui si arriva. Sotto, «Mese per mese» (una barretta per mese; solo se il periodo ha più di un mese) e l'elenco dei movimenti raggruppati per giorno, con le stesse righe di Movimenti (telefono: riga compatta; computer: tabella con data, tipo, fornitore/descrizione, documento, importo, origine).
- Toccando un movimento si apre il suo dettaglio (`/movimenti/:id`); la freccia indietro e l'eliminazione riportano al dettaglio della voce (la pagina passa «da dove arrivi» nello stato di navigazione; senza, si torna ai Movimenti).
- **Modifica voce** (pulsante da 44 px nella scheda di riepilogo, assente per «Senza …»): apre le stesse azioni di `AzioniVoce`. Dopo una rinomina resta sulla pagina col titolo nuovo; dopo un'eliminazione o un'unione la voce non esiste più e si torna alla lista.
- Coerenza: l'elenco usa `GET /api/movimenti` con `da`, `a`, `sedi`, `fornitore` / `dipendente` / `categorie` oppure `senza`, e lo stesso `tipo` delle statistiche (fornitori: `COSTO_VARIABILE`; dipendenti: nessun tipo, con `retribuzione=true`; categorie: `RICAVO`, nessun tipo per «Tutti»; per «Costi» nessun tipo e si tolgono i ricavi dall'elenco, perché «COSTI» non è un tipo dei movimenti). La somma con segno degli importi (note di credito in negativo) è il totale della riga. Logica pura e test: `ui/src/util/dettaglioVoce.ts` / `.test.ts`.

## Correzioni dalla simulazione del cliente (novembre 2026)

Una prova d'uso da parte del titolare di una pizzeria (iPhone) ha portato a queste correzioni; i punti sono quelli dell'elenco della simulazione.

1. **Statistiche per dipendente = solo paghe.** Con «Dipendenti» (`raggruppa=DIPENDENTE`) si contano solo i movimenti con documento `RETRIBUZIONE_REGOLARE`/`RETRIBUZIONE_EXTRA`; il tipo non si manda (`tipoPerServizio("DIPENDENTE", …)` è `undefined`). L'affitto non compare più, nemmeno in «Senza dipendente» (= paghe senza dipendente). L'elenco del dettaglio di un dipendente chiede `GET /api/movimenti?dipendente=<id>&retribuzione=true` (per «Senza dipendente»: `senza=DIPENDENTE&retribuzione=true`), senza `tipo`; la somma dell'elenco resta uguale al totale della riga. Il parametro `retribuzione=true|false` è nuovo (valore non valido: 400) anche nel servizio finto.
2. **Unisci con conferma.** Scelta la voce di destinazione, «Unisci a «B»» non unisce subito: passa a un passo di conferma «Unire «A» in «B»? N movimenti passeranno a «B» e «A» sparirà. Non si può annullare.» con **Annulla** (torna alla scelta) e **Unisci**. Sotto il titolo, per le categorie, la riga «Puoi unire solo con voci dello stesso tipo: costi fissi.»; se la ricerca non trova nulla: «Nessuna voce con questo nome tra i costi fissi. Per unire serve una voce già esistente dello stesso tipo.» (per fornitori e dipendenti: «Nessun fornitore con questo nome. Per unire serve un fornitore già esistente.»). Il pulsante «Unisci a «…»» va a capo se il nome è lungo, non si taglia (320–375 px). Testi in `util/voci.ts` (`testoConfermaUnione`, `testoNessunaDestinazione`, `nomeTipoCategoria`).
3. **Interruttore «È una retribuzione» protetto** (finestra Rinomina). Sta sotto il testo «Cambia come vengono contate le paghe e le statistiche per dipendente. Il cambio vale solo dopo «Salva».»: lo stato cambia solo al salvataggio. Se la categoria è già una retribuzione e ha movimenti l'interruttore è **disabilitato** con la spiegazione «Non si può togliere: questa categoria ha già N movimenti.» (il servizio risponderebbe 409). Se lo si spegne (categoria senza movimenti) compare l'avviso «Se salvi, i nuovi movimenti di «…» non chiederanno più Regolare o Extra e il dipendente…». Logica: `interruttoreRetribuzione` in `util/voci.ts`.
4. **Dipendente di una paga.** Resta facoltativo; sotto il campo vuoto, solo per le retribuzioni, il suggerimento tenue «Indica chi: serve per le statistiche per dipendente.» (`nota` del Combobox).
5. **Dopo il salvataggio l'elenco segue il movimento.** Se la data del movimento salvato non cade nel periodo che si sta guardando (quello ricordato nel browser, uguale in Movimenti e Riepilogo), il periodo passa al **mese del movimento** e l'avviso dice «Movimento salvato. Ora vedi ottobre 2026.»; se il movimento è già nel periodo non cambia niente. Vale anche per «Salva e aggiungine un altro». Logica pura: `periodoDopoSalvataggio` in `util/filtriSalvati.ts`. Riepilogo ha lo stesso periodo ricordato e quindi lo stesso comportamento. (Cambiare la data dal dettaglio non sposta il periodo.)
6. **Combobox: «Crea …» non scavalca le voci.** Con il testo che è l'inizio di voci esistenti («Bel» con «Bel Fungo») «Crea fornitore «Bel»» sta **dopo** le voci se queste sono al massimo 6, **in cima** solo se sono di più (`VOCI_LISTA_CORTA` in `util/suggerimenti.ts`). Nessuna voce è evidenziata di partenza: «Crea» ha solo un bordo tratteggiato e si evidenzia come le altre solo con le frecce o il passaggio del mouse. Invio senza una voce scelta con le frecce non sceglie nulla.
7. **Importi che vanno a capo.** Causa comune: lo spazio fra «€» e la cifra era normale. `euro()` ed `euroConSegno()` (`util/formato.ts`) usano lo spazio non separabile (U+00A0), quindi «€ 58.866,00» non si spezza mai (il test è `util/formato.test.ts`).
8. **Titolo della scheda del browser.** Il dettaglio di una voce si intitola «<nome voce> · Contabilità» (`hooks/useTitoloPagina.ts`); prima il titolo era «Contabilità · Contabilità». I titoli delle altre viste stanno in `util/titoloPagina.ts`; il Guscio non tocca quelli che si intitolano da soli (`titoloDellaVista`).
9. **Importazione XML.** Su telefono e tablet (solo tocco: `(pointer: coarse) and (hover: none)`) il riquadro dice «Scegli i file XML o ZIP» invece di «Trascina qui…» (il trascinamento resta sul computer); il testo dice «lette su questo dispositivo». Il messaggio «Tipo di documento TD16 non ammesso: fattura non importata…» del servizio diventa «Questo tipo di documento non è una fattura di acquisto e non viene importato (codice TD16).» (`messaggioChiaro` in `util/anteprimaImportazione.ts`, che raggruppa gli scarti con la frase già tradotta).
10. **Tabella «per voce» e chip dei mesi.** Computer: la griglia si apre già scorsa in modo che il mese corrente (o l'ultimo con dati, `meseInEvidenza`) sia in vista, e un'ombra sul bordo destro dice che c'è altro da scorrere (screen reader: «Scorri a destra per gli altri mesi.»). Telefono: i chip «Guarda un mese solo» si aprono scorsi fino al mese corrente o all'ultimo con dati.
11. **Ricavo.** Le scelte sono «Con fattura» / «Senza fattura (extra)» (i valori interni restano `RICAVO_FATTURATO` / `RICAVO_EXTRA`) con la riga «Nel Riepilogo: «Fatturati» se c'è la fattura, «Extra» se no.».
12. **Voce fissa.** Il campo vuoto ha il segnaposto «Per esempio: Affitto, Luce, Commercialista» e la stessa frase nel testo della lista vuota. Con un nome nuovo l'interruttore «È una retribuzione» sta **fra il campo e la lista dei suggerimenti** (prop `sotto` del Combobox): la tendina si apre sotto e non lo copre.
