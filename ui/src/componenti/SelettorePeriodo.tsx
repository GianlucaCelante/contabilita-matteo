import type { StatoPeriodo } from "../hooks/usePeriodo";
import type { TipoPeriodo } from "../util/formato";
import { IconaDestra, IconaSinistra } from "./Icone";

const SEGMENTI: { tipo: TipoPeriodo; etichetta: string }[] = [
  { tipo: "settimana", etichetta: "Settimana" },
  { tipo: "mese", etichetta: "Mese" },
  { tipo: "anno", etichetta: "Anno" },
  { tipo: "periodo", etichetta: "Periodo" },
];

// Settimana / Mese / Anno / Periodo con le frecce e l'etichetta del periodo.
// Per il periodo libero compaiono due campi data. Sul telefono il periodo
// libero non c'e' (versione ridotta dei mockup) a meno di `conPeriodoLibero`.
export default function SelettorePeriodo({ periodo, conPeriodoLibero = true }: { periodo: StatoPeriodo; conPeriodoLibero?: boolean }) {
  const { tipo, intervallo, etichetta, imposta, sposta, impostaLibero } = periodo;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="segmenti" role="group" aria-label="Tipo di periodo">
        {SEGMENTI.map(({ tipo: t, etichetta: e }) => (
          <button
            key={t}
            type="button"
            aria-pressed={tipo === t}
            onClick={() => imposta(t)}
            className={t === "periodo" && !conPeriodoLibero ? "max-md:hidden" : undefined}
          >
            {e}
          </button>
        ))}
      </div>
      {tipo === "periodo" ? (
        <div className="flex flex-wrap items-center gap-2 max-md:hidden">
          <label className="campo !min-h-[48px]">
            <span className="text-[13px] font-bold text-spento">Dal</span>
            <input type="date" value={intervallo.da} max={intervallo.a} onChange={(e) => e.target.value && impostaLibero(e.target.value, intervallo.a)} />
          </label>
          <label className="campo !min-h-[48px]">
            <span className="text-[13px] font-bold text-spento">Al</span>
            <input type="date" value={intervallo.a} min={intervallo.da} onChange={(e) => e.target.value && impostaLibero(intervallo.da, e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button type="button" className="btnIcona" aria-label="Periodo precedente" onClick={() => sposta(-1)}>
            <IconaSinistra larghezza={20} spessoreTratto={2} />
          </button>
          <span className="px-3 font-titolo text-[18px] font-semibold" aria-live="polite">
            {etichetta}
          </span>
          <button type="button" className="btnIcona" aria-label="Periodo successivo" onClick={() => sposta(1)}>
            <IconaDestra larghezza={20} spessoreTratto={2} />
          </button>
        </div>
      )}
    </div>
  );
}
