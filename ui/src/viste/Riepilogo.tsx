import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { Riepilogo as DatiRiepilogo } from "../api/tipi";
import BadgeSede from "../componenti/BadgeSede";
import SchedaScontrinoMedio from "../componenti/SchedaScontrinoMedio";
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import SelettoreSedi from "../componenti/SelettoreSedi";
import { Caricamento, ErroreCaricamento } from "../componenti/Stati";
import Testata, { PulsanteNuovoMovimento } from "../componenti/Testata";
import { usePeriodo } from "../hooks/usePeriodo";
import { useSedi } from "../hooks/useSedi";
import { dividiVociFisse, nomiTue } from "../util/categorie";
import { euro, NOME_PERIODO, numeroCent, percentuale } from "../util/formato";

// Una riga di una scheda. `sotto` e' il sottotesto accanto al nome (solo sul computer);
function Riga({ nome, valore, sotto, className = "" }: { nome: string; valore: number; sotto?: string; className?: string }) {
  return (
    <li className={className + " flex min-h-[44px] items-center justify-between gap-3 border-t border-riga text-[15px] md:text-[16px]"}>
      <span className="min-w-0">
        {nome}
        {sotto && <span className="text-[13px] text-spento max-md:hidden"> · {sotto}</span>}
      </span>
      <span className="num shrink-0">{euro(valore)}</span>
    </li>
  );
}

// Sul computer il totale e' ancorato al fondo della scheda (la scheda si allunga
// fino in fondo alla pagina); sul telefono sta nell'intestazione, accanto al titolo.
function Blocco({ titolo, totaleNome, totale, peso = 1, children }: { titolo: string; totaleNome: string; totale: number; peso?: number; children: ReactNode }) {
  return (
    <section
      className="scheda flex min-w-0 flex-col px-[18px] pb-1 pt-3.5 max-md:rounded-2xl md:flex-1 md:px-6 md:pb-5 md:pt-5"
      style={{ flexGrow: peso }}
      aria-label={titolo}
    >
      <div className="flex items-baseline justify-between gap-3 md:mb-3">
        <h2 className="text-[18px] font-bold md:text-[20px]">{titolo}</h2>
        <span className="num text-[18px] font-bold md:hidden" aria-label={`${totaleNome} ${euro(totale)}`}>
          {euro(totale)}
        </span>
      </div>
      <ul className="m-0 mt-2 list-none p-0 md:mt-0">{children}</ul>
      <div className="flex-1" />
      <div className="flex h-[52px] items-center justify-between gap-3 border-t-2 border-testo text-[17px] font-bold max-md:hidden">
        <span>{totaleNome}</span>
        <span className="num">{euro(totale)}</span>
      </div>
    </section>
  );
}

function BarraProporzioni({ d, className = "" }: { d: DatiRiepilogo; className?: string }) {
  const ricavi = d.ricavi.totaleCent;
  // La barra e' sempre piena: se i costi superano i ricavi la base e' il totale dei costi.
  const base = Math.max(ricavi, d.costiCent);
  const variabili = d.costiVariabili.totaleCent;
  const fissi = d.costiFissi.totaleCent;
  const risultato = Math.max(d.risultatoCent, 0);
  const larghezza = (v: number) => (base > 0 ? `${(v / base) * 100}%` : "0%");
  return (
    <div
      className={"flex overflow-hidden bg-riga " + className}
      role="img"
      aria-label={`Costi variabili ${percentuale(variabili, ricavi)}, costi fissi ${percentuale(fissi, ricavi)}, risultato ${percentuale(d.risultatoCent, ricavi)} dei ricavi`}
    >
      <div style={{ width: larghezza(variabili) }} className="bg-ambra" />
      <div style={{ width: larghezza(fissi) }} className="bg-verdebordo" />
      <div style={{ width: larghezza(risultato) }} className="bg-verde" />
    </div>
  );
}

function Legenda({ d }: { d: DatiRiepilogo }) {
  const ricavi = d.ricavi.totaleCent;
  return (
    <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-[13px] text-spento max-md:hidden">
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-ambra" />Costi variabili {percentuale(d.costiVariabili.totaleCent, ricavi)}</li>
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-verdebordo" />Costi fissi {percentuale(d.costiFissi.totaleCent, ricavi)}</li>
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-verde" />Risultato {percentuale(d.risultatoCent, ricavi)}</li>
    </ul>
  );
}

// «Per sede»: ricavi, costi e risultato di ogni sede scelta, con una barra proporzionale ai ricavi. Solo con almeno due sedi selezionate.
function PerSede({ righe }: { righe: NonNullable<DatiRiepilogo["perSede"]> }) {
  const maxRicavi = Math.max(...righe.map((r) => r.ricaviCent), 1);
  const info = useSedi().info;
  return (
    <section className="scheda px-[18px] pb-1.5 pt-3.5 max-md:rounded-2xl md:px-6 md:pt-5" aria-label="Confronto tra sedi">
      <div className="flex items-baseline justify-between gap-3 md:mb-1">
        <h2 className="text-[18px] font-bold md:text-[20px]">Per sede</h2>
        <span className="etichettaMaiuscola md:hidden">Ricavi · Risultato</span>
      </div>
      <div className="hidden grid-cols-[26px_minmax(0,1fr)_110px_110px_110px] items-center gap-x-3 pt-2 md:grid" aria-hidden="true">
        <span />
        <span className="etichettaMaiuscola">Sede</span>
        <span className="etichettaMaiuscola text-right">Ricavi</span>
        <span className="etichettaMaiuscola text-right">Costi</span>
        <span className="etichettaMaiuscola text-right">Risultato</span>
      </div>
      <ul className="m-0 mt-1.5 list-none p-0 md:mt-0">
        {righe.map((r) => {
          const colore = info(r.sede.id)?.colore.testo ?? "var(--color-verdescuro)";
          return (
            <li key={r.sede.id} className="border-t border-riga py-2.5 md:pb-3.5">
              <div className="flex items-center gap-2.5 md:grid md:grid-cols-[26px_minmax(0,1fr)_110px_110px_110px] md:gap-x-3">
                <BadgeSede id={r.sede.id} decorativo />
                <span className="min-w-0 flex-1 font-bold">
                  <span className="block truncate">{r.sede.nome}</span>
                  {/* Sui telefoni stretti i ricavi vanno sotto il nome, altrimenti il nome resterebbe di poche lettere. */}
                  <span aria-hidden="true" className="num block text-[13px] font-normal text-spento min-[390px]:hidden">{euro(r.ricaviCent)}</span>
                </span>
                <span className="num text-[14px] text-spento max-[389px]:hidden md:text-right md:text-[15px]">
                  <span className="sr-only">Ricavi </span>
                  {euro(r.ricaviCent)}
                </span>
                <span className="num hidden text-right text-[15px] text-spento md:inline">
                  <span className="sr-only">Costi </span>
                  {euro(r.costiCent)}
                </span>
                <span className={"num min-w-[78px] text-right font-bold " + (r.risultatoCent < 0 ? "text-rosso" : "text-verdescuro")}>
                  <span className="sr-only">Risultato </span>
                  {euro(r.risultatoCent)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded bg-riga md:ml-[38px] md:h-1.5" aria-hidden="true">
                <div className="h-full" style={{ width: `${(Math.max(r.ricaviCent, 0) / maxRicavi) * 100}%`, background: colore }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function Riepilogo() {
  const periodo = usePeriodo("settimana");
  const { da, a } = periodo.intervallo;
  const sedi = useSedi();
  const filtroSedi = sedi.parametro;
  const q = useQuery({ queryKey: chiavi.riepilogo(da, a, filtroSedi), queryFn: () => api.riepilogo(da, a, filtroSedi), enabled: sedi.pronto });
  const d = q.data;
  // Lo scontrino medio dai dati di pizze e ordini: stessa chiamata (e stessa cache) della schermata Statistiche. Se non risponde o non
  // ci sono dati la scheda non compare e il Riepilogo resta com'e'.
  const stat = useQuery({ queryKey: chiavi.statistiche(da, a, filtroSedi), queryFn: () => api.statistiche(da, a, filtroSedi), enabled: sedi.pronto });
  const totaleStat = stat.data?.totale;
  const conScontrino = !!totaleStat && totaleStat.ordini > 0;
  // Se le sedi scelte non sono tutte, il titolo dice quali sono incluse («Risultato della settimana · Via Roma + Lungomare»).
  const nomePeriodo = NOME_PERIODO[periodo.tipo];
  const titoloRisultato = sedi.piu ? `${nomePeriodo} · ${sedi.incluse ?? "tutte le sedi"}` : nomePeriodo;
  const perSede = sedi.piu && sedi.selezionate.length >= 2 ? (d?.perSede ?? []) : [];
  // Le voci fisse create da chi usa l'app («Tua»): sul telefono hanno la loro riga, il resto sta in una riga sola.
  const categorieFisse = useQuery({ queryKey: chiavi.categorie("COSTO_FISSO"), queryFn: () => api.categorie("COSTO_FISSO"), staleTime: 15_000 });
  const tueFisse = nomiTue(categorieFisse.data ?? []);
  const fisseTelefono = dividiVociFisse(d?.costiFissi.altreVoci ?? [], tueFisse);
  const coloreRisultato = d && d.risultatoCent < 0 ? "text-rosso" : "text-verdescuro";

  return (
    <div className="flex min-h-full flex-col">
      <Testata titoloSoloComputer titolo="Riepilogo" azioni={<PulsanteNuovoMovimento />} />
      <div className="flex flex-1 flex-col px-4 pb-24 md:px-8 md:pb-7">
        <SelettoreSedi className="pb-3" />
        <div className="pb-3 md:pb-4">
          <SelettorePeriodo periodo={periodo} />
        </div>

        {(q.isPending || !sedi.pronto) && <Caricamento />}
        {q.isError && <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />}

        {d && (
          <div className="flex flex-1 flex-col gap-3 md:gap-4">
            {/* Computer: Ricavi − Costi = Risultato in una riga. */}
            <section className="scheda shrink-0 px-6 py-5 leading-[1.2] max-md:hidden" aria-label={`Risultato ${titoloRisultato}`}>
              <div className="flex items-end gap-x-12">
                <div>
                  <div className="etichettaMaiuscola">Ricavi</div>
                  <div className="num font-titolo text-[32px] font-bold">{euro(d.ricavi.totaleCent)}</div>
                </div>
                <div className="pb-1 text-[28px] text-spento" aria-hidden="true">−</div>
                <div>
                  <div className="etichettaMaiuscola">Costi</div>
                  <div className="num font-titolo text-[32px] font-bold">{euro(d.costiCent)}</div>
                </div>
                <div className="pb-1 text-[28px] text-spento" aria-hidden="true">=</div>
                <div>
                  <div className="etichettaMaiuscola">Risultato {titoloRisultato}</div>
                  <div className={"num font-titolo text-[32px] font-bold " + coloreRisultato}>{euro(d.risultatoCent)}</div>
                </div>
              </div>
              <BarraProporzioni d={d} className="mt-4 h-3.5 rounded-[7px]" />
              <Legenda d={d} />
            </section>

            {/* Telefono: il risultato in grande, sotto ricavi e costi in piccolo e la barra. */}
            <section className="scheda px-[18px] py-4 md:hidden max-md:rounded-2xl" aria-label={`Risultato ${titoloRisultato}`}>
              <div className="etichettaMaiuscola">Risultato {titoloRisultato}</div>
              <div className={"num font-titolo text-[36px] font-bold leading-tight " + coloreRisultato}>{euro(d.risultatoCent)}</div>
              <div className="mt-2 flex gap-5 text-[14px] text-spento">
                <span>
                  Ricavi <b className="num text-testo">{numeroCent(d.ricavi.totaleCent)}</b>
                </span>
                <span>
                  Costi <b className="num text-testo">{numeroCent(d.costiCent)}</b>
                </span>
              </div>
              <BarraProporzioni d={d} className="mt-3 h-3 rounded-md" />
            </section>

            {(perSede.length >= 2 || conScontrino) && (
              <div className="flex flex-col gap-3 md:flex-row md:gap-4">
                {perSede.length >= 2 && (
                  <div className="min-w-0 md:flex-[1.6]">
                    <PerSede righe={perSede} />
                  </div>
                )}
                {conScontrino && (
                  <SchedaScontrinoMedio titolo={sedi.piu ? `Scontrino medio · ${sedi.incluse ?? "tutte le sedi"}` : "Scontrino medio"} scontrinoCent={totaleStat.scontrinoMedioCent} ordini={totaleStat.ordini} pizze={totaleStat.pizze} />
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 md:flex-1 md:flex-row md:gap-4">
              <Blocco titolo="Ricavi" totaleNome="Totale ricavi" totale={d.ricavi.totaleCent}>
                <Riga nome="Fatturati" valore={d.ricavi.fatturatiCent} />
                <Riga nome="Extra" valore={d.ricavi.extraCent} />
                {d.ricavi.altreVoci.map((v) => (
                  <Riga key={v.categoria} nome={v.categoria} valore={v.importoCent} />
                ))}
              </Blocco>
              <Blocco titolo="Costi variabili" totaleNome="Totale variabili" totale={d.costiVariabili.totaleCent}>
                <Riga nome="Fatture" valore={d.costiVariabili.fattureCent} />
                <Riga nome="Scontrini" sotto="totali inseriti" valore={d.costiVariabili.scontriniCent} />
                {d.costiVariabili.altreVoci.map((v) => (
                  <Riga key={v.categoria} nome={v.categoria} valore={v.importoCent} />
                ))}
              </Blocco>
              <Blocco titolo="Costi fissi" totaleNome="Totale fissi" totale={d.costiFissi.totaleCent} peso={1.15}>
                <Riga nome="Retribuzione regolare" valore={d.costiFissi.retribuzioneRegolareCent} />
                <Riga nome="Retribuzione extra" valore={d.costiFissi.retribuzioneExtraCent} />
                {/* Computer: una riga per voce. Telefono: una riga per ogni voce «Tua» e una sola per tutte le altre. */}
                {d.costiFissi.altreVoci.map((v) => (
                  <Riga key={v.categoria} className="max-md:hidden" nome={v.categoria} valore={v.importoCent} />
                ))}
                {fisseTelefono.tue.map((v) => (
                  <Riga key={v.categoria} className="md:hidden" nome={v.categoria} valore={v.importoCent} />
                ))}
                {fisseTelefono.altre.length > 0 && (
                  <Riga className="md:hidden" nome="Affitto, utenze, altre" valore={fisseTelefono.sommaAltre} />
                )}
              </Blocco>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
