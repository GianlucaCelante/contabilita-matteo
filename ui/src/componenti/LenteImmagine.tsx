import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ZOOM_ADATTA, ZOOM_MASSIMO, ZOOM_MINIMO, dimensioniAdatte, limitaZoom, passoMeno, passoPiu, zoomConRotella } from "../util/zoomLente";
import Finestra from "./Finestra";

interface ProprietaLente {
  titolo: string;
  src: string;
  onChiudi: () => void;
}

// Respiro interno dell'area che scorre (padding di ".corpoLente", index.css).
const RESPIRO_PX = 12;

// La foto di un allegato a tutto schermo (la «lente»), adattata da
// LenteEtichetta del progetto gemello «etichette». E' una `Finestra` comune
// (velo, Esc, focus che resta dentro e torna a chi l'ha aperta, titolo).
//  - Telefono: l'area scorre in tutte le direzioni e si ingrandisce col
//    pizzico (touch-action: pan-x pan-y pinch-zoom, lo fa il browser).
//  - Computer: pulsanti «+», «−» e «Adatta» (zoom a scatti), Ctrl + rotella e
//    i tasti + − 0 con il fuoco sull'area.
// A zoom 1 («Adatta») la foto sta intera nell'area; piu' in la scorre.
export default function LenteImmagine({ titolo, src, onChiudi }: ProprietaLente) {
  const rifArea = useRef<HTMLDivElement>(null);
  const rifImmagine = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(ZOOM_ADATTA);
  const rifZoom = useRef(zoom);
  const [area, setArea] = useState({ l: 0, a: 0 });
  const [foto, setFoto] = useState({ l: 0, a: 0 });
  const [errore, setErrore] = useState(false);
  // Il punto al centro dell'area prima di cambiare zoom (in frazione della
  // zona scorrevole), per tenerlo al centro dopo.
  const centro = useRef<{ x: number; y: number } | null>(null);

  const cambiaZoom = useCallback((nuovo: number) => {
    const z = limitaZoom(nuovo);
    if (z === rifZoom.current) return;
    const el = rifArea.current;
    if (el && el.scrollWidth > 0 && el.scrollHeight > 0) {
      centro.current = {
        x: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
        y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
      };
    }
    rifZoom.current = z;
    setZoom(z);
  }, []);

  // Dopo il nuovo disegno il punto che era al centro ci resta.
  useLayoutEffect(() => {
    const el = rifArea.current;
    const c = centro.current;
    centro.current = null;
    if (!el || !c) return;
    el.scrollLeft = c.x * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = c.y * el.scrollHeight - el.clientHeight / 2;
  }, [zoom]);

  // Misura dell'area utile, sempre aggiornata (finestra ridimensionata, telefono ruotato).
  useEffect(() => {
    const el = rifArea.current;
    if (!el) return;
    const leggi = () => setArea({ l: el.clientWidth - 2 * RESPIRO_PX, a: el.clientHeight - 2 * RESPIRO_PX });
    leggi();
    const osservatore = new ResizeObserver(leggi);
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, []);

  // Ctrl + rotella (e il pizzico sul trackpad, che il browser manda cosi'):
  // ingrandisce la foto invece della pagina. Ascoltatore nativo non passivo,
  // perche' serve preventDefault.
  useEffect(() => {
    const el = rifArea.current;
    if (!el) return;
    function suRotella(evento: WheelEvent) {
      if (!evento.ctrlKey) return;
      evento.preventDefault();
      cambiaZoom(zoomConRotella(rifZoom.current, evento.deltaY));
    }
    // I tasti + − 0 con il fuoco sull'area (le frecce le gestisce il browser: scorre).
    function suTasto(evento: KeyboardEvent) {
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      if (evento.key === "+" || evento.key === "=") cambiaZoom(passoPiu(rifZoom.current));
      else if (evento.key === "-") cambiaZoom(passoMeno(rifZoom.current));
      else if (evento.key === "0") cambiaZoom(ZOOM_ADATTA);
      else return;
      evento.preventDefault();
    }
    el.addEventListener("wheel", suRotella, { passive: false });
    el.addEventListener("keydown", suTasto);
    return () => {
      el.removeEventListener("wheel", suRotella);
      el.removeEventListener("keydown", suTasto);
    };
  }, [cambiaZoom]);

  // Una foto gia' in cache puo' essere pronta prima che React ascolti onLoad.
  useEffect(() => {
    const img = rifImmagine.current;
    if (img?.complete && img.naturalWidth > 0) setFoto({ l: img.naturalWidth, a: img.naturalHeight });
  }, []);

  const misure = dimensioniAdatte({ areaL: area.l, areaA: area.a, fotoL: foto.l, fotoA: foto.a, zoom });
  const pronta = misure.larghezza > 0;
  const percentuale = Math.round(zoom * 100);

  return (
    <Finestra
      intera
      titolo={titolo}
      onChiudi={onChiudi}
      piede={
        <>
          {/* Su PC i pulsanti dello zoom; sul telefono basta il pizzico. */}
          <div className="mr-auto flex items-center gap-2 max-md:hidden" role="group" aria-label="Ingrandimento">
            <button type="button" className="btn min-w-12 px-0 text-[20px]" aria-label="Riduci" disabled={zoom <= ZOOM_MINIMO} onClick={() => cambiaZoom(passoMeno(zoom))}>
              <span aria-hidden="true">−</span>
            </button>
            <button type="button" className="btn" aria-label="Adatta alla finestra" disabled={zoom === ZOOM_ADATTA} onClick={() => cambiaZoom(ZOOM_ADATTA)}>
              Adatta
            </button>
            <button type="button" className="btn min-w-12 px-0 text-[20px]" aria-label="Ingrandisci" disabled={zoom >= ZOOM_MASSIMO} onClick={() => cambiaZoom(passoPiu(zoom))}>
              <span aria-hidden="true">+</span>
            </button>
            <span className="num min-w-12 text-[14px] text-tenue" aria-live="polite" aria-label={`Ingrandimento ${percentuale} per cento`}>
              {percentuale}%
            </span>
          </div>
          <button type="button" className="btn" data-focus-iniziale aria-label="Chiudi la foto" onClick={onChiudi}>
            Chiudi
          </button>
        </>
      }
    >
      <div
        ref={rifArea}
        className="corpoLente"
        role="region"
        aria-label="Foto ingrandita: scorre se è più grande della finestra"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- regione scorrevole: senza il fuoco la tastiera non la scorre
        tabIndex={0}
      >
        {errore && <p className="m-auto text-[16px] font-bold text-rosso">Non riesco a mostrare la foto.</p>}
        {!errore && !pronta && <p className="m-auto text-[15px] text-tenue">Carico la foto…</p>}
        {!errore && (
          <img
            ref={rifImmagine}
            src={src}
            alt={titolo}
            draggable={false}
            className={"m-auto block max-w-none shrink-0 bg-white shadow-[0_6px_20px_rgba(88,68,60,.14)]" + (pronta ? "" : " absolute opacity-0")}
            style={pronta ? { width: misure.larghezza, height: misure.altezza } : { width: 1, height: 1 }}
            onLoad={(e) => setFoto({ l: e.currentTarget.naturalWidth, a: e.currentTarget.naturalHeight })}
            onError={() => setErrore(true)}
          />
        )}
      </div>
      <p className="m-0 text-[13px] text-tenue">
        <span className="md:hidden">Pizzica con due dita per ingrandire, trascina per spostare.</span>
        <span className="max-md:hidden">
          Ingrandisci con + e −, oppure Ctrl e rotella (da {ZOOM_MINIMO * 100}% a {ZOOM_MASSIMO * 100}%); trascina o usa le frecce per spostare.
        </span>
      </p>
    </Finestra>
  );
}
