import { Component, type ErrorInfo, type ReactNode } from "react";
import { IconaAllarme, IconaCercaDiNuovo } from "./Icone";

interface Proprieta {
  children: ReactNode;
}
interface Stato {
  errore: Error | null;
}

// Rete di sicurezza contro uno schermo bianco: un errore di resa in una vista
// non deve portare giu' tutta l'app, barra di navigazione compresa. Il guscio
// le passa una key legata al percorso, cosi' cambiando vista si azzera.
export default class ErroreVista extends Component<Proprieta, Stato> {
  state: Stato = { errore: null };

  static getDerivedStateFromError(errore: Error): Stato {
    return { errore };
  }

  componentDidCatch(errore: Error, info: ErrorInfo) {
    console.error("Errore di resa in una vista:", errore, info.componentStack);
  }

  ricarica = () => window.location.reload();

  render() {
    const { errore } = this.state;
    if (!errore) return this.props.children;
    return (
      <div className="p-4 md:p-8">
        <div className="scheda flex items-start gap-3 p-5" role="alert">
          <span className="text-rosso">
            <IconaAllarme larghezza={24} spessoreTratto={2} />
          </span>
          <div>
            <p className="m-0 text-[17px] font-bold text-rosso">Qualcosa è andato storto in questa schermata.</p>
            <p className="m-0 mt-1 text-[14px] text-tenue">{errore.message || String(errore)}</p>
            <button type="button" className="btn mt-3" onClick={this.ricarica}>
              <IconaCercaDiNuovo larghezza={18} spessoreTratto={2} />
              <span>Ricarica la pagina</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
