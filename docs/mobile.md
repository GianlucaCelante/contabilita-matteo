# Uso da telefono: inventario e decisioni

Gli accorgimenti per il telefono sono stati importati dal progetto gemello `etichette` (versione 5f8799f), adattandoli. Questo documento elenca blocco per blocco cosa c'era nel gemello, cosa c'era già qui e cosa si è deciso.

## Soglie

- **Telefono = meno di 1024 px** (`md` di Tailwind, ridefinito in `ui/src/index.css`: `--breakpoint-md: 64rem`; all'inizio era 768 px). Vale anche per il tablet in verticale. Il gemello usa 860 px. Le classi `md:` / `max-md:` dell'interfaccia seguono questa soglia; nel resto del codice compare come `(max-width: 1023.98px)` (CSS e `useTastieraVirtuale`) e `(min-width: 1024px)` (`useSchermoGrande`, CSS).
- **Zoom automatico su PC piccoli: da 1024 px in su**, cioè solo col layout da computer, a tre scalini (`ui/src/index.css`, regole `html { zoom }`); per ognuno basta una delle due misure, e vince lo scalino più piccolo: `0.92` con la larghezza fino a 1366 px o l'altezza fino a 760 px; `0.84` fino a 1180 px o 680 px; `0.76` con l'altezza fino a 600 px (non ha più una larghezza: era «fino a 1000 px», sotto la soglia). Sopra i 1366 px di larghezza con più di 760 px di altezza, e sotto i 1024 px di larghezza, niente zoom.
- **Perché 1024 e non più 861.** Nel gemello lo zoom parte da 861 px perché lì il layout da computer parte da 861 px: la regola del cliente è «il computer piccolo si rimpicciolisce, il telefono non si tocca». Qui il layout da computer parte da 1024 px, e con la soglia a 861 px fra 861 e 1023 px si rimpiccioliva il layout **da telefono** (`0.76` fino a 1000 px, `0.84` fino a 1023 px): bersagli da 44 px ridotti a 33-37 px, campi da 16-17 px a 12-14 px, senza guadagnare niente, perché quel layout è a una colonna e a 900 px lo spazio non manca. Capitava a: una finestra del computer stretta (mezzo schermo di un 1920 px = 960 px), un tablet fra 861 e 1023 px (iPad da 768, 820 e 834 px in verticale erano già sotto la soglia e non cambiano), e un telefono in orizzontale (932×430: zoom `0.76` per larghezza e per altezza). Da 1024 px in su non cambia niente (iPad Pro da 1024 px in verticale: layout da computer a `0.84`, come prima). Verifica: `ui/src/zoomPagina.test.ts` (ogni regola dello zoom parte da 1024 px).

## Inventario

| Blocco | Dove nel gemello | Stato qui | Decisione e dove importato |
|---|---|---|---|
| `viewport` con `interactive-widget=resizes-content` | `ui/index.html` | presente | Già uguale in `ui/index.html`. |
| `theme-color`, `mobile-web-app-capable`, `robots` | `ui/index.html` | presente | Già presenti. |
| `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` | `ui/index.html` | assente | Importati in `ui/index.html`; icona PNG 180 px in `ui/public/apple-touch-icon.png` (disegnata dal marchio `icona.svg`). |
| Manifest con icone PNG | `ui/public/manifest.webmanifest`, `icone/` | parziale (solo SVG) | Aggiunte `icona-192.png`, `icona-512.png`, `icona-512-maskable.png` in `ui/public/` e nel manifest. |
| Token di densità `--d-*` e `--d-vh` con `@supports (height: 1dvh)` | `index.css` ≈ 93–192 | assente | **Importato in versione ridotta** in `index.css` (`:root`): `--d-vh` (dvh dove c'è), `--d-nav` (voce della barra in basso 62/54/50 px) e `--d-barra` (pulsanti della barra fissa 56/52/48 px) per altezza ≤ 700 e ≤ 600 px, solo sotto i 1024 px. A schermo alto i valori sono quelli del mockup. **Non importata** la scala completa (`--d-btn`, `--d-campo`, `--d-riga`, `--d-gap`…): nomi e misure sono del gemello, qui le schermate sono quelle del mockup. I bersagli restano ≥ 44 px. `--d-vh` è usato in `RipristinaDaCopia.tsx` (era `50vh`); la barra in basso (`Guscio.tsx`) e il «+» tondo seguono `--d-nav`. |
| `html`/`body` con `height:100%; overflow:hidden; overscroll-behavior:none`, `text-size-adjust` | `index.css` ≈ 205–221 | parziale (altezza e `text-size-adjust` sì, niente `overflow:hidden`) | Importato in `index.css` (`html`). Il documento non scorre mai: scorre il `<main>` del Guscio (già `overflow-y-auto` in un contenitore `fixed inset-0`) e le finestre. Verificato che ogni schermata resti scorrevole (vedi sotto). |
| Zoom della pagina su PC a scaglioni | `index.css` ≈ 217–220 | assente | Importato in `index.css`, con la soglia spostata al layout da computer di qui: `html { zoom: .92 / .84 / .76 }` per `min-width: 1024px` con larghezza ≤ 1366 / 1180 px o altezza ≤ 760 / 680 / 600 px (nel gemello `min-width: 861px` e un terzo scalino anche per larghezza ≤ 1000 px). Sopra i 1366 px (e ≥ 761 px di altezza) l'app resta a dimensione piena; sotto i 1024 px niente zoom (vedi «Soglie»). |
| Barre di scorrimento sottili (PC) e nascoste (telefono) | `.scorre`, `.corpoLente`, `.schermo`… | assente | Importato in modo generale in `index.css`: `* { scrollbar-width: thin; scrollbar-color: bordo2 transparent }` e `scrollbar-width: none` sotto i 1024 px. Si applica a ogni contenitore che scorre (`<main>`, finestre, elenchi, lente). Il gemello usa classi a mano e `::-webkit-scrollbar`; qui bastano le proprietà standard. |
| `overscroll-behavior: contain` dei contenitori | `.scorre`, `.schermo`, `.corpoLente` | assente | Importato in `index.css` per `main`, `.finestra`, `[role="listbox"]`. |
| Tocco senza selezione (`-webkit-touch-callout: none; user-select: none`, eccezione per i campi) | `.blocco.telefono` ≈ 661–664 | assente | Importato sotto i 1024 px su `button, a, [role=radio], [role=switch], summary`; i campi di testo restano selezionabili. (Nel gemello era pensato per i blocchi trascinabili; qui serve a non selezionare il testo dei pulsanti con la pressione lunga. Le immagini non sono toccate.) |
| Campi a 17 px: sopra i 16 px iOS non zooma al fuoco | `index.css` ≈ 761, 1380 | parziale (`.campo` già a 17 px; la ricerca di Movimenti a 16 px) | Aggiunta in `index.css`, sotto i 1024 px, `input, select, textarea { font-size: max(16px, 1em) }`: nessun campo scende sotto i 16 px. Le misure delle schermate non cambiano. |
| Foglio inferiore (bottom sheet) | `.foglioBlocchi`, `FoglioAggiungiBlocco.tsx` ≈ 743–757 | assente | **Non importato**: nel gemello serve solo per «Aggiungi un blocco» (funzione che qui non esiste); le finestre di questo progetto sono finestre centrate come nel mockup approvato e restano tali (nessuna `Finestra` di conferma o scelta passa a foglio). Importata solo la parte utile: area sicura nel velo (vedi sotto). |
| Area sicura `env(safe-area-inset-*)` | `.velo.veloLente` ≈ 1558–1561, `.foglioBlocchi` | parziale (barra in basso e barra Annulla/Salva sì) | Aggiunta al `.velo` di tutte le finestre sotto i 1024 px (`index.css`): mai sotto la tacca o la barra dei gesti. |
| Lente con pizzico: `.corpoLente { overflow:auto; touch-action: pan-x pan-y pinch-zoom }`, `cursor: zoom-in` | `LenteEtichetta.tsx`, `index.css` ≈ 1224–1238 | assente | **Importato come `LenteImmagine.tsx`** (generico, adattato): vedi sezione «Lente delle foto». |
| `useTastieraVirtuale.ts` | `hooks/` | assente | Importato (adattato): `hooks/useTastieraVirtuale.ts`, montato in `Guscio.tsx`. La logica pura (soglia, apertura, altezza) è in `util/tastiera.ts` con test. |
| `useBarreFisse.ts` | `hooks/` | assente | Importato (adattato): `hooks/useBarreFisse.ts`, montato in `Guscio.tsx`. Misura le barre marcate `data-barra-fissa` (Annulla/Salva, totali di Movimenti) e scrive `--h-barra-basso`, letto da `scroll-padding-bottom` del `<main>` e dal «+» tondo, che sale di quell'altezza per non coprire la barra (`Guscio.tsx`; le barre stesse sono osservate con un `ResizeObserver`). Niente variabile `--h-barra-alto`/`--h-testata`: qui non ci sono barre ancorate in alto. |
| `scorriInVista.ts` | `hooks/` | assente | Importato (adattato): `hooks/scorriInVista.ts`; tiene conto del visual viewport e delle barre `data-barra-fissa`. È usato dalla tastiera virtuale per portare il campo a fuoco in vista. |
| `useTestata.ts`, `contestoTestata.ts` | `hooks/`, `componenti/` | non applicabile | **Non importati**: portali verso la testata condivisa del gemello. Qui `Testata.tsx` è un componente per schermata. |
| `useLarghezzaElemento.ts` | `hooks/` | non applicabile | **Non importato**: serve all'anteprima dell'etichetta. La lente misura la sua area con un `ResizeObserver` in `LenteImmagine.tsx`. |
| `Guscio.tsx` (barre fisse, tastiera, meta viewport) | `componenti/` | parziale | Adattato: classi `guscio`, `barraNavigazione`, `pulsanteNuovo`; con la tastiera aperta il guscio prende altezza e posizione dell'area visibile, la barra di navigazione e il «+» tondo spariscono. |
| `Finestra.tsx` sul telefono | `componenti/` | presente (finestra centrata) | Invariata, più la variante `intera` (a tutto schermo) per la lente. |
| `sensoriRiordino.ts` | `componenti/` | non applicabile | **Non importato**: sensori touch del trascinamento (dnd-kit), qui assente. |
| `matchMedia`, `visualViewport`, `.telefono`, `pointer: coarse`, `hover: none` altrove | `Etichette.tsx`, `Stampa.tsx`, `CampiComuni.tsx`, `RigaBloccoTelefono.tsx` | non applicabile | Cambi di layout propri delle schermate del gemello. Qui il cambio computer/telefono lo fanno `md:` e `useSchermoGrande`. `pointer: coarse` era già usato da `CampoAllegato.tsx` («Scatta»). |

## Tastiera virtuale e barra Annulla/Salva

- Chrome Android (con `interactive-widget=resizes-content`) restringe il viewport di layout; Safari iOS no, restringe solo il visual viewport. Per non dipendere dal browser si legge sempre `visualViewport`.
- Con un campo di testo a fuoco e un viewport visibile più basso di almeno 120 px del solito, sotto i 1024 px, il `<html>` riceve `data-tastiera` e le variabili `--vv-top`, `--vv-h`, `--sotto-tastiera`.
- Il guscio (`.guscio`) e il velo delle finestre prendono posizione e altezza dell'area visibile; la barra di navigazione e il «+» tondo spariscono.
- La barra fissa Annulla/Salva (`data-barra-fissa`, `fixed`) usa `bottom: var(--sotto-tastiera)`: resta visibile sopra la tastiera (su iOS, dove il viewport di layout non si restringe, sale della parte coperta; su Chrome la variabile vale 0 e segue il viewport).
- Con la tastiera chiusa la stessa barra copre la barra di navigazione: finché la copre, la barra di navigazione è `visibility: hidden` (`html[data-navigazione-coperta]`, scritto da `useBarreFisse` con `navigazioneCoperta` di `util/barreFisse.ts`), così le voci coperte non restano bersagli invisibili per dito, Tab e lettore di schermo.
- Il campo a fuoco viene portato al centro dell'area libera (sopra la tastiera e sopra la barra) con `scorriInVista`; in più `scroll-padding-bottom` del `<main>` (`--h-barra-basso`) tiene sopra la barra anche lo spostamento automatico del browser.
- Sui PC (≥ 1024 px) il meccanismo non fa niente.

## Lente delle foto

- Toccando o cliccando la miniatura di un allegato immagine (scheda «Allegato» del Dettaglio, `SchedaAllegato.tsx`; anteprima prima del salvataggio, `CampoAllegato.tsx`) si apre la foto a tutto schermo (`LenteImmagine.tsx`, finestra `intera` di `Finestra.tsx`: focus dentro la finestra, Esc chiude, il fuoco torna a chi l'ha aperta).
- Il contenitore scorre in tutte le direzioni con `touch-action: pan-x pan-y pinch-zoom` (Chrome lo mostra come `manipulation`, che è lo stesso valore). Sul telefono si ingrandisce col pizzico (lo fa il browser).
- Su PC: pulsanti «−», «Adatta», «+» (zoom a scatti 100, 150, 200, 300, 400, 500%), Ctrl + rotella e tasti `+`, `-`, `0` con il fuoco sull'area. Il punto al centro resta al centro quando si cambia zoom.
- «Chiudi» è alto 48 px (`aria-label` «Chiudi la foto»); i pulsanti dello zoom 48 px. I PDF restano col link «Apri».
- La logica pura (passi, limiti, misura adattata) è in `util/zoomLente.ts`, con test.

## Verifica

Test automatici: `util/tastiera.test.ts`, `util/zoomLente.test.ts` (`npm run test`).

Soglia dello zoom a 1024 px (novembre 2026), con Chromium headless sulla demo: zoom 1, layout da telefono e nessuno scorrimento orizzontale a 860×700, 861×700, 861×1000, 900×800, 932×430, 1000×590, 1000×700 e 1023×768; layout da computer con zoom `0.84` a 1024×768 e 1180×800, `0.92` a 1181×800, 1280×800, 1366×768 e 1367×760, `0.76` a 1024×590 e 1100×590, `0.84` a 1440×680, 1 a 1440×900.

A vista in Chrome, prima dello spostamento della soglia (iframe a 390, 768, 860/861, 1000, 1180, 1366, 1440 px): scaglioni dello zoom (`getComputedStyle(html).zoom`), barre di scorrimento, apertura e chiusura della lente, passi di zoom, schermate scorrevoli a 390×844, 390×500, 1440×871, 1180×700 e 1000×590, tastiera simulata restringendo l'iframe. Non verificabili con Chrome da computer: il pizzico vero, la tastiera virtuale di iOS Safari e di Chrome Android, l'area sicura su un telefono con incavo, l'aspetto dell'icona sulla schermata Home.

- **Titolo delle schermate a tab (Riepilogo, Movimenti, Esporta):** sul telefono non si vede, perché è già scritto nella barra in basso (resta per lo screen reader). Sul computer c'è come prima.
