# Fuorigioco

Il programma si chiama **Fuorigioco** (come nel calcio: il nome sa di pallone, come la schermata della password, e non dice che dentro ci sono conti e fatture). È il nome che si legge: scheda del browser, app sul telefono, scorciatoie, «App installate», file esportati (`fuorigioco-…`). I nomi tecnici restano quelli di prima e non vanno cambiati, altrimenti gli aggiornamenti non ritrovano l'installazione e i dati: package `it.contabilita`, proprietà e chiavi `contabilita.*`, `CONTABILITA_DATA_DIR`, `contabilita.db`, servizio Windows `Contabilita`, cartelle `Contabilita`, repository.

Gestione di ricavi e costi di una pizzeria: movimenti (fatture, scontrini, retribuzioni, ricavi), voci ricorrenti,
riepilogo per periodo, export Excel/CSV, import delle fatture XML. Si usa sulla rete locale, anche dal telefono; si può mettere una password (Impostazioni),
e allora chi apre l'app vede prima la schermata della password. Non ci sono utenti né nomi da scrivere.

## Stack

Java 17 + Spring Boot (un solo jar che serve anche l'interfaccia), SQLite, React + Vite + TypeScript (PWA installabile).
Porta **8766**. Installer per Windows (MSI, servizio Windows) e macOS (PKG, servizio launchd).

## Come si costruisce

```bash
mvn -DskipTests package          # jar in target/contabilita-<versione>.jar (include l'interfaccia)
```

Gli installer (MSI e PKG) si costruiscono con gli script in `installer/` o dal workflow GitHub `Installer`:
istruzioni, prerequisiti e limiti in [`installer/README.md`](installer/README.md).

## Documentazione

- [`docs/piano.md`](docs/piano.md): cosa deve fare l'app e fasi di lavoro
- [`docs/stack.md`](docs/stack.md): decisioni tecniche e riuso
- [`docs/api.md`](docs/api.md), [`docs/interfaccia.md`](docs/interfaccia.md)

## Riservatezza

Il repository è pubblico: database, allegati, XML, CSV ed Excel sono esclusi da git. Mai numeri reali nel repository.
