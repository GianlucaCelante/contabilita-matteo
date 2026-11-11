import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, invalidaVoci, messaggioErrore } from "../api/client";
import { apiAllegati } from "../api/allegati";
import CampoAllegato from "../componenti/CampoAllegato";
import ConfermaUscita from "../componenti/ConfermaUscita";
import DoveFinisce from "../componenti/DoveFinisce";
import FormMovimento from "../componenti/FormMovimento";
import SelettoreModalita from "../componenti/SelettoreModalita";
import { Caricamento } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { mostraPrimoErrore } from "../hooks/scorriInVista";
import { useAvviso } from "../hooks/useAvviso";
import { useBloccoUscita } from "../hooks/useBloccoUscita";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { sediDopoSalvataggio } from "../util/sedeDopoSalvataggio";
import { useSedi } from "../hooks/useSedi";
import { useTornaIndietro } from "../hooks/useTornaIndietro";
import { avvisoMovimentoSalvato, type EsitoSalvataggio } from "../util/avvisoSalvataggio";
import { oggiIso } from "../util/formato";
import { leggiFiltri, magazzinoBrowser, periodoDopoSalvataggio, salvaFiltri } from "../util/filtriSalvati";
import { campiPerUnAltro, campiVuoti, preparaInput, type CampiForm, type Errori } from "../util/modelloMovimento";
import { seguePeriodoSalvato, senzaPeriodo } from "../util/ritorno";
import { leggiUltimaSede, magazzinoUltimaSede, ricordaUltimaSede, sedeDiPartenza } from "../util/ultimaSede";

// Aspetta l'elenco delle sedi, cosi' il modulo parte con la sede giusta gia' scelta: la sola selezionata, altrimenti l'ultima usata
// su questo dispositivo (util/ultimaSede.ts), altrimenti nessuna.
export default function NuovoMovimento() {
  const sedi = useSedi();
  const { torna, alClic } = useTornaIndietro();
  if (!sedi.pronto) {
    return (
      <>
        <Testata compatta titolo="Nuovo movimento" indietro={torna} alClicIndietro={alClic()} />
        <Caricamento />
      </>
    );
  }
  return <ModuloNuovo torna={torna} />;
}

// `torna`: l'indirizzo da cui si e' aperto il nuovo movimento (Movimenti, Riepilogo, una statistica per voce): ci si torna
// dopo il salvataggio, con «Annulla» e con la freccia indietro.
function ModuloNuovo({ torna }: { torna: string }) {
  // Con modifiche non salvate «Annulla» e la freccia non fanno il passo indietro (che la conferma non sempre ferma): util/ritorno.
  const { esci, alClic } = useTornaIndietro(() => uscitaBloccata());
  const grande = useSchermoGrande();
  const avvisa = useAvviso();
  const client = useQueryClient();
  const { piu, sedi, selezionate, aggiungi: aggiungiSedi } = useSedi();
  // La sede si legge una volta sola, all'apertura: cosi' il modulo appena aperto non risulta «modificato».
  const [campi, setCampi] = useState<CampiForm>(() => ({ ...campiVuoti(), sedeId: sedeDiPartenza(sedi, selezionate.map((s) => s.id), leggiUltimaSede()) }));
  const [errori, setErrori] = useState<Errori>({});
  const [iniziali, setIniziali] = useState<CampiForm>(campi);
  const [allegato, setAllegato] = useState<File | null>(null);
  // Il file scelto e rifiutato dal campo (formato non ammesso…): se si salva lo stesso, senza averne scelto uno buono, l'avviso
  // finale ricorda che il movimento e' senza allegato. `giroAllegato` rimonta il campo dopo ogni salvataggio, cosi' con «Salva e
  // aggiungine un altro» l'errore del file di prima non resta sotto il campo del modulo nuovo.
  const [rifiutato, setRifiutato] = useState<string | null>(null);
  const [giroAllegato, setGiroAllegato] = useState(0);
  // Il file scelto si sta ancora preparando (foto grande da ridimensionare): finche' non e' pronto non si salva, altrimenti il
  // movimento partirebbe senza il file e senza promemoria. I pulsanti «Salva» sono spenti e `invia` non parte.
  const [allegatoInPreparazione, setAllegatoInPreparazione] = useState(false);
  const modificato = JSON.stringify(campi) !== JSON.stringify(iniziali) || allegato !== null;
  const { blocker, consenti, attivo: uscitaBloccata } = useBloccoUscita(modificato);
  // Dopo un salvataggio che ha spostato il periodo (vedi sotto) si torna senza il periodo nell'indirizzo: vale quello salvato.
  const [periodoSpostato, setPeriodoSpostato] = useState(false);
  const uscita = periodoSpostato ? senzaPeriodo(torna) : torna;

  // Con due o piu' sedi scelte si crea un movimento per sede (una sola chiamata, tutto o niente); altrimenti ne crea uno.
  const salva = useMutation({
    mutationFn: async (corpo: NonNullable<ReturnType<typeof preparaInput>["input"]>) => {
      await api.assicuraCategoriaRetribuzione(corpo);
      return campi.dividi ? api.dividiMovimento(corpo, campi.sediDivise) : [await api.creaMovimento(corpo)];
    },
    onSuccess: () => {
      // Cambiano elenchi, riepilogo e statistiche (per voce comprese), e il conto dei movimenti di ogni sede.
      invalidaVoci(client);
      void client.invalidateQueries({ queryKey: chiavi.sedi });
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });

  const occupato = salva.isPending || allegatoInPreparazione;

  function cambia(parziale: Partial<CampiForm>) {
    setCampi((c) => ({ ...c, ...parziale }));
    setErrori((e) => {
      const resto = { ...e };
      for (const k of Object.keys(parziale) as (keyof CampiForm)[]) delete resto[k];
      return resto;
    });
  }

  async function invia(eAltro: boolean) {
    if (allegatoInPreparazione) return;
    const { errori: nuovi, input } = preparaInput(campi, true, piu);
    setErrori(nuovi);
    if (!input) {
      avvisa("Controlla i campi segnati in rosso.", { tipo: "errore", posizione: "alto" });
      mostraPrimoErrore();
      return;
    }
    let creati;
    try {
      creati = await salva.mutateAsync(input);
    } catch {
      return; // l'avviso d'errore e' gia' mostrato da onError
    }
    // La prossima volta, con «Tutte le sedi», il modulo parte da questa sede (mai da una divisione o da una sede personale).
    if (piu && !campi.dividi && campi.sedeId !== null) ricordaUltimaSede(magazzinoUltimaSede(), sedi, campi.sedeId);
    // Il movimento e' salvato: se l'allegato non parte, il movimento resta e non si rifa' la POST.
    // Con «Tutte, dividi» l'allegato (la fattura, la foto) va sul primo dei movimenti creati.
    let esitoAllegato: EsitoSalvataggio["allegato"] = "nessuno";
    const primo = creati[0];
    if (allegato && primo) {
      try {
        await apiAllegati.carica(primo.id, allegato);
        void client.invalidateQueries({ queryKey: ["movimenti"] });
        esitoAllegato = "caricato";
      } catch {
        esitoAllegato = "nonCaricato";
      }
    }
    // Se il movimento e' di un periodo diverso da quello mostrato, l'elenco passa al suo mese: altrimenti sembrerebbe vuoto.
    // Vale tornando ai Movimenti o al Riepilogo; una statistica resta sul suo periodo.
    const cambio = seguePeriodoSalvato(torna) ? periodoDopoSalvataggio(campi.data, leggiFiltri(), oggiIso()) : null;
    if (cambio) {
      salvaFiltri(magazzinoBrowser(), cambio);
      setPeriodoSpostato(true);
    }
    // Lo stesso per le sedi: se il movimento e' su una sede che il selettore non mostra, la sede si accende (mai una personale: per
    // quella l'avviso dice dov'e' il movimento). Vedi util/sedeDopoSalvataggio.ts.
    const sediDopo = seguePeriodoSalvato(torna) ? sediDopoSalvataggio(sedi, selezionate.map((s) => s.id), creati.map((m) => m.sede.id)) : null;
    if (sediDopo && sediDopo.daAggiungere.length > 0) aggiungiSedi(sediDopo.daAggiungere);
    // Un solo testo per tutte le varianti (util/avvisoSalvataggio.ts): normale, piu' sedi, allegato non caricato o rifiutato, demo; tutte
    // dicono «Ora vedi …» se il periodo e' cambiato. Nell'app vera un allegato mancato e' in rosso: c'e' qualcosa da rifare dal dettaglio.
    const esito = avvisoMovimentoSalvato({
      demo: import.meta.env.VITE_DEMO === "1",
      movimenti: creati.length,
      allegato: esitoAllegato,
      rifiutato,
      dataSePeriodoCambiato: cambio ? campi.data : null,
      sedi: sediDopo,
    });
    avvisa(esito.testo, esito.errore ? { tipo: "errore" } : undefined);
    setAllegato(null);
    setRifiutato(null);
    setAllegatoInPreparazione(false);
    setGiroAllegato((g) => g + 1);
    if (eAltro) {
      // si riparte da un modulo vuoto dello stesso tipo, con la stessa data (dopo una nota di credito: da Fattura)
      const nuovo = campiPerUnAltro(campi);
      setCampi(nuovo);
      setIniziali(nuovo);
      setErrori({});
    } else {
      consenti();
      // Un passo indietro se la destinazione e' proprio la voce da cui si e' arrivati (la lista rilegge il periodo salvato, cosi'
      // «Ora vedi …» vale anche cosi'); se l'indirizzo cambia (periodo tolto) o si era arrivati da un link diretto, si va
      // all'indirizzo al posto della voce del modulo. In tutti e due i casi il tasto indietro non riapre il modulo.
      esci(cambio ? senzaPeriodo(torna) : uscita);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Testata compatta titolo="Nuovo movimento" indietro={uscita} alClicIndietro={alClic(uscita)} azioni={<SelettoreModalita attiva="mano" />} />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void invia(false);
        }}
        className="flex flex-1 flex-col gap-4 px-3 pb-28 pt-4 md:px-8 md:pt-0 md:pb-7 lg:flex-row lg:gap-5"
      >
        {/* Sul telefono i campi stanno sullo sfondo, senza scheda bianca. */}
        <div className="scheda flex min-w-0 flex-1 flex-col max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 md:px-7 md:py-6">
          <FormMovimento
            campi={campi}
            onCambia={cambia}
            errori={errori}
            allegato={<CampoAllegato key={giroAllegato} file={allegato} onCambia={setAllegato} onRifiutato={setRifiutato} onPreparazione={setAllegatoInPreparazione} disabilitato={salva.isPending} />}
          />
          {grande && (
            <div data-azioni-modulo className="mt-auto flex flex-wrap justify-end gap-3 pt-5">
              <button type="button" className="btn grande px-[22px]" onClick={() => esci(uscita)}>
                Annulla
              </button>
              <button type="button" className="btn grande px-[22px]" disabled={occupato} onClick={() => void invia(true)}>
                Salva e aggiungine un altro
              </button>
              <button type="submit" className="btn primario grande w-[228px] px-[22px]" disabled={occupato}>
                {salva.isPending ? "Salvo…" : allegatoInPreparazione ? "Preparo il file…" : "Salva"}
              </button>
            </div>
          )}
        </div>
        <DoveFinisce campi={campi} />
        {/* Sul telefono la barra fissa copre quella di navigazione finche' si compila (che, coperta, si nasconde: useBarreFisse). */}
        {!grande && (
          <div data-barra-fissa data-azioni-modulo className="fixed inset-x-0 bottom-[var(--sotto-tastiera)] z-40 flex gap-2.5 border-t border-bordo bg-crema p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
            <button type="button" className="btn min-h-[var(--d-barra)] px-5 text-[16px]" onClick={() => esci(uscita)}>
              Annulla
            </button>
            <button type="submit" className="btn primario min-h-[var(--d-barra)] flex-1 text-[17px]" disabled={occupato}>
              {salva.isPending ? "Salvo…" : allegatoInPreparazione ? "Preparo il file…" : "Salva"}
            </button>
          </div>
        )}
      </form>
      <ConfermaUscita blocker={blocker} />
    </div>
  );
}
