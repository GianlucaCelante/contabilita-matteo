import type { ReactNode } from "react";
import { messaggioErrore } from "../api/client";
import { IconaAllarme, IconaCercaDiNuovo } from "./Icone";

// Gli stati comuni di ogni schermata: caricamento, vuoto, errore.

export function Caricamento({ testo = "Un momento…" }: { testo?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 p-10 text-[16px] text-tenue">
      <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-bordo2 border-t-verde" aria-hidden="true" />
      <span>{testo}</span>
    </div>
  );
}

export function Vuoto({ titolo, testo, azione }: { titolo: string; testo?: string; azione?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center">
      <p className="m-0 font-titolo text-[20px] font-semibold">{titolo}</p>
      {testo && <p className="m-0 max-w-md text-[15px] text-tenue">{testo}</p>}
      {azione && <div className="mt-3">{azione}</div>}
    </div>
  );
}

export function ErroreCaricamento({ errore, onRiprova }: { errore: unknown; onRiprova?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 p-10 text-center">
      <span className="text-rosso">
        <IconaAllarme larghezza={28} spessoreTratto={2} />
      </span>
      <p className="m-0 max-w-md text-[16px] font-bold text-rosso">{messaggioErrore(errore)}</p>
      {onRiprova && (
        <button type="button" className="btn" onClick={onRiprova}>
          <IconaCercaDiNuovo larghezza={18} spessoreTratto={2} />
          <span>Riprova</span>
        </button>
      )}
    </div>
  );
}

// Segnaposto per le funzioni che il servizio non ha ancora (Importa, Esporta).
export function InArrivo({ titolo, testo }: { titolo: string; testo: string }) {
  return (
    <div className="scheda flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="inline-flex h-7 items-center rounded-full bg-ambrachiaro px-3 text-[13px] font-bold text-ambra">In arrivo</span>
      <h2 className="text-[22px] font-bold">{titolo}</h2>
      <p className="m-0 max-w-lg text-[16px] leading-relaxed text-tenue">{testo}</p>
    </div>
  );
}
