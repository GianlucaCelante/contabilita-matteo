import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, ErroreRichiesta, invalidaVoci, messaggioErrore } from "../api/client";
import type { Ambito, Movimento } from "../api/tipi";
import BadgeSede from "../componenti/BadgeSede";
import { IconaDocumento } from "../componenti/IconeMovimento";
import SchedaAllegato, { AllegatoCompatto } from "../componenti/SchedaAllegato";
import SchedaLaterale, { Riga } from "../componenti/SchedaLaterale";
import ConfermaUscita from "../componenti/ConfermaUscita";
import RiquadroRipetizione from "../componenti/RiquadroRipetizione";
import { aiutoRipetizioneDivisa, descriviFrequenza } from "../util/ripetizione";
import { sceltePerEliminare, sottotitoloElimina, type SceltaElimina } from "../util/eliminaMovimento";
import Conferma, { type AzioneConferma } from "../componenti/Conferma";
import FormMovimento from "../componenti/FormMovimento";
import { IconaCestino } from "../componenti/Icone";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { mostraPrimoErrore } from "../hooks/scorriInVista";
import { useAvviso } from "../hooks/useAvviso";
import { useBloccoUscita } from "../hooks/useBloccoUscita";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { useSedi } from "../hooks/useSedi";
import { useTornaIndietro } from "../hooks/useTornaIndietro";
import { testiFatturaImportata } from "../util/allegatoDemo";
import { CLASSE_TIPO, NOME_ORIGINE, TIPO_BREVE } from "../util/etichette";
import { dataBreve, euro } from "../util/formato";
import { categoriaRichiestaInModifica, daMovimento, frequenzaCambiata, modificheDelModello, preparaInput, type CampiForm, type Errori } from "../util/modelloMovimento";

function ModuloDettaglio({ movimento }: { movimento: Movimento }) {
  // Da dove si arriva (la lista di una voce delle statistiche, per esempio): la freccia indietro, «Annulla» e il salvataggio
  // riportano li'; altrimenti ai Movimenti.
  // Con modifiche non salvate «Annulla» e la freccia non fanno il passo indietro (che la conferma non sempre ferma): util/ritorno.
  const { torna, esci: tornaA, alClic } = useTornaIndietro(() => uscitaBloccata());
  const grande = useSchermoGrande();
  const avvisa = useAvviso();
  const client = useQueryClient();
  const { piu } = useSedi();
  const iniziali = useRef<CampiForm>(daMovimento(movimento));
  const [campi, setCampi] = useState<CampiForm>(iniziali.current);
  const [errori, setErrori] = useState<Errori>({});
  // Chi usa l'app ha messo mano alla Categoria: da li' in poi e' obbligatoria anche se il movimento era senza (util/modelloMovimento).
  const [categoriaToccata, setCategoriaToccata] = useState(false);
  // L'allegato e' appena stato caricato dal campo compatto del telefono: la scheda «Allegato» che compare si porta in vista.
  const [allegatoAppenaCaricato, setAllegatoAppenaCaricato] = useState(false);
  // Con una ripetizione attiva e dati del modello cambiati (importo, voce...) il salvataggio chiede «solo questo o anche i prossimi».
  const [daSalvare, setDaSalvare] = useState<NonNullable<ReturnType<typeof preparaInput>["input"]> | null>(null);
  const [chiedeElimina, setChiedeElimina] = useState(false);
  const [chiedeFerma, setChiedeFerma] = useState(false);

  const ricorrenza = movimento.ricorrenza;
  const ricorrente = ricorrenza !== null;
  const importata = movimento.origine === "XML" ? testiFatturaImportata(import.meta.env.VITE_DEMO === "1", movimento.creatoIl) : null;
  const attiva = ricorrenza?.attiva ?? false;
  const modificato = JSON.stringify(campi) !== JSON.stringify(iniziali.current);
  const { blocker, consenti, attivo: uscitaBloccata } = useBloccoUscita(modificato);

  // Cambiano elenchi, riepilogo e statistiche (per voce comprese), e il conto dei movimenti di ogni sede.
  function finito() {
    invalidaVoci(client);
    void client.invalidateQueries({ queryKey: chiavi.sedi });
  }
  // Dopo un salvataggio (o eliminazione, ripetizione fermata o riattivata): un passo indietro se la voce precedente e' `torna`,
  // altrimenti all'indirizzo al posto della voce del movimento. Il tasto indietro non riapre il movimento (magari eliminato).
  const esci = () => {
    consenti();
    tornaA(torna);
  };

  const salva = useMutation({
    mutationFn: async (v: { corpo: NonNullable<ReturnType<typeof preparaInput>["input"]>; ambito: Ambito }) => {
      await api.assicuraCategoriaRetribuzione(v.corpo);
      return api.modificaMovimento(movimento.id, v.corpo, v.ambito);
    },
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
    if ("categoria" in parziale) setCategoriaToccata(true);
    setCampi((c) => ({ ...c, ...parziale }));
    setErrori((e) => {
      const resto = { ...e };
      for (const k of Object.keys(parziale) as (keyof CampiForm)[]) delete resto[k];
      return resto;
    });
  }

  function invia() {
    // La frequenza e' della ripetizione: si manda solo se e' cambiata davvero (e la ripetizione e' attiva).
    const frequenza = attiva && frequenzaCambiata(iniziali.current, campi);
    const { errori: nuovi, input } = preparaInput({ ...campi, ripeti: frequenza }, true, false, categoriaRichiestaInModifica(iniziali.current, categoriaToccata));
    setErrori(nuovi);
    if (!input) {
      avvisa("Controlla i campi segnati in rosso.", { tipo: "errore", posizione: "alto" });
      mostraPrimoErrore();
      return;
    }
    if (!frequenza) delete input.ricorrenza;
    // La sede si manda solo se e' cambiata (una sede archiviata non accetta piu' movimenti, ma quelli che ha restano com'e').
    if (campi.sedeId === iniziali.current.sedeId || !piu) delete input.sedeId;
    if (attiva && modificheDelModello(iniziali.current, campi)) {
      setDaSalvare(input);
      return;
    }
    salva.mutate({ corpo: input, ambito: "SOLO_QUESTO" });
  }

  const prossima = ricorrenza && attiva ? ricorrenza.prossimaData : null;
  const ritardo = salva.isPending || elimina.isPending || ferma.isPending || riattiva.isPending;
  // Le strade per eliminare (una, o due in una ripetizione attiva): l'ultima e' quella che non si annulla.
  const scelteElimina = sceltePerEliminare(ricorrente && attiva);
  const azioneElimina = (scelta: SceltaElimina): AzioneConferma => ({
    chiave: scelta.ambito,
    etichetta: elimina.isPending && elimina.variables === scelta.ambito ? "Elimino…" : scelta.etichetta,
    stile: scelta.pericoloso ? "distruttiva" : "pericolo",
    onClick: () => elimina.mutate(scelta.ambito),
  });
  // Sul telefono, senza allegato, c'e' il campo compatto di «Nuovo movimento» dentro il modulo; con l'allegato (e sul computer) la scheda.
  const senzaAllegatoSulTelefono = !grande && movimento.allegatoNome === null;

  return (
    <div className="flex min-h-full flex-col">
      <Testata
        compatta
        titolo="Movimento"
        indietro={torna}
        alClicIndietro={alClic()}
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
          <FormMovimento
            campi={campi}
            onCambia={cambia}
            errori={errori}
            modifica
            {...(senzaAllegatoSulTelefono ? { allegato: <AllegatoCompatto movimento={movimento} disabilitato={ritardo} onCaricato={() => setAllegatoAppenaCaricato(true)} /> } : {})}
          />

          {ricorrente && ricorrenza && (
            <RiquadroRipetizione
              attiva={attiva}
              descrizione={descriviFrequenza(ricorrenza)}
              campi={campi}
              errori={errori}
              onCambia={cambia}
              onFerma={() => setChiedeFerma(true)}
              onRiattiva={() => riattiva.mutate()}
              disabled={ritardo}
              aiuto={aiutoRipetizioneDivisa(movimento)}
            />
          )}

          {importata && (
            <div className="flex items-center gap-3 rounded-xl border border-bordo bg-carta px-3.5 py-3 md:hidden">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-verdechiaro text-verdescuro">
                <IconaDocumento />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold leading-snug">{importata.titolo}</div>
                <div className="text-[13px] text-spento">{importata.sotto}</div>
              </div>
            </div>
          )}

          {grande && (
            <div data-azioni-modulo className="mt-auto flex flex-wrap justify-end gap-3 pt-2">
              <Link to={torna} onClick={alClic()} className="btn grande px-[22px]">
                Annulla
              </Link>
              <button type="submit" className="btn primario grande w-[248px]" disabled={ritardo || !modificato}>
                {salva.isPending ? "Salvo…" : "Salva modifiche"}
              </button>
            </div>
          )}
        </div>

        <aside className={"w-full shrink-0 flex-col gap-4 lg:w-[320px] lg:self-start " + (senzaAllegatoSulTelefono && !prossima ? "hidden" : "flex")} aria-label="Informazioni">
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
            {piu && (
              <Riga nome="Sede">
                <span className="inline-flex items-center gap-2">
                  <BadgeSede id={movimento.sede.id} taglia="piccolo" decorativo />
                  {movimento.sede.nome}
                </span>
              </Riga>
            )}
            <Riga nome="Ultima modifica">
              <span>{movimento.modificatoIl ? dataBreve(movimento.modificatoIl.slice(0, 10)) : "Mai"}</span>
            </Riga>
          </SchedaLaterale>
          {!senzaAllegatoSulTelefono && <SchedaAllegato movimento={movimento} inVista={allegatoAppenaCaricato} />}
        </aside>

        {!grande && (
          <>
            <button type="button" className="btn pericolo w-full gap-2" onClick={() => setChiedeElimina(true)} disabled={ritardo}>
              <IconaCestino larghezza={20} spessoreTratto={2} />
              <span>Elimina movimento</span>
            </button>
            {/* Sul telefono la barra fissa copre quella di navigazione finche' si modifica (che, coperta, si nasconde: useBarreFisse). */}
            <div data-barra-fissa data-azioni-modulo className="fixed inset-x-0 bottom-[var(--sotto-tastiera)] z-40 flex gap-2.5 border-t border-bordo bg-crema p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <Link to={torna} onClick={alClic()} className="btn min-h-[var(--d-barra)] px-5 text-[16px]">
                Annulla
              </Link>
              <button type="submit" className="btn primario min-h-[var(--d-barra)] flex-1 text-[17px]" disabled={ritardo || !modificato}>
                {salva.isPending ? "Salvo…" : "Salva modifiche"}
              </button>
            </div>
          </>
        )}
      </form>

      {chiedeElimina && (
        <Conferma
          titolo="Eliminare questo movimento?"
          sottotitolo={sottotitoloElimina(ricorrente && attiva)}
          onAnnulla={() => setChiedeElimina(false)}
          occupato={elimina.isPending}
          azione={azioneElimina(scelteElimina[scelteElimina.length - 1]!)}
          altra={scelteElimina.length > 1 ? azioneElimina(scelteElimina[0]!) : undefined}
        />
      )}
      {daSalvare && (
        <Conferma
          titolo="Salvare le modifiche per:"
          onAnnulla={() => setDaSalvare(null)}
          occupato={salva.isPending}
          altra={{ etichetta: "Solo questo movimento", onClick: () => salva.mutate({ corpo: daSalvare, ambito: "SOLO_QUESTO" }) }}
          azione={{ etichetta: "Questo e i prossimi", stile: "primario", onClick: () => salva.mutate({ corpo: daSalvare, ambito: "QUESTO_E_PROSSIMI" }) }}
        />
      )}
      {chiedeFerma && (
        <Conferma
          titolo="Fermare la ripetizione?"
          onAnnulla={() => setChiedeFerma(false)}
          occupato={ferma.isPending}
          azione={{ chiave: "ferma", etichetta: ferma.isPending ? "Fermo…" : "Ferma", stile: "distruttiva", onClick: () => ferma.mutate() }}
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
  const { torna, alClic } = useTornaIndietro();
  const q = useQuery({ queryKey: chiavi.movimento(numero), queryFn: () => api.movimento(numero), enabled: valido });

  if (!valido || (q.isError && q.error instanceof ErroreRichiesta && q.error.stato === 404)) {
    return (
      <>
        <Testata titolo="Movimento" indietro={torna} alClicIndietro={alClic()} />
        <Vuoto
          titolo="Questo movimento non c'è più"
          testo="Può essere stato eliminato."
          azione={
            <Link to={torna} onClick={alClic()} className="btn primario">
              {torna.startsWith("/movimenti") ? "Torna ai movimenti" : "Torna indietro"}
            </Link>
          }
        />
      </>
    );
  }
  if (q.isPending) {
    return (
      <>
        <Testata titolo="Movimento" indietro={torna} alClicIndietro={alClic()} />
        <Caricamento />
      </>
    );
  }
  if (q.isError) {
    return (
      <>
        <Testata titolo="Movimento" indietro={torna} alClicIndietro={alClic()} />
        <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />
      </>
    );
  }
  return <ModuloDettaglio key={q.data.id} movimento={q.data} />;
}
