import { IconaOrologio, IconaSpunta } from "./Icone";

// «Da pagare» / «Pagata» di una fattura ricevuta: icona + parola + colore (mai solo il colore).
// `piccolo`: la versione per le righe dell'elenco Movimenti; senza, quella delle Ricevute. In tutti e due i casi sta dentro un pulsante:
// un tocco cambia lo stato (hooks/useSegnaPagata).
export default function BadgePagata({ pagata, piccolo = false, className = "" }: { pagata: boolean; piccolo?: boolean; className?: string }) {
  const Icona = pagata ? IconaSpunta : IconaOrologio;
  const colori = pagata ? "border-verdebordo bg-verdechiaro text-verdescuro" : "border-ambrabordo bg-ambrachiaro text-ambra";
  const misure = piccolo ? "h-[22px] gap-1 px-1.5 text-[12px]" : "h-[36px] gap-1.5 px-2.5 text-[14px]";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-lg border font-bold ${misure} ${colori} ${className}`}>
      <Icona larghezza={piccolo ? 13 : 16} spessoreTratto={2.25} />
      {pagata ? "Pagata" : "Da pagare"}
    </span>
  );
}
