import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fermaAlPassaggio, fondoZona, postoAvviso, puntatoreMosso, SELETTORE_DA_AFFIANCARE, SELETTORE_DA_NON_COPRIRE, sopraIPulsanti, troppeRighe, type Posto } from "../util/avviso";
import { Contesto, type OpzioniAvviso } from "./contestoAvviso";
import { IconaAllarme, IconaVia } from "./Icone";

// Quanto resta un avviso: almeno 6 s (8 per gli errori), di piu' per i
// messaggi lunghi, mai oltre 15 s. Il fuoco dentro lo ferma; il mouse sopra
// anche, ma solo se ci entra dopo la comparsa (util/avviso.ts).
const DURATA_MINIMA_MS = 6000;
const DURATA_ERRORE_MINIMA_MS = 8000;
const DURATA_MASSIMA_MS = 15000;
const MS_PER_CARATTERE = 55;
const CARATTERI_GRATIS = 60;

function durataPer(testo: string, errore: boolean): number {
  const base = errore ? DURATA_ERRORE_MINIMA_MS : DURATA_MINIMA_MS;
  const extra = Math.max(0, testo.length - CARATTERI_GRATIS) * MS_PER_CARATTERE;
  return Math.min(DURATA_MASSIMA_MS, Math.max(base, DURATA_MINIMA_MS + extra));
}

interface AvvisoAttivo {
  id: number;
  testo: string;
  errore: boolean;
  alto: boolean;
}

// L'avviso temporaneo in basso. Un solo provider in cima all'app, richiamabile
// da ogni vista con useAvviso(). Le due regioni live (polite per le
// informazioni, alert per gli errori) sono sempre nel documento, anche vuote,
// perche' lo schermo parlante annunci quello che vi compare dentro.
export function ProviderAvviso({ children }: { children: ReactNode }) {
  const [attivo, setAttivo] = useState<AvvisoAttivo | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const contatore = useRef(0);
  const scadenza = useRef(0);
  const rimanente = useRef(0);

  const parti = useCallback((ms: number) => {
    window.clearTimeout(timer.current);
    scadenza.current = Date.now() + ms;
    timer.current = window.setTimeout(() => setAttivo(null), ms);
  }, []);

  const avvisa = useCallback(
    (testo: string, opzioni?: OpzioniAvviso) => {
      const errore = opzioni?.tipo === "errore";
      contatore.current += 1;
      setAttivo({ id: contatore.current, testo, errore, alto: opzioni?.posizione === "alto" });
      parti(opzioni?.durataMs ?? durataPer(testo, errore));
    },
    [parti],
  );

  const chiudi = useCallback(() => {
    window.clearTimeout(timer.current);
    setAttivo(null);
  }, []);

  const ferma = useCallback(() => {
    rimanente.current = Math.max(scadenza.current - Date.now(), 0);
    window.clearTimeout(timer.current);
  }, []);
  const riprendi = useCallback(() => parti(Math.max(rimanente.current, 3000)), [parti]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Quante volte il mouse si e' mosso davvero (posizione cambiata; gli eventi sintetici del browser, con la stessa posizione, non
  // contano): serve a sapere se si e' mosso dopo la comparsa dell'avviso, senza guardare dove sono l'avviso e il puntatore.
  const puntatore = useRef<{ x: number; y: number } | null>(null);
  const mosse = useRef(0);
  useEffect(() => {
    const segui = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const adesso = { x: e.clientX, y: e.clientY };
      if (puntatoreMosso(puntatore.current, adesso)) mosse.current += 1;
      puntatore.current = adesso;
    };
    document.addEventListener("pointermove", segui, { capture: true, passive: true });
    document.addEventListener("pointerdown", segui, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointermove", segui, { capture: true });
      document.removeEventListener("pointerdown", segui, { capture: true });
    };
  }, []);

  const zona = useRef<HTMLDivElement | null>(null);
  const nodoAvviso = useRef<HTMLDivElement | null>(null);
  // Le mosse del mouse contate alla comparsa dell'avviso, e se il tempo e' fermo per via del mouse.
  const mosseAllaComparsa = useRef(0);
  const fermoColMouse = useRef(false);

  // L'avviso in basso non copre i pulsanti di azione di un modulo (data-azioni-modulo) ne' quello che e' marcato data-non-coprire (la
  // barra dei totali di Movimenti): se li toccherebbe, la zona sale fin sopra. E non copre il «+» tondo del telefono
  // (data-avviso-di-fianco): se lo toccherebbe, la zona si stringe e l'avviso gli sta di fianco; se cosi' il testo supera le tre righe,
  // l'avviso torna largo e sale sopra anche al «+» (util/avviso.ts: postoAvviso, troppeRighe, sopraIPulsanti).
  // Si misura dalla posizione di partenza (quella del CSS), quindi rifarlo non accumula niente.
  const sistema = useCallback(() => {
    const z = zona.current;
    const nodo = nodoAvviso.current;
    if (!z) return;
    z.style.bottom = "";
    z.style.right = "";
    if (!nodo || nodo.classList.contains("alto")) return;
    const visibili = (selettore: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selettore))
        .map((o) => o.getBoundingClientRect())
        .filter((o) => o.width > 0 && o.height > 0);
    const barre = visibili(SELETTORE_DA_NON_COPRIRE);
    const pulsanti = visibili(SELETTORE_DA_AFFIANCARE);
    const rettangolo = nodo.getBoundingClientRect();
    const testo = nodo.querySelector<HTMLElement>("[data-testo-avviso]");
    // i valori del CSS, letti prima di toccare lo stile (getComputedStyle e' vivo)
    const stile = getComputedStyle(z);
    const fondoCss = parseFloat(stile.bottom);
    const destraCss = parseFloat(stile.right);
    // currentCSSZoom: quanto e' rimpicciolita la pagina (index.css); dove il browser non lo dice vale 1, come prima
    const metti = ({ alzata, stretta }: Posto) => {
      z.style.bottom = alzata > 0 ? `${fondoZona(fondoCss, alzata, z.currentCSSZoom)}px` : "";
      z.style.right = stretta > 0 ? `${fondoZona(destraCss, stretta, z.currentCSSZoom)}px` : "";
    };
    const ingombro = testo ? rettangolo.width - testo.getBoundingClientRect().width : 0;
    const posto = postoAvviso(rettangolo, z.getBoundingClientRect(), barre, pulsanti, { ingombro });
    metti(posto);
    if (posto.stretta > 0 && testo && troppeRighe(testo.offsetHeight, parseFloat(getComputedStyle(testo).lineHeight))) {
      // `rettangolo` e' l'avviso largo quanto la zona, misurato prima della stretta
      const sopra = sopraIPulsanti(rettangolo, barre, pulsanti);
      if (sopra) metti(sopra);
    }
  }, []);

  // A ogni avviso nuovo: lo si mette al suo posto e si annota quanto si era mosso il mouse fin li'. Finche' c'e', il posto si ricalcola se
  // la pagina cambia sotto (si torna alla lista, la finestra cambia misura, il modulo scorre), quando si apre o si chiude la tastiera
  // virtuale, che nasconde il «+» con un attributo su <html> (index.css) senza cambiare nessun nodo, e quando cambia lo stile di
  // <html>: li' useBarreFisse scrive --h-barra-basso, che sposta il «+» (Guscio.tsx).
  const idAttivo = attivo?.id;
  useLayoutEffect(() => {
    sistema();
    mosseAllaComparsa.current = mosse.current;
    fermoColMouse.current = false;
    if (idAttivo === undefined) return;
    let richiesta = 0;
    const presto = () => {
      window.cancelAnimationFrame(richiesta);
      richiesta = window.requestAnimationFrame(sistema);
    };
    const osserva = new MutationObserver(presto);
    osserva.observe(document.body, { childList: true, subtree: true });
    osserva.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tastiera", "style"] });
    window.addEventListener("resize", presto);
    window.visualViewport?.addEventListener("resize", presto);
    document.addEventListener("scroll", presto, { capture: true, passive: true });
    return () => {
      window.cancelAnimationFrame(richiesta);
      osserva.disconnect();
      window.removeEventListener("resize", presto);
      window.visualViewport?.removeEventListener("resize", presto);
      document.removeEventListener("scroll", presto, { capture: true });
    };
  }, [idAttivo, sistema]);

  const alPassaggio = useCallback(
    (evento: "entra" | "muove" | "esce") => {
      const esito = fermaAlPassaggio(fermoColMouse.current, mosse.current !== mosseAllaComparsa.current, evento);
      fermoColMouse.current = esito.fermo;
      if (esito.ferma) ferma();
      if (esito.riprendi) riprendi();
    },
    [ferma, riprendi],
  );
  const entra = useCallback(() => alPassaggio("entra"), [alPassaggio]);
  const muove = useCallback(() => alPassaggio("muove"), [alPassaggio]);
  const esce = useCallback(() => alPassaggio("esce"), [alPassaggio]);

  const valore = useMemo(() => ({ avvisa }), [avvisa]);

  const avvisoVisibile = (errore: boolean) =>
    attivo && attivo.errore === errore ? (
      <div key={attivo.id} ref={nodoAvviso} className={"avvisino" + (errore ? " errore" : "") + (attivo.alto ? " alto" : "")} onMouseEnter={entra} onMouseMove={muove} onMouseLeave={esce} onFocus={ferma} onBlur={riprendi}>
        {errore && <IconaAllarme larghezza={20} spessoreTratto={2.2} />}
        <span data-testo-avviso className="min-w-0 flex-1">{attivo.testo}</span>
        <button type="button" className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg before:absolute before:-inset-1 before:content-['']" onClick={chiudi} aria-label="Chiudi l'avviso">
          <IconaVia larghezza={18} spessoreTratto={2.4} />
        </button>
      </div>
    ) : null;

  return (
    <Contesto.Provider value={valore}>
      {children}
      {createPortal(
        <div ref={zona} className="zonaAvvisi" data-sempre-attivo>
          <div role="status" aria-live="polite" aria-atomic="true">
            {avvisoVisibile(false)}
          </div>
          <div role="alert" aria-atomic="true">
            {avvisoVisibile(true)}
          </div>
        </div>,
        document.body,
      )}
    </Contesto.Provider>
  );
}
