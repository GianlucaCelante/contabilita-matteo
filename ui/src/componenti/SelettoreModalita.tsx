import { Link, useLocation } from "react-router-dom";
import { statoDaInoltrare } from "../util/ritorno";

// «A mano» / «Importa fatture»: i due modi di aggiungere movimenti. («Importa XML o ZIP» era gergo: che cosa si importa lo dice la
// schermata, «fatture elettroniche o ZIP»; qui la voce resta corta, perche' a 320 px le due voci stanno su una riga.)
// Passando dall'uno all'altro resta il punto di partenza (`state.da`) e la voce della cronologia si sostituisce: «Annulla»,
// la freccia e il tasto indietro riportano a dove si era prima di aprire il nuovo movimento (util/ritorno).
export default function SelettoreModalita({ attiva }: { attiva: "mano" | "importa" }) {
  const stato = statoDaInoltrare(useLocation().state);
  return (
    // A 320 px i segmenti hanno 4 px ai lati (index.css, per il periodo); qui le voci sono due e c'e' posto: 10 px, «A mano» respira.
    <nav className="segmenti max-[359px]:[&>a]:!px-2.5" aria-label="Come aggiungere i movimenti">
      <Link to="/movimenti/nuovo" replace state={stato} aria-current={attiva === "mano" ? "page" : undefined}>
        A mano
      </Link>
      <Link to="/movimenti/importa" replace state={stato} aria-current={attiva === "importa" ? "page" : undefined}>
        Importa fatture
      </Link>
    </nav>
  );
}
