import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, messaggioErrore } from "../api/client";
import type { Sede } from "../api/tipi";
import { useAvviso } from "../hooks/useAvviso";
import { useSedi } from "../hooks/useSedi";
import BadgeSede from "./BadgeSede";
import Finestra from "./Finestra";
import { IconaMatita } from "./Icone";
import { Caricamento } from "./Stati";

const CLASSE_BOTTONE = "btn !rounded-[10px] !px-4 !text-[14px]";
const INVALIDA = ["sedi", "movimenti", "movimento", "riepilogo"];

function contaMovimenti(n: number): string {
  return n === 1 ? "1 movimento" : `${n.toLocaleString("it-IT")} movimenti`;
}

// Cambia il nome di una sede. Il servizio risponde 409 se esiste gia' una sede con quel nome.
function Rinomina({ sede, onChiudi }: { sede: Sede; onChiudi: () => void }) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const [nome, setNome] = useState(sede.nome);
  const [errore, setErrore] = useState<string | null>(null);
  const salva = useMutation({
    mutationFn: () => api.modificaSede(sede.id, { nome: nome.trim() }),
    onSuccess: () => {
      for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
      avvisa("Sede rinominata.");
      onChiudi();
    },
    onError: (e) => setErrore(messaggioErrore(e)),
  });
  const invia = () => {
    if (!nome.trim()) {
      setErrore("Scrivi il nome della sede.");
      return;
    }
    if (nome.trim() === sede.nome) {
      onChiudi();
      return;
    }
    setErrore(null);
    salva.mutate();
  };
  return (
    <Finestra
      titolo={`Rinomina «${sede.nome}»`}
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
        <div className={errore ? "campo errore" : "campo"}>
          <input
            id="nome-sede"
            type="text"
            data-focus-iniziale
            autoComplete="off"
            maxLength={120}
            value={nome}
            aria-invalid={errore ? true : undefined}
            aria-describedby={errore ? "nome-sede-e" : undefined}
            onChange={(e) => setNome(e.target.value)}
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

function ConfermaArchivia({ sede, onChiudi }: { sede: Sede; onChiudi: () => void }) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const archivia = useMutation({
    mutationFn: () => api.modificaSede(sede.id, { archiviata: true }),
    onSuccess: () => {
      for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
      avvisa(`«${sede.nome}» archiviata. Puoi riattivarla quando vuoi.`);
      onChiudi();
    },
    onError: (e) => {
      avvisa(messaggioErrore(e), { tipo: "errore" });
      onChiudi();
    },
  });
  return (
    <Finestra
      titolo={`Archiviare «${sede.nome}»?`}
      sottotitolo="I suoi movimenti restano e contano nei totali dei periodi passati. Non si potranno più registrare movimenti su questa sede, e non comparirà più fra le scelte."
      onChiudi={archivia.isPending ? undefined : onChiudi}
      piede={
        <>
          <button type="button" className="btn" data-focus-iniziale disabled={archivia.isPending} onClick={onChiudi}>
            No, lascia
          </button>
          <button type="button" className="btn primario" disabled={archivia.isPending} onClick={() => archivia.mutate()}>
            {archivia.isPending ? "Archivio…" : "Sì, archivia"}
          </button>
        </>
      }
    />
  );
}

// «Sedi» di Impostazioni: elenco con il numero di movimenti, rinomina, archivia o riattiva (l'ultima sede attiva non si archivia), aggiungi.
export default function SezioneSedi() {
  const { sedi, attive, pronto } = useSedi();
  const client = useQueryClient();
  const avvisa = useAvviso();
  const [nuova, setNuova] = useState("");
  const [rinomina, setRinomina] = useState<Sede | null>(null);
  const [archivia, setArchivia] = useState<Sede | null>(null);

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

  return (
    <section className="scheda min-w-0 px-6 py-[22px]" aria-label="Sedi">
      <h2 className="text-[20px] font-bold">Sedi</h2>
      <p className="m-0 mb-2 mt-1 text-[14px] text-spento">Ogni movimento appartiene a una sede. Una sede con dei movimenti non si cancella: si archivia.</p>
      {!pronto && <Caricamento />}
      <ul className="m-0 list-none p-0">
        {sedi.map((s) => (
          <li key={s.id} className="flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-1 border-t border-riga py-2 first:border-t-0">
            <BadgeSede id={s.id} decorativo />
            <div className="min-w-0 flex-1 basis-[140px]">
              <div className="break-words font-bold">
                {s.nome}
                {s.archiviata && <span className="ml-2 rounded-md bg-riga px-1.5 py-px text-[11px] font-bold text-spento">Archiviata</span>}
              </div>
              <div className="text-[13px] text-spento">{contaMovimenti(s.movimenti)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btnIcona" aria-label={`Rinomina ${s.nome}`} onClick={() => setRinomina(s)}>
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
                  disabled={unicaAttiva}
                  aria-label={`Archivia ${s.nome}`}
                  aria-describedby={unicaAttiva ? "sedi-ultima" : undefined}
                  onClick={() => setArchivia(s)}
                >
                  Archivia
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {unicaAttiva && (
        <p id="sedi-ultima" className="m-0 mt-1 text-[13px] text-spento">
          È l&apos;unica sede attiva: non si può archiviare. Ne serve almeno una.
        </p>
      )}
      <form
        className="mt-4 flex flex-wrap gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (nuova.trim()) aggiungi.mutate(nuova.trim());
        }}
      >
        <label className="campo min-w-0 flex-1 basis-[200px]">
          <span className="sr-only">Nome della nuova sede</span>
          <input type="text" autoComplete="off" maxLength={120} placeholder="Nuova sede" value={nuova} onChange={(e) => setNuova(e.target.value)} />
        </label>
        <button type="submit" className="btn primario" disabled={!nuova.trim() || aggiungi.isPending}>
          {aggiungi.isPending ? "Aggiungo…" : "Aggiungi sede"}
        </button>
      </form>
      {rinomina && <Rinomina sede={rinomina} onChiudi={() => setRinomina(null)} />}
      {archivia && <ConfermaArchivia sede={archivia} onChiudi={() => setArchivia(null)} />}
    </section>
  );
}
