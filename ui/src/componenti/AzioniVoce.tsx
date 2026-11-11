import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, invalidaVoci, messaggioErrore } from "../api/client";
import type { Anagrafica, Tipo } from "../api/tipi";
import { useAvviso } from "../hooks/useAvviso";
import { normalizzaNome } from "../util/categorie";
import { ANAGRAFICA, avvisoEliminazione, destinazioniUnione, erroreNomeVoce, frasePerRinomina, interruttoreRetribuzione, nomeTipoCategoria, testoConfermaUnione, testoNessunaDestinazione, testoUsi } from "../util/voci";
import Finestra from "./Finestra";
import { IconaSpunta } from "./Icone";
import Interruttore from "./Interruttore";

// Rinomina, unisci ed elimina una voce (categoria, fornitore, dipendente): lo stesso gesto ovunque la voce si veda,
// cioe' nelle statistiche per voce, nei campi di scelta del movimento e nella pagina «Elenchi» (docs/interfaccia.md).
// Telefono: fogli dal basso (Finestra «foglio»). Computer: finestre al centro.

export interface VoceGestita {
  id: number;
  nome: string;
  // Quanti movimenti la usano.
  usi: number;
  // Solo per le categorie: si uniscono fra categorie dello stesso tipo.
  tipo?: Tipo;
  // Solo per le categorie dei costi fissi: e' una retribuzione (con dipendente, regolare ed extra).
  retribuzione?: boolean | undefined;
}

export type FaseVoce = "scelta" | "rinomina" | "unisci" | "elimina";

// Cosa e' successo, per chi deve aggiornare i propri campi (il modulo del movimento che aveva scritto il vecchio nome).
export type EsitoVoce = { azione: "rinomina"; nome: string; retribuzione?: boolean } | { azione: "unisci"; nome: string } | { azione: "elimina" };

interface Proprieta {
  anagrafica: Anagrafica;
  voce: VoceGestita;
  // Da dove si parte: «scelta» mostra le tre azioni, le altre vanno dritte alla finestra dell'azione.
  inizio?: FaseVoce;
  onChiudi: () => void;
  onFatto?: (esito: EsitoVoce) => void;
}

export default function AzioniVoce({ anagrafica, voce, inizio = "scelta", onChiudi, onFatto }: Proprieta) {
  const [fase, setFase] = useState<FaseVoce>(inizio);
  // Dalla finestra di una sola azione si torna a chiudere, dalla «scelta» si torna alla scelta.
  const indietro = inizio === "scelta" ? () => setFase("scelta") : onChiudi;

  if (fase === "scelta") return <Scelta anagrafica={anagrafica} voce={voce} onFase={setFase} onChiudi={onChiudi} />;
  if (fase === "rinomina") return <Rinomina anagrafica={anagrafica} voce={voce} onIndietro={indietro} onChiudi={onChiudi} onFatto={onFatto} />;
  if (fase === "unisci") return <Unisci anagrafica={anagrafica} voce={voce} onIndietro={indietro} onChiudi={onChiudi} onFatto={onFatto} />;
  return <Elimina anagrafica={anagrafica} voce={voce} onIndietro={indietro} onChiudi={onChiudi} onFatto={onFatto} onUnisci={() => setFase("unisci")} />;
}

interface ProprietaFase {
  anagrafica: Anagrafica;
  voce: VoceGestita;
  onIndietro: () => void;
  onChiudi: () => void;
  onFatto?: ((esito: EsitoVoce) => void) | undefined;
}

// Le tre azioni come pulsanti grandi, per chi arriva dalla matita di un campo.
function Scelta({ anagrafica, voce, onFase, onChiudi }: { anagrafica: Anagrafica; voce: VoceGestita; onFase: (f: FaseVoce) => void; onChiudi: () => void }) {
  const d = ANAGRAFICA[anagrafica];
  return (
    <Finestra
      foglio
      titolo={voce.nome}
      sottotitolo={`${d.nome.charAt(0).toUpperCase()}${d.nome.slice(1)} ${testoUsi(anagrafica, voce.usi)}${voce.retribuzione ? " · Retribuzione" : ""}`}
      onChiudi={onChiudi}
      piede={
        <button type="button" className="btn max-md:w-full" onClick={onChiudi}>
          Chiudi
        </button>
      }
    >
      <div className="flex flex-col gap-2.5">
        <button type="button" className="btn grande w-full !justify-start" onClick={() => onFase("rinomina")}>
          Rinomina
        </button>
        <button type="button" className="btn grande w-full !justify-start" onClick={() => onFase("unisci")}>
          Unisci con un{d.genere === "f" ? "'altra" : " altro"}…
        </button>
        <button type="button" className="btn grande pericolo w-full !justify-start" onClick={() => onFase("elimina")}>
          Elimina
        </button>
      </div>
    </Finestra>
  );
}

function Rinomina({ anagrafica, voce, onIndietro, onChiudi, onFatto }: ProprietaFase) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const idNome = useId();
  const idErrore = `${idNome}-e`;
  const rifNome = useRef<HTMLInputElement>(null);
  const d = ANAGRAFICA[anagrafica];
  const [nome, setNome] = useState(voce.nome);
  // L'interruttore «È una retribuzione» c'e' solo per le categorie dei costi fissi.
  const conFlag = anagrafica === "categorie" && voce.tipo === "COSTO_FISSO";
  const [retribuzione, setRetribuzione] = useState(!!voce.retribuzione);
  const blocco = interruttoreRetribuzione(voce);
  const [errore, setErrore] = useState<string | null>(null);

  const salva = useMutation({
    mutationFn: (v: { nome: string; flag: boolean }) => {
      if (anagrafica === "categorie") {
        // Si manda solo cio' che cambia (almeno uno dei due, come chiede il servizio).
        const corpo: { nome?: string; retribuzione?: boolean } = {};
        if (v.nome !== voce.nome) corpo.nome = v.nome;
        if (conFlag && v.flag !== !!voce.retribuzione) corpo.retribuzione = v.flag;
        return api.modificaCategoria(voce.id, corpo);
      }
      return anagrafica === "fornitori" ? api.rinominaFornitore(voce.id, v.nome) : api.rinominaDipendente(voce.id, v.nome);
    },
    onSuccess: (r) => {
      invalidaVoci(client);
      const flag = "retribuzione" in r && typeof r.retribuzione === "boolean" ? r.retribuzione : undefined;
      avvisa(r.nome !== voce.nome ? `«${voce.nome}» ora si chiama «${r.nome}».` : `«${r.nome}» salvata.`);
      onFatto?.(flag === undefined ? { azione: "rinomina", nome: r.nome } : { azione: "rinomina", nome: r.nome, retribuzione: flag });
      onChiudi();
    },
    onError: (e) => {
      setErrore(messaggioErrore(e));
      rifNome.current?.focus();
    },
  });

  function conferma(evento?: FormEvent) {
    evento?.preventDefault();
    if (salva.isPending) return;
    const pulito = normalizzaNome(nome);
    const e = erroreNomeVoce(anagrafica, pulito);
    if (e) {
      setErrore(e);
      rifNome.current?.focus();
      return;
    }
    if (pulito === voce.nome && (!conFlag || retribuzione === !!voce.retribuzione)) {
      onChiudi();
      return;
    }
    setErrore(null);
    salva.mutate({ nome: pulito, flag: retribuzione });
  }

  return (
    <Finestra
      foglio
      titolo={`Rinomina «${voce.nome}»`}
      sottotitolo={frasePerRinomina(voce.usi, d.genere)}
      onChiudi={salva.isPending ? undefined : onChiudi}
      piede={
        <div className="flex w-full gap-3 md:w-auto">
          <button type="button" className="btn max-md:flex-1" disabled={salva.isPending} onClick={onIndietro}>
            Annulla
          </button>
          <button type="submit" form={`${idNome}-f`} className="btn primario max-md:flex-[2]" disabled={salva.isPending}>
            {salva.isPending ? "Salvo…" : conFlag ? "Salva" : "Salva nome"}
          </button>
        </div>
      }
    >
      <form id={`${idNome}-f`} onSubmit={conferma}>
        <label htmlFor={idNome} className="etichetta">
          Nome {d.genere === "f" ? "della" : "del"} {d.nome}
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
          />
        </div>
        {errore && (
          <p id={idErrore} role="alert" className="m-0 mt-1.5 text-[14px] font-bold text-rosso">
            {errore}
          </p>
        )}
        {conFlag && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="m-0 text-[14px] leading-snug text-tenue">
              Cambia come vengono contate le paghe e le statistiche per dipendente. Il cambio vale solo dopo «Salva».
            </p>
            <Interruttore
              acceso={retribuzione}
              onCambia={() => {
                setRetribuzione(!retribuzione);
                setErrore(null);
              }}
              titolo="È una retribuzione"
              sotto="Con dipendente, regolare ed extra."
              disabled={salva.isPending || blocco.bloccato}
            />
            {blocco.bloccato && <p className="m-0 text-[14px] leading-snug text-tenue">{blocco.motivo}</p>}
            {!retribuzione && !!voce.retribuzione && !blocco.bloccato && (
              <p role="status" className="m-0 rounded-xl bg-sabbia px-3 py-2 text-[14px] leading-snug">
                Se salvi, i nuovi movimenti di «{voce.nome}» non chiederanno più Regolare o Extra e il dipendente. Per tornare indietro riaccendi l&apos;interruttore.
              </p>
            )}
          </div>
        )}
      </form>
    </Finestra>
  );
}

// Le altre voci della stessa anagrafica (e, per le categorie, dello stesso tipo), per scegliere con chi unire.
function useAltreVoci(anagrafica: Anagrafica, voce: VoceGestita) {
  const q = useQuery({
    queryKey: anagrafica === "categorie" ? chiavi.categorie(voce.tipo) : anagrafica === "fornitori" ? chiavi.fornitori("") : chiavi.dipendenti(""),
    queryFn: (): Promise<{ id: number; nome: string; usi: number; tipo?: Tipo; retribuzione?: boolean }[]> =>
      anagrafica === "categorie" ? api.categorie(voce.tipo) : anagrafica === "fornitori" ? api.fornitori("") : api.dipendenti(""),
    staleTime: 0,
  });
  const altre = useMemo(
    () => destinazioniUnione(q.data ?? [], voce).sort((x, y) => x.nome.localeCompare(y.nome, "it")),
    [q.data, voce],
  );
  return { altre, inCaricamento: q.isPending, errore: q.isError };
}

function Unisci({ anagrafica, voce, onIndietro, onChiudi, onFatto }: ProprietaFase) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const idCerca = useId();
  const d = ANAGRAFICA[anagrafica];
  const { altre, inCaricamento, errore: erroreElenco } = useAltreVoci(anagrafica, voce);
  const [cerca, setCerca] = useState("");
  const [scelta, setScelta] = useState<number | null>(null);
  // Passo di conferma: l'unione non si annulla, quindi non parte al primo tocco.
  const [confermando, setConfermando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const visibili = altre.filter((x) => x.nome.toLowerCase().includes(cerca.trim().toLowerCase()));
  const destinazione = altre.find((x) => x.id === scelta);

  const unisci = useMutation({
    mutationFn: (idAltra: number) => api.eliminaVoce(anagrafica, voce.id, idAltra),
    onSuccess: () => {
      if (!destinazione) return;
      invalidaVoci(client);
      avvisa(voce.usi > 0 ? `«${voce.nome}» unito a «${destinazione.nome}»: ${voce.usi === 1 ? "1 movimento spostato" : `${voce.usi} movimenti spostati`}.` : `«${voce.nome}» unito a «${destinazione.nome}».`);
      onFatto?.({ azione: "unisci", nome: destinazione.nome });
      onChiudi();
    },
    onError: (e) => setErrore(messaggioErrore(e)),
  });

  return (
    <Finestra
      foglio
      titolo={confermando && destinazione ? `Unire «${voce.nome}»?` : `Unisci «${voce.nome}»`}
      sottotitolo={confermando ? undefined : `Scegli ${d.genere === "f" ? "la categoria" : `il ${d.nome}`} che resta: ${voce.usi > 0 ? `${voce.usi === 1 ? "il movimento" : `i ${voce.usi} movimenti`} di «${voce.nome}» ${voce.usi === 1 ? "passa" : "passano"} a ${d.genere === "f" ? "lei" : "lui"}` : `«${voce.nome}» sparisce dall'elenco`}.`}
      onChiudi={unisci.isPending ? undefined : onChiudi}
      piede={
        <div className="flex w-full gap-3 md:w-auto">
          <button type="button" className="btn max-md:flex-1" disabled={unisci.isPending} onClick={confermando ? () => setConfermando(false) : onIndietro}>
            Annulla
          </button>
          {confermando && destinazione ? (
            <button
              type="button"
              data-distruttivo
              className="btn pericolo pieno max-md:flex-[2]"
              disabled={unisci.isPending}
              onClick={() => {
                setErrore(null);
                unisci.mutate(destinazione.id);
              }}
            >
              {unisci.isPending ? "Unisco…" : "Unisci"}
            </button>
          ) : (
            // Il testo va a capo se il nome e' lungo: mai tagliato (telefono a 320-375 px).
            <button
              type="button"
              className="btn primario !h-auto !whitespace-normal py-2 leading-tight max-md:flex-[2] max-md:!px-3"
              disabled={scelta === null}
              onClick={() => {
                setErrore(null);
                setConfermando(true);
              }}
            >
              {destinazione ? `Unisci a «${destinazione.nome}»` : "Unisci"}
            </button>
          )}
        </div>
      }
    >
      {inCaricamento && <p className="m-0 text-tenue">Un momento…</p>}
      {erroreElenco && <p role="alert" className="m-0 font-bold text-rosso">Non riesco a leggere l&apos;elenco.</p>}
      {confermando && destinazione && (
        <p role="alert" className="m-0 text-[16px] leading-snug">
          {testoConfermaUnione(voce.nome, destinazione.nome, voce.usi)}
        </p>
      )}
      {!confermando && voce.tipo && altre.length > 0 && (
        <p className="m-0 mb-2 text-[14px] leading-snug text-tenue">Puoi unire solo con voci dello stesso tipo: {nomeTipoCategoria(voce.tipo)}.</p>
      )}
      {!confermando && !inCaricamento && !erroreElenco && altre.length === 0 && (
        <p className="m-0 text-[15px] text-tenue">
          Non c&apos;è {d.genere === "f" ? "nessun'altra categoria" : `nessun altro ${d.nome}`}{voce.tipo ? " di questo tipo" : ""} con cui unire.
        </p>
      )}
      {!confermando && altre.length > 0 && (
        <div className="flex min-h-0 flex-col gap-2">
          {altre.length > 6 && (
            <div>
              <label htmlFor={idCerca} className="etichetta">
                Cerca
              </label>
              <div className="campo">
                <input id={idCerca} type="text" autoComplete="off" data-focus-iniziale value={cerca} onChange={(e) => setCerca(e.target.value)} />
              </div>
            </div>
          )}
          <div role="radiogroup" aria-label={`Con quale ${d.nome} unire`} className="flex max-h-[min(44vh,320px)] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {visibili.map((x) => {
              const attiva = scelta === x.id;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={attiva}
                  className={"flex min-h-[48px] w-full shrink-0 items-center gap-3 rounded-xl border px-3.5 py-2 text-left text-[16px] font-bold leading-snug " + (attiva ? "border-verde bg-verdechiaro text-verdescuro" : "border-bordo2 bg-carta hover:bg-sabbia")}
                  onClick={() => setScelta(x.id)}
                >
                  {/* Il nome va a capo, mai tagliato: due voci simili si distinguono dalla fine del nome. */}
                  <span className="min-w-0 flex-1 break-words">{x.nome}</span>
                  <span className="num shrink-0 text-[13px] font-normal text-spento">{x.usi} mov.</span>
                  {attiva && <IconaSpunta larghezza={18} spessoreTratto={2.6} />}
                </button>
              );
            })}
            {visibili.length === 0 && <p className="m-0 py-2 text-[15px] leading-snug text-tenue">{testoNessunaDestinazione(anagrafica, voce.tipo)}</p>}
          </div>
        </div>
      )}
      {errore && (
        <p role="alert" className="m-0 text-[14px] font-bold text-rosso">
          {errore}
        </p>
      )}
    </Finestra>
  );
}

function Elimina({ anagrafica, voce, onIndietro, onChiudi, onFatto, onUnisci }: ProprietaFase & { onUnisci: () => void }) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const [errore, setErrore] = useState<string | null>(null);
  const d = ANAGRAFICA[anagrafica];
  const elimina = useMutation({
    mutationFn: () => api.eliminaVoce(anagrafica, voce.id),
    onSuccess: () => {
      invalidaVoci(client);
      avvisa(`«${voce.nome}» eliminat${d.genere === "f" ? "a" : "o"}.`);
      onFatto?.({ azione: "elimina" });
      onChiudi();
    },
    onError: (e) => setErrore(messaggioErrore(e)),
  });

  return (
    <Finestra
      foglio
      titolo={`Eliminare «${voce.nome}»?`}
      onChiudi={elimina.isPending ? undefined : onChiudi}
      piede={
        <div className="flex w-full gap-3 md:w-auto">
          <button type="button" className="btn max-md:flex-1" disabled={elimina.isPending} onClick={onIndietro}>
            Annulla
          </button>
          <button
            type="button"
            data-distruttivo
            className="btn pericolo pieno max-md:flex-[2]"
            disabled={elimina.isPending}
            onClick={() => {
              setErrore(null);
              elimina.mutate();
            }}
          >
            {elimina.isPending ? "Elimino…" : "Elimina"}
          </button>
        </div>
      }
    >
      <p className="m-0 text-[16px] leading-snug">{avvisoEliminazione(anagrafica, voce.nome, voce.usi)}</p>
      {voce.usi > 0 && (
        <>
          <p className="m-0 text-[14px] leading-snug text-tenue">I movimenti restano dove sono: cambia solo che non indicano più {d.genere === "f" ? "la" : "il"} {d.nome}.</p>
          <button type="button" className="btn !justify-start max-md:w-full" onClick={onUnisci}>
            Meglio unir{d.genere === "f" ? "la" : "lo"} a un&apos;altra voce…
          </button>
        </>
      )}
      {errore && (
        <p role="alert" className="m-0 text-[14px] font-bold text-rosso">
          {errore}
        </p>
      )}
    </Finestra>
  );
}
