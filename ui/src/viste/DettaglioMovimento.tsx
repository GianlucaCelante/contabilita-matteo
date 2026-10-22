import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, ErroreRichiesta, messaggioErrore } from "../api/client";
import type { Ambito, Movimento } from "../api/tipi";
import { IconaDocumento } from "../componenti/IconeMovimento";
import SchedaAllegato from "../componenti/SchedaAllegato";
import SchedaLaterale, { Riga } from "../componenti/SchedaLaterale";
import ConfermaUscita from "../componenti/ConfermaUscita";
import Finestra from "../componenti/Finestra";
import FormMovimento from "../componenti/FormMovimento";
import { IconaCestino } from "../componenti/Icone";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { useAvviso } from "../hooks/useAvviso";
import { useBloccoUscita } from "../hooks/useBloccoUscita";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { CLASSE_TIPO, NOME_ORIGINE, TIPO_BREVE } from "../util/etichette";
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
  const grande = useSchermoGrande();
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
    <div className="flex min-h-full flex-col">
      <Testata
        compatta
        titolo="Movimento"
        indietro="/movimenti"
        etichetta={
          <span className={"etichettaTipo " + CLASSE_TIPO[movimento.tipo]}>
            {TIPO_BREVE[movimento.tipo]}
            {ricorrente ? " · ricorrente" : ""}
          </span>
        }
        azioni={
          grande ? (
            <button type="button" className="btn pericolo gap-2" onClick={() => setChiedeElimina(true)} disabled={ritardo}>
              <IconaCestino larghezza={20} spessoreTratto={2} />
              <span>Elimina</span>
            </button>
          ) : undefined
        }
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          invia();
        }}
        className="flex flex-1 flex-col gap-4 px-3 pb-28 pt-4 md:px-8 md:pt-0 md:pb-7 lg:flex-row lg:gap-5"
      >
        {/* Sul telefono i campi stanno sullo sfondo, senza scheda bianca. */}
        <div className="scheda flex min-w-0 flex-1 flex-col gap-[18px] max-md:gap-3.5 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 md:px-7 md:py-6">
          <FormMovimento campi={campi} onCambia={cambia} errori={errori} modifica />

          {ricorrente && (
            <section className="rounded-xl border border-bordo2 bg-crema px-[18px] py-4 max-md:px-3.5" aria-label="Ripetizione">
              {attiva ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="flex items-center gap-2.5 text-[16px] font-bold">
                      <label htmlFor="giorno-ricorrente">Si ripete ogni mese, il giorno</label>
                      <div className={"campo min-h-11 w-[72px] justify-center px-0" + (errori.giorno ? " errore" : "")}>
                        <input
                          id="giorno-ricorrente"
                          type="number"
                          min={1}
                          max={31}
                          inputMode="numeric"
                          className="num h-10 min-h-0 text-center font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          value={campi.giorno}
                          disabled={ambito !== "QUESTO_E_PROSSIMI"}
                          aria-describedby="nota-giorno"
                          title={ambito === "QUESTO_E_PROSSIMI" ? undefined : "Per cambiare il giorno scegli «Per questo e per i prossimi»."}
                          onChange={(e) => cambia({ giorno: e.target.value })}
                        />
                      </div>
                    </div>
                    <button type="button" className="min-h-11 text-[14px] font-bold text-rosso underline" onClick={() => setChiedeFerma(true)} disabled={ritardo}>
                      Ferma la ripetizione
                    </button>
                  </div>
                  <p id="nota-giorno" className="sr-only">
                    {ambito === "QUESTO_E_PROSSIMI" ? "Vale dal prossimo mese." : "Per cambiare il giorno scegli «Per questo e per i prossimi»."}
                  </p>
                  {errori.giorno && <p className="m-0 mt-1 text-[13px] font-bold text-rosso">{errori.giorno}</p>}
                  <div id="ambito-etichetta" className="mb-1 mt-2 text-[13px] leading-4 text-spento">
                    Se cambi qualcosa o elimini, vale:
                  </div>
                  <div role="radiogroup" aria-labelledby="ambito-etichetta">
                    {(
                      [
                        ["SOLO_QUESTO", "Solo per questo movimento"],
                        ["QUESTO_E_PROSSIMI", "Per questo e per i prossimi"],
                      ] as const
                    ).map(([valore, testo]) => (
                      <button key={valore} type="button" role="radio" aria-checked={ambito === valore} className="flex h-10 w-full items-center gap-3 text-[16px]" onClick={() => setAmbito(valore)}>
                        <span className={"pallino" + (ambito === valore ? " on" : "")} aria-hidden="true" />
                        <span>{testo}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="m-0 text-[16px] font-bold">La ripetizione è ferma: i movimenti già registrati restano.</p>
              )}
            </section>
          )}

          {movimento.origine === "XML" && (
            <div className="flex items-center gap-3 rounded-xl border border-bordo bg-carta px-3.5 py-3 md:hidden">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-verdechiaro text-verdescuro">
                <IconaDocumento />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold">Fattura importata da XML</div>
                <div className="text-[13px] text-spento">Il {dataBreve(movimento.creatoIl.slice(0, 10)).slice(0, 5)} · il file resta allegato</div>
              </div>
            </div>
          )}

          {grande && (
            <div className="mt-auto flex flex-wrap justify-end gap-3 pt-2">
              <Link to="/movimenti" className="btn grande px-[22px]">
                Annulla
              </Link>
              <button type="submit" className="btn primario grande w-[248px]" disabled={ritardo || (!modificato && !giornoCambiato)}>
                {salva.isPending ? "Salvo…" : "Salva modifiche"}
              </button>
            </div>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[320px] lg:self-start" aria-label="Informazioni">
          {prossima && (
            <SchedaLaterale titolo="Prossima volta" etichetta="Prossima volta">
              <Riga nome="Data" primo>
                <b>{dataBreve(prossima)}</b>
              </Riga>
              <Riga nome="Importo">
                <b className="num">{euro(movimento.importoCent)}</b>
              </Riga>
            </SchedaLaterale>
          )}
          <SchedaLaterale titolo="Registrato" etichetta="Registrato" className="max-md:hidden">
            <Riga nome="Creato" primo>
              <span>{dataBreve(movimento.creatoIl.slice(0, 10))}</span>
            </Riga>
            <Riga nome="Origine">
              <span>{movimento.origine === "RICORRENZA" ? "Ripetizione" : NOME_ORIGINE[movimento.origine]}</span>
            </Riga>
            <Riga nome="Ultima modifica">
              <span>{movimento.modificatoIl ? dataBreve(movimento.modificatoIl.slice(0, 10)) : "Mai"}</span>
            </Riga>
          </SchedaLaterale>
          <SchedaAllegato movimento={movimento} />
        </aside>

        {!grande && (
          <>
            <button type="button" className="btn pericolo w-full gap-2" onClick={() => setChiedeElimina(true)} disabled={ritardo}>
              <IconaCestino larghezza={20} spessoreTratto={2} />
              <span>Elimina movimento</span>
            </button>
            {/* Sul telefono la barra fissa copre quella di navigazione finche' si modifica. */}
            <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-t border-bordo bg-crema p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <Link to="/movimenti" className="btn min-h-14 px-5 text-[16px]">
                Annulla
              </Link>
              <button type="submit" className="btn primario min-h-14 flex-1 text-[17px]" disabled={ritardo || (!modificato && !giornoCambiato)}>
                {salva.isPending ? "Salvo…" : "Salva modifiche"}
              </button>
            </div>
          </>
        )}
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
    </div>
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
