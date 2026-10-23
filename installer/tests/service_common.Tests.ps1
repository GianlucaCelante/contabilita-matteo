# Prove di service_common.ps1 (Pester 3.x, quello incluso in Windows):
#   Invoke-Pester installer\tests
# Il caso che le ha fatte nascere: rilanciando lo STESSO MSI gia' installato, Windows Installer entra in
# «modalita' manutenzione», esce con codice 0 e non esegue le azioni che riavviano il servizio; lo script
# dava il servizio per riavviato e lo lasciava fermo.

. (Join-Path $PSScriptRoot "..\service_common.ps1")

Describe "Get-PostInstallAction" {
    It "installazione riuscita e servizio attivo: non c'e' niente da fare" {
        Get-PostInstallAction -ExitCode 0 -ServiceStatus "Running" | Should Be "Nessuna"
        Get-PostInstallAction -ExitCode 3010 -ServiceStatus "Running" | Should Be "Nessuna"
    }
    It "installazione riuscita ma servizio fermo (stessa versione gia' installata): lo avvia" {
        Get-PostInstallAction -ExitCode 0 -ServiceStatus "Stopped" | Should Be "AvviaServizio"
        Get-PostInstallAction -ExitCode 3010 -ServiceStatus "Stopped" | Should Be "AvviaServizio"
    }
    It "installazione riuscita ma servizio non registrato: lo registra e lo avvia (script di installazione)" {
        Get-PostInstallAction -ExitCode 0 -ServiceStatus "Assente" | Should Be "RegistraEAvviaServizio"
    }
    It "installazione riuscita e servizio in partenza: aspetta, non lo tocca" {
        Get-PostInstallAction -ExitCode 0 -ServiceStatus "StartPending" | Should Be "Nessuna"
    }
    It "installazione fallita: rimette in piedi il servizio, qualunque sia il suo stato" {
        Get-PostInstallAction -ExitCode 1603 -ServiceStatus "Stopped" | Should Be "RipristinaServizio"
        Get-PostInstallAction -ExitCode 1638 -ServiceStatus "Running" | Should Be "RipristinaServizio"
    }
}

Describe "Wait-ForServiceRunning" {
    It "se il servizio e' gia' attivo torna subito" {
        Mock Get-Service { [pscustomobject]@{ Status = "Running" } }
        Wait-ForServiceRunning -Name "Contabilita" -TimeoutSeconds 5 | Should Be "Running"
    }
    It "aspetta che parta" {
        $script:chiamate = 0
        Mock Get-Service {
            $script:chiamate++
            if ($script:chiamate -lt 3) { [pscustomobject]@{ Status = "Stopped" } } else { [pscustomobject]@{ Status = "Running" } }
        }
        Wait-ForServiceRunning -Name "Contabilita" -TimeoutSeconds 10 | Should Be "Running"
    }
    It "se non parte entro il tempo dice com'e' rimasto" {
        Mock Get-Service { [pscustomobject]@{ Status = "Stopped" } }
        Wait-ForServiceRunning -Name "Contabilita" -TimeoutSeconds 2 | Should Be "Stopped"
    }
    It "servizio non registrato: «Assente»" {
        Mock Get-Service { $null }
        Wait-ForServiceRunning -Name "Contabilita" -TimeoutSeconds 2 | Should Be "Assente"
    }
}
