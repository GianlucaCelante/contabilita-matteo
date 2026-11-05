import type { StatoFattura } from "../api/tipi";
import { ETICHETTA_STATO, type TonoStato } from "../util/fatture";
import { CLASSI_TONO, iconaStato } from "./statoFattura";

// La pillola dello stato di una fattura: icona + parola + colore (vedi statoFattura.ts).
export default function BadgeStatoFattura({ stato, tono, className = "" }: { stato: StatoFattura; tono: TonoStato; className?: string }) {
  const Icona = iconaStato(stato, tono);
  return (
    <span className={`inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[14px] font-bold ${CLASSI_TONO[tono]} ${className}`}>
      <Icona larghezza={16} spessoreTratto={2.25} />
      {ETICHETTA_STATO[stato]}
    </span>
  );
}
