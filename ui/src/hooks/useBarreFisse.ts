import { useEffect, type RefObject } from "react";

// Le barre fisse in basso (Annulla/Salva del telefono, totali dei movimenti)
// coprono cio' che prende il fuoco. Qui se ne misura l'altezza e la si scrive
// in --h-barra-basso sul <html>: index.css la legge in scroll-padding-bottom
// del <main>, cosi' il browser, portando in vista l'elemento col fuoco, lo
// tiene sopra la barra. Adattato dal progetto gemello «etichette».
//
// Una barra e' un elemento marcato data-barra-fissa con position fixed o sticky
// in basso. Se non lo e' in quel momento (computer) non conta.
const SELETTORE_BARRE = "[data-barra-fissa]";

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

    function misura() {
      fotogramma = 0;
      let basso = 0;
      // Le barre possono stare dentro il <main> (sticky) o fuori (fixed, in un
      // altro punto dell'albero): si cerca in tutto il documento.
      for (const barra of document.querySelectorAll<HTMLElement>(SELETTORE_BARRE)) {
        const stile = getComputedStyle(barra);
        if (stile.position !== "fixed" && stile.position !== "sticky") continue;
        const altezza = barra.getBoundingClientRect().height;
        if (altezza === 0) continue;
        if (stile.bottom === "auto") continue;
        // Fissa: copre il fondo del <main> per tutta la sua altezza. Sticky: in
        // piu' dello scarto dal bordo.
        basso = Math.max(basso, altezza + (stile.position === "sticky" ? px(stile.bottom) : 0));
      }
      const arrotondato = Math.round(basso);
      if (arrotondato === scritto) return;
      scritto = arrotondato;
      radice.style.setProperty("--h-barra-basso", `${arrotondato}px`);
    }

    function programma() {
      if (!fotogramma) fotogramma = window.requestAnimationFrame(misura);
    }

    misura();
    const osservaDom = new MutationObserver(programma);
    osservaDom.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-barra-fissa"] });
    const osservaMisure = new ResizeObserver(programma);
    osservaMisure.observe(main);
    window.addEventListener("resize", programma);
    return () => {
      window.cancelAnimationFrame(fotogramma);
      osservaDom.disconnect();
      osservaMisure.disconnect();
      window.removeEventListener("resize", programma);
      radice.style.removeProperty("--h-barra-basso");
    };
  }, [principale]);
}
