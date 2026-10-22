import { useEffect, useId, useState } from "react";
import type { StatoPeriodo } from "../hooks/usePeriodo";
import type { TipoPeriodo } from "../util/formato";
import { IconaDestra, IconaSinistra } from "./Icone";

const SEGMENTI: { tipo: TipoPeriodo; etichetta: string }[] = [
  { tipo: "settimana", etichetta: "Settimana" },
  { tipo: "mese", etichetta: "Mese" },
  { tipo: "anno", etichetta: "Anno" },
  { tipo: "periodo", etichetta: "Periodo" },
];

// I due campi data del periodo libero. Una data che farebbe finire il periodo
// prima dell'inizio non viene applicata: resta nel campo con l'errore spiegato.
function PeriodoLibero({ da, a, imposta }: { da: string; a: string; imposta: (da: string, a: string) => void }) {
  const idErrore = useId();
  const [bozzaDa, setBozzaDa] = useState(da);
  const [bozzaA, setBozzaA] = useState(a);
  useEffect(() => {
    setBozzaDa(da);
    setBozzaA(a);
  }, [da, a]);
  const incoerente = bozzaDa !== "" && bozzaA !== "" && bozzaDa > bozzaA;

  function cambia(nuovoDa: string, nuovoA: string) {
    setBozzaDa(nuovoDa);
    setBozzaA(nuovoA);
    if (nuovoDa && nuovoA && nuovoDa <= nuovoA) imposta(nuovoDa, nuovoA);
  }

  const descrive = incoerente ? idErrore : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className={"campo !min-h-[48px]" + (incoerente ? " errore" : "")}>
          <span className="text-[13px] font-bold text-spento">Dal</span>
          <input type="date" value={bozzaDa} aria-invalid={incoerente || undefined} aria-describedby={descrive} onChange={(e) => cambia(e.target.value, bozzaA)} />
        </label>
        <label className={"campo !min-h-[48px]" + (incoerente ? " errore" : "")}>
          <span className="text-[13px] font-bold text-spento">Al</span>
          <input type="date" value={bozzaA} aria-invalid={incoerente || undefined} aria-describedby={descrive} onChange={(e) => cambia(bozzaDa, e.target.value)} />
        </label>
      </div>
      {incoerente && (
        <p id={idErrore} role="alert" className="m-0 text-[13px] font-bold text-rosso">
          La data «Dal» non può venire dopo la data «Al».
        </p>
      )}
    </div>
  );
}

// Settimana / Mese / Anno / Periodo con le frecce e l'etichetta del periodo.
// Per il periodo libero compaiono due campi data (anche sul telefono, dove
// vanno a capo). `conPeriodoLibero={false}` nasconde la scelta «Periodo».
export default function SelettorePeriodo({ periodo, conPeriodoLibero = true }: { periodo: StatoPeriodo; conPeriodoLibero?: boolean }) {
  const { tipo, intervallo, etichetta, imposta, sposta, impostaLibero } = periodo;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="segmenti" role="group" aria-label="Tipo di periodo">
        {SEGMENTI.map(({ tipo: t, etichetta: e }) => (
          <button key={t} type="button" aria-pressed={tipo === t} onClick={() => imposta(t)} className={t === "periodo" && !conPeriodoLibero ? "hidden" : undefined}>
            {e}
          </button>
        ))}
      </div>
      {tipo === "periodo" ? (
        <PeriodoLibero da={intervallo.da} a={intervallo.a} imposta={impostaLibero} />
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
