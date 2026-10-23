import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, ErroreRichiesta, messaggioErrore } from "../api/client";
import type { Ambito, Movimento } from "../api/tipi";
import { IconaDocumento } from "../componenti/IconeMovimento";
import SchedaAllegato from "../componenti/SchedaAllegato";
import SchedaLaterale, { Riga } from "../componenti/SchedaLaterale";
import ConfermaUscita from "../componenti/ConfermaUscita";
import RiquadroRipetizione from "../componenti/RiquadroRipetizione";
import { descriviFrequenza } from "../util/ripetizione";
import { sceltePerEliminare, sottotitoloElimina } from "../util/eliminaMovimento";
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
    mutationFn: (quale: Ambito) => api.eliminaMovimento(movimento.id, ricorrente && attiva ? quale : "SOLO_QUESTO"),
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
  const riattiva = useMutation({
    mutationFn: () => api.riattivaRicorrenza(ricorrenza!.id),
    onSuccess: () => {
      finito();
      avvisa("Ripetizione riattivata: riparte dalla prossima scadenza.");
      esci();
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
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

  const giornoCambiato = attiva && ambito === "QUESTO_E_PROSSIMI" && (campi.giorno !== String(ricorrenza?.giorno) || campi.frequenza !== iniziali.current.frequenza || campi.unita !== iniziali.current.unita || campi.intervallo !== iniziali.current.intervallo);
  const prossima = ricorrenza && attiva ? prossimaOccorrenza(movimento.data, Number(campi.giorno) || ricorrenza.giorno) : null;
  const ritardo = salva.isPending || elimina.isPending || ferma.isPending || riattiva.isPending;

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

          {ricorrente && ricorrenza && (
            <RiquadroRipetizione
              attiva={attiva}
              descrizione={descriviFrequenza(ricorrenza)}
              campi={campi}
              errori={errori}
              onCambia={cambia}
              estendi={ambito === "QUESTO_E_PROSSIMI"}
              onEstendi={() => setAmbito((a) => (a === "QUESTO_E_PROSSIMI" ? "SOLO_QUESTO" : "QUESTO_E_PROSSIMI"))}
              onFerma={() => setChiedeFerma(true)}
              onRiattiva={() => riattiva.mutate()}
              disabled={ritardo}
            />
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
            <div data-barra-fissa className="fixed inset-x-0 bottom-[var(--sotto-tastiera)] z-40 flex gap-2.5 border-t border-bordo bg-crema p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <Link to="/movimenti" className="btn min-h-[var(--d-barra)] px-5 text-[16px]">
                Annulla
              </Link>
              <button type="submit" className="btn primario min-h-[var(--d-barra)] flex-1 text-[17px]" disabled={ritardo || (!modificato && !giornoCambiato)}>
                {salva.isPending ? "Salvo…" : "Salva modifiche"}
              </button>
            </div>
          </>
        )}
      </form>

      {chiedeElimina && (
        <Finestra
          titolo="Eliminare questo movimento?"
          sottotitolo={sottotitoloElimina(ricorrente && attiva)}
          onChiudi={() => setChiedeElimina(false)}
          piede={
            <>
              <button type="button" className="btn" onClick={() => setChiedeElimina(false)}>
                No, lascia
              </button>
              {sceltePerEliminare(ricorrente && attiva).map((scelta) => (
                <button
                  key={scelta.ambito}
                  type="button"
                  className={"btn pericolo" + (scelta.pericoloso ? " pieno" : "")}
                  disabled={elimina.isPending}
                  onClick={() => elimina.mutate(scelta.ambito)}
                >
                  {elimina.isPending && elimina.variables === scelta.ambito ? "Elimino…" : scelta.etichetta}
                </button>
              ))}
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
