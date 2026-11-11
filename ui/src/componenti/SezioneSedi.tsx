import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, messaggioErrore } from "../api/client";
import type { Sede } from "../api/tipi";
import { useAvviso } from "../hooks/useAvviso";
import { useSedi } from "../hooks/useSedi";
import BadgeSede, { SegnoPersonale } from "./BadgeSede";
import { BOTTONE_RIGA_LARGO, DETTAGLIO_RIGA, TESTO_INTRO, TITOLO_RIGA, TITOLO_SCHEDA } from "./stileImpostazioni";
import Conferma from "./Conferma";
import Finestra from "./Finestra";
import Interruttore from "./Interruttore";
import { IconaMatita } from "./Icone";
import { Caricamento } from "./Stati";

const CLASSE_BOTTONE = `${BOTTONE_RIGA_LARGO} max-md:!w-auto max-md:!px-3`;
// Rinominare, archiviare o rendere personale una sede cambia elenchi, totali, statistiche (per voce comprese) ed esportazione.
const INVALIDA = ["sedi", "movimenti", "movimento", "riepilogo", "statistiche", "esporta"];

const TITOLO_PERSONALE = "Sede personale (spese dei titolari)";
const SPIEGA_PERSONALE = "Non ha pizze e ordini e resta fuori dai totali del locale, se non la scegli.";

function contaMovimenti(n: number): string {
  return n === 1 ? "1 movimento" : `${n.toLocaleString("it-IT")} movimenti`;
}

// Cambia il nome di una sede e se e' personale; si manda solo quello che cambia. Gli errori del servizio (409: nome gia' usato,
// l'ultima sede del locale non puo' diventare personale) restano nella finestra.
function Modifica({ sede, onChiudi }: { sede: Sede; onChiudi: () => void }) {
  const client = useQueryClient();
  const { togliDallaScelta } = useSedi();
  const avvisa = useAvviso();
  const [nome, setNome] = useState(sede.nome);
  const [personale, setPersonale] = useState(sede.personale);
  const [errore, setErrore] = useState<string | null>(null);
  const salva = useMutation({
    mutationFn: (corpo: { nome?: string; personale?: boolean }) => api.modificaSede(sede.id, corpo),
    onSuccess: (_, corpo) => {
      // Diventata personale: esce dalla scelta delle sedi salvata (la si riaccende a mano, se serve).
      if (corpo.personale === true) togliDallaScelta(sede.id);
      for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
      avvisa(corpo.personale === undefined ? "Sede rinominata." : corpo.personale ? "Ora è una sede personale." : "Ora è una sede del locale.");
      onChiudi();
    },
    onError: (e) => setErrore(messaggioErrore(e)),
  });
  // Il campo si segna in rosso solo per gli errori del nome (vuoto, gia' usato), non per quelli su «personale».
  const erroreNome = errore !== null && /nome/i.test(errore);
  const invia = () => {
    if (!nome.trim()) {
      setErrore("Scrivi il nome della sede.");
      return;
    }
    const corpo = { ...(nome.trim() !== sede.nome ? { nome: nome.trim() } : {}), ...(personale !== sede.personale ? { personale } : {}) };
    if (Object.keys(corpo).length === 0) {
      onChiudi();
      return;
    }
    setErrore(null);
    salva.mutate(corpo);
  };
  return (
    <Finestra
      titolo={`Modifica «${sede.nome}»`}
      onChiudi={salva.isPending ? undefined : onChiudi}
      piede={
        <>
          <button type="button" className="btn" disabled={salva.isPending} onClick={onChiudi}>
            Annulla
          </button>
          <button type="button" className="btn primario" disabled={salva.isPending} onClick={invia}>
            {salva.isPending ? "Un momento…" : "Salva"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          invia();
        }}
      >
        <label htmlFor="nome-sede" className="etichetta">
          Nome della sede
        </label>
        <div className={erroreNome ? "campo errore" : "campo"}>
          <input
            id="nome-sede"
            type="text"
            data-focus-iniziale
            autoComplete="off"
            maxLength={120}
            value={nome}
            aria-invalid={erroreNome ? true : undefined}
            aria-describedby={erroreNome ? "nome-sede-e" : undefined}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="mt-4">
          <Interruttore
            acceso={personale}
            onCambia={() => {
              setPersonale((x) => !x);
              setErrore(null);
            }}
            titolo={TITOLO_PERSONALE}
            sotto={SPIEGA_PERSONALE}
          />
        </div>
        {errore && (
          <p id="nome-sede-e" role="alert" className="m-0 mt-1.5 text-[14px] text-rosso">
            {errore}
          </p>
        )}
      </form>
    </Finestra>
  );
}

// Il 409 del servizio (l'ultima sede attiva, o l'ultima del locale quando le altre sono personali) resta nella finestra.
function ConfermaArchivia({ sede, onChiudi }: { sede: Sede; onChiudi: () => void }) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const [errore, setErrore] = useState<string | null>(null);
  const archivia = useMutation({
    mutationFn: () => api.modificaSede(sede.id, { archiviata: true }),
    onSuccess: () => {
      for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
      avvisa(`«${sede.nome}» archiviata. Puoi riattivarla quando vuoi.`);
      onChiudi();
    },
    onError: (e) => setErrore(messaggioErrore(e)),
  });
  return (
    <Conferma
      titolo={`Archiviare «${sede.nome}»?`}
      sottotitolo="I suoi movimenti restano e contano nei totali dei periodi passati. Non si potranno più registrare movimenti su questa sede, e non comparirà più fra le scelte."
      onAnnulla={onChiudi}
      occupato={archivia.isPending}
      azione={{ chiave: "archivia", etichetta: archivia.isPending ? "Archivio…" : "Archivia", stile: "primario", onClick: () => archivia.mutate() }}
    >
      {errore && (
        <p role="alert" className="m-0 text-[14px] font-bold text-rosso">
          {errore}
        </p>
      )}
    </Conferma>
  );
}

// «Sedi» di Impostazioni: elenco con il numero di movimenti, modifica (nome e «personale»), archivia o riattiva, aggiungi (sempre del locale). Non si
// archivia l'ultima sede attiva, ne' l'ultima del locale (non personale): il locale ne ha sempre almeno una.
export default function SezioneSedi() {
  const { sedi, attive, pronto } = useSedi();
  const client = useQueryClient();
  const avvisa = useAvviso();
  const [nuova, setNuova] = useState("");
  const [modifica, setModifica] = useState<Sede | null>(null);
  const [archivia, setArchivia] = useState<Sede | null>(null);

  // Una sede nasce sempre del locale: personale lo diventa dalla matita.
  const aggiungi = useMutation({
    mutationFn: (nome: string) => api.creaSede(nome),
    onSuccess: (sede) => {
      const esisteva = sedi.some((s) => s.id === sede.id);
      for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
      avvisa(esisteva ? `La sede «${sede.nome}» c'è già.` : `Sede «${sede.nome}» aggiunta.`);
      setNuova("");
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });
  const riattiva = useMutation({
    mutationFn: (sede: Sede) => api.modificaSede(sede.id, { archiviata: false }),
    onSuccess: (sede) => {
      for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
      avvisa(`«${sede.nome}» è di nuovo attiva.`);
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });

  const unicaAttiva = attive.length === 1;
  const delLocale = attive.filter((s) => !s.personale);
  // L'ultima sede attiva del locale non si archivia (ne' diventa personale: lo dice il servizio, nella finestra).
  const ultimaDelLocale = (s: Sede) => !s.archiviata && !s.personale && delLocale.length === 1;

  return (
    <section className="scheda min-w-0 px-6 py-[22px]" aria-label="Sedi">
      <h2 className={TITOLO_SCHEDA}>Sedi</h2>
      <p className={TESTO_INTRO}>Ogni movimento appartiene a una sede. Una sede con dei movimenti non si cancella: si archivia.</p>
      {!pronto && <Caricamento />}
      <ul className="m-0 list-none p-0">
        {sedi.map((s) => (
          // Telefono: matita e «Archivia» restano sulla riga del nome (il nome va a capo, il pulsante e' largo quanto il testo). Sotto
          // 360 px al nome resterebbero poche lettere: li' i pulsanti scendono sotto.
          <li key={s.id} className="flex min-h-[56px] items-center gap-x-3 gap-y-1 border-t border-riga py-2 first:border-t-0 max-[359px]:flex-wrap md:flex-wrap">
            <BadgeSede id={s.id} decorativo />
            <div className="min-w-0 flex-1 max-[359px]:basis-[140px] md:basis-[140px]">
              <div className={`break-words ${TITOLO_RIGA}`}>
                {s.nome}
                {s.personale && <SegnoPersonale className="ml-2 align-[2px]" />}
                {s.archiviata && <span className="ml-2 rounded-md bg-riga px-1.5 py-px text-[11px] font-bold text-spento">Archiviata</span>}
              </div>
              <div className={DETTAGLIO_RIGA}>{contaMovimenti(s.movimenti)}</div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button type="button" className="btnIcona" aria-label={`Modifica ${s.nome}`} onClick={() => setModifica(s)}>
                <IconaMatita larghezza={18} spessoreTratto={2} />
              </button>
              {s.archiviata ? (
                <button type="button" className={CLASSE_BOTTONE} disabled={riattiva.isPending} aria-label={`Riattiva ${s.nome}`} onClick={() => riattiva.mutate(s)}>
                  Riattiva
                </button>
              ) : (
                <button
                  type="button"
                  className={CLASSE_BOTTONE}
                  disabled={unicaAttiva || ultimaDelLocale(s)}
                  aria-label={`Archivia ${s.nome}`}
                  aria-describedby={unicaAttiva || ultimaDelLocale(s) ? "sedi-ultima" : undefined}
                  onClick={() => setArchivia(s)}
                >
                  Archivia
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {unicaAttiva ? (
        <p id="sedi-ultima" className={`mt-1 ${DETTAGLIO_RIGA}`}>
          È l&apos;unica sede attiva: non si può archiviare. Ne serve almeno una.
        </p>
      ) : (
        delLocale.length === 1 && (
          <p id="sedi-ultima" className={`mt-1 ${DETTAGLIO_RIGA}`}>
            «{delLocale[0]!.nome}» è l&apos;unica sede del locale (le altre sono personali): non si può archiviare né rendere personale.
          </p>
        )
      )}
      <form
        className="mt-4 flex flex-wrap gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (nuova.trim()) aggiungi.mutate(nuova.trim());
        }}
      >
        <label className="campo w-full min-w-0">
          <span className="sr-only">Nome della nuova sede</span>
          <input type="text" autoComplete="off" maxLength={120} placeholder="Nuova sede" value={nuova} onChange={(e) => setNuova(e.target.value)} />
        </label>
        <button type="submit" className="btn primario !min-h-[52px] max-md:w-full" disabled={!nuova.trim() || aggiungi.isPending}>
          {aggiungi.isPending ? "Aggiungo…" : "Aggiungi sede"}
        </button>
      </form>
      <p className={`mt-2 ${DETTAGLIO_RIGA}`}>Per le spese dei titolari crea una sede e rendila personale con la matita.</p>
      {modifica && <Modifica sede={modifica} onChiudi={() => setModifica(null)} />}
      {archivia && <ConfermaArchivia sede={archivia} onChiudi={() => setArchivia(null)} />}
    </section>
  );
}
