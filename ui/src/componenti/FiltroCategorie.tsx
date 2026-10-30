import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Categoria, Tipo } from "../api/tipi";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { alternaCategoria, etichettaFiltroCategorie, gruppiCategorie } from "../util/filtroCategorie";
import Finestra from "./Finestra";
import { IconaCerca, IconaGiu, IconaVia } from "./Icone";

// Il filtro per categorie di Movimenti: un solo pulsante «Categoria» accanto alla ricerca.
// Telefono: un foglio dal basso (Finestra) con caselle e «Azzera» / «Applica». Computer: un riquadro sotto il pulsante
// che applica subito a ogni spunta e si chiude con Esc, con un clic fuori o uscendo con il Tab.

type ElencoCategorieDati = Categoria[] | undefined | null;

interface Proprieta {
  // Tutte le categorie (undefined: non ancora arrivate; null: errore nel caricarle).
  categorie: ElencoCategorieDati;
  // Il tipo scelto in alto («» = Tutti): se c'e', si propongono solo le categorie di quel tipo.
  tipo: Tipo | "";
  // Gli id scelti adesso.
  scelte: number[];
  onCambia: (ids: number[]) => void;
}

function ElencoCategorie({ categorie, tipo, scelte, onAlterna }: { categorie: ElencoCategorieDati; tipo: Tipo | ""; scelte: number[]; onAlterna: (id: number) => void }) {
  const [testo, setTesto] = useState("");
  const gruppi = categorie ? gruppiCategorie(categorie, tipo, testo) : [];
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <label className="campo !min-h-[48px] !rounded-xl !border-bordo2 !px-3.5">
        <IconaCerca larghezza={20} spessoreTratto={2} className="text-spento" />
        <span className="sr-only">Cerca una categoria</span>
        <input type="search" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cerca una categoria…" className="!text-[16px]" autoComplete="off" />
      </label>
      <div className="max-h-[min(48vh,420px)] overflow-y-auto overscroll-contain md:max-h-[360px]">
        {categorie === undefined && <p className="m-0 py-3 text-[15px] text-spento">Carico le categorie…</p>}
        {categorie === null && <p className="m-0 py-3 text-[15px] text-rosso">Non riesco a caricare le categorie.</p>}
        {categorie && gruppi.length === 0 && <p className="m-0 py-3 text-[15px] text-spento">Nessuna categoria trovata.</p>}
        {gruppi.map((g) => (
          <GruppoCategorie key={g.tipo} titolo={g.titolo}>
            {g.categorie.map((c) => (
              <label key={c.id} className="flex min-h-[48px] cursor-pointer items-center gap-3 border-t border-riga text-[16px] font-bold md:text-[15px]">
                <input type="checkbox" checked={scelte.includes(c.id)} onChange={() => onAlterna(c.id)} className="h-[22px] w-[22px] shrink-0 cursor-pointer accent-verde" />
                <span className="min-w-0 break-words">{c.nome}</span>
              </label>
            ))}
          </GruppoCategorie>
        ))}
      </div>
    </div>
  );
}

function GruppoCategorie({ titolo, children }: { titolo: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="pt-2">
      <h3 id={id} className="etichettaMaiuscola m-0 pb-1">
        {titolo}
      </h3>
      {children}
    </div>
  );
}

export default function FiltroCategorie({ categorie, tipo, scelte, onCambia }: Proprieta) {
  const grande = useSchermoGrande();
  const [aperto, setAperto] = useState(false);
  const rifPulsante = useRef<HTMLButtonElement>(null);
  const idPannello = useId();
  const nomi = scelte.map((id) => categorie?.find((c) => c.id === id)).filter((c): c is Categoria => !!c);
  const etichetta = etichettaFiltroCategorie(nomi, scelte.length);
  const attivo = scelte.length > 0;

  function chiudi(conFuoco = true) {
    setAperto(false);
    // Il fuoco torna al pulsante (sul telefono ci pensa gia' la Finestra, ma e' innocuo).
    if (conFuoco) window.setTimeout(() => rifPulsante.current?.focus(), 0);
  }

  function azzera() {
    onCambia([]);
    window.setTimeout(() => rifPulsante.current?.focus(), 0);
  }

  return (
    <div className="relative max-md:max-w-[56%] max-md:shrink-0">
      <div
        className={
          "flex min-h-[48px] items-stretch rounded-xl border text-[15px] font-bold " +
          (attivo ? "border-verde bg-verdechiaro text-verdescuro" : "border-bordo2 bg-carta text-testo hover:bg-sabbia")
        }
      >
        <button
          ref={rifPulsante}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={aperto}
          aria-controls={aperto && grande ? idPannello : undefined}
          aria-pressed={attivo}
          onClick={() => setAperto((a) => !a)}
          className={"flex min-h-[48px] min-w-0 flex-1 items-center gap-2 rounded-xl pl-3.5 text-left " + (attivo ? "pr-1" : "pr-3")}
        >
          <span className="min-w-0 flex-1 truncate md:max-w-[240px] md:flex-none">{etichetta}</span>
          {!attivo && (
            <span className="shrink-0 text-spento">
              <IconaGiu larghezza={18} spessoreTratto={2.2} />
            </span>
          )}
        </button>
        {attivo && (
          <button type="button" aria-label="Togli il filtro categoria" onClick={azzera} className="flex min-h-[48px] w-[44px] shrink-0 items-center justify-center rounded-xl">
            <IconaVia larghezza={18} spessoreTratto={2.4} />
          </button>
        )}
      </div>
      {aperto && grande && (
        <PannelloComputer id={idPannello} categorie={categorie} tipo={tipo} scelte={scelte} onCambia={onCambia} onChiudi={chiudi} rifPulsante={rifPulsante} />
      )}
      {aperto && !grande && <FoglioTelefono categorie={categorie} tipo={tipo} scelte={scelte} onCambia={onCambia} onChiudi={chiudi} />}
    </div>
  );
}

interface ProprietaPannello extends Proprieta {
  onChiudi: (conFuoco?: boolean) => void;
}

function FoglioTelefono({ categorie, tipo, scelte, onCambia, onChiudi }: ProprietaPannello) {
  // Le spunte restano una bozza finche' non si preme «Applica»: chiudere il foglio senza applicare lascia il filtro com'era.
  const [bozza, setBozza] = useState(scelte);
  return (
    <Finestra
      foglio
      titolo="Filtra per categoria"
      onChiudi={() => onChiudi()}
      piede={
        <div className="flex w-full gap-3">
          <button type="button" className="btn max-md:flex-1" disabled={bozza.length === 0} onClick={() => setBozza([])}>
            Azzera
          </button>
          <button
            type="button"
            className="btn primario max-md:flex-[2]"
            data-focus-iniziale
            onClick={() => {
              onCambia(bozza);
              onChiudi();
            }}
          >
            Applica{bozza.length > 0 ? ` (${bozza.length})` : ""}
          </button>
        </div>
      }
    >
      <ElencoCategorie categorie={categorie} tipo={tipo} scelte={bozza} onAlterna={(id) => setBozza((b) => alternaCategoria(b, id))} />
    </Finestra>
  );
}

function PannelloComputer({ id, categorie, tipo, scelte, onCambia, onChiudi, rifPulsante }: ProprietaPannello & { id: string; rifPulsante: RefObject<HTMLButtonElement | null> }) {
  const rifPannello = useRef<HTMLDivElement>(null);

  // Il fuoco va al campo di ricerca dell'elenco.
  useEffect(() => {
    rifPannello.current?.querySelector<HTMLInputElement>("input[type=search]")?.focus();
  }, []);

  // Un clic fuori dal riquadro (e dal pulsante) lo chiude.
  useEffect(() => {
    function suClic(e: MouseEvent) {
      const bersaglio = e.target as Node;
      if (rifPannello.current?.contains(bersaglio) || rifPulsante.current?.parentElement?.contains(bersaglio)) return;
      onChiudi(false);
    }
    document.addEventListener("mousedown", suClic);
    return () => document.removeEventListener("mousedown", suClic);
  }, [onChiudi, rifPulsante]);

  // Esc chiude da qualunque controllo del riquadro; se il fuoco esce (Tab oltre l'ultimo controllo) si chiude senza rubare
  // il fuoco a dove sta andando.
  useEffect(() => {
    const pannello = rifPannello.current;
    if (!pannello) return;
    const suTasto = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onChiudi();
    };
    const suFuoco = (e: FocusEvent) => {
      const verso = e.relatedTarget as Node | null;
      if (verso && !pannello.contains(verso) && !rifPulsante.current?.parentElement?.contains(verso)) onChiudi(false);
    };
    pannello.addEventListener("keydown", suTasto);
    pannello.addEventListener("focusout", suFuoco);
    return () => {
      pannello.removeEventListener("keydown", suTasto);
      pannello.removeEventListener("focusout", suFuoco);
    };
  }, [onChiudi, rifPulsante]);

  return (
    <div
      id={id}
      ref={rifPannello}
      role="dialog"
      tabIndex={-1}
      aria-label="Filtra per categoria"
      className="absolute right-0 top-full outline-none z-30 mt-2 flex w-[min(380px,calc(100vw-48px))] flex-col gap-2 rounded-[14px] border border-bordo bg-carta p-3 shadow-ombra"
    >
      <ElencoCategorie categorie={categorie} tipo={tipo} scelte={scelte} onAlterna={(idCat) => onCambia(alternaCategoria(scelte, idCat))} />
      <div className="flex justify-between gap-2 border-t border-riga pt-2">
        <button type="button" className="btn !min-h-[44px]" disabled={scelte.length === 0} onClick={() => onCambia([])}>
          Azzera
        </button>
        <button type="button" className="btn primario !min-h-[44px]" onClick={() => onChiudi()}>
          Chiudi
        </button>
      </div>
    </div>
  );
}
