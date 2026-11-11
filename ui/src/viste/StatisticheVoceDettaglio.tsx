import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { Anagrafica, Tipo } from "../api/tipi";
import AzioniVoce from "../componenti/AzioniVoce";
import { IconaDestra, IconaMatita } from "../componenti/Icone";
import { ElencoPerGiorno, IntestazioneElenco } from "../componenti/RigaMovimento";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import Testata, { PulsanteNuovoMovimento } from "../componenti/Testata";
import { useSedi } from "../hooks/useSedi";
import { useSegnaPagataInElenco } from "../hooks/useSegnaPagata";
import { elementiDellaVoce, filtroDellaVoce, indirizzoElencoVoci, indirizzoMovimentiDellaVoce, leggiDettaglioVoce, sommaConSegno, type DettaglioVoce } from "../util/dettaglioVoce";
import { pagatoDaPagareDeiMovimenti } from "../util/fattureRicevute";
import { etichettaDate, euro } from "../util/formato";
import { posizioneLista } from "../util/posizioneLista";
import { ANAGRAFICA_DI, cosaSomma, mesiConDati, sommaRicavi, tipoPerServizio } from "../util/statisticheVoci";
import { useTitoloPagina } from "../hooks/useTitoloPagina";
import { ANAGRAFICA, testoMovimentiElenco } from "../util/voci";
import { MesiDellaVoce, PagatoDaPagare } from "./StatisticheVoci";

// Il dettaglio di una riga di «Costi e ricavi per voce»: i movimenti che la compongono nel periodo e per le sedi scelte, con
// il «Mese per mese», «Vedi in Movimenti» e, per le voci vere (non «Senza …»), il pulsante «Modifica voce» (Rinomina / Unisci / Elimina).
// Per i fornitori il riepilogo dice anche quanto e' pagato e quanto resta da pagare, e le fatture dell'elenco si segnano pagate con un tocco.
// Tutto vive nell'indirizzo (/statistiche/voci/dettaglio?v=FORNITORE&id=5&t=COSTI&da=&a=&sedi=): il tasto indietro funziona.

// La voce intera (con quanti movimenti la usano in tutto e il tipo delle categorie) si legge dall'elenco, poi si apre la finestra dell'azione.
function ModificaVoce({ anagrafica, id, onChiudi, onFatto }: { anagrafica: Anagrafica; id: number; onChiudi: () => void; onFatto: (eliminata: boolean) => void }) {
  const q = useVociDi(anagrafica);
  const voce = q.data?.find((x) => x.id === id);
  if (!voce) return null;
  return <AzioniVoce anagrafica={anagrafica} voce={voce} onChiudi={onChiudi} onFatto={(esito) => onFatto(esito.azione !== "rinomina")} />;
}

type VoceElenco = { id: number; nome: string; usi: number; tipo?: Tipo; retribuzione?: boolean };

function useVociDi(anagrafica: Anagrafica) {
  return useQuery({
    queryKey: anagrafica === "categorie" ? chiavi.categorie(undefined) : anagrafica === "fornitori" ? chiavi.fornitori("") : chiavi.dipendenti(""),
    queryFn: (): Promise<VoceElenco[]> => (anagrafica === "categorie" ? api.categorie() : anagrafica === "fornitori" ? api.fornitori("") : api.dipendenti("")),
  });
}

function TitoloVoceNonTrovata() {
  useTitoloPagina(undefined, "Voce non trovata");
  return null;
}

export default function StatisticheVoceDettaglio() {
  const [params] = useSearchParams();
  const d = useMemo(() => leggiDettaglioVoce(params), [params]);
  if (!d) {
    return (
      <div className="flex min-h-full flex-col">
        <TitoloVoceNonTrovata />
        <Testata compatta titolo="Voce" indietro="/statistiche/voci" />
        <div className="px-4 md:px-8">
          <section className="scheda max-md:rounded-2xl">
            <Vuoto titolo="Voce non trovata" testo="L'indirizzo non indica una voce valida: torna all'elenco e scegline una." />
          </section>
        </div>
      </div>
    );
  }
  return <Dettaglio d={d} />;
}

function Dettaglio({ d }: { d: DettaglioVoce }) {
  const navigate = useNavigate();
  const posizione = useLocation();
  const { piu } = useSedi();
  const [modifica, setModifica] = useState(false);
  const anagrafica = ANAGRAFICA_DI[d.raggruppa];
  const senza = d.id === null;
  // Dove riporta la freccia: la lista da cui si arriva (con il suo periodo e il mese scelto); tornando da un movimento lo stato
  // non c'e' piu' e vale quella ricordata per questo indirizzo; altrimenti una ricostruita dall'indirizzo.
  const stato = posizione.state as { lista?: unknown } | null;
  const qui = posizione.pathname + posizione.search;
  const listaDalloStato = typeof stato?.lista === "string" && stato.lista.startsWith("/statistiche/voci") ? stato.lista : null;
  const lista = listaDalloStato ?? posizioneLista.listeDeiDettagli.get(qui) ?? indirizzoElencoVoci(d);
  useEffect(() => {
    if (listaDalloStato) posizioneLista.listeDeiDettagli.set(qui, listaDalloStato);
  }, [listaDalloStato, qui]);

  const { filtro, soloCosti } = filtroDellaVoce(d);
  const richiesta = useQuery({ queryKey: chiavi.movimenti(filtro), queryFn: () => api.movimenti(filtro) });
  const tipoServizio = tipoPerServizio(d.raggruppa, d.tipo);
  const statistiche = useQuery({
    queryKey: chiavi.statisticheVoci(d.da, d.a, d.raggruppa, tipoServizio, d.sedi),
    queryFn: () => api.statisticheVoci(d.da, d.a, d.raggruppa, tipoServizio, d.sedi),
  });
  const elenco = useVociDi(anagrafica);

  const riga = statistiche.data?.voci.find((v) => v.id === d.id);
  const dellAnagrafica = d.id === null ? undefined : elenco.data?.find((v) => v.id === d.id);
  const nome = riga?.nome ?? dellAnagrafica?.nome ?? (senza ? ANAGRAFICA[anagrafica].senza : ANAGRAFICA[anagrafica].nome);
  useTitoloPagina(riga?.nome ?? dellAnagrafica?.nome ?? (senza ? ANAGRAFICA[anagrafica].senza : undefined), "Dettaglio voce");
  const elementi = useMemo(() => elementiDellaVoce(richiesta.data?.elementi ?? [], soloCosti), [richiesta.data, soloCosti]);
  const totale = sommaConSegno(elementi);
  // «Segna pagata» delle fatture dell'elenco: qui la riga resta (non c'e' un filtro «Da pagare») e il fuoco resta sul badge.
  const pagata = useSegnaPagataInElenco(richiesta.data ? elementi : undefined);
  // Solo per i fornitori: fatture meno note di credito, meno le fatture pagate (gli scontrini non contano).
  const pagamento = d.raggruppa === "FORNITORE" ? pagatoDaPagareDeiMovimenti(elementi) : null;
  const conAnno = d.da.slice(0, 7) !== d.a.slice(0, 7);
  // «Mese per mese»: solo dal primo all'ultimo mese con dati (con l'Anno non restano dieci righe vuote su dodici).
  const perMese = useMemo(
    () => (riga ? mesiConDati(statistiche.data?.mesi ?? [], riga.perMese, riga.movimentiPerMese) : { mesi: [], importi: [] }),
    [riga, statistiche.data],
  );

  return (
    <div className="flex min-h-full flex-col">
      <Testata compatta titolo={nome} indietro={lista} azioni={<PulsanteNuovoMovimento />} />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-24 pt-2 md:gap-4 md:px-8 md:pb-7 md:pt-0">
        {(richiesta.isPending || statistiche.isPending) && <Caricamento />}
        {richiesta.isError && <ErroreCaricamento errore={richiesta.error} onRiprova={() => void richiesta.refetch()} />}

        {richiesta.data && (
          <>
            <section className="scheda min-w-0 px-[18px] py-4 max-md:rounded-2xl md:px-6 md:py-5" aria-label="Riepilogo della voce">
              {/* Il periodo si chiama come nelle altre viste («2026», «Novembre 2026»); il verde e' solo dei ricavi. */}
              <div className="etichettaMaiuscola">
                {cosaSomma(d.raggruppa, d.tipo)} · {etichettaDate({ da: d.da, a: d.a })}
              </div>
              <div className={"num font-titolo text-[36px] font-bold leading-[1.15] md:text-[44px]" + (sommaRicavi(d.raggruppa, d.tipo) ? " text-verdescuro" : "")}>{euro(totale)}</div>
              <div className="num mt-1 text-[14px] text-spento">
                {testoMovimentiElenco(elementi)}
                {senza && <> · movimenti rimasti senza {ANAGRAFICA[anagrafica].nome}</>}
              </div>
              {pagamento && <PagatoDaPagare pagamento={pagamento} className="mt-1 !justify-start !text-[14px]" />}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {!senza && (
                  <button type="button" className="btn !min-h-[44px] !px-4 !text-[14px] max-md:w-full" onClick={() => setModifica(true)}>
                    <IconaMatita larghezza={18} spessoreTratto={2} />
                    <span>Modifica voce</span>
                  </button>
                )}
                <Link to={indirizzoMovimentiDellaVoce(d)} className="inline-flex min-h-[44px] items-center gap-1 text-[14px] font-bold text-verdescuro underline">
                  Vedi in Movimenti
                  <IconaDestra larghezza={16} spessoreTratto={2.2} />
                </Link>
              </div>
            </section>

            {riga && perMese.mesi.length > 1 && (
              <section className="scheda min-w-0 px-[18px] py-4 max-md:rounded-2xl md:px-6 md:py-5" aria-label="Mese per mese">
                <div className="etichettaMaiuscola mb-3">Mese per mese</div>
                <div className="md:max-w-[520px]">
                  <MesiDellaVoce nome={riga.nome} mesi={perMese.mesi} importi={perMese.importi} />
                </div>
              </section>
            )}

            <section className="scheda flex-1 overflow-hidden max-md:rounded-2xl" aria-label="Movimenti che compongono la voce">
              {elementi.length === 0 ? (
                <Vuoto titolo="Nessun movimento" testo="In questo periodo questa voce non ha movimenti." />
              ) : (
                <>
                  <IntestazioneElenco />
                  <ElencoPerGiorno elementi={elementi} conAnno={conAnno} conSede={piu} daDove={qui} pagata={pagata} />
                </>
              )}
            </section>
          </>
        )}
      </div>

      {modifica && d.id !== null && (
        <ModificaVoce
          anagrafica={anagrafica}
          id={d.id}
          onChiudi={() => setModifica(false)}
          onFatto={(eliminata) => {
            // Una voce eliminata o unita a un'altra non esiste piu': si torna alla lista. Rinominata resta qui, col titolo nuovo.
            setModifica(false);
            if (eliminata) void navigate(lista, { replace: true });
          }}
        />
      )}
    </div>
  );
}
