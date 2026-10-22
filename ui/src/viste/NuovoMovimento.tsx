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
import Testata from "../componenti/Testata";
import { useAvviso } from "../hooks/useAvviso";
import { useBloccoUscita } from "../hooks/useBloccoUscita";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { campiVuoti, preparaInput, type CampiForm, type Errori } from "../util/modelloMovimento";

export default function NuovoMovimento() {
  const navigate = useNavigate();
  const grande = useSchermoGrande();
  const avvisa = useAvviso();
  const client = useQueryClient();
  const [campi, setCampi] = useState<CampiForm>(campiVuoti);
  const [errori, setErrori] = useState<Errori>({});
  const [iniziali, setIniziali] = useState<CampiForm>(campi);
  const [allegato, setAllegato] = useState<File | null>(null);
  const modificato = JSON.stringify(campi) !== JSON.stringify(iniziali) || allegato !== null;
  const { blocker, consenti } = useBloccoUscita(modificato);

  const salva = useMutation({
    mutationFn: (corpo: NonNullable<ReturnType<typeof preparaInput>["input"]>) => api.creaMovimento(corpo),
    onSuccess: () => {
      for (const k of ["movimenti", "riepilogo", "fornitori", "categorie", "dipendenti"]) void client.invalidateQueries({ queryKey: [k] });
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
    const { errori: nuovi, input } = preparaInput(campi, true);
    setErrori(nuovi);
    if (!input) {
      avvisa("Controlla i campi segnati in rosso.", { tipo: "errore" });
      return;
    }
    let creato;
    try {
      creato = await salva.mutateAsync(input);
    } catch {
      return; // l'avviso d'errore e' gia' mostrato da onError
    }
    // Il movimento e' salvato: se l'allegato non parte, il movimento resta e non si rifa' la POST.
    let allegatoOk = true;
    if (allegato) {
      try {
        await apiAllegati.carica(creato.id, allegato);
        void client.invalidateQueries({ queryKey: ["movimenti"] });
      } catch {
        allegatoOk = false;
      }
    }
    if (allegatoOk) avvisa("Movimento salvato.");
    else avvisa("Movimento salvato, ma l'allegato non è stato caricato: puoi aggiungerlo dal dettaglio.", { tipo: "errore" });
    setAllegato(null);
    if (eAltro) {
      // si riparte da un modulo vuoto dello stesso tipo, con la stessa data
      const nuovo = { ...campiVuoti(), tipo: campi.tipo, voceFissa: campi.voceFissa, retribuzione: campi.retribuzione, data: campi.data, documentoVariabile: campi.documentoVariabile, tipoRicavo: campi.tipoRicavo };
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
