import { euro, numeroCent } from "../util/formato";
import { numeroSettimanaIso, settimanaCorta, type PuntoSettimana } from "../util/statistiche";

// Lo scontrino medio delle ultime settimane, una barra per settimana. Le barre sono disegnate con il CSS e il testo e' testo vero
// (leggibile anche a 320 px); per chi non vede il disegno c'e' l'elenco completo, nascosto alla vista. Non si capisce dal solo colore:
// l'ultima barra e' scura E il suo valore e' in grassetto; le settimane a cui mancano dati di qualche sede sono a righe.
const ALTEZZA_MASSIMA = 88;

function descrizione(p: PuntoSettimana): string {
  const valore = p.scontrinoMedioCent === null ? "nessun dato" : euro(p.scontrinoMedioCent);
  const extra = p.mancanti > 0 && p.scontrinoMedioCent !== null ? `, mancano i dati di ${p.mancanti === 1 ? "una sede" : `${p.mancanti} sedi`}` : "";
  return `Settimana ${numeroSettimanaIso(p.settimana)} (${settimanaCorta(p.settimana)}): ${valore}${extra}`;
}

export default function GraficoScontrino({ punti }: { punti: PuntoSettimana[] }) {
  return (
    <figure className="m-0" aria-label="Scontrino medio delle ultime settimane">
      <ol className="sr-only">
        {punti.map((p) => (
          <li key={p.settimana}>{descrizione(p)}</li>
        ))}
      </ol>
      <div aria-hidden="true" className="flex items-end gap-1.5 md:gap-3" style={{ height: ALTEZZA_MASSIMA + 44 }}>
        {punti.map((p, i) => {
          const mostraValore = p.ultima || i === 0;
          return (
            <div key={p.settimana} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className={"num text-[11px] md:text-[12px] " + (p.ultima ? "font-bold text-verdescuro" : "font-bold text-spento") + (mostraValore ? "" : " max-md:invisible")}>
                {p.scontrinoMedioCent === null ? "–" : numeroCent(p.scontrinoMedioCent)}
              </span>
              <div
                className={"w-full rounded-t-[5px] rounded-b-[2px] " + (p.ultima ? "bg-verde" : "bg-verdebordo")}
                style={{
                  height: p.scontrinoMedioCent === null ? 3 : Math.max(Math.round(p.altezza * ALTEZZA_MASSIMA), 4),
                  ...(p.mancanti > 0 && p.scontrinoMedioCent !== null
                    ? { backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.65) 0 3px, transparent 3px 6px)" }
                    : {}),
                  ...(p.scontrinoMedioCent === null ? { background: "var(--color-bordo2)" } : {}),
                }}
              />
              <span className={"num text-[11px] " + (p.ultima ? "font-bold text-testo" : "text-spento")}>{p.etichetta}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
