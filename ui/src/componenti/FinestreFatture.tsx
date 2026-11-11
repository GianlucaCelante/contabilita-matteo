import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, messaggioErrore } from "../api/client";
import type { CasellaFattura, MeseFattura, StatoFattura } from "../api/tipi";
import { useAvviso } from "../hooks/useAvviso";
import { euroPerCampo } from "../util/formato";
import { erroreNomeCasella, erroreNotaFattura, ETICHETTA_STATO, leggiGiornoScadenza, leggiImportoFattura, MASSIMO_NOTA_FATTURA, nomeMeseAnno, STATI } from "../util/fatture";
import { IconaMatita } from "./Icone";
import { iconaStato } from "./statoFattura";
import Conferma from "./Conferma";
import Finestra from "./Finestra";

// Le due finestre delle Fatture da fare: importo, nota e stato di un mese, e nome (o eliminazione) di una casella.
// Sul telefono sono fogli dal basso, sul computer finestre al centro (Finestra).

const invalidaFatture = (client: ReturnType<typeof useQueryClient>) => client.invalidateQueries({ queryKey: ["fatture"] });

function MessaggioErrore({ id, testo }: { id: string; testo: string | null }) {
  if (!testo) return null;
  return (
    <p id={id} role="alert" className="m-0 mt-1 text-[13px] font-bold text-rosso">
      {testo}
    </p>
  );
}

// ---- un mese di una casella ----

interface ProprietaMese {
  casella: CasellaFattura;
  mese: string;
  attuale: MeseFattura;
  onChiudi: () => void;
  // Se c'e', in fondo compare «Rinomina o elimina la casella» (nella lista non c'e' un tasto apposta per ogni riga).
  onModificaCasella?: () => void;
}

export function FinestraMeseFattura({ casella, mese, attuale, onChiudi, onModificaCasella }: ProprietaMese) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const idStato = useId();
  const idImporto = useId();
  const idNota = useId();
  const [stato, setStato] = useState<StatoFattura>(attuale.stato);
  const [importo, setImporto] = useState(attuale.importoCent === null ? "" : euroPerCampo(attuale.importoCent));
  const [nota, setNota] = useState(attuale.nota ?? "");
  const [errImporto, setErrImporto] = useState<string | null>(null);
  const [errNota, setErrNota] = useState<string | null>(null);
  const [errGenerale, setErrGenerale] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  async function salva() {
    if (occupato) return;
    const letto = leggiImportoFattura(importo);
    const eNota = erroreNotaFattura(nota);
    setErrImporto(letto.errore);
    setErrNota(eNota);
    if (letto.errore || eNota) return;
    setOccupato(true);
    setErrGenerale(null);
    try {
      await api.salvaMeseFattura(casella.id, mese, { stato, importoCent: letto.cent, nota: nota.trim() || null });
      await invalidaFatture(client);
      avvisa(`Salvato: «${casella.nome}», ${nomeMeseAnno(mese).toLowerCase()}.`);
      onChiudi();
    } catch (e) {
      setErrGenerale(messaggioErrore(e));
    } finally {
      setOccupato(false);
    }
  }

  const classeScelta = (s: StatoFattura) => (s === "DA_FARE" ? "ambra" : s === "EMESSA" ? "bruno" : "");

  return (
    <Finestra
      foglio
      titolo={casella.nome}
      sottotitolo={nomeMeseAnno(mese)}
      onChiudi={onChiudi}
      piede={
        <div className="flex w-full gap-3 md:justify-end">
          <button type="button" className="btn max-md:flex-1" onClick={onChiudi}>
            Annulla
          </button>
          <button type="button" className="btn primario max-md:flex-[2]" disabled={occupato} onClick={() => void salva()}>
            Salva
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <span id={idStato} className="etichetta">
            Come sta questa fattura
          </span>
          <div role="radiogroup" aria-labelledby={idStato} className="flex gap-2">
            {STATI.map((s) => {
              const Icona = iconaStato(s, "fare");
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={stato === s}
                  data-focus-iniziale={stato === s ? true : undefined}
                  className={`scelta ${classeScelta(s)} !min-w-0 !flex-col !gap-1 !px-1 !py-2`}
                  onClick={() => setStato(s)}
                >
                  <Icona larghezza={22} spessoreTratto={2} />
                  {ETICHETTA_STATO[s]}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label htmlFor={idImporto} className="etichetta">
            Importo (facoltativo)
          </label>
          <div className={"campo" + (errImporto ? " errore" : "")}>
            <input
              id={idImporto}
              className="num"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={importo}
              aria-invalid={errImporto ? true : undefined}
              aria-describedby={errImporto ? `${idImporto}-e` : undefined}
              onChange={(e) => {
                setImporto(e.target.value);
                setErrImporto(null);
              }}
              onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && (e.preventDefault(), void salva())}
            />
            <span className="text-spento" aria-hidden="true">
              €
            </span>
          </div>
          <MessaggioErrore id={`${idImporto}-e`} testo={errImporto} />
        </div>
        <div>
          <label htmlFor={idNota} className="etichetta">
            Nota (facoltativa)
          </label>
          <div className={"campo" + (errNota ? " errore" : "")}>
            <input
              id={idNota}
              type="text"
              autoComplete="off"
              maxLength={MASSIMO_NOTA_FATTURA + 20}
              placeholder="Per esempio il numero della fattura"
              value={nota}
              aria-invalid={errNota ? true : undefined}
              aria-describedby={errNota ? `${idNota}-e` : undefined}
              onChange={(e) => {
                setNota(e.target.value);
                setErrNota(null);
              }}
              onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && (e.preventDefault(), void salva())}
            />
          </div>
          <MessaggioErrore id={`${idNota}-e`} testo={errNota} />
        </div>
        <MessaggioErrore id={`${idNota}-g`} testo={errGenerale} />
        {onModificaCasella && (
          <button type="button" className="btn w-full" onClick={onModificaCasella}>
            <IconaMatita larghezza={18} spessoreTratto={2} />
            <span>Rinomina o elimina la casella</span>
          </button>
        )}
      </div>
    </Finestra>
  );
}

// ---- una casella: nuova, rinomina, elimina ----

interface ProprietaCasella {
  // Assente = nuova casella.
  casella: CasellaFattura | null;
  onChiudi: () => void;
}

export function FinestraCasellaFattura({ casella, onChiudi }: ProprietaCasella) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const idNome = useId();
  const idGiorno = useId();
  const rifNome = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState(casella?.nome ?? "");
  const [giorno, setGiorno] = useState(casella?.giornoScadenza ? String(casella.giornoScadenza) : "");
  const [errGiorno, setErrGiorno] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [chiediElimina, setChiediElimina] = useState(false);

  async function salva() {
    if (occupato) return;
    const e = erroreNomeCasella(nome);
    if (e) {
      setErrore(e);
      rifNome.current?.focus();
      return;
    }
    const letto = leggiGiornoScadenza(giorno);
    setErrGiorno(letto.errore);
    if (letto.errore) return;
    const pulito = nome.trim();
    if (casella && pulito === casella.nome && letto.giorno === casella.giornoScadenza) {
      onChiudi();
      return;
    }
    setOccupato(true);
    try {
      if (casella) {
        await api.modificaCasellaFattura(casella.id, { nome: pulito, giornoScadenza: letto.giorno });
        avvisa(`Casella «${pulito}» salvata.`);
      } else {
        // Il servizio con lo stesso nome restituirebbe la casella che c'e' gia': qui lo si dice a chi scrive.
        const lista = await api.caselleFatture();
        if (lista.some((c) => c.nome.toLowerCase() === pulito.toLowerCase())) {
          setErrore("Esiste già una casella con questo nome.");
          rifNome.current?.focus();
          return;
        }
        await api.creaCasellaFattura({ nome: pulito, giornoScadenza: letto.giorno });
        avvisa(`Casella «${pulito}» aggiunta.`);
      }
      await invalidaFatture(client);
      onChiudi();
    } catch (err) {
      setErrore(messaggioErrore(err));
      rifNome.current?.focus();
    } finally {
      setOccupato(false);
    }
  }

  async function elimina() {
    if (!casella || occupato) return;
    setOccupato(true);
    try {
      await api.eliminaCasellaFattura(casella.id);
      await invalidaFatture(client);
      avvisa(`Casella «${casella.nome}» eliminata.`);
      onChiudi();
    } catch (err) {
      setChiediElimina(false);
      setErrore(messaggioErrore(err));
    } finally {
      setOccupato(false);
    }
  }

  if (chiediElimina && casella) {
    return (
      <Conferma
        titolo={`Eliminare «${casella.nome}»?`}
        sottotitolo="Spariscono anche gli stati di tutti i mesi di questa casella. Le fatture vere non c'entrano: questo è solo il promemoria."
        onAnnulla={() => setChiediElimina(false)}
        occupato={occupato}
        azione={{ etichetta: "Elimina", stile: "distruttiva", onClick: () => void elimina() }}
      />
    );
  }

  return (
    <Finestra
      foglio
      titolo={casella ? "Modifica la casella" : "Nuova casella"}
      sottotitolo={casella ? undefined : "Una casella per ogni cliente o tipo di fattura da ricordare, per esempio «Fatture eventi» o «Euro Service»."}
      onChiudi={onChiudi}
      piede={
        <div className="flex w-full flex-wrap gap-3">
          {casella && (
            <button type="button" className="btn pericolo max-md:basis-full" onClick={() => setChiediElimina(true)}>
              Elimina la casella
            </button>
          )}
          <div className="flex gap-3 max-md:w-full md:ml-auto">
            <button type="button" className="btn max-md:flex-1" onClick={onChiudi}>
              Annulla
            </button>
            <button type="button" className="btn primario max-md:flex-[2]" disabled={occupato} onClick={() => void salva()}>
              {casella ? "Salva" : "Aggiungi"}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
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
              placeholder="Per esempio: Fatture catering"
              value={nome}
              aria-invalid={errore ? true : undefined}
              aria-describedby={errore ? `${idNome}-e` : undefined}
              onChange={(e) => {
                setNome(e.target.value);
                setErrore(null);
              }}
              onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && (e.preventDefault(), void salva())}
            />
          </div>
          <MessaggioErrore id={`${idNome}-e`} testo={errore} />
        </div>
        <div>
          <label htmlFor={idGiorno} className="etichetta">
            Scadenza (facoltativa)
          </label>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[16px]" aria-hidden="true">
              Entro il giorno
            </span>
            <div className={"campo !w-[104px] shrink-0" + (errGiorno ? " errore" : "")}>
              <input
                id={idGiorno}
                className="num"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={3}
                placeholder="Nessuna"
                value={giorno}
                aria-describedby={`${idGiorno}-aiuto`}
                aria-invalid={errGiorno ? true : undefined}
                onChange={(e) => {
                  setGiorno(e.target.value);
                  setErrGiorno(null);
                }}
                onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && (e.preventDefault(), void salva())}
              />
            </div>
            <span className="text-[16px]" aria-hidden="true">
              del mese
            </span>
          </div>
          <p id={`${idGiorno}-aiuto`} className="m-0 mt-1 text-[13px] text-spento">
            Da 1 a 31, oppure vuoto per nessuna. Nei mesi più corti vale l&apos;ultimo giorno. Tre giorni prima il Riepilogo te lo ricorda.
          </p>
          <MessaggioErrore id={`${idGiorno}-e`} testo={errGiorno} />
        </div>
      </div>
    </Finestra>
  );
}
