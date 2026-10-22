import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { IconaGiu, IconaPiu } from "./Icone";

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
}

interface Voce {
  testo: string;
  crea: boolean;
}

// Campo con suggerimenti e creazione al volo (pattern ARIA «combobox» con
// lista): si scrive, si sceglie un suggerimento con mouse o frecce, oppure si
// sceglie «Crea ...» per un nome nuovo. In ogni caso al salvataggio si manda
// il solo nome: se non esiste, lo crea il servizio.
export default function Combobox({ etichetta, cosa, genere, value, onChange, opzioni, inCaricamento, errore, facoltativo, invalido, messaggioErrore }: ProprietaCombobox) {
  const id = useId();
  const idLista = `${id}-lista`;
  const idErrore = `${id}-errore`;
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(-1);

  const testo = value.trim();
  const esatto = opzioni.some((o) => o.toLowerCase() === testo.toLowerCase());
  const nuova = testo !== "" && !esatto && !inCaricamento && !errore;

  const f = genere === "f";
  const etichettaNuovo = f ? "Nuova" : "Nuovo";

  const voci = useMemo<Voce[]>(() => {
    const lista: Voce[] = opzioni.slice(0, 8).map((o) => ({ testo: o, crea: false }));
    if (testo && !esatto) lista.push({ testo, crea: true });
    return lista;
  }, [opzioni, testo, esatto]);

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
          type="text"
          role="combobox"
          aria-expanded={aperto}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={aperto && attivo >= 0 ? `${id}-${attivo}` : undefined}
          aria-invalid={invalido || undefined}
          aria-describedby={invalido && messaggioErrore ? idErrore : undefined}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setAperto(true);
            setAttivo(-1);
          }}
          onFocus={() => setAperto(true)}
          onBlur={() => setAperto(false)}
          onKeyDown={suTasto}
        />
        {nuova && (
          <span aria-label={`${etichettaNuovo} ${cosa}`} className="inline-flex h-6 items-center rounded-xl bg-verdechiaro px-2 text-[12px] font-bold text-verdescuro">
            {etichettaNuovo}
          </span>
        )}
        <IconaGiu larghezza={18} spessoreTratto={2} className="text-spento" />
      </div>
      {invalido && messaggioErrore && (
        <p id={idErrore} className="m-0 mt-1 text-[13px] font-bold text-rosso">
          {messaggioErrore}
        </p>
      )}
      <ul
        id={idLista}
        role="listbox"
        aria-label={`Suggerimenti per ${etichetta.toLowerCase()}`}
        hidden={!aperto}
        className="absolute left-0 right-0 top-full z-30 m-0 mt-1 list-none rounded-xl border border-bordo2 bg-carta p-1.5 shadow-ombra"
      >
        {inCaricamento && opzioni.length === 0 && <li role="presentation" className="px-3 py-2 text-[13px] text-spento">Cerco…</li>}
        {errore && <li role="presentation" className="px-3 py-2 text-[13px] font-bold text-rosso">Non riesco a caricare i suggerimenti.</li>}
        {!inCaricamento && !errore && opzioni.length === 0 && (
          <li role="presentation" className="px-3 py-2 text-[13px] text-spento">
            {testo ? `Nessun${f ? "a" : ""} ${cosa} con questo nome` : `Scrivi per cercare o creare un${f ? "a" : ""} ${cosa}`}
          </li>
        )}
        {voci.map((v, i) => (
          <li key={(v.crea ? "+" : "") + v.testo} role="presentation">
            <button
              type="button"
              role="option"
              id={`${id}-${i}`}
              aria-selected={i === attivo}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => scegli(v)}
              className={
                "flex min-h-[48px] w-full items-center gap-2.5 rounded-lg px-3 text-[15px] " +
                (v.crea ? "font-bold text-verdescuro " : "") +
                (i === attivo || v.crea ? "bg-verdechiaro" : "hover:bg-sabbia")
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
                <span className="min-w-0 truncate">{v.testo}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
