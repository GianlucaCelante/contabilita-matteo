import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import { righePromemoria, testoDaEmettere } from "../util/fatture";
import { IconaAllarme, IconaDestra, IconaOrologio } from "./Icone";

// Nel Riepilogo: un promemoria discreto «Fatture da emettere questo mese: N» che porta alle Fatture. Riguarda SEMPRE il mese corrente
// (GET /api/fatture/promemoria), anche se il Riepilogo mostra un altro periodo. Se qualche casella e' in scadenza (entro 3 giorni, o gia'
// scaduta) sotto ci sono, in evidenza, al massimo due righe come «Fattura a Rossi: scade tra 3 giorni» e «e altre N».
// Non compare se non c'e' niente da fare o se il servizio non risponde (il Riepilogo resta com'e').
export default function SchedaFattureDaFare() {
  const q = useQuery({ queryKey: chiavi.promemoriaFatture, queryFn: () => api.promemoriaFatture(), staleTime: 15_000 });
  const n = q.data?.daFare ?? 0;
  if (n <= 0) return null;
  const inScadenza = q.data?.inScadenza ?? [];
  const { righe, altre } = righePromemoria(inScadenza);
  return (
    <Link
      to="/statistiche/fatture"
      className="mb-3 flex min-h-[52px] items-center gap-3 rounded-2xl border border-ambrabordo bg-ambrachiaro px-4 py-2 text-ambra no-underline hover:brightness-95 md:mb-4"
    >
      <IconaOrologio larghezza={22} spessoreTratto={2} className="shrink-0" />
      <span className="min-w-0 flex-1 text-[15px] leading-snug md:text-[16px]">
        <span className="block font-bold">
          {testoDaEmettere(n)}
        </span>
        {righe.map((riga, i) => (
          <span key={riga} className={"mt-0.5 flex items-start gap-1 text-[14px] font-bold " + ((inScadenza[i]?.giorniMancanti ?? 0) < 0 ? "text-rosso" : "")}>
            <IconaAllarme larghezza={14} spessoreTratto={2.25} className="mt-[3px] shrink-0" />
            <span className="min-w-0 break-words">{riga}</span>
          </span>
        ))}
        {altre > 0 && <span className="mt-0.5 block text-[13px]">e altre {altre}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[14px] font-bold">
        <span className="max-[389px]:sr-only">Apri</span>
        <IconaDestra larghezza={18} spessoreTratto={2.25} />
      </span>
    </Link>
  );
}
