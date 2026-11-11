import { useEffect, useId, useRef, useState } from "react";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { notaAllegato } from "../util/allegatoDemo";
import { controllaAllegato, preparaAllegato, tipoDi } from "../util/immagini";
import LenteImmagine from "./LenteImmagine";
import { IconaFotocamera, IconaGraffetta } from "./IconeMovimento";

interface ProprietaCampoAllegato {
  file: File | null;
  onCambia: (file: File | null) => void;
  disabilitato?: boolean;
  // Il file scelto sta partendo (nel dettaglio l'allegato si carica subito): il pulsante dice «Carico…» e non si tocca.
  inCaricamento?: boolean;
  // Il file scelto non va bene (il motivo e' scritto sotto il campo): il nome del file rifiutato, o null quando l'errore non c'e'
  // piu' (un altro file, «Rimuovi»). Serve a «Nuovo movimento» per ricordarlo nell'avviso dopo il salvataggio.
  onRifiutato?: (nomeFile: string | null) => void;
  // Il file scelto si sta preparando (ridimensionamento e controllo, asincroni): chi salva aspetta, altrimenti il movimento partirebbe
  // senza il file appena scelto.
  onPreparazione?: (inCorso: boolean) => void;
}

// Sul telefono (puntatore "grossolano") il pulsante invita a scattare.
function suTelefono(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

// Scelta dell'allegato facoltativo PRIMA del salvataggio: anteprima (miniatura per le
// immagini, icona e nome per i PDF), «Rimuovi», controlli in italiano e ridimensionamento
// delle foto grandi. Il file arriva al genitore gia' pronto per l'invio.
export default function CampoAllegato({ file, onCambia, disabilitato, inCaricamento, onRifiutato, onPreparazione }: ProprietaCampoAllegato) {
  const idEtichetta = useId();
  const idErrore = useId();
  const idNota = useId();
  // Solo nella demo: gli allegati non si salvano, e si dice prima di scegliere il file. Nell'app vera non c'e' nessuna nota.
  const nota = notaAllegato(import.meta.env.VITE_DEMO === "1");
  const rifInput = useRef<HTMLInputElement>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const [lente, setLente] = useState(false);

  const eImmagine = file !== null && tipoDi(file).startsWith("image/");
  useEffect(() => {
    if (!file || !eImmagine) {
      setMiniatura(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setMiniatura(url);
    return () => URL.revokeObjectURL(url);
  }, [file, eImmagine]);

  // La preparazione e' asincrona: se nel frattempo il campo e' stato smontato (dopo un salvataggio «Nuovo movimento» lo rimonta
  // pulito) il risultato si butta, altrimenti il file o il rifiuto finirebbero sul modulo del movimento successivo.
  const montato = useRef(true);
  useEffect(() => {
    montato.current = true;
    return () => {
      montato.current = false;
    };
  }, []);

  async function scelto(scelto: File | undefined) {
    if (rifInput.current) rifInput.current.value = ""; // si puo' riscegliere lo stesso file
    if (!scelto) return;
    setErrore(null);
    onRifiutato?.(null);
    setInCorso(true);
    onPreparazione?.(true);
    try {
      const pronto = await preparaAllegato(scelto);
      const problema = await controllaAllegato(pronto);
      if (!montato.current) return;
      if (problema) {
        setErrore(problema);
        onRifiutato?.(scelto.name);
      } else onCambia(pronto);
    } finally {
      if (montato.current) {
        setInCorso(false);
        onPreparazione?.(false);
      }
    }
  }

  // Computer: «Foto o PDF» con la graffetta. Telefono: la fotocamera e «Scatta» (o «Scegli un file» senza tocco).
  const grande = useSchermoGrande();
  const icona = grande ? <IconaGraffetta /> : <IconaFotocamera />;
  const testoPulsante = grande ? "Foto o PDF" : suTelefono() ? "Scatta" : "Scegli un file";

  return (
    <div>
      <div id={idEtichetta} className="etichetta">
        {grande ? "Allegato" : "Foto"} <span className="font-normal">{grande ? "(facoltativo)" : "(facoltativa)"}</span>
      </div>
      <input
        ref={rifInput}
        type="file"
        accept="image/*,application/pdf"
        hidden
        tabIndex={-1}
        aria-labelledby={idEtichetta}
        onChange={(e) => void scelto(e.target.files?.[0])}
      />
      {file ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-bordo2 p-3">
          {miniatura ? (
            // Un tocco sulla miniatura apre la foto a tutto schermo (prima di salvare).
            <button type="button" className="shrink-0 cursor-zoom-in rounded-lg" aria-label={`Ingrandisci la foto ${file.name}`} onClick={() => setLente(true)}>
              <img src={miniatura} alt={`Anteprima di ${file.name}`} className="h-16 w-16 rounded-lg object-cover" />
            </button>
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-sabbia text-[15px] font-bold" aria-hidden="true">
              PDF
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold" title={file.name}>
            {file.name}
          </span>
          <button type="button" className="btn" disabled={disabilitato || inCorso} onClick={() => rifInput.current?.click()}>
            Cambia
          </button>
          <button
            type="button"
            className="btn pericolo"
            disabled={disabilitato}
            aria-label={`Rimuovi l'allegato ${file.name}`}
            onClick={() => {
              setErrore(null);
              onRifiutato?.(null);
              onCambia(null);
            }}
          >
            Rimuovi
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="flex min-h-[52px] w-full items-center gap-2 rounded-[10px] border border-dashed border-tratteggio bg-carta px-3.5 text-left text-[15px] text-spento hover:bg-sabbia disabled:opacity-60 md:gap-2.5"
          disabled={disabilitato || inCorso || inCaricamento}
          aria-describedby={errore ? idErrore : nota ? idNota : undefined}
          onClick={() => rifInput.current?.click()}
        >
          {inCorso ? (
            "Preparo il file…"
          ) : inCaricamento ? (
            "Carico…"
          ) : (
            <>
              {icona}
              <span>{testoPulsante}</span>
            </>
          )}
        </button>
      )}
      {nota && (
        <p id={idNota} className="m-0 mt-1 text-[13px] leading-snug text-spento">
          {nota}
        </p>
      )}
      {lente && file && miniatura && <LenteImmagine titolo={file.name} src={miniatura} onChiudi={() => setLente(false)} />}
      <div aria-live="polite">
        {inCorso && file && <p className="m-0 mt-1 text-[13px] text-tenue">Preparo il file…</p>}
        {errore && (
          <p id={idErrore} role="alert" className="m-0 mt-1 text-[13px] font-bold text-rosso">
            {errore}
          </p>
        )}
      </div>
    </div>
  );
}
