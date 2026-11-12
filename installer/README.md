# Installer di Fuorigioco

Due installer per la stessa app (servizio Java con interfaccia web su `http://localhost:8766/`):

| | Windows | macOS |
|---|---|---|
| Formato | `Contabilita-<versione dell'MSI>.msi` (es. `Contabilita-0.1.3156.msi`, vedi «Versione dell'MSI») | `Contabilita-<versione>-<arch>.pkg` |
| Si costruisce con | `installer\Build-Setup.ps1` (su Windows) | `installer/mac/Build-Setup.sh` (**solo su un Mac**) |
| App | `C:\Program Files\Contabilita` | `/Applications/Contabilita.app` |
| Servizio | servizio Windows `Contabilita` (nome mostrato «Fuorigioco»), WinSW, avvio automatico ritardato, account LocalSystem | LaunchDaemon `it.contabilita.servizio` (root, `RunAtLoad` + `KeepAlive`) |
| Dati | `C:\ProgramData\Contabilita` | `/Library/Application Support/Contabilita` |
| Log | `C:\ProgramData\Contabilita\log` | dati: `.../Contabilita/log`; avvio launchd: `/Library/Logs/Contabilita/launchd.log` |
| Variabile dati | `CONTABILITA_DATA_DIR` (nel file WinSW) | `CONTABILITA_DATA_DIR` (nel plist), più `TZ=Europe/Rome` |
| Firewall | regola TCP «Contabilita 8766», tutti i profili | nessuna regola esplicita (vedi sotto) |
| Apertura | scorciatoie «Fuorigioco» (desktop, avvio automatico, menu Start): Edge/Chrome in modalità app | `Contabilita.app`, nome mostrato «Fuorigioco» (apre Chrome/Edge in modalità app o il browser predefinito) + LaunchAgent che la apre a ogni accesso |
| Aggiornamento | `update.ps1 <msi>` (backup del DB, ferma, `msiexec`) oppure MSI sopra | `.pkg` sopra: `preinstall` fa il backup e ferma il servizio |
| Disinstallazione | `uninstall_service.ps1` (anche dall'MSI) | `sudo .../Resources/uninstall.sh` |

**Nome mostrato e nomi tecnici.** Il programma si chiama «Fuorigioco»: è il nome del prodotto in «App installate» (`Product Name` in `wix\main.install.wxs`), del servizio in `services.msc` (`<name>` e `<description>` in `Contabilita.xml`), delle scorciatoie (`Fuorigioco.lnk`; quelle vecchie `Contabilita.lnk` si tolgono all'aggiornamento), della descrizione della regola firewall e dell'app Mac. Il nome dell'interfaccia sta in `ui/src/util/nomeProgramma.ts`, `ui/index.html` (solo `apple-mobile-web-app-title`: il `<title>` è «Area soci · Calcio» finché non si è entrati) e `ui/public/manifest.webmanifest`; quello dei file esportati in `NomeProgramma.java`; editore e copyright in `Build-Setup.ps1` e `mac/app/Info.plist`.

- **Servizio Windows, installazione nuova:** WinSW registra il servizio con il nome e la descrizione di `Contabilita.xml`.
- **Servizio Windows, aggiornamento:** il servizio è già registrato e WinSW non lo registra di nuovo, quindi terrebbe il nome di prima («Contabilità Matteo»). `install_service.ps1` li riscrive ogni volta con `sc.exe config … DisplayName=` e `sc.exe description`, leggendoli da `Contabilita.xml` (`Get-ServiceDisplayInfo` in `service_common.ps1`). Se non ci riesce avvisa e prosegue: il servizio parte lo stesso, con l'etichetta vecchia.
- **Mac:** il pacchetto resta `Contabilita.app` (perché non si rinomina: «macOS: dettagli», «Perché l'app non si chiama Fuorigioco.app»). Il Finder mostra «Fuorigioco» grazie a `LSHasLocalizedDisplayName` e a `Resources/it.lproj/InfoPlist.strings` (più `en.lproj`), che `Build-Setup.sh` copia da `mac/app/`. Perché funzioni, `CFBundleDisplayName` in `Info.plist` deve restare uguale al nome del pacchetto sul disco (`Contabilita`): non «correggerlo». Nel Terminale e nei percorsi si vede comunque `Contabilita.app`. **Non provato su un Mac.**
 Tutto il resto resta `Contabilita` e **non va rinominato**: id del servizio, `--name` di jpackage (cartella `C:\Program Files\Contabilita`, nome dell'MSI), cartella dati, regola firewall, `Contabilita.app`, id launchd, UpgradeCode. Cambiarli spezzerebbe gli aggiornamenti e l'accesso ai dati.

Il codice è un adattamento a pezzi degli installer del progetto gemello (vedi `docs/stack.md`): servizio,
cartella dati, regola firewall e **UpgradeCode WiX** sono tutti rinominati, così le due app possono
convivere sullo stesso PC (porte diverse: 8766 qui, 8765 là). Regola d'oro: l'installer tocca solo
roba propria (cartelle, servizio, una regola firewall, scorciatoie).

## Prerequisiti

- **Windows**: JDK 17 con `jpackage`/`jlink` (`JAVA_HOME`), Maven, WiX Toolset 3.x sul `PATH`
  (`candle.exe`/`light.exe`; es. `C:\Program Files (x86)\WiX Toolset v3.14\bin`), Internet la prima
  volta (WinSW 2.12.0 scaricato da GitHub e verificato con SHA-256, in `installer\.winsw-cache`,
  ignorata da git). Per firmare: `signtool.exe` e `SIGNING_CERT_PATH`/`SIGNING_CERT_PASSWORD`.
- **macOS**: JDK 17 con `jmods` (es. Temurin 17), Maven 3.9, strumenti da riga di comando di Xcode
  (`pkgbuild`, `productbuild`, `codesign`).
- Il jar `target/contabilita-<versione>.jar` è prodotto da Maven (`pom.xml`, versione `0.1.0`); gli script lo
  costruiscono da soli, salvo `-SkipMaven` / `--skip-maven`.

## Come si costruisce

```powershell
# Windows, dalla cartella installer
.\Build-Setup.ps1                       # versione del programma letta da ..\pom.xml
.\Build-Setup.ps1 -Version 0.1.0 -SkipMaven [-JarPath C:\...\contabilita-0.1.0.jar]
.\Build-Setup.ps1 -CodeSign             # firma (richiede il certificato)
.\Build-Setup.ps1 -MsiVersion 0.1.4000  # forza il numero scritto nell'MSI (di norma non serve)
# Output: target\installer\Contabilita-<versione dell'MSI>.msi, per esempio Contabilita-0.1.3156.msi
```

### Versione dell'MSI

Le versioni sono due e non vanno confuse.

- **Versione del programma**: quella del `pom.xml` (oggi `0.1.0`), o `-Version`. È il nome del jar, la risposta di
  `GET /api/versione` e quello che si legge in Impostazioni («Programma: Fuorigioco · versione 0.1.0»). Cambia solo quando
  si cambia il pom.
- **Versione dell'MSI**: `<primo>.<secondo>.<numero di build>`, per esempio `0.1.3156`. I primi due numeri sono quelli del
  programma; il terzo del pom non si usa (Windows Installer confronta tre numeri soli, al massimo `255.255.65535`) e al suo
  posto va un numero che cresce col tempo: **giorni passati dal 1° gennaio 2026 (UTC) per dieci, più il decimo di giorno,
  più uno**. Il 12 novembre 2026 è il giorno 315: a mezzogiorno UTC esce `0.1.3156`. La calcola `Get-MsiVersion` in
  `installer\build_common.ps1` (prove: `installer\tests\build_common.Tests.ps1`); è nel nome del file, in «App installate»
  e nelle proprietà dell'MSI.

Perché così: fino a novembre 2026 ogni MSI era `0.1.0` e due build diverse non si distinguevano dal numero. Adesso un MSI
costruito dopo ha sempre un numero uguale o maggiore, quindi l'aggiornamento «installa sopra» non è mai un downgrade (che
`wix\main.install.wxs` rifiuta), e chi ha già installato un MSI `0.1.0` si aggiorna con qualunque MSI nuovo.

- Due build a meno di 2 ore e 24 minuti l'una dall'altra possono avere lo stesso numero: si sostituiscono lo stesso
  (la riga `Upgrade` ha il massimo compreso), solo non si distinguono.
- L'ora è UTC, uguale sul PC e in CI. In CI il passo della firma ricostruisce l'MSI con `-MsiVersion` uguale a quello appena
  fatto, così l'artefatto contiene un solo file.
- Cambiando il primo o il secondo numero nel pom (`0.2.0`) l'MSI nuovo è comunque maggiore di tutti quelli `0.1.x`.
- **Non spostare l'epoca** (`$script:MsiBuildEpoch`) e non passare un `-MsiVersion` più basso di quello installato: l'MSI
  verrebbe rifiutato come più vecchio. Un `-MsiVersion` oltre `255.255.65535` o che non sia di tre numeri ferma la build
  subito (`Assert-MsiVersion`). Il numero basta fino al 10 dicembre 2043.
- `update.ps1` e gli script del servizio **non confrontano versioni**: passano il file a `msiexec` e guardano solo il codice
  d'uscita e lo stato del servizio. Il PKG del Mac resta con la versione del pom (lì l'aggiornamento non dipende dal numero).
- **Non provato:** una costruzione vera dell'MSI con il numero nuovo (jpackage + WiX) e l'aggiornamento da `0.1.0` in
  Windows Sandbox. Provato: la funzione (Pester, su PowerShell 5.1 e 7) e la sintassi degli script.

```bash
# macOS, dalla radice del repository
installer/mac/Build-Setup.sh [--version 0.1.0] [--skip-maven]
# Output: target/installer-mac/Contabilita-<versione>-<arch>.pkg  (arm64 su Apple Silicon, x86_64 su Intel)
```

In CI: `.github/workflows/installer.yml` costruisce entrambi su tag `v*` o a mano (Actions > Installer >
Run workflow) e carica gli artefatti `Contabilita-msi` e `Contabilita-pkg`. Non servono segreti per la
build non firmata.

### Icona

Il logo è quello della barra laterale dell'app (quadrato verde `#5E7B18` con l'euro bianco). Sorgente vettoriale:
`installer/icona-sorgente.svg` (copia di `ui/public/icona.svg`). Da lì sono generati:

- Windows: `installer/contabilita.ico`, sette immagini PNG incorporate (16, 24, 32, 48, 64, 128, 256 px). Se manca, la
  build avvisa e usa l'icona generica; le scorciatoie restano senza icona propria.
- macOS: `installer/mac/contabilita-1024.png` (1024x1024 RGBA, margine di circa il 10% e ombra leggera). Se manca, la
  build avvisa e l'app ha l'icona generica.

Lo script che le ha generate (Python con Pillow, supersampling e riduzione) non è nel repository: per rigenerarle basta
ridisegnare lo stesso logo alle dimensioni indicate. Non provate in un MSI o in un pacchetto reale, e l'icona macOS non è
stata provata su un Mac (`sips` e `iconutil` esistono solo lì).

### Moduli jlink

L'elenco è quello del progetto gemello (`java.base`, `java.logging`, `java.sql`, `java.naming`, `java.xml`,
`java.management`, `java.instrument`, `java.desktop` [serve a `java.beans`, non alla grafica],
`java.security.jgss`, `java.net.http`, `jdk.unsupported`, `jdk.crypto.ec`, `jdk.charsets`, `jdk.zipfs`).
**Da rivedere quando il jar esiste**: `jdeps --print-module-deps --ignore-missing-deps --multi-release 17 target/contabilita-0.1.0.jar`
(il jar Spring Boot va prima estratto). Lo stesso elenco è duplicato in `Build-Setup.ps1` e `mac/Build-Setup.sh`.

## Come si prova senza rovinare il PC

- Sintassi (non esegue nulla):
  ```powershell
  Get-ChildItem installer\*.ps1 | % { $e=$null; [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$null,[ref]$e)|Out-Null; $e }
  [xml](Get-Content installer\Contabilita.xml -Raw) | Out-Null; [xml](Get-Content installer\wix\main.install.wxs -Raw) | Out-Null
  ```
  ```bash
  for f in installer/mac/Build-Setup.sh installer/mac/uninstall.sh installer/mac/scripts/* installer/mac/app/Contabilita; do bash -n "$f"; done
  plutil -lint installer/mac/launchd/*.plist installer/mac/app/Info.plist   # su un Mac
  ```
- MSI: estrazione senza installare (`msiexec /a Contabilita-0.1.0.msi /qn TARGETDIR=C:\cartella\estratta`) e
  `dark.exe` per controllare le custom action `ContabilitaInstallService` / `ContabilitaUninstallService`.
  L'installazione vera va provata in **Windows Sandbox**: `Get-Service Contabilita` Running, regola «Contabilita 8766»,
  scorciatoie, `C:\ProgramData\Contabilita`, `http://localhost:8766/`; la disinstallazione toglie il servizio e lascia i dati.
- PKG: su un Mac (meglio una macchina virtuale o un Mac di prova) `sudo installer -pkg ... -target /`, poi
  `sudo launchctl print system/it.contabilita.servizio` e `curl http://localhost:8766/`.

## Windows: dettagli

`Build-Setup.ps1` mette in `target\stage` il jar come `contabilita.jar`, WinSW come `Contabilita.exe`,
`Contabilita.xml` e gli script, e fa passare `wix\main.install.wxs` a jpackage (`--resource-dir`) al posto del suo
`main.wxs`. L'MSI esegue `install_service.ps1 -Silent` (cartella dati con permessi, regola firewall, servizio, scorciatoie)
e, solo alla disinstallazione vera, `uninstall_service.ps1`.

Scelte rispetto al progetto gemello:

- **Account del servizio: LocalSystem, invariato.** Serve a scrivere in ProgramData senza complicazioni di permessi e a
  partire senza utente connesso. Il motivo originale (USB della stampante) non c'è più, ma non c'è motivo di cambiare
  e restringere i privilegi richiederebbe ACL aggiuntive; si può ridiscutere in seguito.
- Tolti: `-Djava.awt.headless=true`, USB/stampante, regola UDP 5353 e pulizia della vecchia regola mDNS (questa app non l'ha mai avuta).
- `-Dcontabilita.sorveglia-padre=true` resta: WinSW è il processo padre.
- Il `ServiceControl` WiX ferma il servizio prima di sostituire i file; il componente ha un GUID nuovo.
- Il lanciatore nativo di jpackage (`Contabilita.exe` in radice) non si usa: l'app si apre dalle scorciatoie.

## macOS: dettagli

Struttura (`installer/mac/`): `Build-Setup.sh`, `app/` (lanciatore e `Info.plist`), `launchd/` (i due plist),
`scripts/preinstall` e `scripts/postinstall`, `uninstall.sh`. Rispetto al progetto gemello mancano libusb, JNA e
l'icona; il resto (pacchetto **non ricollocabile**, `bootout` atteso prima del `bootstrap`, proprietà root su app e plist)
è invariato.

- `preinstall`: ferma il servizio, **copia `*.db`, `*.db-wal`, `*.db-shm` in `backup/pre-aggiornamento-<data-ora>`**, toglie la vecchia app.
- `postinstall`: crea dati e log, sistemi permessi, carica il LaunchDaemon (si ripete fino a 5 volte se il vecchio servizio non è ancora uscito)
  e apre la finestra per l'utente collegato. È idempotente.
- `-Dcontabilita.sorveglia-padre=true` **non** è usato su macOS: il padre è `launchd` e non muore; è launchd stesso a fermare la JVM.
- **Firewall**: nessuna regola esplicita. Il firewall di macOS è spento di serie; se è acceso, `postinstall` registra
  solo la JRE dell'app come consentita (se non ci riesce, il Mac chiede «Vuoi consentire le connessioni in ingresso?» al primo
  avvio: rispondere Consenti). Per l'accesso dal telefono: stessa rete Wi-Fi, indirizzo IP del Mac e porta 8766
  (`http://<IP>:8766/`; l'app mostra il QR), e il Mac non deve essere in stop.
- **Firma e notarizzazione**: disattive di default. Senza certificati Apple (Developer ID, a pagamento) il pacchetto non è firmato e
  Gatekeeper lo blocca: clic destro > Apri, oppure Impostazioni di sistema > Privacy e sicurezza > «Apri comunque», oppure
  `sudo installer -pkg <file>.pkg -target /`. Per firmare: `APPLE_SIGN_IDENTITY`, `APPLE_INSTALLER_IDENTITY`, e per notarizzare
  `APPLE_NOTARY_PROFILE` oppure `APPLE_ID` + `APPLE_TEAM_ID` + `APPLE_APP_PASSWORD`. In CI gli stessi nomi sono secrets
  (più `APPLE_CERT_P12_BASE64` e `APPLE_CERT_P12_PASSWORD`).
- `uninstall.sh`: ferma e rimuove servizio, LaunchAgent e app; **conserva i dati** salvo `--remove-data` (cancella anche i log).

### Perché l'app non si chiama Fuorigioco.app (limite noto)

Sul disco il pacchetto è `/Applications/Contabilita.app`; il Finder, il Launchpad e Spotlight mostrano già «Fuorigioco»
(`InfoPlist.strings`). Il nome vecchio si vede solo nel Terminale, nei percorsi e in «Ottieni informazioni». Rinominare la
cartella è stato valutato a novembre 2026 e **non è stato fatto**: tocca molti punti insieme e qui non c'è un Mac su cui
provarlo; un errore lascerebbe un Mac senza servizio o con due app. Che cosa servirebbe, tutto nello stesso rilascio:

1. `Build-Setup.sh`: `APP="$STAGE/Applications/Fuorigioco.app"`; decidere se rinominare anche l'eseguibile
   (`Contents/MacOS/Contabilita`, `CFBundleExecutable`) o lasciarlo.
2. `app/Info.plist`: `CFBundleDisplayName` deve essere uguale al nome della cartella sul disco, altrimenti il Finder ignora
   il nome localizzato; con il nome vero uguale a quello mostrato `LSHasLocalizedDisplayName` e i `.lproj` non servono più.
   `CFBundleIdentifier` (`it.contabilita.app`) **non** cambia.
3. `launchd/it.contabilita.servizio.plist` (percorsi di `java` e del jar) e `launchd/it.contabilita.avvio.plist` (percorso
   dell'app): percorsi nuovi, **stessi id**.
4. `scripts/preinstall`: migrazione. Fermare il servizio, chiudere la JVM cercandola con **tutti e due** i percorsi
   (`pkill -f` sul jar vecchio e su quello nuovo), togliere **sia** `/Applications/Contabilita.app` **sia**
   `/Applications/Fuorigioco.app`, togliere il plist del LaunchAgent già caricato per l'utente collegato (punta all'app vecchia).
5. `scripts/postinstall`: `APP=`, i `chmod`, la registrazione della JRE nel firewall (il percorso cambia: la regola vecchia
   resta orfana e va tolta con `socketfilterfw --remove`), l'apertura della finestra.
6. `uninstall.sh`: togliere tutti e due i nomi e cercare la JVM con tutti e due i percorsi. Attenzione: lo script sta
   **dentro** l'app, quindi chi ha annotato `sudo /Applications/Contabilita.app/Contents/Resources/uninstall.sh` non lo trova più.
7. Quello che lo script non può sistemare: l'icona tenuta nel Dock punta al percorso vecchio e diventa un punto di domanda;
   un eventuale «Apri comunque» di Gatekeeper e i permessi concessi all'app vecchia vanno ridati.
8. Prova su un Mac vero, nei due casi: installazione nuova e aggiornamento sopra `Contabilita.app` con il servizio acceso
   (`launchctl print system/it.contabilita.servizio`, `curl http://localhost:8766/`, una sola app in `/Applications`, dati intatti).

Finché non c'è un Mac di prova il guadagno (il nome giusto anche nel Terminale) non vale il rischio.

## Aggiornare e disinstallare

- Windows: `.\update.ps1 "C:\percorso\Contabilita-0.2.0.msi"` (si autoeleva, fa il backup del database in
  `backup\pre-aggiornamento-<data>`, ferma servizio e finestre, lancia `msiexec`, e se fallisce rimette in piedi il servizio).
  Dopo `msiexec` controlla che il servizio giri davvero: con la stessa versione già installata Windows Installer entra in «modalità manutenzione», esce con 0 e non riavvia nulla, quindi lo script rimette il servizio su avvio automatico (durante l'aggiornamento era «Disabilitato») e lo avvia. Prove dello script: `Invoke-Pester installer\tests` (Pester 3, incluso in Windows).
  Un doppio clic su un MSI più nuovo funziona uguale grazie all'UpgradeCode fisso (`F1E5A28E-4BA7-4B75-8F1F-8C5AE9025A9E`, non cambiarlo mai).
  Disinstallazione: «App installate»; i dati restano (`uninstall_service.ps1 -RemoveData` per cancellarli).
- macOS: vedi sopra.
- Il database ha anche il backup automatico dell'app (cartella `backup` dei dati).

## Memoria del servizio (`-Xmx512m`): cosa è provato e cosa no

Il servizio parte con `-Xmx512m` (`Contabilita.xml` su Windows, `launchd/it.contabilita.servizio.plist` sul Mac); i limiti
dell'importazione delle fatture seguono quel valore (`docs/api.md`, «Quanto si legge in una volta»).

Provato l'11 novembre 2026, **senza installare niente**:

- `MemoriaDelServizioTest` (JUnit, gira con `mvn test`): `Contabilita.xml` e il plist sono XML ben formati, hanno un solo
  `-Xmx`, prima di `-jar`, uguale nei due file e pari a 512 MB; `wix\main.install.wxs` toglie la versione di prima
  subito dopo `InstallInitialize` e ha `Product Id="*"`; `Build-Setup.ps1` mette nell'MSI proprio quel file.
- Costruzione vera del solo MSI (il passo 4 di `Build-Setup.ps1`: jpackage 17 + WiX 3.14, in una cartella temporanea, con
  il jar e l'immagine jlink già in `target`): riuscita. Dall'MSI, aperto in sola lettura (`dark.exe -x` e le tabelle):
  `app\Contabilita.xml` è identico a `installer\Contabilita.xml` e ha `-Xmx512m`; l'MSI costruito in ottobre aveva `-Xmx256m`.
- Aggiornamento, letto dalle tabelle dei due MSI: stesso `UpgradeCode`, `ProductCode` diversi, **stessa versione 0.1.0**
  (la versione viene dal `pom.xml`, che non è cambiato). La riga `Upgrade` ha il massimo **compreso**, quindi anche a
  parità di versione il nuovo MSI riconosce il vecchio come da sostituire; `RemoveExistingProducts` è alla posizione 1501,
  subito dopo `InstallInitialize` (1500) e prima di `InstallFiles` (4000): la versione di prima viene tolta **tutta**
  (anche un `Contabilita.xml` modificato a mano dopo l'installazione) e poi si copiano i file nuovi. Dopo `CreateShortcuts`
  parte `install_service.ps1 -Silent`, che ferma e riavvia il servizio: WinSW rilegge `Contabilita.xml` a ogni avvio.
- La JRE jlink dell'MSI accetta gli argomenti: `runtime\bin\java.exe -Dcontabilita.sorveglia-padre=true -Xmx512m
  -XX:+PrintFlagsFinal -version` dice `MaxHeapSize = 536870912`.
- `Invoke-Pester installer\tests`: 9 prove su 9 (riguardano `service_common.ps1`, non la memoria).

**Non provato** (serve una macchina di prova, per esempio Windows Sandbox, o un Mac):

- l'installazione e l'aggiornamento veri (`msiexec /i` sopra una versione con 256 MB) e che dopo l'aggiornamento il
  servizio giri davvero con 512 MB. Controllo da fare lì: `Get-CimInstance Win32_Process -Filter "Name='java.exe'" |
  Select CommandLine` deve mostrare `-Xmx512m`, e nel log dell'app all'avvio ci deve essere «Importazione: in una sola
  lettura si accettano al massimo 128 MB invece di 200 MB, perché la memoria del programma è 512 MB.» (su un PC con un
  solo processore o meno di 2 GB la JVM sceglie un altro gestore della memoria e ne conta qualche MB in meno: i limiti
  scendono di conseguenza, per esempio 123 MB per lettura invece di 128; il limite per file invece resta 20 MB, perché
  scende solo sotto i 480 MB);
- che WinSW passi `-Xmx512m` alla JVM così com'è scritto (è un argomento come `-Dcontabilita.sorveglia-padre=true`, che
  nel progetto gemello arriva; qui non si è avviato WinSW, perché partirebbe sui dati veri);
- rilanciare **lo stesso file MSI** già installato non sostituisce niente («modalità manutenzione»): non è un problema per
  la memoria, perché lo stesso file ha lo stesso XML, ma un MSI ricostruito è sempre un file con `ProductCode` nuovo;
- nello stesso log **non** ci deve essere la riga sul limite per file («Importazione: un file si legge se pesa al massimo
  … MB invece di 20 MB, perché la memoria del programma è … MB.»): con 512 MB il limite per file è il massimo, 20 MB
  (un quarto della memoria diviso 6 fa 21). La riga compare solo se la JVM conta meno di 480 MB: con 256 MB direbbe 10 MB;
- **il nome nuovo nell'MSI.** La costruzione dell'MSI dell'11 novembre è precedente al cambio di nome: `Product Name`
  «Fuorigioco», `--vendor`, la descrizione, le scorciatoie `Fuorigioco.lnk` (e la pulizia delle `Contabilita.lnk`) e
  il nome del servizio riscritto con `sc.exe` a chi aggiorna non sono stati verificati in un MSI né in un'installazione;
- **la versione nuova dell'MSI** (`0.1.<numero di build>`, vedi «Versione dell'MSI»): il calcolo è provato con Pester, ma
  nessun MSI è stato costruito con quel numero né installato sopra uno `0.1.0`;
- tutto il lato Mac: il plist è stato solo letto come XML (niente `plutil`, niente `launchctl`, niente pacchetto); anche il
  nome «Fuorigioco» nel Finder (`InfoPlist.strings`) non è stato visto su un Mac.

### Prova in Windows Sandbox: aggiornamento da 256 MB a 512 MB (da fare)

**Non fatta il 12 novembre 2026.** Su questo PC Windows Sandbox non è attivo: `C:\Windows\System32\WindowsSandbox.exe` non
c'è, e `Get-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM` chiede un terminale da
amministratore. Attivarlo vuol dire abilitare una funzione di Windows e riavviare: lo decide chi usa il PC. L'MSI **non** va
provato sul PC vero (c'è il servizio vero con i dati in `C:\ProgramData\Contabilita`).

Una volta sola, da amministratore, poi riavvio (serve Windows Pro o Enterprise con la virtualizzazione accesa nel BIOS):

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All
```

Poi:

1. Mettere in una cartella vuota, per esempio `C:\prova-msi`, **solo** i due MSI: quello vecchio con `-Xmx256m` (costruito
   in ottobre, `Contabilita-0.1.0.msi`) rinominato `vecchio.msi`, e quello nuovo rinominato `nuovo.msi`. Nient'altro: la
   sandbox vede solo quella cartella, in sola lettura.
2. Salvare accanto, fuori dalla cartella, un file `prova.wsb`:

   ```xml
   <Configuration>
     <Networking>Disable</Networking>
     <MappedFolders>
       <MappedFolder>
         <HostFolder>C:\prova-msi</HostFolder>
         <SandboxFolder>C:\msi</SandboxFolder>
         <ReadOnly>true</ReadOnly>
       </MappedFolder>
     </MappedFolders>
   </Configuration>
   ```

3. Doppio clic su `prova.wsb`. Dentro la sandbox, in PowerShell (lì si è già amministratori):

   ```powershell
   $java = { Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Select-Object -ExpandProperty CommandLine }
   Start-Process msiexec -ArgumentList '/i C:\msi\vecchio.msi /qb /l*v C:\vecchio.log' -Wait
   Get-Service Contabilita            # Running
   & $java                            # deve contenere -Xmx256m
   Set-Content "C:\ProgramData\Contabilita\segnaposto.txt" "dati di prima"

   Start-Process msiexec -ArgumentList '/i C:\msi\nuovo.msi /qb /l*v C:\nuovo.log' -Wait
   Get-Service Contabilita            # Running, nome mostrato "Fuorigioco"
   & $java                            # deve contenere -Xmx512m e NON -Xmx256m
   Get-Content "C:\ProgramData\Contabilita\segnaposto.txt"   # i dati sono rimasti
   Select-String -Path "C:\ProgramData\Contabilita\log\*" -Pattern "Importazione:" | Select-Object -Last 4   # una riga per avvio
   Get-Package | Where-Object Name -eq "Fuorigioco" | Select-Object Name, Version   # una riga sola, 0.1.<numero di build>
   (Invoke-WebRequest http://localhost:8766/api/versione -UseBasicParsing).Content
   ```

4. Che cosa deve risultare: dopo il secondo `msiexec` (codice d'uscita 0 in fondo a `C:\nuovo.log`) c'è **una sola** voce
   «Fuorigioco» in «App installate», con la versione nuova; la riga di comando di `java.exe` ha `-Xmx512m`; nel log dell'app
   c'è **una riga** «Importazione: …», quella sul limite per lettura (128 MB invece di 200 MB), e **non** quella sul limite
   per file, che con 512 MB resta 20 MB (vedi «Non provato», qui sopra); `segnaposto.txt` c'è ancora; le scorciatoie si chiamano
   `Fuorigioco.lnk` e le `Contabilita.lnk` non ci sono più.
5. Controprova del downgrade: `Start-Process msiexec -ArgumentList '/i C:\msi\vecchio.msi /qb' -Wait` deve rifiutarsi
   (un MSI più vecchio sopra uno più nuovo) e lasciare il servizio com'è.
6. Chiudere la finestra della sandbox: sparisce tutto. Sul PC vero non è cambiato niente.

Se un passo non torna, i due log di `msiexec` e la cartella `C:\ProgramData\Contabilita\log` della sandbox vanno copiati
prima di chiuderla (la cartella condivisa è in sola lettura: per portarli fuori si usa il copia e incolla).

## Cosa NON è stato provato

Scritto e controllato solo con parser/sintassi su Windows. **Mai eseguiti**: build del PKG (quella dell'MSI sì, vedi la sezione qui sopra), installazione, avvio del
servizio, firewall, scorciatoie, aggiornamento, disinstallazione, il comportamento su un Mac vero (launchd, Gatekeeper,
firma/notarizzazione), il workflow GitHub. Mancano inoltre il jar vero (l'elenco dei moduli jlink è ereditato) e le icone.
Punti da guardare alla prima prova: espansione di `%BASE%` in `Contabilita.xml`;
la firma dei binari del runtime con hardened runtime.
