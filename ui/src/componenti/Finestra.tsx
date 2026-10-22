import { useCallback, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModale } from "../hooks/useModale";

interface ProprietaFinestra {
  titolo: string;
  sottotitolo?: string;
  onChiudi?: () => void;
  piede?: ReactNode;
  children?: ReactNode;
}

// Il velo e la finestra modale (conferme di eliminazione e simili). Sta in un
// portale su document.body; la gestione del fuoco (dentro all'apertura, Tab
// che gira, Esc, pagina dietro inerte, fuoco restituito) e' in useModale.
export default function Finestra({ titolo, sottotitolo, onChiudi, piede, children }: ProprietaFinestra) {
  const rifVelo = useRef<HTMLDivElement>(null);
  const rifFinestra = useRef<HTMLDivElement>(null);
  const idTitolo = useId();
  const idSottotitolo = useId();

  const suClicVelo = useCallback(
    (evento: MouseEvent<HTMLDivElement>) => {
      if (onChiudi && evento.target === evento.currentTarget) onChiudi();
    },
    [onChiudi],
  );

  useModale({ velo: rifVelo, finestra: rifFinestra, onChiudi });

  return createPortal(
    <div ref={rifVelo} className="velo" onClick={suClicVelo} role="presentation">
      <div
        ref={rifFinestra}
        className="finestra"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitolo}
        aria-describedby={sottotitolo ? idSottotitolo : undefined}
        tabIndex={-1}
      >
        <div className="flex flex-col gap-1">
          <h2 id={idTitolo} className="text-[22px] font-bold leading-tight">
            {titolo}
          </h2>
          {sottotitolo && (
            <p id={idSottotitolo} className="m-0 text-[15px] leading-snug text-tenue">
              {sottotitolo}
            </p>
          )}
        </div>
        {children}
        {piede && <div className="flex flex-wrap justify-end gap-3">{piede}</div>}
      </div>
    </div>,
    document.body,
  );
}
