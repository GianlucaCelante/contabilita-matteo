import { useEffect, type RefObject } from "react";
import { navigazioneCoperta, type Rettangolo } from "../util/barreFisse";

// Le barre fisse in basso (Annulla/Salva del telefono, totali dei movimenti)
// coprono cio' che prende il fuoco. Qui se ne misura l'altezza e la si scrive
// in --h-barra-basso sul <html>: index.css la legge in scroll-padding-bottom
// del <main>, cosi' il browser, portando in vista l'elemento col fuoco, lo
// tiene sopra la barra. La stessa variabile alza il «+» tondo del telefono
// (Guscio.tsx), che cosi' non copre la barra. Adattato dal progetto gemello
// «etichette».
//
// Una barra e' un elemento marcato data-barra-fissa con position fixed o sticky
// in basso. Se non lo e' in quel momento (computer) non conta.
const SELETTORE_BARRE = "[data-barra-fissa]";
// La barra di navigazione del guscio. Quando una barra fissa la copre (telefono: «Annulla | Salva» di un modulo) sul <html> si scrive
// data-navigazione-coperta e index.css la nasconde (visibility: resta al suo posto, ma non e' piu' un bersaglio per dito, Tab e
// lettore di schermo): vedi util/barreFisse.ts.
const SELETTORE_NAVIGAZIONE = ".barraNavigazione";
const ATTRIBUTO_COPERTA = "data-navigazione-coperta";

function px(valore: string): number {
  const n = parseFloat(valore);
  return Number.isFinite(n) ? n : 0;
}

export function useBarreFisse(principale: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const radice = document.documentElement;
    const radiceVista = principale.current;
    if (!radiceVista) return;
    const main: HTMLElement = radiceVista;
    let scritto = -1;
    let fotogramma = 0;
    // Le barre che il ResizeObserver sta osservando: quelle smontate si tolgono.
    const osservate = new Set<HTMLElement>();

    function misura() {
      fotogramma = 0;
      let basso = 0;
      const fisse: Rettangolo[] = [];
      // Le barre possono stare dentro il <main> (sticky) o fuori (fixed, in un
      // altro punto dell'albero): si cerca in tutto il documento.
      const presenti = new Set(document.querySelectorAll<HTMLElement>(SELETTORE_BARRE));
      for (const barra of osservate) {
        if (presenti.has(barra)) continue;
        osservaMisure.unobserve(barra);
        osservate.delete(barra);
      }
      for (const barra of presenti) {
        // La barra cambia altezza anche senza che cambi il DOM intorno (un
        // testo che va a capo, una riga che sparisce a schermo basso): la si
        // osserva, anche quando adesso non conta (alta 0, non fissa), cosi'
        // ci si accorge di quando comincia a contare.
        if (!osservate.has(barra)) {
          osservate.add(barra);
          osservaMisure.observe(barra);
        }
        const stile = getComputedStyle(barra);
        if (stile.position !== "fixed" && stile.position !== "sticky") continue;
        const rettangolo = barra.getBoundingClientRect();
        const altezza = rettangolo.height;
        if (altezza === 0) continue;
        if (stile.bottom === "auto") continue;
        if (stile.position === "fixed") fisse.push(rettangolo);
        // Fissa: copre il fondo del <main> per tutta la sua altezza. Sticky: in
        // piu' dello scarto dal bordo.
        basso = Math.max(basso, altezza + (stile.position === "sticky" ? px(stile.bottom) : 0));
      }
      // visibility: hidden lascia alla barra di navigazione le sue misure, quindi la risposta non cambia dopo averla nascosta.
      const coperta = navigazioneCoperta(document.querySelector<HTMLElement>(SELETTORE_NAVIGAZIONE)?.getBoundingClientRect() ?? null, fisse);
      if (coperta !== radice.hasAttribute(ATTRIBUTO_COPERTA)) radice.toggleAttribute(ATTRIBUTO_COPERTA, coperta);
      const arrotondato = Math.round(basso);
      if (arrotondato === scritto) return;
      scritto = arrotondato;
      radice.style.setProperty("--h-barra-basso", `${arrotondato}px`);
    }

    function programma() {
      if (!fotogramma) fotogramma = window.requestAnimationFrame(misura);
    }

    const osservaMisure = new ResizeObserver(programma);
    osservaMisure.observe(main);
    misura();
    const osservaDom = new MutationObserver(programma);
    osservaDom.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-barra-fissa"] });
    window.addEventListener("resize", programma);
    return () => {
      window.cancelAnimationFrame(fotogramma);
      osservaDom.disconnect();
      osservaMisure.disconnect();
      window.removeEventListener("resize", programma);
      radice.style.removeProperty("--h-barra-basso");
      radice.removeAttribute(ATTRIBUTO_COPERTA);
    };
  }, [principale]);
}
