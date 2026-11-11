import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiAllegati } from "../api/allegati";
import { messaggioErrore } from "../api/client";
import { urlAllegato } from "../api/importa";
import type { Movimento } from "../api/tipi";
import { scorriInVista } from "../hooks/scorriInVista";
import { useAvviso } from "../hooks/useAvviso";
import { notaAllegato } from "../util/allegatoDemo";
import { controllaAllegato, preparaAllegato } from "../util/immagini";
import CampoAllegato from "./CampoAllegato";
import Conferma from "./Conferma";
import LenteImmagine from "./LenteImmagine";

const INVALIDA = ["movimenti", "movimento"];

// Il caricamento dell'allegato di un movimento gia' salvato: parte subito, poi elenco e dettaglio si rileggono.
function useCaricaAllegato(movimento: Movimento, dopo?: () => void) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  return useMutation({
    mutationFn: (file: File) => apiAllegati.carica(movimento.id, file),
    onSuccess: () => {
      dopo?.();
      for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
      avvisa("Allegato salvato.");
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });
}

// Sul telefono, finche' il movimento non ha un allegato: lo stesso campo compatto di «Nuovo movimento» («Foto · Scatta»), ma il
// file scelto si carica subito. Con l'allegato c'e' la scheda qui sotto. `onCaricato`: il caricamento e' riuscito (fra poco il campo
// lascia il posto alla scheda).
export function AllegatoCompatto({ movimento, disabilitato, onCaricato }: { movimento: Movimento; disabilitato?: boolean; onCaricato?: () => void }) {
  const carica = useCaricaAllegato(movimento, onCaricato);
  return (
    <CampoAllegato
      file={null}
      onCambia={(file) => {
        if (file) carica.mutate(file);
      }}
      {...(disabilitato ? { disabilitato } : {})}
      inCaricamento={carica.isPending}
    />
  );
}

// La scheda «Allegato» del dettaglio: apri, sostituisci, rimuovi (con conferma) o aggiungi. Un file che non va bene (troppo grande,
// tipo sbagliato) si dice in linea sotto i pulsanti, come nel campo compatto (CampoAllegato); gli errori del servizio sono avvisi.
// `inVista`: la scheda e' appena comparsa dopo un caricamento dal campo compatto, quindi si porta in vista (sta in fondo al modulo).
export default function SchedaAllegato({ movimento, inVista }: { movimento: Movimento; inVista?: boolean }) {
  const rifScheda = useRef<HTMLElement>(null);
  const [problema, setProblema] = useState<string | null>(null);
  useEffect(() => {
    if (inVista && rifScheda.current) scorriInVista(rifScheda.current);
    // solo alla comparsa della scheda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const client = useQueryClient();
  const avvisa = useAvviso();
  const rifInput = useRef<HTMLInputElement>(null);
  const [chiedeRimuovi, setChiedeRimuovi] = useState(false);
  const [preparo, setPreparo] = useState(false);
  const [immagineKo, setImmagineKo] = useState(false);
  const [lente, setLente] = useState(false);
  const nome = movimento.allegatoNome;
  const eImmagine = nome !== null && /\.(jpe?g|png)$/i.test(nome);

  function aggiorna() {
    setImmagineKo(false);
    for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
  }

  const carica = useCaricaAllegato(movimento, () => setImmagineKo(false));
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
    setProblema(null);
    setPreparo(true);
    try {
      const pronto = await preparaAllegato(file);
      const trovato = await controllaAllegato(pronto);
      if (trovato) setProblema(trovato);
      else carica.mutate(pronto);
    } finally {
      setPreparo(false);
    }
  }

  const occupato = preparo || carica.isPending || rimuovi.isPending;
  // Solo nella demo: gli allegati non si salvano, e si dice prima di scegliere il file (come nel campo compatto).
  const notaDemo = notaAllegato(import.meta.env.VITE_DEMO === "1");
  // L'indirizzo cambia con il nome: dopo una sostituzione il browser non mostra la vecchia anteprima.
  const indirizzo = `${urlAllegato(movimento.id)}?v=${encodeURIComponent(nome ?? "")}`;

  return (
    <section ref={rifScheda} className="scheda px-[22px] py-5" aria-label="Allegato" aria-busy={occupato}>
      <h2 className="pb-2.5 text-[18px] font-bold leading-[22px]">Allegato</h2>
      <input ref={rifInput} type="file" accept="image/*,application/pdf" hidden tabIndex={-1} aria-label="Scegli il file da allegare" onChange={(e) => void scelto(e.target.files?.[0])} />
      {nome ? (
        <div className="border-t border-riga pt-3">
          {eImmagine && !immagineKo && (
            // Un tocco sulla miniatura apre la foto a tutto schermo (pizzico, scorrimento, + e −).
            <button type="button" className="block w-full cursor-zoom-in" aria-label={`Ingrandisci la foto ${nome}`} onClick={() => setLente(true)}>
              <img src={indirizzo} alt={`Anteprima di ${nome}`} className="mb-3 max-h-48 w-full rounded-lg border border-riga object-contain" onError={() => setImmagineKo(true)} />
            </button>
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
      {notaDemo && <p className="m-0 mt-2 text-[13px] leading-snug text-spento">{notaDemo}</p>}
      <div aria-live="polite">
        {problema && (
          <p role="alert" className="m-0 mt-2 text-[13px] font-bold text-rosso">
            {problema}
          </p>
        )}
      </div>
      {lente && nome && <LenteImmagine titolo={nome} src={indirizzo} onChiudi={() => setLente(false)} />}
      {chiedeRimuovi && (
        <Conferma
          titolo="Rimuovere l'allegato?"
          sottotitolo="Il file viene cancellato dal computer. Non si può annullare."
          onAnnulla={() => setChiedeRimuovi(false)}
          occupato={rimuovi.isPending}
          azione={{ chiave: "rimuovi", etichetta: rimuovi.isPending ? "Rimuovo…" : "Rimuovi", stile: "distruttiva", onClick: () => rimuovi.mutate() }}
        />
      )}
    </section>
  );
}
