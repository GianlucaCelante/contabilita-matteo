import { useEffect, useId, useRef, useState } from "react";
import type { StatoPeriodo } from "../hooks/usePeriodo";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { nomiFrecce, sceltePeriodo, type SceltaPeriodo } from "../util/sceltePeriodo";
import Finestra from "./Finestra";
import { IconaDestra, IconaGiu, IconaSinistra, IconaSpunta } from "./Icone";

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
      {/* Telefono (nel foglio): le due date una sotto l'altra, a tutta larghezza. */}
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

// Il periodo da guardare: Oggi / Settimana / Mese / Anno / Periodo, le frecce e l'etichetta del periodo.
// Computer (da md): i segmenti con accanto le frecce e l'etichetta; per il periodo libero due campi data al posto delle frecce.
// Telefono: una riga sola «‹ Novembre 2026 ›»; toccando l'etichetta si apre un foglio dal basso con le stesse scelte e, per il
// periodo libero, le due date. Stesso stato (`usePeriodo`: indirizzo e ultima scelta ricordata) nelle due forme.
// `conPeriodoLibero={false}` toglie la scelta «Periodo», `senzaGiorno` la scelta «Oggi».
export default function SelettorePeriodo({
  periodo,
  conPeriodoLibero = true,
  senzaGiorno = false,
  className = "flex-wrap items-center gap-x-4 gap-y-2",
}: {
  periodo: StatoPeriodo;
  conPeriodoLibero?: boolean;
  senzaGiorno?: boolean;
  className?: string;
}) {
  const { tipo, imposta } = periodo;
  const scelte = sceltePeriodo({ conPeriodoLibero, senzaGiorno });
  return (
    <>
      <PeriodoCompatto periodo={periodo} scelte={scelte} />
      <div className={"flex max-md:hidden " + className}>
        <div className="segmenti" role="group" aria-label="Tipo di periodo">
          {scelte.map((s) => (
            <button key={s.tipo} type="button" aria-pressed={tipo === s.tipo} onClick={() => imposta(s.tipo)}>
              {s.etichetta}
            </button>
          ))}
        </div>
        <NavigatorePeriodo periodo={periodo} />
      </div>
    </>
  );
}

// Larghezza dell'etichetta sul computer, la piu' lunga che il tipo puo' avere («Mercoledì 23 settembre 2026»,
// «29 dicembre 2025 – 4 gennaio 2026», «Settembre 2026»): le frecce stanno sempre nello stesso punto.
const LARGHEZZA_ETICHETTA: Record<"giorno" | "settimana" | "mese" | "anno", string> = {
  giorno: "w-[20rem]",
  settimana: "w-[22rem]",
  mese: "w-[11rem]",
  anno: "w-[7rem]",
};

// Computer: le frecce con l'etichetta del periodo, oppure i due campi data per il periodo libero.
function NavigatorePeriodo({ periodo }: { periodo: StatoPeriodo }) {
  const { tipo, intervallo, etichetta, sposta, impostaLibero } = periodo;
  if (tipo === "periodo") return <PeriodoLibero da={intervallo.da} a={intervallo.a} imposta={impostaLibero} />;
  const nomi = nomiFrecce(tipo);
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="btnIcona" aria-label={nomi.prima} onClick={() => sposta(-1)}>
        <IconaSinistra larghezza={20} spessoreTratto={2} />
      </button>
      <span className={"flex items-center justify-center text-balance px-1 text-center font-titolo text-[18px] font-semibold leading-tight " + LARGHEZZA_ETICHETTA[tipo]} aria-live="polite">
        {etichetta}
      </span>
      <button type="button" className="btnIcona" aria-label={nomi.dopo} onClick={() => sposta(1)}>
        <IconaDestra larghezza={20} spessoreTratto={2} />
      </button>
    </div>
  );
}

const FRECCIA_COMPATTA = "flex w-[48px] shrink-0 items-center justify-center rounded-xl hover:bg-sabbia disabled:opacity-35 disabled:hover:bg-transparent";

// Telefono: «‹ Novembre 2026 ›» in una riga sola. Le frecce scorrono il periodo (spente con il periodo libero, che si cambia dalle
// date nel foglio); l'etichetta e' il pulsante che apre il foglio.
function PeriodoCompatto({ periodo, scelte }: { periodo: StatoPeriodo; scelte: SceltaPeriodo[] }) {
  const { tipo, etichetta, sposta } = periodo;
  const [aperto, setAperto] = useState(false);
  // Il foglio e' del telefono: se la finestra si allarga fino al computer (da 1024 px) si chiude.
  const grande = useSchermoGrande();
  useEffect(() => {
    if (grande) setAperto(false);
  }, [grande]);
  const libero = tipo === "periodo";
  const nomi = nomiFrecce(tipo);
  return (
    <div role="group" aria-label="Periodo" className="flex min-h-[48px] items-stretch rounded-xl border border-bordo2 bg-carta md:hidden">
      <button type="button" className={FRECCIA_COMPATTA} aria-label={nomi.prima} disabled={libero} onClick={() => sposta(-1)}>
        <IconaSinistra larghezza={20} spessoreTratto={2} />
      </button>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Cambia periodo. Adesso: ${etichetta}`}
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1 py-1 hover:bg-sabbia"
        onClick={() => setAperto(true)}
      >
        <span className="min-w-0 text-balance text-center font-titolo text-[16px] font-semibold leading-tight">{etichetta}</span>
        <span className="shrink-0 text-spento">
          <IconaGiu larghezza={18} spessoreTratto={2.2} />
        </span>
      </button>
      <button type="button" className={FRECCIA_COMPATTA} aria-label={nomi.dopo} disabled={libero} onClick={() => sposta(1)}>
        <IconaDestra larghezza={20} spessoreTratto={2} />
      </button>
      {/* Chi usa lo screen reader sente il nuovo periodo quando preme una freccia. */}
      <span className="sr-only" aria-live="polite">
        {etichetta}
      </span>
      {aperto && <FoglioPeriodo periodo={periodo} scelte={scelte} onChiudi={() => setAperto(false)} />}
    </div>
  );
}

// Il foglio dal basso: una riga per scelta. Oggi, Settimana, Mese e Anno si applicano e chiudono il foglio; «Periodo» lo lascia
// aperto con le due date, che si applicano mentre si scelgono. Toccare «Oggi» quando e' gia' scelto riporta al giorno corrente.
function FoglioPeriodo({ periodo, scelte, onChiudi }: { periodo: StatoPeriodo; scelte: SceltaPeriodo[]; onChiudi: () => void }) {
  const { tipo, intervallo, etichetta, imposta, impostaLibero } = periodo;
  const libero = tipo === "periodo";
  // Le due date stanno in fondo al foglio: su un telefono corto possono restare sotto la piega. Quando compaiono si portano in
  // vista; se si e' appena toccato «Periodo» il fuoco va su «Dal» (aprendo il foglio resta sulla scelta attiva).
  const rifDate = useRef<HTMLDivElement>(null);
  const appenaScelto = useRef(false);
  useEffect(() => {
    if (!libero) return;
    rifDate.current?.scrollIntoView({ block: "nearest" });
    if (appenaScelto.current) rifDate.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    appenaScelto.current = false;
  }, [libero]);
  return (
    <Finestra
      foglio
      titolo="Che periodo vuoi vedere?"
      onChiudi={onChiudi}
      piede={
        <button type="button" className="btn primario w-full" onClick={onChiudi}>
          {libero ? `Mostra ${etichetta}` : "Chiudi"}
        </button>
      }
    >
      <div role="group" aria-label="Tipo di periodo" className="-mt-2 flex flex-col">
        {scelte.map((s, i) => {
          const scelto = tipo === s.tipo;
          return (
            <button
              key={s.tipo}
              type="button"
              aria-pressed={scelto}
              data-focus-iniziale={scelto || undefined}
              className={"flex min-h-[56px] w-full items-center gap-3 py-1.5 text-left " + (i > 0 ? "border-t border-riga" : "")}
              onClick={() => {
                imposta(s.tipo);
                if (s.tipo !== "periodo") onChiudi();
                else if (!libero) appenaScelto.current = true;
              }}
            >
              <span className="min-w-0 flex-1">
                <span className={"block text-[16px] font-bold " + (scelto ? "text-verdescuro" : "")}>{s.etichetta}</span>
                <span className="block text-[13.5px] leading-snug text-tenue">{s.aiuto}</span>
              </span>
              {scelto && (
                <span className="shrink-0 text-verdescuro">
                  <IconaSpunta larghezza={20} spessoreTratto={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {libero && (
        <div ref={rifDate}>
          <PeriodoLibero da={intervallo.da} a={intervallo.a} imposta={impostaLibero} />
        </div>
      )}
    </Finestra>
  );
}
