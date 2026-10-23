import { useEffect, useId, useState } from "react";
import type { StatoPeriodo } from "../hooks/usePeriodo";
import type { TipoPeriodo } from "../util/formato";
import { IconaDestra, IconaSinistra } from "./Icone";

const SEGMENTI: { tipo: TipoPeriodo; etichetta: string }[] = [
  { tipo: "giorno", etichetta: "Oggi" },
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
      {/* Telefono: le due date una sotto l'altra, larghe quanto i segmenti. */}
      <div className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
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
export default function SelettorePeriodo({
  periodo,
  conPeriodoLibero = true,
  senzaNavigatore = false,
  className = "flex-wrap items-center gap-x-4 gap-y-2",
}: {
  periodo: StatoPeriodo;
  conPeriodoLibero?: boolean;
  senzaNavigatore?: boolean;
  className?: string;
}) {
  const { tipo, imposta } = periodo;
  return (
    <div className={"flex max-md:flex-col max-md:items-stretch max-md:gap-3 " + className}>
      <div className="segmenti max-md:flex max-md:h-[46px] max-md:min-h-0 max-md:w-full max-md:min-w-0" role="group" aria-label="Tipo di periodo">
        {SEGMENTI.map(({ tipo: t, etichetta: e }) => (
          <button
            key={t}
            type="button"
            aria-pressed={tipo === t}
            onClick={() => imposta(t)}
            className={(t === "periodo" && !conPeriodoLibero ? "hidden " : "") + "max-md:min-h-0 max-md:min-w-0 max-md:flex-1 max-md:justify-center max-md:px-0 max-md:text-[13px] max-md:tracking-tight"}
          >
            {e}
          </button>
        ))}
      </div>
      {!senzaNavigatore && <NavigatorePeriodo periodo={periodo} />}
    </div>
  );
}

// Larghezza dell'etichetta sul computer, la piu' lunga che il tipo puo' avere («Mercoledì 23 settembre 2026»,
// «29 dicembre 2025 – 4 gennaio 2026», «Settembre 2026»).
const LARGHEZZA_ETICHETTA: Record<"giorno" | "settimana" | "mese" | "anno", string> = {
  giorno: "md:w-[20rem]",
  settimana: "md:w-[22rem]",
  mese: "md:w-[11rem]",
  anno: "md:w-[7rem]",
};

// Le frecce con l'etichetta del periodo, oppure i due campi data per il periodo
// libero. Sul telefono le frecce stanno ai lati e l'etichetta al centro.
export function NavigatorePeriodo({ periodo, className = "" }: { periodo: StatoPeriodo; className?: string }) {
  const { tipo, intervallo, etichetta, sposta, impostaLibero } = periodo;
  if (tipo === "periodo") return <PeriodoLibero da={intervallo.da} a={intervallo.a} imposta={impostaLibero} />;
  return (
    <div className={"flex items-center gap-1 max-md:w-full max-md:justify-between " + className}>
      <button type="button" className="btnIcona" aria-label={tipo === "giorno" ? "Giorno precedente" : "Periodo precedente"} onClick={() => sposta(-1)}>
        <IconaSinistra larghezza={20} spessoreTratto={2} />
      </button>
      {/* Le frecce stanno sempre nello stesso punto: sul computer l'etichetta ha una larghezza fissa per tipo di periodo,
          sul telefono occupa lo spazio fra le frecce e ha l'altezza di due righe. */}
      <span
        className={
          "flex items-center justify-center text-balance px-1 text-center font-titolo text-[16px] font-semibold leading-tight max-md:min-w-0 max-md:flex-1 max-md:min-h-[2.5em] md:text-[18px] " +
          LARGHEZZA_ETICHETTA[tipo]
        }
        aria-live="polite"
      >
        {etichetta}
      </span>
      <button type="button" className="btnIcona" aria-label={tipo === "giorno" ? "Giorno successivo" : "Periodo successivo"} onClick={() => sposta(1)}>
        <IconaDestra larghezza={20} spessoreTratto={2} />
      </button>
    </div>
  );
}
