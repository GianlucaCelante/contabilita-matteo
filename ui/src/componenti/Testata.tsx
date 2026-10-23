import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconaPiu, IconaSinistra } from "./Icone";

interface ProprietaTestata {
  titolo: string;
  // Se c'e', compare la freccia indietro verso questo indirizzo.
  indietro?: string;
  azioni?: ReactNode;
  // Un'etichetta accanto al titolo (sul telefono va a destra del titolo).
  etichetta?: ReactNode;
  // Sul telefono: margini di 12 px e altezza 68, come nei mockup di Nuovo movimento e Dettaglio.
  compatta?: boolean;
  // Sul telefono il titolo non si vede (e' gia' scritto nella barra in basso): resta per chi usa lo screen reader.
  titoloSoloComputer?: boolean;
}

// La riga del titolo di ogni schermata (28 px, Bricolage Grotesque) con, a
// destra, le azioni della vista.
export default function Testata({ titolo, indietro, azioni, etichetta, compatta, titoloSoloComputer }: ProprietaTestata) {
  return (
    <header className={"flex min-h-[64px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-2 pt-4 md:min-h-[76px] md:px-8 md:py-3" + (compatta ? " max-md:min-h-[68px] max-md:px-3 max-md:pb-0 max-md:pt-[18px]" : "") + (titoloSoloComputer ? " max-md:min-h-0 max-md:p-0 max-md:h-4" : "")}>
      <div className={"flex min-w-0 items-center gap-3 md:gap-4" + (etichetta ? " max-md:flex-1" : "")}>
        {indietro && (
          <Link to={indietro} className="btnIcona" aria-label="Indietro">
            <IconaSinistra larghezza={20} spessoreTratto={2} />
          </Link>
        )}
        <h1 className={"text-[24px] font-bold leading-tight tracking-tight md:text-[28px]" + (etichetta ? " max-md:flex-1" : "") + (titoloSoloComputer ? " max-md:sr-only" : "")}>{titolo}</h1>
        {etichetta}
      </div>
      {azioni}
    </header>
  );
}

// Il pulsante «Nuovo movimento» delle testate (solo computer: sul telefono c'e' il «+»).
export function PulsanteNuovoMovimento() {
  return (
    <Link to="/movimenti/nuovo" className="btn primario hidden md:inline-flex">
      <IconaPiu larghezza={20} spessoreTratto={2.25} />
      <span>Nuovo movimento</span>
    </Link>
  );
}
