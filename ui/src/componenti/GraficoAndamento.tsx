import { useId, useState, type KeyboardEvent } from "react";
import { euroTondo, barraIniziale, type Barra, type DatiGrafico, type MisuraGrafico } from "../util/graficoStatistiche";
import { testoConteggio } from "../util/statistiche";

// Pizze o ricavi intervallo per intervallo (giorni, settimane o mesi), barre da zero. I ricavi sono una barra impilata: in basso il
// fatturato, sopra l'extra, separati da 2 px di bianco; le pizze una barra sola. Una scala sola: le due misure non stanno mai insieme.
// Disegno con il CSS e testo vero; per chi non vede il disegno c'e' l'elenco completo, nascosto alla vista (come GraficoScontrino).
// Toccando o passando sopra una barra, la riga sopra il grafico dice il suo valore. Non si capisce dal solo colore: c'e' la legenda,
// la riga del dettaglio e l'elenco; gli intervalli senza pizze inserite sono un trattino a righe, quelli futuri restano vuoti. Con le
// pizze giorno per giorno, un lunedi' che porta il «Totale della settimana» ha la barra a strisce oblique e il bordo scuro (voce di
// legenda apposta, e il testo del dettaglio e dell'elenco lo dice); i giorni dopo, senza dati loro, sono un trattino col bordo
// tratteggiato («Nel totale della settimana»), non «Non inserite».
// Tastiera: l'area delle barre e' un cursore (role="slider") raggiungibile col Tab; le frecce sinistra/destra (e Inizio/Fine) scelgono
// la barra, il dettaglio si aggiorna e lo screen reader legge il valore (aria-valuetext: «Lunedì 2 novembre 2026: 700 pizze …»). Le
// colonne restano fuori dal giro del Tab e nascoste agli screen reader; l'elenco completo resta.

const ALTEZZA = 168;
// La colonna dei numeri della scala: ci sta «€ 12.500» (per le pizze basta meno).
const GRONDA = { pizze: 40, ricavi: 52 };
// Il verde scuro dell'app per il fatturato (e per le pizze), un'ocra per l'extra: coppia controllata per daltonismo (skill dataviz,
// validate_palette: ΔE 18 protan, 25 a vista normale; l'ocra ha contrasto 2,9:1 sul bianco, per questo legenda ed elenco ci sono sempre).
export const COLORE_FATTURATO = "#4B6313";
export const COLORE_EXTRA = "#C98E1E";
const RIGHE_SENZA_DATI = "repeating-linear-gradient(135deg, var(--color-bordo2) 0 2px, transparent 2px 5px)";
// La barra col totale della settimana: il verde delle pizze a strisce chiare oblique, con il bordo verde scuro.
const STRISCE_SETTIMANA = "repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 2px, transparent 2px 6px)";
const STILE_SETTIMANA = { backgroundColor: "var(--color-verde)", backgroundImage: STRISCE_SETTIMANA, boxShadow: "inset 0 0 0 1.5px var(--color-verdescuro)" };

// Un giorno compreso nel totale della settimana: un trattino vuoto col bordo verde scuro tratteggiato.
const STILE_NEL_TOTALE = { border: "1.5px dashed var(--color-verdescuro)", background: "transparent" };

function Campione({ colore, righe = false, settimana = false, nelTotale = false }: { colore?: string; righe?: boolean; settimana?: boolean; nelTotale?: boolean }) {
  const stile = nelTotale
    ? STILE_NEL_TOTALE
    : settimana
      ? STILE_SETTIMANA
      : righe
        ? { backgroundImage: RIGHE_SENZA_DATI, boxShadow: "inset 0 0 0 1px var(--color-bordo2)" }
        : { background: colore };
  return <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={stile} />;
}

function Colonna({ b, misura, scelta, onScegli }: { b: Barra; misura: MisuraGrafico; scelta: boolean; onScegli: () => void }) {
  const fatturato = Math.max(b.altezza - b.altezzaExtra, 0) * ALTEZZA;
  const extra = b.altezzaExtra * ALTEZZA;
  return (
    // Un pulsante fuori dal giro del Tab (tutto il disegno e' nascosto agli screen reader, che leggono l'elenco): l'area da toccare e'
    // tutta la colonna, non solo la barra.
    <button
      type="button"
      tabIndex={-1}
      className={"flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end rounded-t-md border-0 bg-transparent p-0 " + (scelta ? "!bg-sabbia" : "")}
      // il clic non porta il fuoco sulla colonna (che e' nascosta agli screen reader): resta sul gruppo
      onMouseDown={(e) => e.preventDefault()}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onScegli();
      }}
      onClick={onScegli}
    >
      {b.stato === "senzaDati" && <div className="w-full max-w-[24px] rounded-t-[3px]" style={{ height: 10, backgroundImage: RIGHE_SENZA_DATI }} />}
      {b.stato === "nelTotale" && <div className="w-full max-w-[24px] rounded-t-[3px]" style={{ height: 10, ...STILE_NEL_TOTALE }} />}
      {b.stato === "dati" && (
        <div className="flex w-full max-w-[24px] flex-col justify-end gap-[2px]">
          {/* i 2 px dello stacco si tolgono all'extra, cosi' la barra intera arriva esattamente alla sua altezza */}
          {extra > 0 && <div className="w-full rounded-t-[4px]" style={{ height: Math.max(extra - (fatturato > 0 ? 2 : 0), 2), background: COLORE_EXTRA }} />}
          {(fatturato > 0 || extra === 0) && (
            <div
              className={"w-full " + (extra > 0 ? "" : "rounded-t-[4px]")}
              // uno zero inserito resta visibile: una linea di 2 px sulla base
              style={{
                height: Math.max(Math.round(fatturato), b.valore > 0 && extra === 0 ? 3 : 2),
                ...(b.settimanale ? STILE_SETTIMANA : { background: misura === "pizze" ? "var(--color-verde)" : COLORE_FATTURATO }),
              }}
            />
          )}
        </div>
      )}
    </button>
  );
}

export default function GraficoAndamento({ dati, misura, descrizione }: { dati: DatiGrafico; misura: MisuraGrafico; descrizione: string }) {
  const { barre, scala } = dati;
  // La barra del dettaglio: quella toccata, altrimenti l'ultima che non e' nel futuro. Si azzera quando cambiano le barre.
  const [scelta, setScelta] = useState<{ chiave: string; indice: number } | null>(null);
  const chiave = `${misura}|${barre[0]?.inizio ?? ""}|${barre.length}`;
  const indice = scelta && scelta.chiave === chiave ? scelta.indice : barraIniziale(barre);
  const attuale = barre[indice];
  const senzaDati = barre.some((b) => b.stato === "senzaDati");
  const nelTotale = barre.some((b) => b.stato === "nelTotale");
  const idAiuto = useId();
  const vaiA = (i: number) => {
    if (barre.length > 0) setScelta({ chiave, indice: Math.max(0, Math.min(barre.length - 1, i)) });
  };
  const tasto = (e: KeyboardEvent<HTMLDivElement>) => {
    const nuovo = e.key === "ArrowLeft" ? indice - 1 : e.key === "ArrowRight" ? indice + 1 : e.key === "Home" ? 0 : e.key === "End" ? barre.length - 1 : null;
    if (nuovo === null) return;
    e.preventDefault();
    vaiA(nuovo);
  };
  const poche = barre.length <= 14;
  // Lo stacco fra le barre: largo con poche barre, 2 px fino a un mese, 1 px oltre (53 settimane a 320 px restano leggibili).
  const spazio = poche ? "gap-1.5 md:gap-3" : barre.length <= 31 ? "gap-[2px]" : "gap-px";
  const testoTacca = (v: number) => (misura === "pizze" ? testoConteggio(v) : euroTondo(v));

  return (
    <figure className="m-0" aria-label={descrizione}>
      <ol className="sr-only">
        {barre.map((b) => (
          <li key={b.inizio}>
            {b.nome}: {b.testo}
          </li>
        ))}
      </ol>

      <div>
        {/* Legenda: sempre, anche con una sola serie se ci sono intervalli senza dati. */}
        <div aria-hidden="true" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-spento">
          {misura === "ricavi" ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Campione colore={COLORE_FATTURATO} /> Fatturato
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Campione colore={COLORE_EXTRA} /> Extra
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Campione colore="var(--color-verde)" /> Pizze
            </span>
          )}
          {senzaDati && (
            <span className="inline-flex items-center gap-1.5">
              <Campione righe /> Non inserite
            </span>
          )}
          {dati.settimanali && (
            <span className="inline-flex items-center gap-1.5">
              <Campione settimana /> Totale della settimana, messo sul lunedì
            </span>
          )}
          {nelTotale && (
            <span className="inline-flex items-center gap-1.5">
              <Campione nelTotale /> Nel totale della settimana
            </span>
          )}
        </div>

        {/* Il dettaglio della barra scelta (il «tooltip», che sul telefono si apre toccando). */}
        <div aria-hidden="true" className="mt-2 min-h-[44px] rounded-xl bg-crema px-3 py-1.5 leading-snug">
          {attuale && (
            <>
              <div className="text-[13px] font-bold text-spento">{attuale.nome}</div>
              <div className="num text-[15px] font-bold text-testo">{attuale.testo}</div>
            </>
          )}
        </div>

        {/* A sinistra una colonna stretta con i numeri della scala, allineati alle linee; le barre non li coprono mai. */}
        <div className="mt-4 flex">
          <div aria-hidden="true" className="relative shrink-0" style={{ width: GRONDA[misura], height: ALTEZZA }}>
            {scala.tacche.map((t) => (
              <span key={t} className="num absolute right-1.5 translate-y-1/2 whitespace-nowrap text-[11px] leading-none text-spento" style={{ bottom: (t / scala.cima) * ALTEZZA }}>
                {testoTacca(t)}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div
              role="slider"
              tabIndex={0}
              aria-label="Barre del grafico"
              aria-describedby={idAiuto}
              aria-orientation="horizontal"
              aria-valuemin={1}
              aria-valuemax={Math.max(barre.length, 1)}
              aria-valuenow={indice + 1}
              aria-valuetext={attuale ? `${attuale.nome}: ${attuale.testo}` : ""}
              className="relative rounded-md"
              style={{ height: ALTEZZA }}
              onKeyDown={tasto}
            >
              <span id={idAiuto} className="sr-only">
                Frecce sinistra e destra per leggere una barra alla volta, Inizio e Fine per la prima e l&apos;ultima.
              </span>
              {scala.tacche.map((t) => (
                <div key={t} className={"pointer-events-none absolute inset-x-0 border-t " + (t === 0 ? "border-bordo2" : "border-riga")} style={{ bottom: (t / scala.cima) * ALTEZZA }} />
              ))}
              <div aria-hidden="true" className={"absolute inset-0 flex items-end " + spazio}>
                {barre.map((b, i) => (
                  <Colonna key={b.inizio} b={b} misura={misura} scelta={i === indice} onScegli={() => setScelta({ chiave, indice: i })} />
                ))}
              </div>
            </div>
            <div aria-hidden="true" className={"mt-1 flex " + spazio}>
              {barre.map((b, i) => (
                <span
                  key={b.inizio}
                  className={
                    "num flex min-w-0 flex-1 justify-center text-center text-[11px] leading-tight " +
                    // poche barre: «lun 9» va a capo se la colonna e' stretta; tante: l'etichetta (una ogni tante) puo' uscire dalla colonna
                    (poche ? "" : "whitespace-nowrap ") +
                    (i === indice ? "font-bold text-testo " : "text-spento ") +
                    (b.etichettaTelefono ? "" : "max-md:invisible ") +
                    (b.etichettaComputer ? "" : "md:invisible")
                  }
                >
                  {b.etichetta}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
