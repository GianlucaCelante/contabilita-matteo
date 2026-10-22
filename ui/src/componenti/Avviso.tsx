import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Contesto, type OpzioniAvviso } from "./contestoAvviso";
import { IconaAllarme, IconaVia } from "./Icone";

// Quanto resta un avviso: almeno 6 s (8 per gli errori), di piu' per i
// messaggi lunghi, mai oltre 15 s. Il mouse sopra o il fuoco dentro lo fermano.
const DURATA_MINIMA_MS = 6000;
const DURATA_ERRORE_MINIMA_MS = 8000;
const DURATA_MASSIMA_MS = 15000;
const MS_PER_CARATTERE = 55;
const CARATTERI_GRATIS = 60;

function durataPer(testo: string, errore: boolean): number {
  const base = errore ? DURATA_ERRORE_MINIMA_MS : DURATA_MINIMA_MS;
  const extra = Math.max(0, testo.length - CARATTERI_GRATIS) * MS_PER_CARATTERE;
  return Math.min(DURATA_MASSIMA_MS, Math.max(base, DURATA_MINIMA_MS + extra));
}

interface AvvisoAttivo {
  id: number;
  testo: string;
  errore: boolean;
}

// L'avviso temporaneo in basso. Un solo provider in cima all'app, richiamabile
// da ogni vista con useAvviso(). Le due regioni live (polite per le
// informazioni, alert per gli errori) sono sempre nel documento, anche vuote,
// perche' lo schermo parlante annunci quello che vi compare dentro.
export function ProviderAvviso({ children }: { children: ReactNode }) {
  const [attivo, setAttivo] = useState<AvvisoAttivo | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const contatore = useRef(0);
  const scadenza = useRef(0);
  const rimanente = useRef(0);

  const parti = useCallback((ms: number) => {
    window.clearTimeout(timer.current);
    scadenza.current = Date.now() + ms;
    timer.current = window.setTimeout(() => setAttivo(null), ms);
  }, []);

  const avvisa = useCallback(
    (testo: string, opzioni?: OpzioniAvviso) => {
      const errore = opzioni?.tipo === "errore";
      contatore.current += 1;
      setAttivo({ id: contatore.current, testo, errore });
      parti(opzioni?.durataMs ?? durataPer(testo, errore));
    },
    [parti],
  );

  const chiudi = useCallback(() => {
    window.clearTimeout(timer.current);
    setAttivo(null);
  }, []);

  const ferma = useCallback(() => {
    rimanente.current = Math.max(scadenza.current - Date.now(), 0);
    window.clearTimeout(timer.current);
  }, []);
  const riprendi = useCallback(() => parti(Math.max(rimanente.current, 3000)), [parti]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const valore = useMemo(() => ({ avvisa }), [avvisa]);

  const avvisoVisibile = (errore: boolean) =>
    attivo && attivo.errore === errore ? (
      <div key={attivo.id} className={"avvisino" + (errore ? " errore" : "")} onMouseEnter={ferma} onMouseLeave={riprendi} onFocus={ferma} onBlur={riprendi}>
        {errore && <IconaAllarme larghezza={20} spessoreTratto={2.2} />}
        <span className="min-w-0 flex-1">{attivo.testo}</span>
        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg" onClick={chiudi} aria-label="Chiudi l'avviso">
          <IconaVia larghezza={18} spessoreTratto={2.4} />
        </button>
      </div>
    ) : null;

  return (
    <Contesto.Provider value={valore}>
      {children}
      {createPortal(
        <div className="zonaAvvisi" data-sempre-attivo>
          <div role="status" aria-live="polite" aria-atomic="true">
            {avvisoVisibile(false)}
          </div>
          <div role="alert" aria-atomic="true">
            {avvisoVisibile(true)}
          </div>
        </div>,
        document.body,
      )}
    </Contesto.Provider>
  );
}
