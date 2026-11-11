import { euro, numeroCent } from "../util/formato";
import { notaSenzaIncassi, numeroSettimanaIso, settimanaCorta, valoreSempreScritto, type PuntoSettimana } from "../util/statistiche";

// Lo scontrino medio delle ultime settimane, una barra per settimana. Le barre sono disegnate con il CSS e il testo e' testo vero
// (leggibile anche a 320 px); per chi non vede il disegno c'e' l'elenco completo, nascosto alla vista. Non si capisce dal solo colore:
// l'ultima barra e' scura E il suo valore e' in grassetto; le settimane a cui mancano dati di qualche sede sono a righe; una settimana non
// inserita e' un trattino vuoto tratteggiato senza testo, una con ordini ma senza incassi un trattino ambra con «—» (legenda sotto).
const ALTEZZA_MASSIMA = 88;

function descrizione(p: PuntoSettimana): string {
  const valore = p.tipo === "valore" ? euro(p.scontrinoMedioCent!) : p.tipo === "senzaIncassi" ? "scontrino —, ci sono ordini ma nessun incasso registrato" : "non inserita";
  const extra = p.mancanti > 0 && p.tipo === "valore" ? `, mancano i dati di ${p.mancanti === 1 ? "una sede" : `${p.mancanti} sedi`}` : "";
  return `Settimana ${numeroSettimanaIso(p.settimana)} (${settimanaCorta(p.settimana)}): ${valore}${extra}`;
}

export default function GraficoScontrino({ punti }: { punti: PuntoSettimana[] }) {
  const nota = notaSenzaIncassi(punti);
  return (
    <figure className="m-0" aria-label="Scontrino medio delle ultime settimane">
      <ol className="sr-only">
        {punti.map((p) => (
          <li key={p.settimana}>{descrizione(p)}</li>
        ))}
      </ol>
      <div aria-hidden="true" className="flex items-end gap-1.5 md:gap-3" style={{ height: ALTEZZA_MASSIMA + 44 }}>
        {punti.map((p, i) => {
          const mostraValore = valoreSempreScritto(p, i);
          return (
            <div key={p.settimana} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              {/* Senza dati: nessun testo. Ordini senza incassi: «—» in ambra, sempre scritto (anche sul telefono). */}
              <span
                className={
                  "num text-[11px] md:text-[12px] font-bold " +
                  (p.tipo === "senzaIncassi" ? "text-ambra" : p.ultima ? "text-verdescuro" : "text-spento") +
                  (mostraValore ? "" : " max-md:invisible")
                }
              >
                {p.tipo === "valore" ? numeroCent(p.scontrinoMedioCent!) : p.tipo === "senzaIncassi" ? "—" : "\u00a0"}
              </span>
              <div
                className={"w-full rounded-t-[5px] rounded-b-[2px] " + (p.ultima ? "bg-verde" : "bg-verdebordo")}
                style={{
                  height: p.scontrinoMedioCent === null ? 3 : Math.max(Math.round(p.altezza * ALTEZZA_MASSIMA), 4),
                  ...(p.mancanti > 0 && p.scontrinoMedioCent !== null
                    ? { backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.65) 0 3px, transparent 3px 6px)" }
                    : {}),
                  // senza dati: un trattino vuoto col bordo tratteggiato grigio; ordini senza incassi: col bordo ambra pieno
                  ...(p.tipo === "senzaDati" ? { background: "transparent", border: "1.5px dashed var(--color-bordo2)", height: 8 } : {}),
                  ...(p.tipo === "senzaIncassi" ? { background: "var(--color-ambrachiaro)", border: "1.5px solid var(--color-ambra)", height: 8 } : {}),
                }}
              />
              <span className={"num text-[11px] " + (p.ultima ? "font-bold text-testo" : "text-spento")}>{p.etichetta}</span>
            </div>
          );
        })}
      </div>
      {/* La legenda di quello che non e' un valore: solo se c'e' (il testo vero per lo screen reader e' nell'elenco). */}
      {(nota || punti.some((p) => p.tipo === "senzaDati")) && (
        <figcaption aria-hidden="true" className="mt-2 flex flex-col gap-0.5 text-[12px] leading-snug text-spento">
          {punti.some((p) => p.tipo === "senzaDati") && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 shrink-0 rounded-[2px]" style={{ border: "1.5px dashed var(--color-bordo2)" }} /> Settimana non inserita
            </span>
          )}
          {nota && (
            <span className="inline-flex items-start gap-1.5">
              <span className="mt-[3px] inline-block h-2 w-3 shrink-0 rounded-[2px]" style={{ background: "var(--color-ambrachiaro)", border: "1.5px solid var(--color-ambra)" }} />
              <span>{nota}</span>
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
