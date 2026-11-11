import { useState } from "react";
import { Link } from "react-router-dom";
import { useSedi } from "../hooks/useSedi";
import BadgeSede, { SegnoPersonale } from "./BadgeSede";
import Finestra from "./Finestra";
import { IconaGiu, IconaPiu, IconaSede, IconaSpunta } from "./Icone";

// Quali sedi vedere: una sola (vista singola) o piu' d'una (vista mista). Compare con almeno due sedi da scegliere (anche una sede vera
// piu' una personale: serve per vedere la personale). «Tutte» sono le sedi del locale; le personali stanno dopo, col contrassegno
// «Personale», e si accendono a mano; in fondo le personali archiviate che hanno movimenti («(archiviata)»).
// Telefono: un chip con le sedi scelte che apre un foglio con le caselle, «Solo» e «Tutte le sedi».
// Computer: una barra di pillole, una per sede (si accendono e si spengono; l'ultima accesa resta accesa).
export default function SelettoreSedi({ className = "" }: { className?: string }) {
  const sedi = useSedi();
  const [aperto, setAperto] = useState(false);
  if (!sedi.selettore) return null;

  return (
    <div className={className}>
      {/* Telefono */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Scegli le sedi. Adesso: ${sedi.etichetta}`}
        className="flex min-h-[48px] w-full min-w-0 items-center gap-2 rounded-xl border border-bordo2 bg-carta px-3.5 text-[15px] font-bold md:hidden"
        onClick={() => setAperto(true)}
      >
        <span className="text-verdescuro">
          <IconaSede larghezza={20} spessoreTratto={2} />
        </span>
        <span className="min-w-0 flex-1 truncate">{sedi.etichetta}</span>
        <span className="text-spento">
          <IconaGiu larghezza={18} spessoreTratto={2.2} />
        </span>
      </button>

      {/* Computer */}
      <div role="group" aria-label="Sedi" className="flex flex-wrap items-center gap-2 max-md:hidden">
        <span className="etichettaMaiuscola mr-1" aria-hidden="true">
          Sedi
        </span>
        <button type="button" className="pillaSede senzaBadge" aria-pressed={sedi.tutteSelezionate} onClick={sedi.tutte}>
          <span aria-hidden="true" className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-lg bg-riga font-titolo text-[12px] text-testo">
            ∑
          </span>
          Tutte
        </button>
        {sedi.selezionabili.map((s, i, elenco) => {
          const acceso = sedi.selezionate.some((x) => x.id === s.id);
          const primaPersonale = s.personale && !elenco[i - 1]?.personale;
          return (
            <span key={s.id} className="contents">
              {primaPersonale && <span aria-hidden="true" className="mx-1 h-6 w-px bg-bordo2" />}
              <button type="button" className="pillaSede" aria-pressed={acceso} onClick={() => sedi.alterna(s.id)}>
                <BadgeSede id={s.id} taglia="piccolo" decorativo />
                {s.nome}
                {s.archiviata ? " (archiviata)" : ""}
                {s.personale && <SegnoPersonale />}
                {acceso && <IconaSpunta larghezza={16} spessoreTratto={3} />}
              </button>
            </span>
          );
        })}
      </div>

      {aperto && <FoglioSedi onChiudi={() => setAperto(false)} />}
    </div>
  );
}

function Casella({ acceso }: { acceso: boolean }) {
  return <span className="casellaSede" aria-hidden="true">{acceso && <IconaSpunta larghezza={14} spessoreTratto={3.5} />}</span>;
}

function FoglioSedi({ onChiudi }: { onChiudi: () => void }) {
  const sedi = useSedi();
  return (
    <Finestra
      foglio
      titolo="Quali sedi vuoi vedere?"
      sottotitolo="Scegline una per la vista singola, più d'una per la vista mista."
      onChiudi={onChiudi}
      piede={
        <button type="button" className="btn primario w-full" data-focus-iniziale onClick={onChiudi}>
          {/* «Mostra tutte le sedi», non «Mostra Tutte le sedi»; i nomi delle sedi restano come sono. */}
          Mostra {sedi.etichetta.replace(/^Tutte le sedi/, "tutte le sedi")}
        </button>
      }
    >
      <div className="-mt-2 flex flex-col">
        <button
          type="button"
          role="checkbox"
          aria-checked={sedi.tutteSelezionate}
          className="flex min-h-[56px] w-full items-center gap-3 text-left text-[16px] font-bold"
          onClick={sedi.tutte}
        >
          <Casella acceso={sedi.tutteSelezionate} />
          Tutte le sedi
        </button>
        {sedi.selezionabili.map((s, i, elenco) => {
          const acceso = sedi.selezionate.some((x) => x.id === s.id);
          const primaPersonale = s.personale && !elenco[i - 1]?.personale;
          return (
            <div key={s.id} className="contents">
              {primaPersonale && (
                <p className="m-0 border-t border-riga pt-3 pb-1 text-[13.5px] text-tenue">
                  <b className="text-testo">Sedi personali</b> (spese dei titolari): restano fuori da «Tutte le sedi», accendile per vederle.
                </p>
              )}
              <div className="flex items-center gap-2 border-t border-riga">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={acceso}
                  className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 text-left text-[16px] font-bold"
                  onClick={() => sedi.alterna(s.id)}
                >
                  <Casella acceso={acceso} />
                  <BadgeSede id={s.id} decorativo />
                  <span className="min-w-0 truncate">
                    {s.nome}
                    {s.archiviata ? " (archiviata)" : ""}
                  </span>
                  {s.personale && <SegnoPersonale />}
                </button>
                <button type="button" className="pillaSede senzaBadge !min-h-[44px] !text-[13px]" aria-label={`Solo ${s.nome}`} onClick={() => sedi.solo(s.id)}>
                  Solo
                </button>
              </div>
            </div>
          );
        })}
        <Link to="/impostazioni" className="flex min-h-[56px] items-center gap-3 border-t border-riga text-[15px] font-bold text-verdescuro no-underline" onClick={onChiudi}>
          <IconaPiu larghezza={20} spessoreTratto={2.2} />
          Aggiungi o modifica le sedi
        </Link>
      </div>
    </Finestra>
  );
}
