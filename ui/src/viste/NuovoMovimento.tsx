import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, messaggioErrore } from "../api/client";
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
import { useSedi } from "../hooks/useSedi";
import { campiVuoti, preparaInput, type CampiForm, type Errori } from "../util/modelloMovimento";

// Aspetta l'elenco delle sedi, cosi' il modulo parte con la sede giusta gia' scelta (la sola selezionata, altrimenti nessuna).
export default function NuovoMovimento() {
  const sedi = useSedi();
  if (!sedi.pronto) {
    return (
      <>
        <Testata compatta titolo="Nuovo movimento" indietro="/movimenti" />
        <Caricamento />
      </>
    );
  }
  return <ModuloNuovo sedeIniziale={sedi.sedePreselezionata} />;
}

function ModuloNuovo({ sedeIniziale }: { sedeIniziale: number | null }) {
  const navigate = useNavigate();
  const grande = useSchermoGrande();
  const avvisa = useAvviso();
  const client = useQueryClient();
  const { piu } = useSedi();
  const [campi, setCampi] = useState<CampiForm>(() => ({ ...campiVuoti(), sedeId: sedeIniziale }));
  const [errori, setErrori] = useState<Errori>({});
  const [iniziali, setIniziali] = useState<CampiForm>(campi);
  const [allegato, setAllegato] = useState<File | null>(null);
  const modificato = JSON.stringify(campi) !== JSON.stringify(iniziali) || allegato !== null;
  const { blocker, consenti } = useBloccoUscita(modificato);

  // Con due o piu' sedi scelte si crea un movimento per sede (una sola chiamata, tutto o niente); altrimenti ne crea uno.
  const salva = useMutation({
    mutationFn: async (corpo: NonNullable<ReturnType<typeof preparaInput>["input"]>) => (campi.dividi ? api.dividiMovimento(corpo, campi.sediDivise) : [await api.creaMovimento(corpo)]),
    onSuccess: () => {
      for (const k of ["movimenti", "riepilogo", "fornitori", "categorie", "dipendenti", "sedi"]) void client.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });

  function cambia(parziale: Partial<CampiForm>) {
    setCampi((c) => ({ ...c, ...parziale }));
    setErrori((e) => {
      const resto = { ...e };
      for (const k of Object.keys(parziale) as (keyof CampiForm)[]) delete resto[k];
      return resto;
    });
  }

  async function invia(eAltro: boolean) {
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
    // Il movimento e' salvato: se l'allegato non parte, il movimento resta e non si rifa' la POST.
    // Con «Tutte, dividi» l'allegato (la fattura, la foto) va sul primo dei movimenti creati.
    let allegatoOk = true;
    const primo = creati[0];
    if (allegato && primo) {
      try {
        await apiAllegati.carica(primo.id, allegato);
        void client.invalidateQueries({ queryKey: ["movimenti"] });
      } catch {
        allegatoOk = false;
      }
    }
    if (allegatoOk) avvisa(creati.length > 1 ? `Movimento diviso fra ${creati.length} sedi.` : "Movimento salvato.");
    else avvisa("Movimento salvato, ma l'allegato non è stato caricato: puoi aggiungerlo dal dettaglio.", { tipo: "errore" });
    setAllegato(null);
    if (eAltro) {
      // si riparte da un modulo vuoto dello stesso tipo, con la stessa data
      const nuovo = { ...campiVuoti(), tipo: campi.tipo, voceFissa: campi.voceFissa, categoria: campi.voceFissa === "ALTRA" ? campi.categoria : "", retribuzione: campi.retribuzione, data: campi.data, documentoVariabile: campi.documentoVariabile, tipoRicavo: campi.tipoRicavo, sedeId: campi.sedeId, dividi: campi.dividi, sediDivise: campi.sediDivise };
      setCampi(nuovo);
      setIniziali(nuovo);
      setErrori({});
    } else {
      consenti();
      void navigate("/movimenti");
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Testata compatta titolo="Nuovo movimento" indietro="/movimenti" azioni={<SelettoreModalita attiva="mano" />} />
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
            allegato={<CampoAllegato file={allegato} onCambia={setAllegato} disabilitato={salva.isPending} />}
          />
          {grande && (
            <div className="mt-auto flex flex-wrap justify-end gap-3 pt-5">
              <button type="button" className="btn grande px-[22px]" onClick={() => void navigate("/movimenti")}>
                Annulla
              </button>
              <button type="button" className="btn grande px-[22px]" disabled={salva.isPending} onClick={() => void invia(true)}>
                Salva e aggiungine un altro
              </button>
              <button type="submit" className="btn primario grande w-[228px] px-[22px]" disabled={salva.isPending}>
                {salva.isPending ? "Salvo…" : "Salva"}
              </button>
            </div>
          )}
        </div>
        <DoveFinisce campi={campi} />
        {/* Sul telefono la barra fissa copre quella di navigazione finche' si compila. */}
        {!grande && (
          <div data-barra-fissa className="fixed inset-x-0 bottom-[var(--sotto-tastiera)] z-40 flex gap-2.5 border-t border-bordo bg-crema p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
            <button type="button" className="btn min-h-[var(--d-barra)] px-5 text-[16px]" onClick={() => void navigate("/movimenti")}>
              Annulla
            </button>
            <button type="submit" className="btn primario min-h-[var(--d-barra)] flex-1 text-[17px]" disabled={salva.isPending}>
              {salva.isPending ? "Salvo…" : "Salva"}
            </button>
          </div>
        )}
      </form>
      <ConfermaUscita blocker={blocker} />
    </div>
  );
}
