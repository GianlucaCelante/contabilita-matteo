#!/bin/bash
# =============================================================================
# Contabilita - build dell'installer per macOS: Maven -> jlink -> pkgbuild -> .pkg
# =============================================================================
# Va lanciato SU UN MAC (jlink e pkgbuild producono binari del Mac su cui girano):
# un Mac Apple Silicon produce un pacchetto per Apple Silicon, un Mac Intel uno per Intel.
# In CI gira su un runner macOS (vedi .github/workflows/installer.yml).
#
# Uso, dalla radice del repository:
#   installer/mac/Build-Setup.sh                    # versione letta da pom.xml (senza -SNAPSHOT)
#   installer/mac/Build-Setup.sh --version 0.2.0    # forza la versione
#   installer/mac/Build-Setup.sh --skip-maven       # jar gia' costruito in target/
#
# Richiede: JDK 17 (con jlink e la cartella jmods, es. Temurin 17), Maven 3.9.
# Output: target/installer-mac/Contabilita-<versione>-<arch>.pkg
#
# FIRMA E NOTARIZZAZIONE: facoltative e DISATTIVE di default (variabili d'ambiente).
#   APPLE_SIGN_IDENTITY        "Developer ID Application: Nome (TEAMID)" -> firma app e runtime
#   APPLE_INSTALLER_IDENTITY   "Developer ID Installer: Nome (TEAMID)"   -> firma il .pkg
#   Notarizzazione (solo se anche il .pkg e' firmato), UNA delle due modalita':
#     APPLE_NOTARY_PROFILE     profilo creato con "xcrun notarytool store-credentials"
#     APPLE_ID + APPLE_TEAM_ID + APPLE_APP_PASSWORD   (password specifica per app)
# Senza queste variabili il pacchetto NON e' firmato: Gatekeeper al primo avvio chiede
# clic destro > Apri (o Impostazioni > Privacy e sicurezza > "Apri comunque"), oppure si
# installa da terminale con: sudo installer -pkg <file>.pkg -target /
# =============================================================================
set -euo pipefail

VERSIONE=""
SKIP_MAVEN=0
while [ $# -gt 0 ]; do
    case "$1" in
        --version) VERSIONE="${2:?manca il valore di --version}"; shift 2 ;;
        --skip-maven) SKIP_MAVEN=1; shift ;;
        *) echo "Opzione sconosciuta: $1" >&2; exit 2 ;;
    esac
done

QUI="$(cd "$(dirname "$0")" && pwd)"
RADICE="$(cd "$QUI/../.." && pwd)"
TARGET="$RADICE/target"
RUNTIME="$TARGET/runtime-mac"
STAGE="$TARGET/stage-mac"
USCITA="$TARGET/installer-mac"
ARCH="$(uname -m)"   # arm64 oppure x86_64

[ "$(uname -s)" = "Darwin" ] || { echo "Questo script va lanciato su macOS." >&2; exit 1; }

# --- Versione: dal pom (primo <version> dopo </parent>, senza -SNAPSHOT) ------
if [ -z "$VERSIONE" ]; then
    VERSIONE="$(sed -n '/<\/parent>/,$p' "$RADICE/pom.xml" | grep -m1 '<version>' | sed -E 's/.*<version>([^<]+)<\/version>.*/\1/; s/-SNAPSHOT$//')"
    [ -n "$VERSIONE" ] || { echo "Impossibile leggere la versione da pom.xml: usa --version." >&2; exit 1; }
    echo "  Versione (da pom.xml): $VERSIONE"
fi

# --- JDK 17 ------------------------------------------------------------------
if [ -z "${JAVA_HOME:-}" ]; then
    JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
fi
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/jlink" ] || [ ! -d "$JAVA_HOME/jmods" ]; then
    echo "JDK 17 con jlink e jmods non trovato: imposta JAVA_HOME." >&2
    exit 1
fi

FIRMA_APP="${APPLE_SIGN_IDENTITY:-}"
FIRMA_PKG="${APPLE_INSTALLER_IDENTITY:-}"

echo "=============================================="
echo " Contabilita per macOS - build $VERSIONE ($ARCH)"
echo "=============================================="
echo "  JDK    : $JAVA_HOME"
echo "  Firma  : app=${FIRMA_APP:-no} pkg=${FIRMA_PKG:-no}"

# --- 1. Maven ------------------------------------------------------------------
if [ "$SKIP_MAVEN" -eq 1 ]; then
    echo "[1/4] Maven saltato (--skip-maven)"
else
    echo "[1/4] Maven clean package"
    (cd "$RADICE" && mvn clean package -DskipTests -B)
fi
JAR="$TARGET/contabilita-$VERSIONE.jar"
[ -f "$JAR" ] || { echo "Jar non trovato: $JAR (esegui Maven senza --skip-maven)." >&2; exit 1; }

# --- 2. Immagine jlink (stessi moduli della versione Windows) -------------------
echo "[2/4] Immagine jlink"
rm -rf "$RUNTIME"
"$JAVA_HOME/bin/jlink" \
    --module-path "$JAVA_HOME/jmods" \
    --add-modules java.base,java.logging,java.sql,java.naming,java.xml,java.management,java.instrument,java.desktop,java.security.jgss,java.net.http,jdk.unsupported,jdk.crypto.ec,jdk.charsets,jdk.zipfs \
    --strip-debug --no-man-pages --no-header-files --compress=2 \
    --output "$RUNTIME"

# --- 3. Albero dei file da installare -----------------------------------------
echo "[3/4] Albero del pacchetto"
rm -rf "$STAGE"
APP="$STAGE/Applications/Contabilita.app"
RISORSE="$APP/Contents/Resources"
mkdir -p "$APP/Contents/MacOS" "$RISORSE/app" "$STAGE/Library/LaunchDaemons" "$STAGE/Library/LaunchAgents"

cp "$JAR" "$RISORSE/app/contabilita.jar"
cp -R "$RUNTIME" "$RISORSE/runtime"
cp "$QUI/uninstall.sh" "$RISORSE/uninstall.sh"
cp "$QUI/app/Contabilita" "$APP/Contents/MacOS/Contabilita"
sed "s/@VERSIONE@/$VERSIONE/g" "$QUI/app/Info.plist" > "$APP/Contents/Info.plist"
cp "$QUI/launchd/it.contabilita.servizio.plist" "$STAGE/Library/LaunchDaemons/"
cp "$QUI/launchd/it.contabilita.avvio.plist" "$STAGE/Library/LaunchAgents/"
chmod 755 "$APP/Contents/MacOS/Contabilita" "$RISORSE/uninstall.sh"

# Icona: installer/mac/contabilita-1024.png (si rigenera da installer/icona-sorgente.svg).
# Se manca, l'app usa l'icona generica di macOS; con il PNG si costruisce l'iconset standard.
if [ -f "$QUI/contabilita-1024.png" ]; then
    ICONSET="$TARGET/contabilita.iconset"
    rm -rf "$ICONSET"; mkdir -p "$ICONSET"
    for d in 16 32 64 128 256 512; do
        sips -z "$d" "$d" "$QUI/contabilita-1024.png" --out "$ICONSET/icon_${d}x${d}.png" >/dev/null
        sips -z "$((d*2))" "$((d*2))" "$QUI/contabilita-1024.png" --out "$ICONSET/icon_${d}x${d}@2x.png" >/dev/null
    done
    iconutil -c icns "$ICONSET" -o "$RISORSE/contabilita.icns"
else
    echo "  ATTENZIONE: $QUI/contabilita-1024.png non trovato: icona generica (rigenerala da installer/icona-sorgente.svg)."
fi

# Firma (facoltativa): ogni binario Mach-O del runtime con "hardened runtime", poi l'app.
# La JVM ha bisogno di poter creare codice in memoria: entitlement allow-jit / unsigned memory.
if [ -n "$FIRMA_APP" ]; then
    echo "  Firma dell'app con: $FIRMA_APP"
    ENT="$TARGET/entitlements-mac.plist"
    cat > "$ENT" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
</dict></plist>
PLIST
    while IFS= read -r f; do
        if file "$f" | grep -q "Mach-O"; then
            codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$FIRMA_APP" "$f"
        fi
    done < <(find "$RISORSE/runtime" -type f)
    codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$FIRMA_APP" "$APP"
fi

# --- 4. Pacchetto ---------------------------------------------------------------
echo "[4/4] pkgbuild + productbuild"
mkdir -p "$USCITA"
COMPONENTE="$USCITA/componente.pkg"
FINALE="$USCITA/Contabilita-$VERSIONE-$ARCH.pkg"
chmod 755 "$QUI/scripts/preinstall" "$QUI/scripts/postinstall"
# Senza questo l'Installer considera l'app "ricollocabile" e, se ne trova una copia altrove
# (es. la cartella stage di questa build), aggiorna quella invece di installare in /Applications.
COMPONENTI="$USCITA/componenti.plist"
pkgbuild --analyze --root "$STAGE" "$COMPONENTI" >/dev/null
/usr/libexec/PlistBuddy -c "Set :0:BundleIsRelocatable false" "$COMPONENTI"
pkgbuild --root "$STAGE" \
    --component-plist "$COMPONENTI" \
    --identifier it.contabilita.pkg \
    --version "$VERSIONE" \
    --install-location / \
    --ownership recommended \
    --scripts "$QUI/scripts" \
    "$COMPONENTE"
if [ -n "$FIRMA_PKG" ]; then
    productbuild --package "$COMPONENTE" --sign "$FIRMA_PKG" --timestamp "$FINALE"
else
    productbuild --package "$COMPONENTE" "$FINALE"
fi
rm -f "$COMPONENTE" "$COMPONENTI"

# Notarizzazione (facoltativa): solo con il .pkg firmato.
if [ -n "$FIRMA_PKG" ] && { [ -n "${APPLE_NOTARY_PROFILE:-}" ] || [ -n "${APPLE_ID:-}" ]; }; then
    echo "  Notarizzazione..."
    if [ -n "${APPLE_NOTARY_PROFILE:-}" ]; then
        xcrun notarytool submit "$FINALE" --keychain-profile "$APPLE_NOTARY_PROFILE" --wait
    else
        xcrun notarytool submit "$FINALE" --apple-id "$APPLE_ID" --team-id "${APPLE_TEAM_ID:?manca APPLE_TEAM_ID}" \
            --password "${APPLE_APP_PASSWORD:?manca APPLE_APP_PASSWORD}" --wait
    fi
    xcrun stapler staple "$FINALE"
fi

echo ""
echo "=============================================="
echo " BUILD COMPLETATA"
echo "=============================================="
echo "  Installer : $FINALE"
echo "  Dimensione: $(du -h "$FINALE" | cut -f1)"
echo ""
if [ -z "$FIRMA_PKG" ]; then
    echo "  Non firmato: doppio clic poi clic destro > Apri, oppure"
fi
echo "  sudo installer -pkg \"$FINALE\" -target /"
