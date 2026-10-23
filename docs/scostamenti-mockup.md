# Scostamenti tra l'app e il mockup approvato

Confronto del 2026-10-22: testi estratti dal mockup e dall'app (11 schermate) più confronto visivo affiancato a 1280 e 390 px. Sorgenti del mockup (versione finale, strati uniti): `scratchpad\mockup-finale\*.dc.html` della sessione `29e12721-…` (il canvas online è stato eliminato). Per vederlo: `python -m http.server 8099 --directory <cartella>` e aprire `http://127.0.0.1:8099/<File>.dc.html`.

Il mockup è il riferimento. Dove l'app deve fare di più di quanto il mockup disegna (frecce del periodo, creazione al volo, allegati) l'aggiunta resta, ma nello stile del mockup.

## Da allineare al mockup (senza decisioni aperte)

### Riepilogo
- **Desktop:** le tre schede (Ricavi, Costi variabili, Costi fissi) si allungano fino al fondo della pagina e il «Totale» è ancorato al bordo inferiore della scheda. Sottotesto «· totali inseriti» accanto a Scontrini.
- **Telefono:** schede con il totale nell'intestazione (titolo a sinistra, importo a destra) e niente riga «Totale …» in fondo; scheda del risultato con «Risultato della settimana» grande e sotto, piccoli, «Ricavi 5.500,00 · Costi 3.830,50» e la barra; etichetta del periodo centrata fra le due frecce; barra in basso con la voce attiva solo colorata, senza sfondo a pillola.

### Movimenti
- **Desktop:** una sola riga per periodo, tipo e ricerca; barra dei totali scura (`#58443C`, testo bianco) attaccata al fondo della tabella: «N movimenti mostrati · <mese anno>» a sinistra e «Ricavi € … Costi € … Saldo € …» a destra; date brevi `gg/mm` (con l'anno quando il periodo è anno o libero); intestazione della colonna Origine vuota.
- **Titoli e sottotitoli di riga** quando manca fornitore o descrizione, come nel mockup: ricavo fatturato «Incassi fatturati», ricavo extra «Incassi extra» con sottotitolo «Non fatturati», scontrino «Scontrini» con sottotitolo «Totale inserito a mano».
- **Telefono:** il selettore del tipo (Tutti, Ricavi, Variabili, Fissi) a tutta larghezza è il primo controllo, seguito dalla ricerca.

### Nuovo movimento
- **Desktop (variabile):** Note a riga singola e Allegato (largo 280 px, tratteggiato, con graffetta e «Foto o PDF») sulla stessa riga; senza «(facoltativo)» su N. fattura e Categoria; scheda del form alta fino in fondo con «Annulla», «Salva e aggiungine un altro» e «Salva» (largo 180 px) in basso a destra; a destra due schede separate: «Dove finisce» (Voce, Periodo, Tipo) e «Costi variabili della settimana» (Prima, **«Con questo movimento»**).
- **Desktop (retribuzione):** «Regolare» / «Extra» (senza «(in busta)» / «(fuori busta)»); Dipendente, Data e Importo su una riga; nessun testo sotto Dipendente; nessun campo Descrizione; riga «Ripeti ogni mese» compatta (interruttore a sinistra, «il giorno [N]» a destra, senza sottotesto né «Acceso/Spento»); a destra «Dove finisce» con Voce, Categoria, Tipo, Dipendente, Ricorrenza («Ogni mese, il 10») e una seconda scheda «<Dipendente> · <mese>» con Regolare, Extra e «Costo del mese».
- **Telefono:** senza scheda bianca (campi sullo sfondo); Data e Importo affiancati; N. fattura e «Foto (facoltativa)» con «Scatta» affiancati; Categoria senza «(facoltativo)»; senza Note; barra fissa in basso con «Annulla» e «Salva» al posto della barra di navigazione.

### Dettaglio
- **Desktop:** titolo con etichetta «Fisso · ricorrente»; Voce fissa e Tipo di retribuzione sulla stessa riga; Dipendente, Data, Importo su una riga; Note a riga singola; riquadro crema della ripetizione con «Si ripete ogni mese, il giorno [N]», «Ferma la ripetizione» come link rosso sottolineato, «Se cambi qualcosa, vale:» (il mockup diceva «o elimini»: per eliminare ci sono due pulsanti espliciti) e due radio verticali; «Annulla» e «Salva modifiche» (verde largo) in basso a destra nella scheda; a destra «Prossima volta» (righe Data e Importo) e «Registrato» (righe Creato, Origine, Ultima modifica: richiedono i campi `creatoIl` e `modificatoIl` nell'API, già presenti nel database). La scheda «Allegato» resta (funzione successiva al mockup).
- **Telefono:** etichetta del tipo («Variabile») a destra del titolo; Data e Importo affiancati; ordine Fornitore, Categoria, poi N. fattura e Note affiancati; scheda «Fattura importata da XML · Il gg/mm · il file resta allegato» (solo se l'origine è XML); pulsante «Elimina movimento» a tutta larghezza (rosso con bordo) in fondo; barra fissa «Annulla» + «Salva modifiche» al posto della barra di navigazione; nessun controllo «Documento» in testa.

### Esporta
- Le due schede si allungano fino in fondo; «Scarica il file» in basso con icona di download; «Cosa includere» come semplici caselle con etichetta; formato come due schede affiancate con titolo e sottotitolo (`.xlsx · con riepilogo`, `.csv · solo movimenti`); riquadro «Il file» con nome in piccolo e due etichette a pillola («Movimenti · uno per riga», «Riepilogo · totali del periodo»); anteprima in carattere monospazio, intestazioni maiuscole, importi senza colori, titolo piccolo maiuscolo «ANTEPRIMA DEL FOGLIO «MOVIMENTI»».

### Impostazioni
- Righe di «Dati e copie» compatte, titoli in peso normale, nell'ordine: Ultima copia di sicurezza («Oggi alle 03:00 · automatica» + «Fai ora»), Dove sono i dati («Solo su questo computer, mai online»), Ripristina da una copia («Sostituisce i dati attuali» + «Scegli file»). «Dal telefono» come nel mockup, con il QR vero.

### Importa
- Nel banner, «Dove trovo i file?» (con icona «i» in un cerchio) e «Scegli i file» affiancati sulla stessa riga; banner basso (circa 88 px).

## Scostamenti motivati (restano, da confermare)
- Frecce e etichetta del periodo in Movimenti ed Esporta (il mockup non le ha: senza non si cambia periodo).
- Campo «Descrizione» per ricavi e voci fisse diverse dalla retribuzione (dà il titolo alla riga).
- Scelta «A mano / Importa XML o ZIP» in Nuovo movimento sul telefono.
- Filtro di periodo e totali in Movimenti sul telefono, e «Periodo» libero nel Riepilogo del telefono.
- «Scegli copia» al posto di «Scegli file» (si sceglie da un elenco), righe «Dove vanno le copie» e «Versione del programma».
- «Apri cartella» non c'è: un sito non può aprire cartelle del computer.
- «Fatture · N documenti» in Riepilogo: l'API non restituisce il numero di documenti.
- Nell'importazione: «(anche firmati, .xml.p7m)» nel testo del banner; il titolo dice «da N file» quando i file sono più di uno.
- Costi fissi del Riepilogo guidati dai dati (le righe Affitto, Utenze, Altre voci compaiono solo se ci sono movimenti).

## Scelte successive al confronto (richieste dell'utente)
- **Ripetizione nel Dettaglio:** il riquadro crema con link rosso e due radio è sostituito da «Ripetizione mensile» con giorno, interruttore «Applica ai prossimi mesi» e pulsante «Ferma la ripetizione» spiegato.
- **Esporta:** tolta la scheda «Il file» (nome del file e pillole «Movimenti · uno per riga» / «Riepilogo · totali del periodo»).
- **Filtro «Oggi»** nel selettore del periodo (prima segmento, poi Settimana, Mese, Anno, Periodo): il mockup non lo ha; richiesto per tornare alla data corrente.
