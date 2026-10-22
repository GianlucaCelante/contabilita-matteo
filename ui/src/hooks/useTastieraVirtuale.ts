import { useEffect } from "react";
import { statoTastiera } from "../util/tastiera";
import { scorriInVista } from "./scorriInVista";

// Un solo meccanismo per la tastiera virtuale del telefono, montato una volta
// sola nel Guscio (adattato dal progetto gemello «etichette»).
//
// Il problema: Chrome Android e Safari iOS si comportano in modo diverso.
// Chrome (col meta viewport "interactive-widget=resizes-content", index.html)
// restringe il viewport di layout: dvh e position:fixed seguono da soli.
// Safari iOS no: il viewport di layout resta intero, la tastiera lo copre e
// si restringe solo il "visual viewport" (window.visualViewport). Per non
// dipendere dal browser si legge SEMPRE visualViewport, che dice la verita' in
// entrambi i casi, e si scrive nel <html>:
//  - data-tastiera: c'e' un campo di testo a fuoco E il viewport visibile e'
//    sensibilmente piu' basso di prima (tastiera aperta). Il CSS ci nasconde la
//    barra di navigazione e il «+» tondo;
//  - --vv-top / --vv-h: dove sta e quanto e' alta l'area visibile. Il CSS
//    (.guscio, .velo) si adatta a quella: pagina e finestre finiscono sopra la
//    tastiera e restano scorrevoli;
//  - --sotto-tastiera: quanto la tastiera copre in basso rispetto al viewport
//    di layout. La barra fissa Annulla/Salva (position:fixed) ci sale sopra e
//    resta visibile sopra la tastiera.
// Poi il campo a fuoco viene portato al centro dell'area libera (sopra la
// tastiera e sopra la barra fissa), con scorriInVista.
//
// Sulla larghezza da computer non fa niente (nessuna tastiera virtuale).

const LARGHEZZA_TELEFONO = "(max-width: 767.98px)";

function campoDiTesto(nodo: Element | null): nodo is HTMLElement {
  if (!(nodo instanceof HTMLElement)) return false;
  if (nodo instanceof HTMLTextAreaElement) return true;
  if (nodo instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color", "image"].includes(nodo.type);
  }
  return nodo.isContentEditable;
}

export function useTastieraVirtuale() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const vista: VisualViewport = vv;
    const radice = document.documentElement;
    const telefono = window.matchMedia(LARGHEZZA_TELEFONO);
    let altezzaRiposo = vista.height;
    let tastieraAperta = false;
    let timer: number | undefined;
    let timerControllo: number | undefined;

    function aggiorna() {
      const inModifica = campoDiTesto(document.activeElement);
      if (!inModifica) altezzaRiposo = vista.height;
      else altezzaRiposo = Math.max(altezzaRiposo, vista.height);
      const { aperta } = statoTastiera({
        telefono: telefono.matches,
        inModifica,
        altezzaRiposo,
        altezzaVisibile: vista.height,
      });
      if (aperta) {
        radice.dataset.tastiera = "1";
        radice.style.setProperty("--vv-top", `${vista.offsetTop}px`);
        radice.style.setProperty("--vv-h", `${vista.height}px`);
        radice.style.setProperty("--sotto-tastiera", `${Math.max(0, Math.round(window.innerHeight - vista.offsetTop - vista.height))}px`);
      } else {
        delete radice.dataset.tastiera;
        radice.style.removeProperty("--vv-top");
        radice.style.removeProperty("--vv-h");
        radice.style.removeProperty("--sotto-tastiera");
      }
      return aperta;
    }

    // Il campo va ricentrato dopo che il layout ha assorbito la nuova altezza
    // (la tastiera si apre in animazione: resize arriva piu' volte).
    function programmaCentratura() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const attivo = document.activeElement;
        if (tastieraAperta && campoDiTesto(attivo)) scorriInVista(attivo, false);
      }, 120);
    }

    function suRidimensiona() {
      const eraAperta = tastieraAperta;
      tastieraAperta = aggiorna();
      if (tastieraAperta) programmaCentratura();
      else if (eraAperta) window.clearTimeout(timer);
    }
    function suFuoco() {
      tastieraAperta = aggiorna();
      // Su iOS il resize arriva dopo il fuoco (o non arriva, con tastiera
      // hardware): ricontrolla un attimo dopo.
      window.clearTimeout(timerControllo);
      timerControllo = window.setTimeout(suRidimensiona, 300);
      programmaCentratura();
    }
    function suPerdutoFuoco() {
      // Il campo successivo prende il fuoco subito dopo: aspetta che si
      // assesti prima di richiudere la tastiera.
      window.clearTimeout(timerControllo);
      timerControllo = window.setTimeout(suRidimensiona, 50);
    }

    vista.addEventListener("resize", suRidimensiona);
    vista.addEventListener("scroll", suRidimensiona);
    document.addEventListener("focusin", suFuoco);
    document.addEventListener("focusout", suPerdutoFuoco);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(timerControllo);
      vista.removeEventListener("resize", suRidimensiona);
      vista.removeEventListener("scroll", suRidimensiona);
      document.removeEventListener("focusin", suFuoco);
      document.removeEventListener("focusout", suPerdutoFuoco);
      delete radice.dataset.tastiera;
      radice.style.removeProperty("--vv-top");
      radice.style.removeProperty("--vv-h");
      radice.style.removeProperty("--sotto-tastiera");
    };
  }, []);
}
