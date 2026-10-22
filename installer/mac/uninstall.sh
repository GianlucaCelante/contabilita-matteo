#!/bin/bash
# Disinstalla Contabilita dal Mac: ferma e toglie il servizio, l'apertura automatica e l'app.
# Di serie NON cancella i dati (database, log, backup): una disinstallazione per sbaglio non perde
# lo storico. Per cancellare anche quelli:  sudo ./uninstall.sh --remove-data
# Corrisponde a uninstall_service.ps1 su Windows. Idempotente.

if [ "$(id -u)" -ne 0 ]; then
    echo "Serve l'amministratore: sudo \"$0\" $*" >&2
    exit 1
fi

DATI="/Library/Application Support/Contabilita"
LOGDIR="/Library/Logs/Contabilita"

/bin/launchctl bootout system/it.contabilita.servizio >/dev/null 2>&1
/usr/bin/pkill -f "/Applications/Contabilita.app/Contents/Resources/app/contabilita.jar" >/dev/null 2>&1

# Il LaunchAgent e' caricato nelle sessioni gia' aperte: si scarica per ogni utente collegato.
for uid in $(/usr/bin/who | /usr/bin/awk '{print $1}' | /usr/bin/sort -u | while read -r u; do /usr/bin/id -u "$u" 2>/dev/null; done); do
    /bin/launchctl bootout "gui/$uid/it.contabilita.avvio" >/dev/null 2>&1
done

/bin/rm -f /Library/LaunchDaemons/it.contabilita.servizio.plist /Library/LaunchAgents/it.contabilita.avvio.plist
/bin/rm -rf /Applications/Contabilita.app
/usr/sbin/pkgutil --forget it.contabilita.pkg >/dev/null 2>&1

if [ "$1" = "--remove-data" ]; then
    /bin/rm -rf "$DATI" "$LOGDIR"
    echo "Contabilita disinstallata, dati cancellati."
else
    echo "Contabilita disinstallata. I dati sono rimasti in: $DATI"
    echo "Per cancellarli:  sudo rm -rf \"$DATI\" \"$LOGDIR\""
fi
