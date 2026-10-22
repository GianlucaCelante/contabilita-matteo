# Installer di Contabilità Matteo

Due installer per la stessa app (servizio Java con interfaccia web su `http://localhost:8766/`):

| | Windows | macOS |
|---|---|---|
| Formato | `Contabilita-<versione>.msi` | `Contabilita-<versione>-<arch>.pkg` |
| Si costruisce con | `installer\Build-Setup.ps1` (su Windows) | `installer/mac/Build-Setup.sh` (**solo su un Mac**) |
| App | `C:\Program Files\Contabilita` | `/Applications/Contabilita.app` |
| Servizio | servizio Windows `Contabilita` («Contabilità Matteo»), WinSW, avvio automatico ritardato, account LocalSystem | LaunchDaemon `it.contabilita.servizio` (root, `RunAtLoad` + `KeepAlive`) |
| Dati | `C:\ProgramData\Contabilita` | `/Library/Application Support/Contabilita` |
| Log | `C:\ProgramData\Contabilita\log` | dati: `.../Contabilita/log`; avvio launchd: `/Library/Logs/Contabilita/launchd.log` |
| Variabile dati | `CONTABILITA_DATA_DIR` (nel file WinSW) | `CONTABILITA_DATA_DIR` (nel plist), più `TZ=Europe/Rome` |
| Firewall | regola TCP «Contabilita 8766», tutti i profili | nessuna regola esplicita (vedi sotto) |
| Apertura | scorciatoie (desktop, avvio automatico, menu Start): Edge/Chrome in modalità app | `Contabilita.app` (apre Chrome/Edge in modalità app o il browser predefinito) + LaunchAgent che la apre a ogni accesso |
| Aggiornamento | `update.ps1 <msi>` (backup del DB, ferma, `msiexec`) oppure MSI sopra | `.pkg` sopra: `preinstall` fa il backup e ferma il servizio |
| Disinstallazione | `uninstall_service.ps1` (anche dall'MSI) | `sudo .../Resources/uninstall.sh` |

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
.\Build-Setup.ps1                       # versione letta da ..\pom.xml
.\Build-Setup.ps1 -Version 0.1.0 -SkipMaven [-JarPath C:\...\contabilita-0.1.0.jar]
.\Build-Setup.ps1 -CodeSign             # firma (richiede il certificato)
# Output: target\installer\Contabilita-<versione>.msi
```

```bash
# macOS, dalla radice del repository
installer/mac/Build-Setup.sh [--version 0.1.0] [--skip-maven]
# Output: target/installer-mac/Contabilita-<versione>-<arch>.pkg  (arm64 su Apple Silicon, x86_64 su Intel)
```

In CI: `.github/workflows/installer.yml` costruisce entrambi su tag `v*` o a mano (Actions > Installer >
Run workflow) e carica gli artefatti `Contabilita-msi` e `Contabilita-pkg`. Non servono segreti per la
build non firmata.

### Icona (da disegnare)

L'icona non c'è ancora. Cosa serve:

- Windows: `installer/contabilita.ico` (multi-risoluzione 16-256 px). Se manca, la build avvisa e usa l'icona
  generica; le scorciatoie restano senza icona propria.
- macOS: `installer/mac/contabilita-1024.png` (1024x1024). Se manca, la build avvisa e l'app ha l'icona generica.

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

## Aggiornare e disinstallare

- Windows: `.\update.ps1 "C:\percorso\Contabilita-0.2.0.msi"` (si autoeleva, fa il backup del database in
  `backup\pre-aggiornamento-<data>`, ferma servizio e finestre, lancia `msiexec`, e se fallisce rimette in piedi il servizio).
  Un doppio clic su un MSI più nuovo funziona uguale grazie all'UpgradeCode fisso (`F1E5A28E-4BA7-4B75-8F1F-8C5AE9025A9E`, non cambiarlo mai).
  Disinstallazione: «App installate»; i dati restano (`uninstall_service.ps1 -RemoveData` per cancellarli).
- macOS: vedi sopra.
- Il database ha anche il backup automatico dell'app (cartella `backup` dei dati).

## Cosa NON è stato provato

Scritto e controllato solo con parser/sintassi su Windows. **Mai eseguiti**: build dell'MSI e del PKG, installazione, avvio del
servizio, firewall, scorciatoie, aggiornamento, disinstallazione, il comportamento su un Mac vero (launchd, Gatekeeper,
firma/notarizzazione), il workflow GitHub. Mancano inoltre il jar vero (l'elenco dei moduli jlink è ereditato) e le icone.
Punti da guardare alla prima prova: espansione di `%BASE%` in `Contabilita.xml`;
la firma dei binari del runtime con hardened runtime.
