# =============================================================================
# Contabilita - script di build: Maven -> jlink -> jpackage -> MSI
# =============================================================================
# Uso:
#   .\Build-Setup.ps1                              # versione letta da ..\pom.xml (<version>, senza -SNAPSHOT)
#   .\Build-Setup.ps1 -Version "1.0.0"
#   .\Build-Setup.ps1 -Version "1.0.0" -SkipMaven   # ripacchettizza solo, jar gia' costruito
#   .\Build-Setup.ps1 -Version "1.0.0" -CodeSign    # firma l'MSI alla fine
#   .\Build-Setup.ps1 -Version "0.1.0" -SkipMaven -JarPath "C:\...\contabilita-0.1.0.jar"
#                                                    # per provare la catena senza Maven,
#                                                    # con un jar di prova (vedi README, sezione Prova)
#
# Output:
#   ..\target\contabilita-*.jar                (jar prodotto da Maven, se non -SkipMaven)
#   ..\target\runtime\                       (immagine jlink)
#   ..\target\installer\Contabilita-{versione}.msi
#
# Richiede:
#   - JDK 17 con bin\jpackage e bin\jlink (verifica $env:JAVA_HOME o passa -JdkHome)
#   - WiX Toolset 3.x sul PATH (light.exe/candle.exe), gia' presente su questo
#     PC in "C:\Program Files (x86)\WiX Toolset v3.14\bin"
#   - Maven sul PATH (evitabile con -SkipMaven)
#   - Accesso a Internet la prima volta (WinSW scaricato da GitHub e messo in cache)
#   - Per -CodeSign: signtool.exe (Windows SDK) + SIGNING_CERT_PATH/SIGNING_CERT_PASSWORD
#
# Adattato dallo script di build del progetto gemello (riuso a pezzi, vedi
# docs/stack.md): un solo servizio, una sola cartella dati, una sola
# configurazione. L'installazione automatica del servizio e' il comportamento
# PREDEFINITO, sempre attivo.
# =============================================================================

param(
    # Se omessa, viene letta da ..\pom.xml (<version> del progetto, senza
    # l'eventuale suffisso -SNAPSHOT) - cosi' jar, MSI e /api/versione
    # dicono sempre la stessa versione senza doverla scrivere in due posti.
    [string]$Version = "",
    [string]$JdkHome = $env:JAVA_HOME,
    [switch]$SkipMaven,

    # Percorso di un jar gia' pronto, usato al posto della ricerca in
    # target\contabilita-*.jar. Pensato per provare la catena jlink -> jpackage
    # prima che il servizio vero esista, con un jar finto (vedi README).
    [string]$JarPath,

    # Se impostato, firma l'MSI con signtool.exe alla fine.
    # Richiede SIGNING_CERT_PATH (.pfx) e SIGNING_CERT_PASSWORD nell'ambiente.
    [switch]$CodeSign
)

$ErrorActionPreference = "Stop"

# --- WinSW: stessa versione e stesso SHA-256 del progetto gemello ---
# Fonte: https://github.com/winsw/winsw/releases
$WinswVersion  = "v2.12.0"
$WinswFileName = "WinSW-x64.exe"
$WinswUrl      = "https://github.com/winsw/winsw/releases/download/$WinswVersion/$WinswFileName"
$WinswSha256   = "05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA"

# UpgradeCode fisso: generato una volta (2026-10-22, NUOVO e diverso da quello del progetto gemello: le due app devono poter convivere sullo stesso PC) e non va piu' cambiato.
# E' quello che permette a un MSI piu' nuovo di riconoscere ed eseguire
# l'aggiornamento "installa sopra" invece di un'installazione parallela.
$UpgradeUuid = "F1E5A28E-4BA7-4B75-8F1F-8C5AE9025A9E"

# --- Percorsi ---------------------------------------------------------------
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot  = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$TargetDir    = Join-Path $ProjectRoot "target"
$RuntimeDir   = Join-Path $TargetDir "runtime"
$InstallerDir = Join-Path $TargetDir "installer"
# Fuori da target\: "mvn clean" svuota target a ogni build e costringeva a
# riscaricare winsw da GitHub ogni volta (il 12 settembre 2026 GitHub non ha
# risposto e la build e' saltata). Cartella ignorata da git; il file viene
# comunque verificato con lo SHA-256 qui sotto a ogni build.
$WinswCacheDir  = Join-Path $PSScriptRoot ".winsw-cache"
$WixResourceDir = Join-Path $TargetDir "wix-resources"
$StageDir       = Join-Path $TargetDir "stage"
$IconFile       = Join-Path $ScriptDir "contabilita.ico"

function Get-PomVersion {
    # Legge <version> dal <project> di primo livello del pom.xml (non quello
    # dentro <parent>, che e' la versione di spring-boot-starter-parent).
    # pom.xml dichiara il namespace Maven come default: serve un
    # XmlNamespaceManager anche per un elemento senza prefisso esplicito.
    param([string]$PomPath)
    if (-not (Test-Path $PomPath)) {
        throw "pom.xml non trovato in $PomPath - passa -Version esplicitamente."
    }
    [xml]$pomXml = Get-Content -LiteralPath $PomPath -Raw
    $ns = New-Object System.Xml.XmlNamespaceManager($pomXml.NameTable)
    $ns.AddNamespace("m", "http://maven.apache.org/POM/4.0.0")
    $versionNode = $pomXml.SelectSingleNode("/m:project/m:version", $ns)
    if ($null -eq $versionNode -or [string]::IsNullOrWhiteSpace($versionNode.InnerText)) {
        throw "Impossibile leggere <version> da $PomPath - passa -Version esplicitamente."
    }
    return ($versionNode.InnerText.Trim() -replace '-SNAPSHOT$', '')
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $PomPath = Join-Path $ProjectRoot "pom.xml"
    $Version = Get-PomVersion -PomPath $PomPath
    Write-Host "  Versione (da pom.xml, -Version non passato): $Version" -ForegroundColor Gray
}

if (-not $JdkHome -or -not (Test-Path $JdkHome)) {
    throw "JAVA_HOME non impostato o non valido. Passa -JdkHome 'C:\Program Files\Java\jdk-17' oppure imposta JAVA_HOME."
}
$JpackageExe = Join-Path $JdkHome "bin\jpackage.exe"
$JlinkExe    = Join-Path $JdkHome "bin\jlink.exe"
if (-not (Test-Path $JpackageExe)) { throw "jpackage non trovato in $JpackageExe" }
if (-not (Test-Path $JlinkExe))    { throw "jlink non trovato in $JlinkExe" }

# L'icona e' installer\contabilita.ico (si rigenera da installer\icona-sorgente.svg, vedi
# README): se manca la build prosegue con l'icona generica di Java/jpackage e di Windows.
$HasIcon = Test-Path $IconFile
if (-not $HasIcon) {
    Write-Warning "Icona non trovata in ${IconFile}: uso l'icona generica. Rigenera contabilita.ico (multi-risoluzione 16-256 px) da installer\icona-sorgente.svg e mettila in installer\."
}

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " Contabilita - Build $Version"                     -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Repository : $ProjectRoot"
Write-Host "  JDK        : $JdkHome"
Write-Host "  winsw      : $WinswVersion"
Write-Host ""

# --- Passo 1: Maven package -------------------------------------------------
if ($SkipMaven) {
    Write-Host "[salto] Maven package saltato (-SkipMaven)" -ForegroundColor Yellow
} else {
    Write-Host "[1/4] Maven clean package" -ForegroundColor Green
    Push-Location $ProjectRoot
    try {
        & mvn clean package -DskipTests -B
        if ($LASTEXITCODE -ne 0) { throw "Maven ha fallito (codice $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

if ($JarPath) {
    if (-not (Test-Path $JarPath)) { throw "JarPath non trovato: $JarPath" }
    $JarFile = Get-Item $JarPath
    Write-Host "       Jar (da -JarPath): $($JarFile.Name)" -ForegroundColor Gray
} else {
    # Nome esatto atteso dalla versione risolta sopra (parametro o pom.xml),
    # non un wildcard generico: un target\ con jar di versioni precedenti
    # lasciati da build passate non deve far scegliere quello sbagliato.
    $expectedJarName = "contabilita-$Version.jar"
    $JarFile = Get-ChildItem -Path $TargetDir -Filter $expectedJarName -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $JarFile) {
        throw "Jar atteso non trovato: $TargetDir\$expectedJarName (versione $Version). Esegui Maven (senza -SkipMaven) oppure passa -JarPath."
    }
    Write-Host "       Jar: $($JarFile.Name)" -ForegroundColor Gray
}

# --- Passo 2: download + verifica winsw -------------------------------------
Write-Host "[2/4] winsw" -ForegroundColor Green

if (-not (Test-Path $WinswCacheDir)) {
    New-Item -ItemType Directory -Path $WinswCacheDir | Out-Null
}
$WinswCachedPath = Join-Path $WinswCacheDir $WinswFileName

if (-not (Test-Path $WinswCachedPath)) {
    Write-Host "       Scarico $WinswUrl"
    Invoke-WebRequest -Uri $WinswUrl -OutFile $WinswCachedPath -UseBasicParsing
    if (-not (Test-Path $WinswCachedPath)) {
        throw "Download di winsw fallito da $WinswUrl"
    }
} else {
    Write-Host "       Uso la cache: $WinswCachedPath"
}

$ActualSha = (Get-FileHash -Algorithm SHA256 -Path $WinswCachedPath).Hash.ToUpper()
if ($ActualSha -ne $WinswSha256.ToUpper()) {
    throw @"
SHA-256 di winsw non corrisponde:
  Atteso : $WinswSha256
  Letto  : $ActualSha
Il file in cache potrebbe essere corrotto o manomesso, oppure la versione
$WinswVersion pinnata qui non e' piu' quella giusta. O cancella
$WinswCachedPath e riprova, oppure aggiorna `$WinswSha256 in questo script
confrontandolo con la pagina delle release di GitHub.
"@
}
Write-Host "       SHA-256 verificato: $ActualSha" -ForegroundColor Gray

# --- Passo 3: immagine jlink -------------------------------------------------
Write-Host "[3/4] Immagine jlink" -ForegroundColor Green

if (Test-Path $RuntimeDir) {
    # jlink rifiuta di sovrascrivere una cartella gia' esistente.
    Remove-Item $RuntimeDir -Recurse -Force
}

# Moduli richiesti (elenco ragionato, da rigenerare con "jdeps --list-deps"
# sul jar vero appena esiste - vedi README):
#   java.base, java.logging      : nucleo + logging (SLF4J/Logback)
#   java.sql, java.naming        : sqlite-jdbc, JPA/Hibernate
#   java.xml                     : parsing usato da varie parti di Spring
#   java.management, java.instrument : actuator, strumentazione di Spring
#   java.desktop                 : serve per java.beans (introspezione di Spring/Hibernate),
#                                   non per la grafica: nessuna stampa/Java 2D in questo progetto.
#   java.security.jgss           : handshake TLS (nel caso di HTTPS futuro)
#   java.net.http                : client HTTP (java.net.http.HttpClient)
#   jdk.unsupported               : sun.misc.Unsafe (Hibernate/Spring)
#   jdk.crypto.ec                : crittografia a curva ellittica per TLS
#   jdk.charsets                 : set di caratteri oltre l'ASCII di base
#   jdk.zipfs                    : lettura di risorse dentro il jar (nio zipfs)
$Modules = @(
    "java.base",
    "java.logging",
    "java.sql",
    "java.naming",
    "java.xml",
    "java.management",
    "java.desktop",
    "java.instrument",
    "java.security.jgss",
    "java.net.http",
    "jdk.unsupported",
    "jdk.crypto.ec",
    "jdk.charsets",
    "jdk.zipfs"
) -join ","

& $JlinkExe `
    --module-path "$JdkHome\jmods" `
    --add-modules $Modules `
    --strip-debug `
    --no-man-pages `
    --no-header-files `
    --compress=2 `
    --output $RuntimeDir

if ($LASTEXITCODE -ne 0) { throw "jlink ha fallito (codice $LASTEXITCODE)" }
Write-Host "       Immagine: $RuntimeDir" -ForegroundColor Gray

# --- Passo 4: jpackage MSI ---------------------------------------------------
Write-Host "[4/4] jpackage - MSI" -ForegroundColor Green

if (-not (Test-Path $InstallerDir)) {
    New-Item -ItemType Directory -Path $InstallerDir | Out-Null
}

if (Test-Path $StageDir) { Remove-Item $StageDir -Recurse -Force }
New-Item -ItemType Directory -Path $StageDir | Out-Null

# jpackage copia OGNI file di --input dentro app\: la cartella di staging
# tiene il repository pulito e raccoglie qui tutto quello che deve finire
# nell'MSI, rinominato secondo le convenzioni attese da Contabilita.xml.

# 1. Il jar, rinominato "contabilita.jar" (nome fisso, atteso da Contabilita.xml
#    e da install_service.ps1/update.ps1).
Copy-Item $JarFile.FullName -Destination (Join-Path $StageDir "contabilita.jar")

# 2. winsw rinominato "Contabilita.exe" (winsw cerca "{nomebase}.xml" accanto
#    a se stesso: Contabilita.exe + Contabilita.xml).
Copy-Item $WinswCachedPath -Destination (Join-Path $StageDir "Contabilita.exe")

# 3. La configurazione del servizio.
$WinswXmlSource = Join-Path $ScriptDir "Contabilita.xml"
if (-not (Test-Path $WinswXmlSource)) { throw "Contabilita.xml non trovato in $WinswXmlSource" }
Copy-Item $WinswXmlSource -Destination (Join-Path $StageDir "Contabilita.xml")

# 4-6. Script di installazione/disinstallazione/aggiornamento + libreria comune.
foreach ($script in @("install_service.ps1", "uninstall_service.ps1", "update.ps1", "service_common.ps1")) {
    $source = Join-Path $ScriptDir $script
    if (-not (Test-Path $source)) { throw "$script non trovato in $source" }
    Copy-Item $source -Destination $StageDir
}

# 7. L'icona, cosi' install_service.ps1 puo' usarla per le scorciatoie
#    desktop/avvio automatico (jpackage la usa separatamente per l'MSI/ARP
#    tramite --icon, sotto: qui la copiamo ANCHE dentro app\ per lo script).
if ($HasIcon) { Copy-Item $IconFile -Destination $StageDir }

# --- Override WiX: installazione automatica del servizio ---------------------
# jpackage richiede la SOSTITUZIONE COMPLETA di main.wxs quando si passa
# --resource-dir (non un'aggiunta): main.install.wxs e' gia' quel file intero
# (adattato dal progetto gemello).
$WixTemplate = Join-Path $ScriptDir "wix\main.install.wxs"
if (-not (Test-Path $WixTemplate)) {
    throw "Modello WiX non trovato in $WixTemplate"
}
if (Test-Path $WixResourceDir) { Remove-Item $WixResourceDir -Recurse -Force }
New-Item -ItemType Directory -Path $WixResourceDir | Out-Null
Copy-Item $WixTemplate -Destination (Join-Path $WixResourceDir "main.wxs")

$jpackageArgs = @(
    "--type", "msi",
    "--input", $StageDir,
    "--name", "Contabilita",
    "--main-jar", "contabilita.jar",
    "--main-class", "org.springframework.boot.loader.launch.JarLauncher",
    "--runtime-image", $RuntimeDir,
    "--app-version", $Version,
    "--vendor", "Contabilita Matteo",
    "--copyright", "Copyright (C) 2026 Contabilita Matteo",
    "--description", "Contabilita della pizzeria: ricavi, costi e riepiloghi (servizio Windows, interfaccia web su porta 8766)",
    "--win-upgrade-uuid", $UpgradeUuid,
    "--resource-dir", $WixResourceDir,
    "--dest", $InstallerDir
)
# Deliberatamente ASSENTI: --win-dir-chooser (cartella fissa, decisa),
# --win-shortcut e --win-menu/--win-menu-group (le scorciatoie le crea
# install_service.ps1, non jpackage: cosi' puntano a Edge in modalita' app
# invece che al lanciatore nativo di jpackage, che oltretutto non funziona
# per questa app (nel progetto gemello dava 'Failed to launch JVM': jpackage lo
# costruisce per lanciare la JVM direttamente, non tramite il servizio che imposta
# CONTABILITA_DATA_DIR).

if ($HasIcon) { $jpackageArgs += @("--icon", $IconFile) }

& $JpackageExe @jpackageArgs
if ($LASTEXITCODE -ne 0) { throw "jpackage ha fallito (codice $LASTEXITCODE)" }

$Msi = Get-ChildItem -Path $InstallerDir -Filter "*.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# --- Passo opzionale: firma dell'MSI -----------------------------------------
if ($CodeSign) {
    Write-Host "[+] Firma dell'MSI" -ForegroundColor Green
    if (-not $Msi) {
        throw "Impossibile firmare: nessun MSI trovato in $InstallerDir"
    }
    $CertPath     = $env:SIGNING_CERT_PATH
    $CertPassword = $env:SIGNING_CERT_PASSWORD
    if ([string]::IsNullOrWhiteSpace($CertPath) -or [string]::IsNullOrWhiteSpace($CertPassword)) {
        Write-Warning "SIGNING_CERT_PATH o SIGNING_CERT_PASSWORD non impostati; firma saltata."
        Write-Warning "  Non e' un problema: l'MSI puo' restare non firmato"
        Write-Warning "  (SmartScreen mostra 'editore sconosciuto' e si va avanti)."
    } elseif (-not (Test-Path $CertPath)) {
        Write-Warning "Certificato non trovato in SIGNING_CERT_PATH=$CertPath; firma saltata."
    } else {
        $SignToolExe = (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source
        if (-not $SignToolExe) {
            $sdkSignTools = Get-ChildItem -Path 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter 'signtool.exe' -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
                Sort-Object FullName -Descending
            if ($sdkSignTools) { $SignToolExe = $sdkSignTools[0].FullName }
        }
        if (-not $SignToolExe) {
            throw "signtool.exe non trovato ne' sul PATH ne' sotto il Windows SDK. Installa il Windows SDK o aggiungi signtool al PATH."
        }
        Write-Host "       signtool: $SignToolExe" -ForegroundColor Gray
        $TimestampUrl = if ($env:SIGNING_TIMESTAMP_URL) { $env:SIGNING_TIMESTAMP_URL } else { "http://timestamp.digicert.com" }
        $MaxSignAttempts = 3
        $SignAttempt = 0
        while ($true) {
            $SignAttempt++
            & $SignToolExe sign `
                /f $CertPath `
                /p $CertPassword `
                /fd sha256 `
                /tr $TimestampUrl `
                /td sha256 `
                /d "Contabilita Matteo" `
                $Msi.FullName
            if ($LASTEXITCODE -eq 0) { break }
            if ($SignAttempt -ge $MaxSignAttempts) {
                throw "signtool.exe ha fallito (codice $LASTEXITCODE) dopo $SignAttempt tentativi"
            }
            Write-Warning "signtool.exe fallito (codice $LASTEXITCODE), tentativo $SignAttempt/$MaxSignAttempts - probabile intoppo del server di marcatura temporale; riprovo tra 8s..."
            Start-Sleep -Seconds 8
        }
        $signature = Get-AuthenticodeSignature -FilePath $Msi.FullName
        if (-not $signature.SignerCertificate) {
            throw "Verifica della firma fallita: nessun certificato firmatario presente dopo la firma."
        }
        Write-Host "       MSI firmato: $($Msi.FullName) (stato firma: $($signature.Status))" -ForegroundColor Gray
    }
} else {
    Write-Host "[+] Firma saltata (-CodeSign non impostato)" -ForegroundColor Yellow
}

# --- Riepilogo ----------------------------------------------------------------
Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " BUILD COMPLETATA"                                -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan
if ($Msi) {
    Write-Host "  Installer : $($Msi.FullName)" -ForegroundColor Green
    Write-Host "  Dimensione: $([math]::Round($Msi.Length / 1MB, 2)) MB" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  Un doppio clic sull'MSI installa tutto: file, servizio, firewall, scorciatoie."
Write-Host "  Per un'installazione silenziosa: msiexec /i `"$($Msi.FullName)`" /qb"
Write-Host ""
Write-Host "  Vedi installer\README.md per la prova in Windows Sandbox."
Write-Host ""
