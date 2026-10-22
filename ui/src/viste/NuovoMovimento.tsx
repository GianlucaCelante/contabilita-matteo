import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, messaggioErrore } from "../api/client";
import type { Tipo } from "../api/tipi";
import ConfermaUscita from "../componenti/ConfermaUscita";
import FormMovimento from "../componenti/FormMovimento";
import SelettoreModalita from "../componenti/SelettoreModalita";
import Testata from "../componenti/Testata";
import { useAvviso } from "../hooks/useAvviso";
import { useBloccoUscita } from "../hooks/useBloccoUscita";
import { NOME_DOCUMENTO } from "../util/etichette";
import { dataValida, euro, intervalloDi, leggiEuro, settimanaBreve } from "../util/formato";
import { campiVuoti, categoriaDi, documentoDi, preparaInput, testoRipetizione, type CampiForm, type Errori } from "../util/modelloMovimento";

const VOCE_TIPO: Record<Tipo, string> = { RICAVO: "Ricavi", COSTO_VARIABILE: "Costi variabili", COSTO_FISSO: "Costi fissi" };

function Riga({ nome, valore }: { nome: string; valore: string }) {
  return (
    <div className="flex min-h-[38px] items-center justify-between gap-3 border-t border-riga text-[15px]">
      <dt className="text-spento">{nome}</dt>
      <dd className="m-0 text-right font-bold">{valore}</dd>
    </div>
  );
}

// Riquadro laterale (solo computer): dove verra' contato il movimento e l'effetto sul totale.
function DoveFinisce({ campi }: { campi: CampiForm }) {
  const valida = dataValida(campi.data);
  const settimana = valida ? intervalloDi("settimana", campi.data) : null;
  const q = useQuery({
    queryKey: chiavi.riepilogo(settimana?.da ?? "", settimana?.a ?? ""),
    queryFn: () => api.riepilogo(settimana!.da, settimana!.a),
    enabled: settimana !== null,
  });
  const cent = leggiEuro(campi.importo);
  const r = q.data;
  const prima = r ? (campi.tipo === "RICAVO" ? r.ricavi.totaleCent : campi.tipo === "COSTO_VARIABILE" ? r.costiVariabili.totaleCent : r.costiFissi.totaleCent) : null;
  const doc = NOME_DOCUMENTO[documentoDi(campi)];
  const categoria = categoriaDi(campi);
  const ripetizione = testoRipetizione(campi);

  return (
    <aside className="scheda hidden w-[300px] shrink-0 self-start px-5 py-5 lg:block" aria-label="Dove finisce">
      <h2 className="mb-2 text-[20px] font-bold">Dove finisce</h2>
      <dl className="m-0">
        <Riga nome="Voce" valore={VOCE_TIPO[campi.tipo]} />
        <Riga nome="Periodo" valore={settimana ? settimanaBreve(settimana) : "–"} />
        {doc && <Riga nome="Tipo" valore={doc} />}
        {categoria && <Riga nome="Categoria" valore={categoria} />}
        {campi.tipo === "COSTO_FISSO" && campi.voceFissa === "RETRIBUZIONE" && <Riga nome="Dipendente" valore={campi.dipendente.trim() || "Non indicato"} />}
        {ripetizione && <Riga nome="Ripetizione" valore={ripetizione} />}
      </dl>
      <div className="mt-3 rounded-xl bg-sabbia p-3">
        <div className="etichettaMaiuscola mb-1">{VOCE_TIPO[campi.tipo]} della settimana</div>
        {q.isPending && settimana && <p className="m-0 text-[14px] text-spento">Calcolo…</p>}
        {q.isError && <p className="m-0 text-[14px] text-spento">Non riesco a calcolare il totale.</p>}
        {prima !== null && (
          <dl className="m-0">
            <div className="flex justify-between text-[15px]">
              <dt className="text-spento">Prima</dt>
              <dd className="num m-0">{euro(prima)}</dd>
            </div>
            <div className="flex justify-between text-[16px] font-bold">
              <dt>Con questo</dt>
              <dd className="num m-0 whitespace-nowrap">{euro(prima + (cent ?? 0))}</dd>
            </div>
          </dl>
        )}
      </div>
    </aside>
  );
}

export default function NuovoMovimento() {
  const navigate = useNavigate();
  const avvisa = useAvviso();
  const client = useQueryClient();
  const [campi, setCampi] = useState<CampiForm>(campiVuoti);
  const [errori, setErrori] = useState<Errori>({});
  const [iniziali, setIniziali] = useState<CampiForm>(campi);
  const modificato = JSON.stringify(campi) !== JSON.stringify(iniziali);
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
    try {
      await salva.mutateAsync(input);
    } catch {
      return; // l'avviso d'errore e' gia' mostrato da onError
    }
    avvisa("Movimento salvato.");
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
    <>
      <Testata titolo="Nuovo movimento" indietro="/movimenti" azioni={<SelettoreModalita attiva="mano" />} />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void invia(false);
        }}
        className="flex flex-col gap-4 px-4 pb-28 md:px-8 md:pb-8 lg:flex-row"
      >
        <div className="scheda min-w-0 flex-1 px-5 py-6 md:px-7">
          <FormMovimento campi={campi} onCambia={cambia} errori={errori} />
          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-riga pt-5">
            <button type="button" className="btn grande" onClick={() => void navigate("/movimenti")}>
              Annulla
            </button>
            <button type="button" className="btn grande max-md:hidden" disabled={salva.isPending} onClick={() => void invia(true)}>
              Salva e aggiungine un altro
            </button>
            <button type="submit" className="btn primario grande" disabled={salva.isPending}>
              {salva.isPending ? "Salvo…" : "Salva"}
            </button>
          </div>
        </div>
        <DoveFinisce campi={campi} />
      </form>
      <ConfermaUscita blocker={blocker} />
    </>
  );
}
