import { useEffect, useId, useRef, useState } from "react";
import { controllaAllegato, preparaAllegato, tipoDi } from "../util/immagini";

interface ProprietaCampoAllegato {
  file: File | null;
  onCambia: (file: File | null) => void;
  disabilitato?: boolean;
}

// Sul telefono (puntatore "grossolano") il pulsante invita a scattare.
function suTelefono(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

// Scelta dell'allegato facoltativo PRIMA del salvataggio: anteprima (miniatura per le
// immagini, icona e nome per i PDF), «Rimuovi», controlli in italiano e ridimensionamento
// delle foto grandi. Il file arriva al genitore gia' pronto per l'invio.
export default function CampoAllegato({ file, onCambia, disabilitato }: ProprietaCampoAllegato) {
  const idEtichetta = useId();
  const idErrore = useId();
  const rifInput = useRef<HTMLInputElement>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [miniatura, setMiniatura] = useState<string | null>(null);

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

  async function scelto(scelto: File | undefined) {
    if (rifInput.current) rifInput.current.value = ""; // si puo' riscegliere lo stesso file
    if (!scelto) return;
    setErrore(null);
    setInCorso(true);
    try {
      const pronto = await preparaAllegato(scelto);
      const problema = controllaAllegato(pronto);
      if (problema) setErrore(problema);
      else onCambia(pronto);
    } finally {
      setInCorso(false);
    }
  }

  const testoPulsante = suTelefono() ? "Scatta o scegli" : "Scegli un file";

  return (
    <div>
      <div id={idEtichetta} className="etichetta">
        Allegato <span className="font-normal text-tenue">(facoltativo) Foto o PDF</span>
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
            <img src={miniatura} alt={`Anteprima di ${file.name}`} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
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
              onCambia(null);
            }}
          >
            Rimuovi
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn w-full border-dashed"
          disabled={disabilitato || inCorso}
          aria-describedby={errore ? idErrore : undefined}
          onClick={() => rifInput.current?.click()}
        >
          {inCorso ? "Preparo il file…" : testoPulsante}
        </button>
      )}
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
