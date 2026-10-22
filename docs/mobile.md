# Uso da telefono: inventario e decisioni

Gli accorgimenti per il telefono sono stati importati dal progetto gemello `etichette` (versione 5f8799f), adattandoli. Questo documento elenca blocco per blocco cosa c'era nel gemello, cosa c'era già qui e cosa si è deciso.

## Soglie

- **Telefono = meno di 768 px** (`md` di Tailwind). Il gemello usa 860 px: qui si è tenuto 768 perché le classi `max-md:` dell'interfaccia (allineate al mockup approvato) non cambiano. Nel codice la soglia compare come `(max-width: 767.98px)` (CSS e `useTastieraVirtuale`).
- **Zoom automatico su PC piccoli: da 861 px in su**, come nel gemello (decisione del cliente). Fra 768 e 860 px (tablet in verticale) l'interfaccia resta a dimensione piena e col layout «computer»; sotto i 768 px niente zoom.

## Inventario

| Blocco | Dove nel gemello | Stato qui | Decisione e dove importato |
|---|---|---|---|
| `viewport` con `interactive-widget=resizes-content` | `ui/index.html` | presente | Già uguale in `ui/index.html`. |
| `theme-color`, `mobile-web-app-capable`, `robots` | `ui/index.html` | presente | Già presenti. |
| `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` | `ui/index.html` | assente | Importati in `ui/index.html`; icona PNG 180 px in `ui/public/apple-touch-icon.png` (disegnata dal marchio `icona.svg`). |
| Manifest con icone PNG | `ui/public/manifest.webmanifest`, `icone/` | parziale (solo SVG) | Aggiunte `icona-192.png`, `icona-512.png`, `icona-512-maskable.png` in `ui/public/` e nel manifest. |
| Token di densità `--d-*` e `--d-vh` con `@supports (height: 1dvh)` | `index.css` ≈ 93–192 | assente | **Importato in versione ridotta** in `index.css` (`:root`): `--d-vh` (dvh dove c'è), `--d-nav` (voce della barra in basso 62/54/50 px) e `--d-barra` (pulsanti della barra fissa 56/52/48 px) per altezza ≤ 700 e ≤ 600 px, solo sotto i 768 px. A schermo alto i valori sono quelli del mockup. **Non importata** la scala completa (`--d-btn`, `--d-campo`, `--d-riga`, `--d-gap`…): nomi e misure sono del gemello, qui le schermate sono quelle del mockup. I bersagli restano ≥ 44 px. `--d-vh` è usato in `RipristinaDaCopia.tsx` (era `50vh`); la barra in basso (`Guscio.tsx`) e il «+» tondo seguono `--d-nav`. |
| `html`/`body` con `height:100%; overflow:hidden; overscroll-behavior:none`, `text-size-adjust` | `index.css` ≈ 205–221 | parziale (altezza e `text-size-adjust` sì, niente `overflow:hidden`) | Importato in `index.css` (`html`). Il documento non scorre mai: scorre il `<main>` del Guscio (già `overflow-y-auto` in un contenitore `fixed inset-0`) e le finestre. Verificato che ogni schermata resti scorrevole (vedi sotto). |
| Zoom della pagina su PC a scaglioni | `index.css` ≈ 217–220 | assente | Importato in `index.css`: `html { zoom: .92 / .84 / .76 }` per `min-width: 861px` con larghezza ≤ 1366 / 1180 / 1000 px o altezza ≤ 760 / 680 / 600 px. Sopra i 1366 px (e ≥ 761 px di altezza) l'app resta a dimensione piena. |
| Barre di scorrimento sottili (PC) e nascoste (telefono) | `.scorre`, `.corpoLente`, `.schermo`… | assente | Importato in modo generale in `index.css`: `* { scrollbar-width: thin; scrollbar-color: bordo2 transparent }` e `scrollbar-width: none` sotto i 768 px. Si applica a ogni contenitore che scorre (`<main>`, finestre, elenchi, lente). Il gemello usa classi a mano e `::-webkit-scrollbar`; qui bastano le proprietà standard. |
| `overscroll-behavior: contain` dei contenitori | `.scorre`, `.schermo`, `.corpoLente` | assente | Importato in `index.css` per `main`, `.finestra`, `[role="listbox"]`. |
| Tocco senza selezione (`-webkit-touch-callout: none; user-select: none`, eccezione per i campi) | `.blocco.telefono` ≈ 661–664 | assente | Importato sotto i 768 px su `button, a, [role=radio], [role=switch], summary`; i campi di testo restano selezionabili. (Nel gemello era pensato per i blocchi trascinabili; qui serve a non selezionare il testo dei pulsanti con la pressione lunga. Le immagini non sono toccate.) |
| Campi a 17 px: sopra i 16 px iOS non zooma al fuoco | `index.css` ≈ 761, 1380 | parziale (`.campo` già a 17 px; la ricerca di Movimenti a 16 px) | Aggiunta in `index.css`, sotto i 768 px, `input, select, textarea { font-size: max(16px, 1em) }`: nessun campo scende sotto i 16 px. Le misure delle schermate non cambiano. |
| Foglio inferiore (bottom sheet) | `.foglioBlocchi`, `FoglioAggiungiBlocco.tsx` ≈ 743–757 | assente | **Non importato**: nel gemello serve solo per «Aggiungi un blocco» (funzione che qui non esiste); le finestre di questo progetto sono finestre centrate come nel mockup approvato e restano tali (nessuna `Finestra` di conferma o scelta passa a foglio). Importata solo la parte utile: area sicura nel velo (vedi sotto). |
| Area sicura `env(safe-area-inset-*)` | `.velo.veloLente` ≈ 1558–1561, `.foglioBlocchi` | parziale (barra in basso e barra Annulla/Salva sì) | Aggiunta al `.velo` di tutte le finestre sotto i 768 px (`index.css`): mai sotto la tacca o la barra dei gesti. |
| Lente con pizzico: `.corpoLente { overflow:auto; touch-action: pan-x pan-y pinch-zoom }`, `cursor: zoom-in` | `LenteEtichetta.tsx`, `index.css` ≈ 1224–1238 | assente | **Importato come `LenteImmagine.tsx`** (generico, adattato): vedi sezione «Lente delle foto». |
| `useTastieraVirtuale.ts` | `hooks/` | assente | Importato (adattato): `hooks/useTastieraVirtuale.ts`, montato in `Guscio.tsx`. La logica pura (soglia, apertura, altezza) è in `util/tastiera.ts` con test. |
| `useBarreFisse.ts` | `hooks/` | assente | Importato (adattato): `hooks/useBarreFisse.ts`, montato in `Guscio.tsx`. Misura le barre marcate `data-barra-fissa` (Annulla/Salva, totali di Movimenti) e scrive `--h-barra-basso`, letto da `scroll-padding-bottom` del `<main>`. Niente variabile `--h-barra-alto`/`--h-testata`: qui non ci sono barre ancorate in alto. |
| `scorriInVista.ts` | `hooks/` | assente | Importato (adattato): `hooks/scorriInVista.ts`; tiene conto del visual viewport e delle barre `data-barra-fissa`. È usato dalla tastiera virtuale per portare il campo a fuoco in vista. |
| `useTestata.ts`, `contestoTestata.ts` | `hooks/`, `componenti/` | non applicabile | **Non importati**: portali verso la testata condivisa del gemello. Qui `Testata.tsx` è un componente per schermata. |
| `useLarghezzaElemento.ts` | `hooks/` | non applicabile | **Non importato**: serve all'anteprima dell'etichetta. La lente misura la sua area con un `ResizeObserver` in `LenteImmagine.tsx`. |
| `Guscio.tsx` (barre fisse, tastiera, meta viewport) | `componenti/` | parziale | Adattato: classi `guscio`, `barraNavigazione`, `pulsanteNuovo`; con la tastiera aperta il guscio prende altezza e posizione dell'area visibile, la barra di navigazione e il «+» tondo spariscono. |
| `Finestra.tsx` sul telefono | `componenti/` | presente (finestra centrata) | Invariata, più la variante `intera` (a tutto schermo) per la lente. |
| `sensoriRiordino.ts` | `componenti/` | non applicabile | **Non importato**: sensori touch del trascinamento (dnd-kit), qui assente. |
| `matchMedia`, `visualViewport`, `.telefono`, `pointer: coarse`, `hover: none` altrove | `Etichette.tsx`, `Stampa.tsx`, `CampiComuni.tsx`, `RigaBloccoTelefono.tsx` | non applicabile | Cambi di layout propri delle schermate del gemello. Qui il cambio computer/telefono lo fanno `md:` e `useSchermoGrande`. `pointer: coarse` era già usato da `CampoAllegato.tsx` («Scatta»). |

## Tastiera virtuale e barra Annulla/Salva

- Chrome Android (con `interactive-widget=resizes-content`) restringe il viewport di layout; Safari iOS no, restringe solo il visual viewport. Per non dipendere dal browser si legge sempre `visualViewport`.
- Con un campo di testo a fuoco e un viewport visibile più basso di almeno 120 px del solito, sotto i 768 px, il `<html>` riceve `data-tastiera` e le variabili `--vv-top`, `--vv-h`, `--sotto-tastiera`.
- Il guscio (`.guscio`) e il velo delle finestre prendono posizione e altezza dell'area visibile; la barra di navigazione e il «+» tondo spariscono.
- La barra fissa Annulla/Salva (`data-barra-fissa`, `fixed`) usa `bottom: var(--sotto-tastiera)`: resta visibile sopra la tastiera (su iOS, dove il viewport di layout non si restringe, sale della parte coperta; su Chrome la variabile vale 0 e segue il viewport).
- Il campo a fuoco viene portato al centro dell'area libera (sopra la tastiera e sopra la barra) con `scorriInVista`; in più `scroll-padding-bottom` del `<main>` (`--h-barra-basso`) tiene sopra la barra anche lo spostamento automatico del browser.
- Sui PC (≥ 768 px) il meccanismo non fa niente.

## Lente delle foto

- Toccando o cliccando la miniatura di un allegato immagine (scheda «Allegato» del Dettaglio, `SchedaAllegato.tsx`; anteprima prima del salvataggio, `CampoAllegato.tsx`) si apre la foto a tutto schermo (`LenteImmagine.tsx`, finestra `intera` di `Finestra.tsx`: focus dentro la finestra, Esc chiude, il fuoco torna a chi l'ha aperta).
- Il contenitore scorre in tutte le direzioni con `touch-action: pan-x pan-y pinch-zoom` (Chrome lo mostra come `manipulation`, che è lo stesso valore). Sul telefono si ingrandisce col pizzico (lo fa il browser).
- Su PC: pulsanti «−», «Adatta», «+» (zoom a scatti 100, 150, 200, 300, 400, 500%), Ctrl + rotella e tasti `+`, `-`, `0` con il fuoco sull'area. Il punto al centro resta al centro quando si cambia zoom.
- «Chiudi» è alto 48 px (`aria-label` «Chiudi la foto»); i pulsanti dello zoom 48 px. I PDF restano col link «Apri».
- La logica pura (passi, limiti, misura adattata) è in `util/zoomLente.ts`, con test.

## Verifica

Test automatici: `util/tastiera.test.ts`, `util/zoomLente.test.ts` (`npm run test`).

A vista in Chrome (iframe a 390, 768, 860/861, 1000, 1180, 1366, 1440 px): scaglioni dello zoom (`getComputedStyle(html).zoom`), barre di scorrimento, apertura e chiusura della lente, passi di zoom, schermate scorrevoli a 390×844, 390×500, 1440×871, 1180×700 e 1000×590, tastiera simulata restringendo l'iframe. Non verificabili con Chrome da computer: il pizzico vero, la tastiera virtuale di iOS Safari e di Chrome Android, l'area sicura su un telefono con incavo, l'aspetto dell'icona sulla schermata Home.
