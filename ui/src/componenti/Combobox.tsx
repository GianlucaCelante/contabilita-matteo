import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode, useRef } from "react";
import { vociSuggerimenti, type VoceSuggerimento } from "../util/suggerimenti";
import { IconaGiu, IconaMatita, IconaPiu } from "./Icone";

// Come il campo permette di rinominare, unire o eliminare le voci che suggerisce: una matita accanto a ogni voce che esiste gia'.
export interface ModificaVoci {
  // Il nome e' di una voce esistente (le voci da «Crea…» non lo sono).
  puo: (nome: string) => boolean;
  apri: (nome: string) => void;
  // Il nome del campo, scritto sul controllo (`data-campo-voce`): chi ha aperto la finestra della matita ci riporta il fuoco quando
  // la matita non c'e' piu' (voce eliminata: il campo e' vuoto).
  campo?: string;
}

interface ProprietaCombobox {
  etichetta: string;
  // Come si chiama la cosa da creare nel comando: "fornitore", "categoria"…
  cosa: string;
  // Il genere di «cosa»: «Nuovo»/«un»/«Nessun» (m) oppure «Nuova»/«una»/«Nessuna» (f).
  genere: "m" | "f";
  value: string;
  onChange: (valore: string) => void;
  // I nomi suggeriti per il testo scritto (gia' filtrati dal chiamante).
  opzioni: string[];
  inCaricamento?: boolean;
  errore?: boolean;
  facoltativo?: boolean;
  invalido?: boolean;
  messaggioErrore?: string;
  modifica?: ModificaVoci;
  // Una riga tenue sotto il campo (suggerimento).
  nota?: string | undefined;
  // Esempi per il campo vuoto: «Per esempio: Affitto, Luce». Compaiono nel segnaposto e nel testo della lista vuota.
  esempi?: string;
  // Contenuto fisso fra il campo e la lista dei suggerimenti: la lista si apre SOTTO, quindi non lo copre.
  sotto?: ReactNode;
}

type Voce = VoceSuggerimento;

// Campo con suggerimenti e creazione al volo (pattern ARIA «combobox» con
// lista): si scrive, si sceglie un suggerimento con mouse o frecce, oppure si
// sceglie «Crea ...» per un nome nuovo. In ogni caso al salvataggio si manda
// il solo nome: se non esiste, lo crea il servizio.
export default function Combobox({ etichetta, cosa, genere, value, onChange, opzioni, inCaricamento, errore, facoltativo, invalido, messaggioErrore, modifica, nota, esempi, sotto }: ProprietaCombobox) {
  const id = useId();
  const idLista = `${id}-lista`;
  const idErrore = `${id}-errore`;
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(-1);
  const rifCampo = useRef<HTMLInputElement>(null);

  const testo = value.trim();
  const esatto = opzioni.some((o) => o.toLowerCase() === testo.toLowerCase());
  const nuova = testo !== "" && !esatto && !inCaricamento && !errore;

  const f = genere === "f";
  const etichettaNuovo = f ? "Nuova" : "Nuovo";

  // Tutte le opzioni (la lista scorre) e il comando «Crea …» (dopo le voci se sono poche, in cima se la lista e' lunga).
  const voci = useMemo<Voce[]>(() => vociSuggerimenti(opzioni, testo), [opzioni, testo]);

  // La voce attiva con le frecce scorre in vista nella lista.
  useEffect(() => {
    if (aperto && attivo >= 0) document.getElementById(`${id}-${attivo}`)?.scrollIntoView({ block: "nearest" });
  }, [aperto, attivo, id]);

  function scegli(voce: Voce) {
    onChange(voce.testo);
    setAperto(false);
    setAttivo(-1);
  }

  function suTasto(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAperto(true);
      setAttivo((a) => Math.min(a + 1, voci.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAttivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && aperto && attivo >= 0 && voci[attivo]) {
      e.preventDefault();
      scegli(voci[attivo]);
    } else if (e.key === "Escape" && aperto) {
      e.preventDefault();
      e.stopPropagation();
      setAperto(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="etichetta">
        {etichetta} {facoltativo && <span className="font-normal">(facoltativo)</span>}
      </label>
      <div className={"campo" + (invalido ? " errore" : "")}>
        <input
          id={id}
          ref={rifCampo}
          type="text"
          role="combobox"
          data-campo-voce={modifica?.campo}
          aria-expanded={aperto}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={aperto && attivo >= 0 ? `${id}-${attivo}` : undefined}
          aria-invalid={invalido || undefined}
          aria-describedby={invalido && messaggioErrore ? idErrore : undefined}
          autoComplete="off"
          placeholder={esempi ? `Per esempio: ${esempi.split(", ").slice(0, 2).join(", ")}` : undefined}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setAperto(true);
            setAttivo(-1);
          }}
          onFocus={() => setAperto(true)}
          onClick={() => setAperto(true)}
          onBlur={() => setAperto(false)}
          onKeyDown={suTasto}
        />
        {nuova && (
          <span aria-label={`${etichettaNuovo} ${cosa}`} className="inline-flex h-6 items-center rounded-xl bg-verdechiaro px-2 text-[12px] font-bold text-verdescuro">
            {etichettaNuovo}
          </span>
        )}
        {modifica?.puo(testo) && (
          <button
            type="button"
            aria-label={`Modifica «${testo}»: rinomina, unisci o elimina`}
            title="Rinomina, unisci o elimina"
            onClick={() => {
              setAperto(false);
              modifica.apri(testo);
            }}
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-spento hover:bg-sabbia hover:text-testo"
          >
            <IconaMatita larghezza={18} spessoreTratto={2} />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label={aperto ? `Chiudi i suggerimenti per ${etichetta.toLowerCase()}` : `Mostra i suggerimenti per ${etichetta.toLowerCase()}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (aperto) setAperto(false);
            else {
              rifCampo.current?.focus();
              setAperto(true);
            }
          }}
          className="-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-spento"
        >
          <IconaGiu larghezza={18} spessoreTratto={2} />
        </button>
      </div>
      {invalido && messaggioErrore && (
        <p id={idErrore} className="m-0 mt-1 text-[13px] font-bold text-rosso">
          {messaggioErrore}
        </p>
      )}
      {nota && !(invalido && messaggioErrore) && <p className="m-0 mt-1 text-[13px] text-spento">{nota}</p>}
      {sotto}
      <ul
        id={idLista}
        role="listbox"
        aria-label={`Suggerimenti per ${etichetta.toLowerCase()}`}
        hidden={!aperto}
        className="absolute left-0 right-0 top-full z-30 m-0 mt-1 list-none max-h-[min(22rem,40dvh)] overflow-y-auto overscroll-contain rounded-xl border border-bordo2 bg-carta p-1.5 shadow-ombra"
      >
        {inCaricamento && opzioni.length === 0 && <li role="presentation" className="px-3 py-2 text-[13px] text-spento">Cerco…</li>}
        {errore && <li role="presentation" className="px-3 py-2 text-[13px] font-bold text-rosso">Non riesco a caricare i suggerimenti.</li>}
        {!inCaricamento && !errore && opzioni.length === 0 && (
          <li role="presentation" className="m-1 rounded-lg border border-dashed border-bordo2 px-3 py-4 text-center text-[14px] text-spento">
            {testo ? (
              `Nessun${f ? "a" : ""} ${cosa} con questo nome`
            ) : (
              <>
                <b className="block text-testo">Ancora nessun{f ? "a" : ""} {cosa}</b>
                Scrivi un nome per {f ? "crearla" : "crearlo"}
                {esempi && (
                  <span className="mt-1 block">
                    Per esempio: {esempi}
                  </span>
                )}
              </>
            )}
          </li>
        )}
        {voci.map((v, i) => (
          <li key={(v.crea ? "+" : "") + v.testo} role="presentation" className="flex items-center">
            <button
              type="button"
              role="option"
              id={`${id}-${i}`}
              aria-selected={i === attivo}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => scegli(v)}
              className={
                "flex min-h-[48px] min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-[15px] " +
                (v.crea ? "font-bold text-verdescuro " : "") +
                (i === attivo ? "bg-verdechiaro" : v.crea ? "border border-dashed border-bordo2 hover:bg-verdechiaro" : "hover:bg-sabbia")
              }
            >
              {v.crea ? (
                <>
                  <IconaPiu larghezza={18} spessoreTratto={2.5} />
                  <span className="min-w-0 truncate">
                    Crea {cosa} «{v.testo}»
                  </span>
                </>
              ) : (
                <>
                  <span className="min-w-0 truncate">{v.testo}</span>
                </>
              )}
            </button>
            {!v.crea && modifica?.puo(v.testo) && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Modifica «${v.testo}»`}
                title="Rinomina, unisci o elimina"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setAperto(false);
                  modifica.apri(v.testo);
                }}
                className="ml-0.5 flex h-[48px] w-11 shrink-0 items-center justify-center rounded-lg text-spento hover:bg-sabbia hover:text-testo"
              >
                <IconaMatita larghezza={17} spessoreTratto={2} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
