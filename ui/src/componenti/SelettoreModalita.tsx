import { Link } from "react-router-dom";

// «A mano» / «Importa XML o ZIP»: i due modi di aggiungere movimenti.
export default function SelettoreModalita({ attiva }: { attiva: "mano" | "importa" }) {
  return (
    <nav className="segmenti" aria-label="Come aggiungere i movimenti">
      <Link to="/movimenti/nuovo" aria-current={attiva === "mano" ? "page" : undefined}>
        A mano
      </Link>
      <Link to="/movimenti/importa" aria-current={attiva === "importa" ? "page" : undefined}>
        Importa XML o ZIP
      </Link>
    </nav>
  );
}
