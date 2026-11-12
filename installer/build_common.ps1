# =============================================================================
# Contabilita - funzioni di Build-Setup.ps1 che si possono provare da sole
# (Invoke-Pester installer\tests). Non finisce nell'MSI: serve solo a costruirlo.
# =============================================================================

# Il giorno zero del numero di build. NON spostarlo in avanti: i numeri ripartirebbero da capo e un MSI
# nuovo risulterebbe piu' vecchio di quelli gia' installati (Windows Installer rifiuta il downgrade).
$script:MsiBuildEpoch = [datetime]::new(2026, 1, 1, 0, 0, 0, [System.DateTimeKind]::Utc)

function Assert-MsiVersion {
    <#
    .SYNOPSIS
        Controlla una versione dell'MSI passata a mano (-MsiVersion) e la restituisce ripulita dagli spazi.
        Tre numeri, al massimo 255.255.65535: oltre, Windows Installer la confronta male o la rifiuta.
    #>
    param([Parameter(Mandatory = $true)][string]$MsiVersion)

    $pulita = $MsiVersion.Trim()
    if ($pulita -notmatch '^\d+\.\d+\.\d+$') {
        throw "-MsiVersion '$MsiVersion' non valida: servono tre numeri separati da punti, per esempio 0.1.4000."
    }
    $campi = $pulita.Split('.')
    $massimi = @(255, 255, 65535)
    for ($i = 0; $i -lt 3; $i++) {
        # Per lunghezza prima che per valore: un numero di venti cifre non entra in un intero.
        if ($campi[$i].TrimStart('0').Length -gt 5 -or [int]$campi[$i] -gt $massimi[$i]) {
            throw "-MsiVersion '$MsiVersion' non valida: i tre numeri arrivano al massimo a 255.255.65535."
        }
    }
    return $pulita
}

function Get-MsiVersion {
    <#
    .SYNOPSIS
        La versione da scrivere nell'MSI: <primo>.<secondo>.<numero di build>.
    .DESCRIPTION
        Windows Installer confronta solo tre numeri (massimi 255.255.65535). I primi due sono quelli della
        versione del programma (pom.xml); il terzo del pom non si usa e al suo posto va un numero che cresce
        col tempo: i giorni passati dal 2026-01-01 (UTC) per dieci, piu' il decimo di giorno, piu' uno.
        Esempio: 12 novembre 2026 a mezzogiorno UTC = giorno 315, decimo 5 -> 0.1.3156.
          - sempre maggiore di 0.1.0, la versione di tutti gli MSI costruiti prima;
          - due build a meno di 2 ore e 24 minuti possono avere lo stesso numero: si aggiornano lo stesso
            (wix\main.install.wxs sostituisce anche la stessa versione), solo non si distinguono dal numero;
          - UTC, cosi' il PC di sviluppo e la CI contano allo stesso modo e l'ora legale non fa tornare indietro;
          - basta fino al 10 dicembre 2043; poi si alza il secondo numero nel pom, non l'epoca.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$AppVersion,
        [datetime]$Now = [datetime]::UtcNow
    )

    $pulita = $AppVersion.Trim() -replace '-SNAPSHOT$', ''
    if ($pulita -notmatch '^\d+(\.\d+)*$') {
        throw "Versione '$AppVersion' non valida: servono numeri separati da punti, per esempio 0.1.0."
    }
    $campi = $pulita.Split('.')
    $primo = [int]$campi[0]
    $secondo = if ($campi.Length -gt 1) { [int]$campi[1] } else { 0 }
    if ($primo -gt 255 -or $secondo -gt 255) {
        throw "Versione '$AppVersion' non adatta a un MSI: i primi due numeri arrivano al massimo a 255."
    }

    $trascorso = $Now.ToUniversalTime() - $script:MsiBuildEpoch
    if ($trascorso.Ticks -lt 0) {
        throw "La data del computer ($($Now.ToString('yyyy-MM-dd'))) viene prima del 2026-01-01: il numero di build non si puo' calcolare. Controlla l'orologio."
    }
    # Conti interi sui tick (un decimo di giorno = 86.400.000.000 tick): con TotalDays * 10 l'arrotondamento
    # dei decimali spostava di uno il numero proprio sul confine fra due decimi.
    $build = [long][math]::Floor($trascorso.Ticks / ([timespan]::TicksPerDay / 10)) + 1
    if ($build -gt 65535) {
        throw "Il numero di build ($build) supera 65535, il massimo di un MSI: alza il secondo numero della versione nel pom.xml e passa -MsiVersion a mano."
    }
    return "$primo.$secondo.$build"
}
