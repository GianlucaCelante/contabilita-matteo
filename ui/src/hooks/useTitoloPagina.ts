import { useEffect } from "react";
import { titoloDocumento } from "../util/titoloPagina";

// Il titolo della scheda del browser per le viste che hanno un nome proprio (la voce aperta): «<nome> · Contabilità»,
// e finche' il nome non c'e' ancora `intanto`. Il Guscio non tocca queste viste (util/titoloPagina, titoloDellaVista).
export function useTitoloPagina(nome: string | undefined, intanto: string) {
  const titolo = nome || intanto;
  useEffect(() => {
    document.title = titoloDocumento(titolo);
  }, [titolo]);
}
