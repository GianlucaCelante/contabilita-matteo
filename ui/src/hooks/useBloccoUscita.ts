import { useRef } from "react";
import { useBlocker, type Blocker } from "react-router-dom";

// Ferma l'uscita dalla schermata (menu, indietro del browser, qualunque link)
// quando ci sono modifiche non salvate. `consenti()` si chiama subito prima di
// uscire di proposito (dopo un salvataggio riuscito).
export function useBloccoUscita(modificato: boolean): { blocker: Blocker; consenti: () => void } {
  const via = useRef(false);
  const blocker = useBlocker(() => modificato && !via.current);
  return {
    blocker,
    consenti: () => {
      via.current = true;
    },
  };
}
