import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, ErroreRichiesta, messaggioErrore } from "../api/client";
import type { Ambito, Movimento } from "../api/tipi";
import SchedaAllegato from "../componenti/SchedaAllegato";
import ConfermaUscita from "../componenti/ConfermaUscita";
import Finestra from "../componenti/Finestra";
import FormMovimento from "../componenti/FormMovimento";
import { IconaCestino } from "../componenti/Icone";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { useAvviso } from "../hooks/useAvviso";
import { useBloccoUscita } from "../hooks/useBloccoUscita";
import { CLASSE_TIPO, NOME_ORIGINE, NOME_TIPO } from "../util/etichette";
import { aggiungiMesi, dataBreve, euro, ultimoGiornoMese, daIso, isoDa } from "../util/formato";
import { daMovimento, preparaInput, type CampiForm, type Errori } from "../util/modelloMovimento";

// La data della prossima occorrenza: il mese dopo, nel giorno della ricorrenza
// (o l'ultimo giorno se il mese e' piu' corto).
function prossimaOccorrenza(dataMovimento: string, giorno: number): string {
  const inizio = aggiungiMesi(`${dataMovimento.slice(0, 8)}01`, 1);
  const d = daIso(inizio);
  return isoDa(new Date(d.getFullYear(), d.getMonth(), Math.min(giorno, ultimoGiornoMese(d.getFullYear(), d.getMonth()))));
}

const INVALIDA = ["movimenti", "movimento", "riepilogo", "fornitori", "categorie", "dipendenti"];

function ModuloDettaglio({ movimento }: { movimento: Movimento }) {
  const navigate = useNavigate();
  const avvisa = useAvviso();
  const client = useQueryClient();
  const iniziali = useRef<CampiForm>(daMovimento(movimento));
  const [campi, setCampi] = useState<CampiForm>(iniziali.current);
  const [errori, setErrori] = useState<Errori>({});
  const [ambito, setAmbito] = useState<Ambito>("SOLO_QUESTO");
  const [chiedeElimina, setChiedeElimina] = useState(false);
  const [chiedeFerma, setChiedeFerma] = useState(false);

  const ricorrenza = movimento.ricorrenza;
  const ricorrente = ricorrenza !== null;
  const attiva = ricorrenza?.attiva ?? false;
  const modificato = JSON.stringify(campi) !== JSON.stringify(iniziali.current);
  const { blocker, consenti } = useBloccoUscita(modificato);

  function finito() {
    for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
  }
  const esci = () => {
    consenti();
    void navigate("/movimenti");
  };

  const salva = useMutation({
    mutationFn: (v: { corpo: NonNullable<ReturnType<typeof preparaInput>["input"]>; ambito: Ambito }) =>
      api.modificaMovimento(movimento.id, v.corpo, v.ambito),
    onSuccess: () => {
      finito();
      avvisa("Modifiche salvate.");
      esci();
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });
  const elimina = useMutation({
    mutationFn: () => api.eliminaMovimento(movimento.id, ricorrente && attiva ? ambito : "SOLO_QUESTO"),
    onSuccess: () => {
      finito();
      avvisa("Movimento eliminato.");
      esci();
    },
    onError: (e) => {
      setChiedeElimina(false);
      avvisa(messaggioErrore(e), { tipo: "errore" });
    },
  });
  const ferma = useMutation({
    mutationFn: () => api.fermaRicorrenza(ricorrenza!.id),
    onSuccess: () => {
      finito();
      avvisa("Ripetizione fermata. I movimenti già registrati restano.");
      esci();
    },
    onError: (e) => {
      setChiedeFerma(false);
      avvisa(messaggioErrore(e), { tipo: "errore" });
    },
  });

  function cambia(parziale: Partial<CampiForm>) {
    setCampi((c) => ({ ...c, ...parziale }));
    setErrori((e) => {
      const resto = { ...e };
      for (const k of Object.keys(parziale) as (keyof CampiForm)[]) delete resto[k];
      return resto;
    });
  }

  function invia() {
    // Il giorno si controlla solo se la ripetizione e' attiva e si cambia solo con «questo e prossimi».
    const conGiorno = attiva && ambito === "QUESTO_E_PROSSIMI";
    const { errori: nuovi, input } = preparaInput({ ...campi, ripeti: conGiorno }, true);
    setErrori(nuovi);
    if (!input) {
      avvisa("Controlla i campi segnati in rosso.", { tipo: "errore" });
      return;
    }
    if (!conGiorno) delete input.ricorrenza;
    salva.mutate({ corpo: input, ambito });
  }

  const giornoCambiato = attiva && campi.giorno !== String(ricorrenza?.giorno);
  const prossima = ricorrenza && attiva ? prossimaOccorrenza(movimento.data, Number(campi.giorno) || ricorrenza.giorno) : null;
  const ritardo = salva.isPending || elimina.isPending || ferma.isPending;

  return (
    <>
      <Testata
        titolo="Movimento"
        indietro="/movimenti"
        azioni={
          <div className="flex flex-wrap items-center gap-3">
            <span className={"etichettaTipo " + CLASSE_TIPO[movimento.tipo]}>
              {NOME_TIPO[movimento.tipo]}
              {ricorrente ? " · ricorrente" : ""}
            </span>
            <button type="button" className="btn pericolo" onClick={() => setChiedeElimina(true)} disabled={ritardo}>
              <IconaCestino larghezza={20} spessoreTratto={2} />
              <span>Elimina</span>
            </button>
          </div>
        }
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          invia();
        }}
        className="flex flex-col gap-4 px-4 pb-28 md:px-8 md:pb-8 lg:flex-row"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="scheda px-5 py-6 md:px-7">
            <FormMovimento campi={campi} onCambia={cambia} errori={errori} modifica />
          </div>

          {ricorrente && (
            <section className="scheda px-5 py-5 md:px-7" aria-label="Ripetizione">
              {attiva ? (
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label htmlFor="giorno-ricorrente" className="etichetta">
                        Si ripete ogni mese, il giorno
                      </label>
                      <div className={"campo w-[110px]" + (errori.giorno ? " errore" : "")}>
                        <input
                          id="giorno-ricorrente"
                          type="number"
                          min={1}
                          max={31}
                          inputMode="numeric"
                          className="num"
                          value={campi.giorno}
                          disabled={ambito !== "QUESTO_E_PROSSIMI"}
                          aria-describedby="nota-giorno"
                          onChange={(e) => cambia({ giorno: e.target.value })}
                        />
                      </div>
                    </div>
                    <p id="nota-giorno" className="m-0 max-w-xs pb-2 text-[13px] text-tenue">
                      {ambito === "QUESTO_E_PROSSIMI" ? "Vale dal prossimo mese." : "Per cambiare il giorno scegli «Per questo e per i prossimi»."}
                    </p>
                  </div>
                  <button type="button" className="btn pericolo" onClick={() => setChiedeFerma(true)} disabled={ritardo}>
                    Ferma la ripetizione
                  </button>
                </div>
              ) : (
                <p className="m-0 text-[16px] font-bold">La ripetizione è ferma: i movimenti già registrati restano.</p>
              )}
              {errori.giorno && <p className="m-0 mt-1 text-[13px] font-bold text-rosso">{errori.giorno}</p>}

              {attiva && (
                <div className="mt-5 border-t border-riga pt-4">
                  <div id="ambito-etichetta" className="etichetta">
                    Se cambi qualcosa o elimini, vale:
                  </div>
                  <div role="radiogroup" aria-labelledby="ambito-etichetta" className="flex flex-wrap gap-2.5">
                    <button type="button" role="radio" aria-checked={ambito === "SOLO_QUESTO"} className="scelta" onClick={() => setAmbito("SOLO_QUESTO")}>
                      Solo per questo movimento
                    </button>
                    <button type="button" role="radio" aria-checked={ambito === "QUESTO_E_PROSSIMI"} className="scelta" onClick={() => setAmbito("QUESTO_E_PROSSIMI")}>
                      Per questo e per i prossimi
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <Link to="/movimenti" className="btn grande">
              Annulla
            </Link>
            <button type="submit" className="btn primario grande" disabled={ritardo || (!modificato && !giornoCambiato)}>
              {salva.isPending ? "Salvo…" : "Salva modifiche"}
            </button>
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[300px]" aria-label="Informazioni">
          {prossima && (
            <section className="scheda px-5 py-5">
              <h2 className="mb-2 text-[20px] font-bold">Prossima volta</h2>
              <p className="num m-0 text-[16px]">
                {dataBreve(prossima)} · <strong>{euro(movimento.importoCent)}</strong>
              </p>
            </section>
          )}
          <section className="scheda px-5 py-5">
            <h2 className="mb-2 text-[20px] font-bold">Registrato</h2>
            <dl className="m-0">
              <div className="flex min-h-[38px] items-center justify-between border-t border-riga text-[15px]">
                <dt className="text-spento">Origine</dt>
                <dd className="m-0 font-bold">{movimento.origine === "RICORRENZA" ? "Ripetizione" : NOME_ORIGINE[movimento.origine]}</dd>
              </div>
            </dl>
          </section>
          <SchedaAllegato movimento={movimento} />
        </aside>
      </form>

      {chiedeElimina && (
        <Finestra
          titolo="Eliminare questo movimento?"
          sottotitolo={
            ricorrente && attiva
              ? ambito === "QUESTO_E_PROSSIMI"
                ? "Elimino questo movimento e fermo la ripetizione: i prossimi non verranno più registrati."
                : "Elimino solo questo movimento. La ripetizione continua il mese prossimo."
              : "Non si può annullare."
          }
          onChiudi={() => setChiedeElimina(false)}
          piede={
            <>
              <button type="button" className="btn" onClick={() => setChiedeElimina(false)}>
                No, lascia
              </button>
              <button type="button" className="btn pericolo pieno" disabled={elimina.isPending} onClick={() => elimina.mutate()}>
                {elimina.isPending ? "Elimino…" : "Sì, elimina"}
              </button>
            </>
          }
        />
      )}
      {chiedeFerma && (
        <Finestra
          titolo="Fermare la ripetizione?"
          sottotitolo="Da ora il movimento non si registra più da solo ogni mese. Quelli già registrati restano dove sono."
          onChiudi={() => setChiedeFerma(false)}
          piede={
            <>
              <button type="button" className="btn" onClick={() => setChiedeFerma(false)}>
                No, lascia
              </button>
              <button type="button" className="btn pericolo pieno" disabled={ferma.isPending} onClick={() => ferma.mutate()}>
                {ferma.isPending ? "Fermo…" : "Sì, ferma"}
              </button>
            </>
          }
        />
      )}
      <ConfermaUscita blocker={blocker} />
    </>
  );
}

export default function DettaglioMovimento() {
  const { id } = useParams();
  const numero = Number(id);
  const valido = Number.isInteger(numero) && numero > 0;
  const q = useQuery({ queryKey: chiavi.movimento(numero), queryFn: () => api.movimento(numero), enabled: valido });

  if (!valido || (q.isError && q.error instanceof ErroreRichiesta && q.error.stato === 404)) {
    return (
      <>
        <Testata titolo="Movimento" indietro="/movimenti" />
        <Vuoto
          titolo="Questo movimento non c'è più"
          testo="Può essere stato eliminato."
          azione={
            <Link to="/movimenti" className="btn primario">
              Torna ai movimenti
            </Link>
          }
        />
      </>
    );
  }
  if (q.isPending) {
    return (
      <>
        <Testata titolo="Movimento" indietro="/movimenti" />
        <Caricamento />
      </>
    );
  }
  if (q.isError) {
    return (
      <>
        <Testata titolo="Movimento" indietro="/movimenti" />
        <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />
      </>
    );
  }
  return <ModuloDettaglio key={q.data.id} movimento={q.data} />;
}
