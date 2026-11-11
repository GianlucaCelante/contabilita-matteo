import type { Blocker } from "react-router-dom";
import Conferma from "./Conferma";

// La finestra «Uscire senza salvare?» mostrata quando useBloccoUscita ferma una navigazione.
export default function ConfermaUscita({ blocker }: { blocker: Blocker }) {
  if (blocker.state !== "blocked") return null;
  return (
    <Conferma
      titolo="Uscire senza salvare?"
      sottotitolo="Le modifiche che hai fatto andranno perse."
      onAnnulla={() => blocker.reset()}
      azione={{ etichetta: "Esci senza salvare", stile: "pericolo", onClick: () => blocker.proceed() }}
    />
  );
}
