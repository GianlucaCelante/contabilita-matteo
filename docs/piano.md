# Contabilità Matteo — piano di lavoro

Gestione di ricavi e costi di una pizzeria, come da schizzo di Matteo.

## Cosa deve mostrare

- **Costi variabili**: spese con documento *fattura* o *scontrino*, con totale.
- **Costi fissi**: voci ricorrenti (affitto, utenze, ...) e **retribuzione** divisa in *regolare* ed *extra* (fuori busta), con totale.
- **Ricavi**: *fatturati* ed *extra* (non fatturati), con totale.
- **Riepilogo**: ricavi − costi per periodo (settimana, mese, periodo libero).
- **Pizze settimanali** (statistica): campo opzionale, da definire con Matteo. Se compilato, il riepilogo mostra ricavi e costi per pizza.

## Modello dati

Un unico registro di **movimenti**: data, importo, direzione (costo o ricavo), categoria, tipo documento (fattura, scontrino, regolare, extra), fornitore, note, allegato opzionale. I totali e il riepilogo si calcolano dai movimenti, non si inseriscono. Categorie di costo: variabile o fisso, estendibili. Voci fisse ricorrenti precompilate ogni mese.

La data sul movimento permette di inserire sia periodicamente (uso previsto) sia giornalmente: il periodo si sceglie solo in visualizzazione.

## Inserimento

- **Fatture**: a mano **oppure** import del file XML FatturaPA (fornitore, data, imponibile, IVA, totale). Entrambe le vie convivono; Matteo sceglie.
- **Scontrini**: a mano, con totali periodici. Nessuna lettura automatica (niente OCR).
- Ricavi e retribuzioni: a mano.

## Stack e stile

Come `etichetta-da-matteo`: Java 17 + Spring Boot, SQLite, interfaccia React 19 + Vite + TypeScript come PWA, installazione con MSI come servizio Windows. Stessa palette e componenti (crema, sabbia, verde). Accesso dal telefono sulla rete locale.

## Dati e riservatezza

Il repository è pubblico: database, allegati, XML, CSV e Excel sono esclusi da git (`.gitignore`). Nel repository solo codice e documentazione, mai numeri reali.

## Fasi

1. Scheletro del progetto, inserimento a mano, elenco con filtri.
2. Riepilogo per periodo, voci ricorrenti, pizze settimanali (opzionali).
3. Export Excel e CSV.
4. Import delle fatture XML.
5. Installazione (MSI) e accesso dal telefono.

## Da chiarire con Matteo

- Se e come vuole tracciare le pizze settimanali.
- Se importerà gli XML o inserirà le fatture a mano (intanto entrambe).
