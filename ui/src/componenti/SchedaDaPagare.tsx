import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import { useSedi } from "../hooks/useSedi";
import { filtroDaPagare, indirizzoDaPagare, riassuntoDaPagare, righeDaPagare, testoDaPagare } from "../util/daPagare";
import { meseCorrente } from "../util/fatture";
import { IconaDestra, IconaFatture } from "./Icone";

// Nel Riepilogo, sotto il promemoria delle fatture da emettere: una riga discreta «Da pagare ai fornitori: € X · N fatture» che apre
// Statistiche › Fatture › Ricevute. Conta TUTTE le fatture dei fornitori ancora da pagare fino alla fine del mese corrente (non solo
// quelle del periodo mostrato), delle sedi scelte, con il conto delle Ricevute mese per mese (una nota di credito riduce il dovuto
// del suo fornitore in quel mese): vedi util/daPagare.ts. Nessuna chiamata nuova: GET /api/movimenti dei costi variabili, senza
// data d'inizio (scarica tutti i costi variabili: con anni di dati pesa, vedi docs/interfaccia.md).
// Non compare se non c'e' niente da pagare, mentre carica o se il servizio non risponde (il Riepilogo resta com'e').
export default function SchedaDaPagare() {
  const sedi = useSedi();
  const oggiMese = meseCorrente();
  const filtro = filtroDaPagare(oggiMese, sedi.parametro);
  const q = useQuery({ queryKey: chiavi.movimenti(filtro), queryFn: () => api.movimenti(filtro), enabled: sedi.pronto, staleTime: 15_000 });
  const r = q.data ? riassuntoDaPagare(q.data.elementi, oggiMese) : null;
  if (!r) return null;
  const { righe, altri } = righeDaPagare(r, oggiMese);
  const apri = (
    <span className="flex shrink-0 items-center gap-1 text-[14px] font-bold text-spento">
      <span className="max-[389px]:sr-only">Apri</span>
      <IconaDestra larghezza={18} spessoreTratto={2.25} />
    </span>
  );
  // Un mese solo: tutta la scheda e' il collegamento alle Ricevute di quel mese.
  if (righe.length === 0) {
    return (
      <Link to={indirizzoDaPagare(r.mese, oggiMese)} className="scheda mb-3 flex min-h-[52px] items-center gap-3 px-4 py-2 text-testo no-underline hover:bg-sabbia max-md:rounded-2xl md:mb-4">
        <IconaFatture larghezza={22} spessoreTratto={2} className="shrink-0 text-spento" />
        <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug md:text-[16px]">{testoDaPagare(r)}</span>
        {apri}
      </Link>
    );
  }
  // Piu' mesi: il totale in cima e sotto una riga per mese, ognuna verso le Ricevute di quel mese (che ne mostrano uno alla volta).
  return (
    <section className="scheda mb-3 overflow-hidden text-testo max-md:rounded-2xl md:mb-4" aria-label="Da pagare ai fornitori">
      <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
        <IconaFatture larghezza={22} spessoreTratto={2} className="shrink-0 text-spento" />
        <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug md:text-[16px]">{testoDaPagare(r)}</span>
      </div>
      <ul className="m-0 list-none p-0">
        {righe.map((riga) => (
          <li key={riga.mese} className="border-t border-riga">
            <Link to={riga.indirizzo} className="flex min-h-[44px] items-center gap-3 py-1.5 pl-[50px] pr-4 text-[15px] leading-snug text-testo no-underline hover:bg-sabbia">
              <span className="num min-w-0 flex-1">{riga.testo}</span>
              {apri}
            </Link>
          </li>
        ))}
        {altri > 0 && (
          <li className="border-t border-riga py-2 pl-[50px] pr-4 text-[14px] text-spento">
            {altri === 1 ? "e un altro mese" : `e altri ${altri} mesi`}
          </li>
        )}
      </ul>
    </section>
  );
}
