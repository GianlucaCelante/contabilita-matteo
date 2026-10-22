import type { Blocker } from "react-router-dom";
import Finestra from "./Finestra";

// La finestra «Uscire senza salvare?» mostrata quando useBloccoUscita ferma una navigazione.
export default function ConfermaUscita({ blocker }: { blocker: Blocker }) {
  if (blocker.state !== "blocked") return null;
  return (
    <Finestra
      titolo="Uscire senza salvare?"
      sottotitolo="Le modifiche che hai fatto andranno perse."
      onChiudi={() => blocker.reset()}
      piede={
        <>
          <button type="button" className="btn" data-focus-iniziale onClick={() => blocker.reset()}>
            Resta qui
          </button>
          <button type="button" className="btn pericolo" onClick={() => blocker.proceed()}>
            Esci senza salvare
          </button>
        </>
      }
    />
  );
}
