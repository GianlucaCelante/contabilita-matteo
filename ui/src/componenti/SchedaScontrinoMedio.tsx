import { Link } from "react-router-dom";
import { euro } from "../util/formato";
import { testoConteggio } from "../util/statistiche";
import { IconaDestra } from "./Icone";

// La scorciatoia del Riepilogo: lo scontrino medio del periodo (dai dati di pizze e ordini) e il collegamento alle statistiche.
// Telefono: una riga con il valore, «ordini · pizze» e la freccia. Computer: scheda con il collegamento scritto.
export default function SchedaScontrinoMedio({ scontrinoCent, ordini, pizze, titolo }: { scontrinoCent: number | null; ordini: number; pizze: number; titolo: string }) {
  return (
    <section className="scheda min-w-0 max-md:rounded-2xl md:flex-1" aria-label={titolo}>
      <Link to="/statistiche" className="flex min-h-[64px] items-center gap-3 px-[18px] py-3 text-testo no-underline max-md:rounded-2xl md:flex-col md:items-start md:gap-0 md:px-6 md:py-5">
        <div className="min-w-0 flex-1">
          <div className="etichettaMaiuscola">{titolo}</div>
          <div className="num font-titolo text-[24px] font-bold leading-tight md:text-[34px] md:text-verdescuro">{scontrinoCent === null ? "—" : euro(scontrinoCent)}</div>
        </div>
        <div className="num text-right text-[14px] text-spento md:mt-0.5 md:text-left">
          {testoConteggio(ordini)} ordini <span aria-hidden="true">·</span>
          <br className="md:hidden" /> {testoConteggio(pizze)} pizze
        </div>
        <span className="text-spento md:hidden">
          <IconaDestra larghezza={20} spessoreTratto={2.2} />
          <span className="sr-only">Vai alle statistiche</span>
        </span>
        <span className="mt-2.5 inline-flex min-h-[44px] items-center gap-0.5 font-bold text-verdescuro max-md:hidden">
          Vai alle statistiche
          <IconaDestra larghezza={18} spessoreTratto={2.4} />
        </span>
      </Link>
    </section>
  );
}
