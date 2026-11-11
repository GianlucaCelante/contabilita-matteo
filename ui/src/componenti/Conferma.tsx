import { useEffect, useRef, type ReactNode } from "react";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { ordinePiede } from "../util/piedeConferma";
import Finestra from "./Finestra";

export interface AzioneConferma {
  // Serve solo se l'etichetta cambia mentre la finestra e' aperta («Elimino…»): tiene fermo il pulsante.
  chiave?: string;
  // Il verbo dell'azione: «Elimina», «Archivia», «Segna pagate», «Esci senza salvare»…
  etichetta: string;
  onClick: () => void;
  // "pericolo" = bordo rosso; "distruttiva" = rosso pieno (la cosa che non si annulla); "primario" = verde; niente = neutro.
  stile?: "primario" | "pericolo" | "distruttiva";
  disabled?: boolean;
}

interface ProprietaConferma {
  titolo: string;
  sottotitolo?: string;
  // «Annulla», Esc e il tocco fuori. Con `occupato` (la richiesta e' partita) la finestra non si chiude.
  onAnnulla: () => void;
  // L'azione che si conferma (sul computer finisce a destra) e, se serve, una seconda strada meno forte («Elimina solo questo»).
  azione: AzioneConferma;
  altra?: AzioneConferma | undefined;
  occupato?: boolean;
  children?: ReactNode;
}

const CLASSE: Record<NonNullable<AzioneConferma["stile"]> | "neutro", string> = {
  neutro: "btn",
  primario: "btn primario",
  pericolo: "btn pericolo",
  distruttiva: "btn pericolo pieno",
};

// La conferma, uguale in tutta l'app: «Annulla» e il verbo dell'azione (mai «Sì/No», «Resta qui», «Tienila»). Sul telefono e' un
// foglio dal basso: con una sola azione «Annulla» sta a sinistra e l'azione, piu' larga, a destra; con piu' azioni i pulsanti stanno
// in colonna a tutta larghezza, la principale in alto e «Annulla» in fondo. Sul computer e' la finestra al centro, «Annulla» per
// primo e la principale a destra. All'apertura il fuoco va su «Annulla».
export default function Conferma({ titolo, sottotitolo, onAnnulla, azione, altra, occupato, children }: ProprietaConferma) {
  const grande = useSchermoGrande();
  const azioni = altra ? [altra, azione] : [azione];
  // Con `occupato` i pulsanti si spengono e quello premuto perde il fuoco (finisce sulla pagina). Se la richiesta fallisce e la
  // conferma resta aperta, il fuoco torna su «Annulla»: Tab e Invio ripartono da li', come all'apertura.
  const rifAnnulla = useRef<HTMLButtonElement>(null);
  const eraOccupato = useRef(false);
  useEffect(() => {
    const perso = document.activeElement === null || document.activeElement === document.body;
    if (eraOccupato.current && !occupato && perso) rifAnnulla.current?.focus({ preventScroll: true });
    eraOccupato.current = !!occupato;
  }, [occupato]);
  // Una sola azione: sul telefono una riga, «Annulla» stretto e l'azione larga il doppio. Piu' azioni: sul telefono in colonna.
  const unaSola = azioni.length === 1;
  const inColonna = !grande && !unaSola;
  const annulla = (
    <button key="annulla" ref={rifAnnulla} type="button" className={"btn" + (unaSola ? " max-md:flex-1 max-md:px-3" : " max-md:w-full")} data-focus-iniziale disabled={occupato} onClick={onAnnulla}>
      Annulla
    </button>
  );
  const pulsanti = azioni.map((a) => (
    <button
      key={a.chiave ?? a.etichetta}
      type="button"
      data-distruttivo={a.stile === "distruttiva" ? "" : undefined}
      className={CLASSE[a.stile ?? "neutro"] + (unaSola ? " max-md:flex-[2] max-md:px-3" : " max-md:w-full")}
      disabled={occupato || a.disabled}
      onClick={a.onClick}
    >
      {a.etichetta}
    </button>
  ));
  const ordinati = ordinePiede(annulla, pulsanti, inColonna);
  return (
    <Finestra
      foglio
      titolo={titolo}
      {...(sottotitolo ? { sottotitolo } : {})}
      {...(occupato ? {} : { onChiudi: onAnnulla })}
      // Piu' azioni: i pulsanti stanno nel piede della finestra, che sul computer va a capo se non c'entrano in una riga.
      piede={unaSola ? <div className="flex w-full gap-3 md:w-auto">{ordinati}</div> : ordinati}
    >
      {children}
    </Finestra>
  );
}
