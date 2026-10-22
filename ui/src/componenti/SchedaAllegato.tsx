import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiAllegati } from "../api/allegati";
import { messaggioErrore } from "../api/client";
import { urlAllegato } from "../api/importa";
import type { Movimento } from "../api/tipi";
import { useAvviso } from "../hooks/useAvviso";
import { controllaAllegato, preparaAllegato } from "../util/immagini";
import Finestra from "./Finestra";

const INVALIDA = ["movimenti", "movimento"];

// La scheda «Allegato» del dettaglio: apri, sostituisci, rimuovi (con conferma) o aggiungi.
export default function SchedaAllegato({ movimento }: { movimento: Movimento }) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const rifInput = useRef<HTMLInputElement>(null);
  const [chiedeRimuovi, setChiedeRimuovi] = useState(false);
  const [preparo, setPreparo] = useState(false);
  const [immagineKo, setImmagineKo] = useState(false);
  const nome = movimento.allegatoNome;
  const eImmagine = nome !== null && /\.(jpe?g|png)$/i.test(nome);

  function aggiorna() {
    setImmagineKo(false);
    for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
  }

  const carica = useMutation({
    mutationFn: (file: File) => apiAllegati.carica(movimento.id, file),
    onSuccess: () => {
      aggiorna();
      avvisa("Allegato salvato.");
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });
  const rimuovi = useMutation({
    mutationFn: () => apiAllegati.rimuovi(movimento.id),
    onSuccess: () => {
      setChiedeRimuovi(false);
      aggiorna();
      avvisa("Allegato rimosso.");
    },
    onError: (e) => {
      setChiedeRimuovi(false);
      avvisa(messaggioErrore(e), { tipo: "errore" });
    },
  });

  async function scelto(file: File | undefined) {
    if (rifInput.current) rifInput.current.value = "";
    if (!file) return;
    setPreparo(true);
    try {
      const pronto = await preparaAllegato(file);
      const problema = controllaAllegato(pronto);
      if (problema) avvisa(problema, { tipo: "errore" });
      else carica.mutate(pronto);
    } finally {
      setPreparo(false);
    }
  }

  const occupato = preparo || carica.isPending || rimuovi.isPending;
  // L'indirizzo cambia con il nome: dopo una sostituzione il browser non mostra la vecchia anteprima.
  const indirizzo = `${urlAllegato(movimento.id)}?v=${encodeURIComponent(nome ?? "")}`;

  return (
    <section className="scheda px-[22px] py-5" aria-label="Allegato" aria-busy={occupato}>
      <h2 className="pb-2.5 text-[18px] font-bold leading-[22px]">Allegato</h2>
      <input ref={rifInput} type="file" accept="image/*,application/pdf" hidden tabIndex={-1} aria-label="Scegli il file da allegare" onChange={(e) => void scelto(e.target.files?.[0])} />
      {nome ? (
        <div className="border-t border-riga pt-3">
          {eImmagine && !immagineKo && (
            <a href={urlAllegato(movimento.id)} target="_blank" rel="noreferrer" aria-label={`Apri l'allegato ${nome}`}>
              <img src={indirizzo} alt={`Anteprima di ${nome}`} className="mb-3 max-h-48 w-full rounded-lg border border-riga object-contain" onError={() => setImmagineKo(true)} />
            </a>
          )}
          <p className="m-0 mb-3 truncate text-[15px] font-bold" title={nome}>
            {nome}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={urlAllegato(movimento.id)} target="_blank" rel="noreferrer" className="btn" aria-label={`Apri l'allegato ${nome}`}>
              Apri
            </a>
            <button type="button" className="btn" disabled={occupato} onClick={() => rifInput.current?.click()}>
              {preparo || carica.isPending ? "Carico…" : "Sostituisci"}
            </button>
            <button type="button" className="btn pericolo" disabled={occupato} onClick={() => setChiedeRimuovi(true)}>
              Rimuovi
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-riga pt-3">
          <p className="m-0 mb-3 text-[15px] text-spento">Nessun allegato.</p>
          <button type="button" className="btn" disabled={occupato} onClick={() => rifInput.current?.click()}>
            {preparo || carica.isPending ? "Carico…" : "Aggiungi allegato"}
          </button>
        </div>
      )}
      {chiedeRimuovi && (
        <Finestra
          titolo="Rimuovere l'allegato?"
          sottotitolo="Il file viene cancellato dal computer. Non si può annullare."
          onChiudi={() => setChiedeRimuovi(false)}
          piede={
            <>
              <button type="button" className="btn" onClick={() => setChiedeRimuovi(false)}>
                No, lascia
              </button>
              <button type="button" className="btn pericolo pieno" disabled={rimuovi.isPending} onClick={() => rimuovi.mutate()}>
                {rimuovi.isPending ? "Rimuovo…" : "Sì, rimuovi"}
              </button>
            </>
          }
        />
      )}
    </section>
  );
}
