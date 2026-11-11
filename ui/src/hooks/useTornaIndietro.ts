import { useState, type MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { creaGuardiaIndietro } from "../util/guardiaIndietro";
import { comeTornare, daDoveTornare } from "../util/ritorno";

// Per le pagine aperte «sopra» un'altra (un movimento, il nuovo movimento, l'importazione):
// - `torna`: da dove si e' arrivati (`state.da`, altrimenti i Movimenti);
// - `esci(verso)`: «Annulla», la freccia e l'uscita dopo un salvataggio. Se la voce precedente della cronologia e' proprio `verso`
//   si fa un passo indietro, altrimenti si va a `verso` sostituendo la voce: in tutti e due i casi il tasto indietro non riapre la
//   pagina e la cronologia non ha due voci uguali di fila (util/ritorno). Un doppio clic non fa due passi (util/guardiaIndietro);
// - `alClic(verso)`: lo stesso per un link (`<Link to={verso}>`, che resta un link vero: Ctrl/clic centrale aprono una scheda).
// `conModifiche`: se dice che ci sono modifiche non salvate (useBloccoUscita().attivo), niente passo indietro ma una navigazione
// all'indirizzo, che la conferma di uscita ferma sempre (anche se la voce precedente non e' del router).
export function useTornaIndietro(conModifiche?: () => boolean) {
  const { key, state } = useLocation();
  const navigate = useNavigate();
  const torna = daDoveTornare(state);
  const [guardia] = useState(() => creaGuardiaIndietro(window));

  function esci(verso: string = torna) {
    const indice = (window.history.state as { idx?: unknown } | null)?.idx;
    const come = comeTornare(key, state, verso, conModifiche?.() ?? false, typeof indice === "number" ? indice : null);
    if (come.indietro) guardia.vai(() => void navigate(-1));
    else void navigate(come.a, { replace: true });
  }

  function alClic(verso: string = torna) {
    return (evento: MouseEvent<HTMLAnchorElement>) => {
      if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
      evento.preventDefault();
      esci(verso);
    };
  }

  return { torna, esci, alClic };
}
