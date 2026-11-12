# Prove di build_common.ps1 (Pester 3.x, quello incluso in Windows): il numero di versione dell'MSI.
#   Invoke-Pester installer\tests
# Prima ogni MSI era 0.1.0 (la versione del pom): due build diverse non si distinguevano dal numero.

. (Join-Path $PSScriptRoot "..\build_common.ps1")

function Utc([string]$testo) {
    return [datetime]::Parse($testo, [cultureinfo]::InvariantCulture, [System.Globalization.DateTimeStyles]"AssumeUniversal, AdjustToUniversal")
}

Describe "Get-MsiVersion" {
    It "tiene i primi due numeri e mette al terzo il numero di build: giorni dal 2026-01-01 per dieci, piu' il decimo di giorno" {
        Get-MsiVersion -AppVersion "0.1.0" -Now (Utc "2026-01-01T00:00:00Z") | Should Be "0.1.1"
        Get-MsiVersion -AppVersion "0.1.0" -Now (Utc "2026-01-01T02:24:00Z") | Should Be "0.1.2"
        Get-MsiVersion -AppVersion "0.1.0" -Now (Utc "2026-11-12T00:00:00Z") | Should Be "0.1.3151"
        Get-MsiVersion -AppVersion "0.1.0" -Now (Utc "2026-11-12T12:00:00Z") | Should Be "0.1.3156"
        Get-MsiVersion -AppVersion "0.1.0" -Now (Utc "2026-11-12T23:59:59Z") | Should Be "0.1.3160"
        Get-MsiVersion -AppVersion "0.1.0" -Now (Utc "2026-11-13T00:00:00Z") | Should Be "0.1.3161"
    }
    It "non scende mai col tempo ed e' sempre maggiore di 0.1.0, la versione degli MSI gia' installati" {
        $prima = [version]"0.1.0"
        $quando = Utc "2026-01-01T00:00:00Z"
        foreach ($i in 1..500) {
            $adesso = [version](Get-MsiVersion -AppVersion "0.1.0" -Now $quando)
            ($adesso -gt $prima) | Should Be $true
            $prima = $adesso
            # Un decimo di giorno esatto, in tick: AddHours(2.4) su PowerShell 7 non arrotonda e resta un soffio sotto.
            $quando = $quando.AddTicks([timespan]::TicksPerDay / 10)
        }
    }
    It "usa l'ora UTC: un orario locale e lo stesso istante in UTC danno lo stesso numero" {
        $utc = Utc "2026-11-12T23:30:00Z"
        Get-MsiVersion -AppVersion "0.1.0" -Now $utc.ToLocalTime() | Should Be (Get-MsiVersion -AppVersion "0.1.0" -Now $utc)
    }
    It "il terzo numero del pom non conta; senza il secondo vale zero; -SNAPSHOT si toglie" {
        $quando = Utc "2026-11-12T00:00:00Z"
        Get-MsiVersion -AppVersion "0.1.7" -Now $quando | Should Be "0.1.3151"
        Get-MsiVersion -AppVersion "2" -Now $quando | Should Be "2.0.3151"
        Get-MsiVersion -AppVersion "1.4.0-SNAPSHOT" -Now $quando | Should Be "1.4.3151"
    }
    It "una versione dell'app piu' alta vince su qualunque numero di build" {
        $vecchia = [version](Get-MsiVersion -AppVersion "0.1.0" -Now (Utc "2040-01-01T00:00:00Z"))
        $nuova = [version](Get-MsiVersion -AppVersion "0.2.0" -Now (Utc "2026-11-12T00:00:00Z"))
        ($nuova -gt $vecchia) | Should Be $true
    }
    It "resta nei limiti di Windows Installer (255.255.65535) e si ferma con un errore chiaro se non ci sta" {
        Get-MsiVersion -AppVersion "255.255.0" -Now (Utc "2043-12-11T00:00:00Z") | Should Be "255.255.65531"
        { Get-MsiVersion -AppVersion "0.1.0" -Now (Utc "2043-12-11T12:00:00Z") } | Should Throw "65535"
        { Get-MsiVersion -AppVersion "256.0.0" -Now (Utc "2026-11-12T00:00:00Z") } | Should Throw "255"
        { Get-MsiVersion -AppVersion "0.300.0" -Now (Utc "2026-11-12T00:00:00Z") } | Should Throw "255"
        { Get-MsiVersion -AppVersion "0.1.0" -Now (Utc "2025-12-31T23:00:00Z") } | Should Throw "2026-01-01"
        { Get-MsiVersion -AppVersion "uno.due" -Now (Utc "2026-11-12T00:00:00Z") } | Should Throw "numeri"
    }
}

Describe "Assert-MsiVersion (-MsiVersion passato a mano)" {
    It "accetta tre numeri nei limiti e li restituisce cosi' come sono" {
        Assert-MsiVersion -MsiVersion "0.1.4000" | Should Be "0.1.4000"
        Assert-MsiVersion -MsiVersion " 255.255.65535 " | Should Be "255.255.65535"
        Assert-MsiVersion -MsiVersion "0.0.0" | Should Be "0.0.0"
    }
    It "rifiuta i numeri oltre 255.255.65535, anche se hanno il numero giusto di cifre" {
        { Assert-MsiVersion -MsiVersion "300.0.70000" } | Should Throw "255.255.65535"
        { Assert-MsiVersion -MsiVersion "256.0.1" } | Should Throw "255.255.65535"
        { Assert-MsiVersion -MsiVersion "0.256.1" } | Should Throw "255.255.65535"
        { Assert-MsiVersion -MsiVersion "0.1.65536" } | Should Throw "255.255.65535"
        { Assert-MsiVersion -MsiVersion "0.1.99999999999999999999" } | Should Throw "255.255.65535"
    }
    It "rifiuta cio' che non sono tre numeri" {
        { Assert-MsiVersion -MsiVersion "0.1" } | Should Throw "tre numeri"
        { Assert-MsiVersion -MsiVersion "0.1.2.3" } | Should Throw "tre numeri"
        { Assert-MsiVersion -MsiVersion "0.1.x" } | Should Throw "tre numeri"
        { Assert-MsiVersion -MsiVersion "0.1.-5" } | Should Throw "tre numeri"
    }
}

Describe "Build-Setup.ps1 e la versione dell'MSI" {
    $build = Get-Content -LiteralPath (Join-Path $PSScriptRoot "..\Build-Setup.ps1") -Raw
    It "passa a jpackage la versione calcolata, non quella del pom" {
        $build | Should Match '"--app-version", \$MsiVersion'
        $build | Should Match 'Get-MsiVersion -AppVersion \$Version'
        $build | Should Match '\$MsiVersion = Assert-MsiVersion -MsiVersion \$MsiVersion'
    }
    It "il jar si cerca ancora con la versione del pom" {
        $build | Should Match '\$expectedJarName = "contabilita-\$Version\.jar"'
    }
    It "l'UpgradeCode non e' cambiato" {
        $build | Should Match '\$UpgradeUuid = "F1E5A28E-4BA7-4B75-8F1F-8C5AE9025A9E"'
    }
}
