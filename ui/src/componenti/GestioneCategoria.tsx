import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, messaggioErrore } from "../api/client";
import type { Categoria } from "../api/tipi";
import { useAvviso } from "../hooks/useAvviso";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { erroreNome, normalizzaNome, trovaDoppione } from "../util/categorie";
import { campiDaNomeVoce, nomeVoce, type CampiForm } from "../util/modelloMovimento";
import Finestra from "./Finestra";
import { IconaMatita } from "./Icone";

// La matita per rinominare una categoria personalizzata, sotto il campo della categoria (o della voce fissa).
// Le categorie nascono scrivendo un nome nuovo nel campo (la suggerisce «Crea…»): niente pulsante «Nuova categoria» né schermata Categorie.
// Telefono: un foglio dal basso (Finestra). Computer: un riquadro che si apre sotto la matita.

const MESSAGGIO_DOPPIONE = "Esiste già una categoria con questo nome.";

interface Proprieta {
  campi: CampiForm;
  onCambia: (parziale: Partial<CampiForm>) => void;
}

export default function GestioneCategoria({ campi, onCambia }: Proprieta) {
  const [aperto, setAperto] = useState(false);
  const rifMatita = useRef<HTMLButtonElement>(null);
  const grande = useSchermoGrande();
  const tipo = campi.tipo;
  const q = useQuery({ queryKey: chiavi.categorie(tipo), queryFn: () => api.categorie(tipo), staleTime: 15_000 });
  // La categoria scelta adesso nel movimento (per un costo fisso: la voce fissa).
  const nomeScelto = (tipo === "COSTO_FISSO" ? nomeVoce(campi) : campi.categoria).trim();
  const scelta = nomeScelto ? q.data?.find((c) => c.nome.trim().toLowerCase() === nomeScelto.toLowerCase()) : undefined;
  const rinominabile = scelta?.personalizzata ? scelta : undefined;

  function chiudi() {
    setAperto(false);
    // Sul computer il riquadro non e' una finestra: il fuoco torna alla matita. Sul telefono ci pensa la Finestra.
    if (grande) window.setTimeout(() => rifMatita.current?.focus(), 0);
  }

  function rinominata(nuovo: string) {
    if (tipo === "COSTO_FISSO") onCambia(campiDaNomeVoce(nuovo));
    else onCambia({ categoria: nuovo });
  }

  if (!rinominabile) return null;
  return (
    <div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          ref={rifMatita}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={grande ? aperto : undefined}
          aria-label={`Rinomina la categoria «${rinominabile.nome}»`}
          title="Rinomina"
          className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-full border border-bordo2 bg-carta text-spento hover:bg-sabbia hover:text-testo"
          onClick={() => setAperto(true)}
        >
          <IconaMatita larghezza={18} spessoreTratto={2} />
        </button>
      </div>

      {aperto && (
        // Cambia categoria: stato pulito.
        <PannelloRinomina key={rinominabile.id} categoria={rinominabile} grande={grande} onChiudi={chiudi} onRinominata={rinominata} />
      )}
    </div>
  );
}

interface ProprietaPannello {
  categoria: Categoria;
  grande: boolean;
  onChiudi: () => void;
  onRinominata: (nuovo: string) => void;
}

function PannelloRinomina({ categoria, grande, onChiudi, onRinominata }: ProprietaPannello) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const idNome = useId();
  const idErrore = `${idNome}-e`;
  const rifNome = useRef<HTMLInputElement>(null);
  const rifRiquadro = useRef<HTMLDivElement>(null);
  const [nome, setNome] = useState(categoria.nome);
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  // Sul computer il fuoco va al campo Nome appena il riquadro si apre; sul telefono lo porta la Finestra.
  useEffect(() => {
    if (grande) rifNome.current?.focus();
  }, [grande]);

  // Sul computer Esc chiude il riquadro da qualunque suo controllo (sul telefono ci pensa la Finestra).
  useEffect(() => {
    const riquadro = rifRiquadro.current;
    if (!riquadro) return;
    const suEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onChiudi();
    };
    riquadro.addEventListener("keydown", suEsc);
    return () => riquadro.removeEventListener("keydown", suEsc);
  }, [onChiudi]);

  async function conferma() {
    if (occupato) return;
    const pulito = normalizzaNome(nome);
    const e = erroreNome(pulito);
    if (e) {
      setErrore(e);
      rifNome.current?.focus();
      return;
    }
    setOccupato(true);
    try {
      // L'elenco aggiornato dello stesso tipo: serve a riconoscere il doppione prima di chiedere al servizio.
      const lista = await client.fetchQuery({ queryKey: chiavi.categorie(categoria.tipo), queryFn: () => api.categorie(categoria.tipo), staleTime: 0 });
      if (pulito === categoria.nome) {
        onChiudi();
        return;
      }
      if (trovaDoppione(pulito, lista, categoria.tipo, categoria.id)) {
        setErrore(MESSAGGIO_DOPPIONE);
        rifNome.current?.focus();
        return;
      }
      const r = await api.rinominaCategoria(categoria.id, pulito);
      client.setQueryData<Categoria[]>(chiavi.categorie(r.tipo), (vecchie) => vecchie?.map((c) => (c.id === r.id ? r : c)));
      for (const k of ["categorie", "movimenti", "movimento", "riepilogo"]) void client.invalidateQueries({ queryKey: [k] });
      onRinominata(r.nome);
      avvisa(`Categoria rinominata in «${r.nome}».`);
      onChiudi();
    } catch (err) {
      setErrore(messaggioErrore(err));
      rifNome.current?.focus();
    } finally {
      setOccupato(false);
    }
  }

  function suTasto(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void conferma();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onChiudi();
    }
  }

  const titolo = `Rinomina «${categoria.nome}»`;

  const campoNome = (
    <div>
      <label htmlFor={idNome} className="etichetta">
        Nome
      </label>
      <div className={"campo" + (errore ? " errore" : "")}>
        <input
          ref={rifNome}
          id={idNome}
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          data-focus-iniziale
          value={nome}
          aria-invalid={errore ? true : undefined}
          aria-describedby={errore ? idErrore : undefined}
          onChange={(e) => {
            setNome(e.target.value);
            setErrore(null);
          }}
          onKeyDown={suTasto}
        />
      </div>
      {errore && (
        <p id={idErrore} role="alert" className="m-0 mt-1 text-[13px] font-bold text-rosso">
          {errore}
        </p>
      )}
    </div>
  );

  if (!grande) {
    return (
      <Finestra
        foglio
        titolo={titolo}
        onChiudi={onChiudi}
        piede={
          <div className="flex w-full gap-3">
            <button type="button" className="btn max-md:flex-1" onClick={onChiudi}>
              Annulla
            </button>
            <button type="button" className="btn primario max-md:flex-[2]" disabled={occupato} onClick={() => void conferma()}>
              Salva nome
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">{campoNome}</div>
      </Finestra>
    );
  }

  return (
    <div ref={rifRiquadro} role="group" aria-label={titolo} className="mt-3 rounded-[14px] border-[1.5px] border-verde bg-crema px-[18px] py-4">
      <h3 className="m-0 mb-3 text-[17px] font-bold">{titolo}</h3>
      <div className="flex flex-col gap-4">{campoNome}</div>
      <div className="mt-4 flex gap-2.5">
        <button type="button" className="btn primario" disabled={occupato} onClick={() => void conferma()}>
          Salva nome
        </button>
        <button type="button" className="btn" onClick={onChiudi}>
          Annulla
        </button>
      </div>
    </div>
  );
}
