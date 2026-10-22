# Stack e riuso da `etichetta-da-matteo`

Stesso stack del progetto delle etichette, copiato e adattato a pezzi (mai interi: il progetto sorgente è accoppiato al dominio delle etichette). Fonte del riuso: `C:\Users\volgi\IdeaProjects\etichetta-da-matteo` (da qui `E:`). Inventario verificato il 2026-10-22.

## Decisioni

| Tema | Scelta |
|---|---|
| Servizio | Java 17 + Spring Boot 3.5.16, un solo jar che serve anche l'interfaccia |
| Dati | SQLite in modalità WAL, JPA/Hibernate (`ddl-auto: none`), migrazioni Liquibase YAML |
| Importi | interi in centesimi (`long`), mai decimali; date `LocalDate` |
| Interfaccia | React 19 + Vite 7 + TypeScript + Tailwind 4 + react-query, PWA solo installabile (nessun offline) |
| Porta | **8766** (la 8765 è delle etichette: le due app possono girare sullo stesso PC) |
| Nomi | package `it.contabilita`, prefisso `contabilita.*`, variabile `CONTABILITA_DATA_DIR`, servizio Windows `Contabilita`, dati in `C:\ProgramData\Contabilita` |
| Accesso | nessun login (come le etichette): rete locale. PIN da valutare con Matteo, dato che i dati sono sensibili |
| Rete | QR con indirizzo IP e porta. **Niente mDNS** (`etichette.local` è stato tolto dal progetto sorgente il 2026-09-10) |
| Export | Excel (fastexcel) e CSV punto e virgola UTF-8, in streaming. **Niente PDF** (non richiesto: non portare OpenPDF) |
| Test | JUnit + MockMvc + `@SpringBootTest` (profilo `test`, cartella dati temporanea); UI: eslint + `tsc`, vitest da introdurre |

## Cosa si riusa (e da dove)

| Funzione | Sorgente in `E:` | Come |
|---|---|---|
| Build Maven con UI incorporata | `pom.xml` (profilo `ui`, `frontend-maven-plugin`, Node 22.12.0, `-Dskip.ui=true`) | Copiare e rinominare; togliere jna, zxing se non serve, openpdf. Tenere `hibernate-community-dialects` alla stessa patch di hibernate-core |
| Configurazione | `src/main/resources/application.yml` | Porta 8766, prefisso `contabilita.*`; tenere gzip (SSE escluso), multipart, log su file con rotazione |
| Avvio e sorveglianza | `EtichetteApplication`, `SorvegliaProcessoPadre` | Rinominare la proprietà `-Dcontabilita.sorveglia-padre=true` |
| SPA, errori, CORS | `api/ConfigurazioneRisorseStatiche`, `ConfigurazioneMime`, `ConfigurazioneCors`, `GestoreErrori`, `ErroreApi` | Quasi invariati |
| SQLite robusta | parametri JDBC in `application.yml` (WAL, `date_class=TEXT`, `busy_timeout`, pool a 1) | Copiare tali e quali |
| Migrazioni | `db/changelog/db.changelog-master.yaml` | Solo la struttura (un file per versione con `include`); lo schema è nuovo |
| Impostazioni chiave/valore | `dati/Impostazione`, `ImpostazioneRepository`, `api/ImpostazioniController` | Riusabili subito |
| Backup | `programma/BackupService` (`VACUUM INTO`, cartella datata, automatico alle 03:00), `EsploratoreCartelle`, `ProgrammaController`, `update.ps1` (backup pre-aggiornamento) | Togliere la parte foto o adattarla agli allegati. Manca un vero «ripristino» dall'app: da scrivere |
| Rete e QR | `rete/IndirizziRete` (+ test), `api/ReteController` | Invariati |
| Telefoni con nome | `dispositivi/*`, `RichiediNomeDispositivo.tsx` | Opzionale: «inserito da» |
| Installer | `installer/` (Build-Setup.ps1, Etichette.xml, install/update/uninstall, wix) | Rinominare tutto: servizio, cartella ProgramData, regola firewall, UpgradeCode WiX (nuovo GUID), icona |
| Guscio e design system | `ui/src/componenti/Guscio.tsx` + hook barre/tastiera; `index.css` (solo le prime ~220 righe: token, font, densità telefono, `.btn`, `.chip`, `.campo`, `.finestra`) | Estrarre, non copiare il monolite da 160 KB |
| Componenti generici | `Finestra`, `ConfermaInline`, `Interruttore`, `Avviso`, `ErroreVista`, `Sezione`, `Icone` (sfoltire) | Invariati |
| Client API | `ui/src/api/client.ts`, `hooks.ts` (pattern), `chiaviQuery` | Tenere il pattern, riscrivere le funzioni di dominio |
| Font | `ui/public/font/` (Bricolage Grotesque, Atkinson Hyperlegible, OFL) | Copiare: niente Google Fonts (il PC può non avere internet) |
| Elenco con filtri, periodo, totali | `viste/Storico.tsx`, `RicercaStorico.java`, `StoricoController` | Modello per Movimenti |
| Export | `storico/EsportazioneStoricoService` (fastexcel, CSV), `FormatoEsportazione`, `EsportaElenco.tsx` | Adattare; scartare il PDF |
| Foto/allegati | `FotoService`, `OrientamentoExif`, `FotoController`, `convertiFoto.ts`, `MiniaturaFoto.tsx` | Per fatture e scontrini: collegare all'entità movimento |
| Creazione al volo | `CampoNomeConSimili.tsx`, `TendinaSimili.tsx`, `NomiSimili.java`, `FornitoriService`, `SelettoreFornitore.tsx` | Modello per fornitore, categoria, dipendente |

## Da non portare

`stampante/*`, `resa/*` (Java 2D), font Liberation, jna, `componenti/etichette/`, `LenteEtichetta`, `RiquadroAnteprima`, mock server da 183 KB (rifarne uno piccolo se serve), `docs/api.md`, `.playwright-mcp/`, `data/`, `installer/.winsw-cache/`. Nel README del progetto sorgente la frase su mDNS è obsoleta: non ricopiarla.

## Da scrivere da zero

Schema dati e API dei movimenti; ricorrenze; creazione al volo di categorie, fornitori e dipendenti; import fatture XML (FatturaPA) e ZIP; riepilogo per periodo; ripristino da copia; test UI.

## Rischi

- Accoppiamento al dominio: copiare a pezzi e rinominare in modo coerente (variabile d'ambiente, nome servizio, cartella dati, regola firewall, id WinSW, UpgradeCode).
- Versioni fissate con motivo (Spring Boot 3.5.16 con hibernate-community-dialects 6.6.53.Final, Node 22.12.0, WinSW 2.12.0 con SHA-256): non aggiornare alla cieca.
- Il pom sorgente dichiara di seguire `restaurant-management-platform/agent-java`: non verificato.
- Dati sensibili (retribuzioni, fuori busta): accesso solo in rete locale, dati fuori da git, valutare un PIN.
