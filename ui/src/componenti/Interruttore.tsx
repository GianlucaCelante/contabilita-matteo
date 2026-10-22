import { useId, type ReactNode } from "react";

interface ProprietaInterruttore {
  acceso: boolean;
  onCambia: () => void;
  titolo: ReactNode;
  // La riga piccola sotto il titolo.
  sotto?: ReactNode;
  disabled?: boolean;
}

// Interruttore accessibile: role="switch" con aria-checked, nome dal titolo e
// descrizione dalla riga sotto. Lo stato si legge in tre segni: posizione del
// pallino, colore e la parola «Acceso»/«Spento». Tutta la riga e' il bersaglio.
export default function Interruttore({ acceso, onCambia, titolo, sotto, disabled }: ProprietaInterruttore) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      aria-labelledby={`${id}-titolo`}
      aria-describedby={sotto ? `${id}-sotto` : undefined}
      disabled={disabled}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-bordo2 bg-carta px-4 py-2 text-left disabled:opacity-60"
      onClick={onCambia}
    >
      <span className="min-w-0 flex-1">
        <span id={`${id}-titolo`} className="block text-[16px] font-bold">
          {titolo}
        </span>
        {sotto && (
          <span id={`${id}-sotto`} className="block text-[13.5px] text-tenue">
            {sotto}
          </span>
        )}
      </span>
      <span className="text-[13px] font-bold text-spento" aria-hidden="true">
        {acceso ? "Acceso" : "Spento"}
      </span>
      <span className={"interruttore" + (acceso ? "" : " off")} aria-hidden="true" />
    </button>
  );
}
