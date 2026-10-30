import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { MedieStatistiche, Statistiche as DatiStatistiche } from "../api/tipi";
import BadgeSede from "../componenti/BadgeSede";
import GraficoScontrino from "../componenti/GraficoScontrino";
import { IconaDestra } from "../componenti/Icone";
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import SelettoreSedi from "../componenti/SelettoreSedi";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { usePeriodo } from "../hooks/usePeriodo";
import { useSedi } from "../hooks/useSedi";
import { euro, NOME_PERIODO } from "../util/formato";
import {
  elencoNomi,
  intervalloUltimeSettimane,
  ricavoPerPizzaCent,
  settimanaCorta,
  testoConteggio,
  testoPizzePerOrdine,
  ultimaIncompleta,
  ultimeSettimane,
} from "../util/statistiche";

const NESSUN_NOME: string[] = [];
const PERCORSO_INSERIMENTO = "/statistiche/pizze-ordini";

const testoEuro = (cent: number | null) => (cent === null ? "—" : euro(cent));

// Un blocco di tre numeri: ordini, pizze, pizze per ordine.
function Numero({ nome, valore, className = "" }: { nome: string; valore: string; className?: string }) {
  return (
    <div className={"min-w-0 rounded-xl bg-crema px-2.5 py-2.5 md:rounded-[14px] md:px-4 md:py-3 " + className}>
      <div className="etichettaMaiuscola !text-[11px]">{nome}</div>
      <div className="num font-titolo text-[20px] font-bold leading-tight md:text-[24px]">{valore}</div>
    </div>
  );
}

// «Settimana 26 ott – 1 nov: mancano pizze e ordini di Lungomare e Mercato.» Porta a «Pizze e ordini» di quella settimana.
function Banner({ lunedi, nomi }: { lunedi: string; nomi: string[] }) {
  return (
    <Link
      to={`${PERCORSO_INSERIMENTO}?s=${lunedi}`}
      className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-ambrabordo bg-ambrachiaro px-3.5 py-3 text-[14px] font-bold text-ambra no-underline md:px-4"
    >
      <span className="min-w-[12rem] flex-1">
        Settimana {settimanaCorta(lunedi)}: mancano pizze e ordini
        {nomi.length > 0 ? ` di ${elencoNomi(nomi)}` : ""}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap">
        Inserisci
        <IconaDestra larghezza={18} spessoreTratto={2.4} />
      </span>
    </Link>
  );
}

function Riassunto({ d, titolo }: { d: DatiStatistiche; titolo: string }) {
  const t = d.totale;
  const perPizza = ricavoPerPizzaCent(t.ricaviCent, t.pizze);
  return (
    <section className="scheda min-w-0 px-[18px] py-4 max-md:rounded-2xl md:px-6 md:py-5" aria-label={titolo}>
      <div className="etichettaMaiuscola">{titolo}</div>
      <div className="num font-titolo text-[40px] font-bold leading-[1.15] text-verdescuro md:text-[44px]">{testoEuro(t.scontrinoMedioCent)}</div>
      <div className="mt-3.5 grid grid-cols-3 gap-2 md:grid-cols-2 md:gap-2.5 2xl:grid-cols-4">
        <Numero nome="Ordini" valore={testoConteggio(t.ordini)} />
        <Numero nome="Pizze" valore={testoConteggio(t.pizze)} />
        <Numero nome="Pizze / ordine" valore={testoPizzePerOrdine(t.pizzePerOrdine)} />
        {perPizza !== null && <Numero className="max-md:hidden" nome="Ricavo per pizza" valore={euro(perPizza)} />}
      </div>
      {perPizza !== null && (
        <div className="mt-2.5 text-[14px] text-spento md:hidden">
          Ogni pizza porta in media <b className="num text-testo">{euro(perPizza)}</b>
        </div>
      )}
    </section>
  );
}

// «Per sede»: scontrino medio di ogni sede scelta con una barra (da zero) e, in fondo, il totale delle sedi scelte.
function ConfrontoSedi({ d, etichettaTotale }: { d: DatiStatistiche; etichettaTotale: string }) {
  const info = useSedi().info;
  const righe = d.perSede;
  const massimo = Math.max(...righe.map((r) => r.scontrinoMedioCent ?? 0), d.totale.scontrinoMedioCent ?? 0, 1);
  const larghezza = (cent: number | null) => `${((cent ?? 0) / massimo) * 100}%`;
  const dettaglio = (m: MedieStatistiche) => `${testoConteggio(m.ordini)} ordini · ${testoConteggio(m.pizze)} pizze · ${testoPizzePerOrdine(m.pizzePerOrdine)} a ordine`;
  const coloreDi = (id: number) => info(id)?.colore.testo ?? "var(--color-verdescuro)";

  return (
    <section className="scheda px-[18px] pb-2 pt-3.5 max-md:rounded-2xl md:px-6 md:pb-3 md:pt-5" aria-label="Confronto tra sedi">
      <h2 className="text-[18px] font-bold md:mb-2 md:text-[20px]">
        <span className="md:hidden">Per sede</span>
        <span className="max-md:hidden">Confronto tra sedi</span>
      </h2>

      {/* Telefono: una riga per sede con la barra e sotto il dettaglio. */}
      <ul className="m-0 mt-1.5 list-none p-0 md:hidden">
        {righe.map((r) => (
          <li key={r.sede.id} className="border-t border-riga py-2.5">
            <div className="flex items-center gap-2.5">
              <BadgeSede id={r.sede.id} decorativo />
              <span className="min-w-0 flex-1 truncate font-bold">{r.sede.nome}</span>
              <b className="num">{testoEuro(r.scontrinoMedioCent)}</b>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-riga" aria-hidden="true">
              <div className="h-full" style={{ width: larghezza(r.scontrinoMedioCent), background: coloreDi(r.sede.id) }} />
            </div>
            <div className="num mt-1 text-[13px] text-spento">{r.ordini > 0 ? dettaglio(r) : "Nessun dato in questo periodo"}</div>
          </li>
        ))}
        <li className="border-t-2 border-testo py-2.5">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="inline-flex h-[26px] min-w-[26px] shrink-0 items-center justify-center rounded-lg bg-riga font-titolo text-[13px] font-bold text-testo">
              ∑
            </span>
            <span className="min-w-0 flex-1 truncate font-bold">{etichettaTotale}</span>
            <b className="num">{testoEuro(d.totale.scontrinoMedioCent)}</b>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-riga" aria-hidden="true">
            <div className="h-full bg-testo" style={{ width: larghezza(d.totale.scontrinoMedioCent) }} />
          </div>
          <div className="num mt-1 text-[13px] text-spento">{dettaglio(d.totale)}</div>
        </li>
      </ul>

      {/* Computer: tabella. */}
      <table className="w-full border-collapse max-md:hidden">
        <caption className="sr-only">Scontrino medio, ordini e pizze di ogni sede nel periodo</caption>
        <thead>
          <tr className="text-left">
            <th scope="col" className="etichettaMaiuscola w-[34px] pb-2" />
            <th scope="col" className="etichettaMaiuscola pb-2 pr-3">Sede</th>
            <th scope="col" className="etichettaMaiuscola pb-2 pr-3">Scontrino medio</th>
            <th scope="col" className="etichettaMaiuscola w-[110px] pb-2 text-right">Valore</th>
            <th scope="col" className="etichettaMaiuscola w-[90px] pb-2 text-right">Ordini</th>
            <th scope="col" className="etichettaMaiuscola w-[90px] pb-2 text-right">Pizze</th>
            <th scope="col" className="etichettaMaiuscola w-[120px] pb-2 text-right">Pizze / ordine</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.sede.id} className="border-t border-riga">
              <td className="py-3"><BadgeSede id={r.sede.id} decorativo /></td>
              <th scope="row" className="py-3 pr-3 text-left font-bold">{r.sede.nome}</th>
              <td className="py-3 pr-3">
                <div className="h-2.5 overflow-hidden rounded-[5px] bg-riga" aria-hidden="true">
                  <div className="h-full" style={{ width: larghezza(r.scontrinoMedioCent), background: coloreDi(r.sede.id) }} />
                </div>
              </td>
              <td className="num py-3 text-right font-bold">{testoEuro(r.scontrinoMedioCent)}</td>
              <td className="num py-3 text-right">{testoConteggio(r.ordini)}</td>
              <td className="num py-3 text-right">{testoConteggio(r.pizze)}</td>
              <td className="num py-3 text-right">{testoPizzePerOrdine(r.pizzePerOrdine)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-testo font-bold">
            <td className="py-3"><span aria-hidden="true" className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-lg bg-riga font-titolo text-[13px]">∑</span></td>
            <th scope="row" className="py-3 pr-3 text-left">{etichettaTotale}</th>
            <td className="py-3 pr-3">
              <div className="h-2.5 overflow-hidden rounded-[5px] bg-riga" aria-hidden="true">
                <div className="h-full bg-testo" style={{ width: larghezza(d.totale.scontrinoMedioCent) }} />
              </div>
            </td>
            <td className="num py-3 text-right">{testoEuro(d.totale.scontrinoMedioCent)}</td>
            <td className="num py-3 text-right">{testoConteggio(d.totale.ordini)}</td>
            <td className="num py-3 text-right">{testoConteggio(d.totale.pizze)}</td>
            <td className="num py-3 text-right">{testoPizzePerOrdine(d.totale.pizzePerOrdine)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export default function Statistiche() {
  const periodo = usePeriodo("settimana", true);
  const { da, a } = periodo.intervallo;
  const sedi = useSedi();
  const filtro = sedi.parametro;
  const ultime = intervalloUltimeSettimane();

  const q = useQuery({ queryKey: chiavi.statistiche(da, a, filtro), queryFn: () => api.statistiche(da, a, filtro), enabled: sedi.pronto });
  // Il grafico segue le sedi scelte; il banner guarda sempre tutte (se manca una sede, manca, anche se non la stai guardando).
  const grafico = useQuery({ queryKey: chiavi.statistiche(ultime.da, ultime.a, filtro), queryFn: () => api.statistiche(ultime.da, ultime.a, filtro), enabled: sedi.pronto });
  const tutte = useQuery({ queryKey: chiavi.statistiche(ultime.da, ultime.a), queryFn: () => api.statistiche(ultime.da, ultime.a), enabled: sedi.pronto });

  const d = q.data;
  const punti = ultimeSettimane(grafico.data?.settimane ?? []);
  const haDatiNelGrafico = punti.some((p) => p.scontrinoMedioCent !== null);
  const incompleta = tutte.data ? ultimaIncompleta(tutte.data.settimane) : null;
  // Con una sola sede non servono i nomi: il banner dice solo quale settimana manca.
  const nomiMancanti = sedi.piu && incompleta ? incompleta.sediMancanti.map((x) => x.nome) : NESSUN_NOME;
  const titolo = `Scontrino medio ${NOME_PERIODO[periodo.tipo]}` + (sedi.piu ? ` · ${sedi.incluse ?? "tutte le sedi"}` : "");
  const conConfronto = sedi.piu && sedi.selezionate.length >= 2 && !!d && d.totale.ordini > 0;
  const etichettaTotale = sedi.tutteSelezionate ? "Tutte le sedi" : "Sedi scelte";

  const pulsante = (className: string) => (
    <Link to={PERCORSO_INSERIMENTO} className={"btn primario " + className}>
      <span className="md:hidden">Inserisci dati della settimana</span>
      <span className="max-md:hidden">Inserisci pizze e ordini</span>
    </Link>
  );

  return (
    <div className="flex min-h-full flex-col">
      <Testata titoloSoloComputer titolo="Statistiche" azioni={<span className="max-md:hidden">{pulsante("")}</span>} />
      <div className="flex flex-1 flex-col px-4 pb-24 md:px-8 md:pb-7">
        <SelettoreSedi className="pb-3" />
        <div className="pb-3 md:pb-4">
          <SelettorePeriodo periodo={periodo} senzaGiorno />
        </div>

        {(q.isPending || !sedi.pronto) && <Caricamento />}
        {q.isError && <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />}

        {d && (
          <div className="flex flex-1 flex-col gap-3 md:gap-4">
            {incompleta && <Banner lunedi={incompleta.settimana} nomi={nomiMancanti} />}

            {/* Telefono e tablet: totale, «Per sede», grafico. Computer largo: totale e grafico affiancati, sotto «Per sede». */}
            <div className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              {d.totale.settimaneConDati === 0 || d.totale.ordini === 0 ? (
                <section className="scheda min-w-0 max-md:rounded-2xl" aria-label={titolo}>
                  {d.totale.settimaneTotali === 0 ? (
                    <Vuoto titolo="Il periodo non comprende una settimana intera" testo="Le statistiche si calcolano sulle settimane che iniziano di lunedì. Scegli una settimana, un mese o un periodo più lungo." />
                  ) : (
                    <Vuoto
                      titolo="Ancora nessun dato di pizze e ordini"
                      testo="Scrivi una volta a settimana quante pizze e quanti ordini ha fatto ogni sede: l'app calcola lo scontrino medio dai ricavi."
                    />
                  )}
                </section>
              ) : (
                <Riassunto d={d} titolo={titolo} />
              )}

              {haDatiNelGrafico && (
                <section className="scheda min-w-0 px-[18px] py-4 max-lg:order-3 max-md:rounded-2xl md:px-6 md:py-5" aria-label="Andamento dello scontrino medio">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="text-[18px] font-bold md:text-[20px]">Ultime 8 settimane</h2>
                    <span className="etichettaMaiuscola">€ per ordine</span>
                  </div>
                  <GraficoScontrino punti={punti} />
                </section>
              )}

              {conConfronto && (
                <div className="min-w-0 max-lg:order-2 lg:col-span-2">
                  <ConfrontoSedi d={d} etichettaTotale={etichettaTotale} />
                </div>
              )}
            </div>

            {pulsante("grande w-full md:hidden")}
          </div>
        )}
        {grafico.isError && !q.isError && <p className="m-0 mt-3 text-[13px] text-rosso">Non riesco a leggere l&apos;andamento delle ultime settimane.</p>}
      </div>
    </div>
  );
}
