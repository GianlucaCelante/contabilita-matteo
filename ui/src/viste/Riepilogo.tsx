import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { Riepilogo as DatiRiepilogo } from "../api/tipi";
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import { Caricamento, ErroreCaricamento } from "../componenti/Stati";
import Testata, { PulsanteNuovoMovimento } from "../componenti/Testata";
import { usePeriodo } from "../hooks/usePeriodo";
import { euro, NOME_PERIODO, percentuale } from "../util/formato";

function Riga({ nome, valore, sotto, className = "" }: { nome: string; valore: number; sotto?: string; className?: string }) {
  return (
    <li className={className + " flex min-h-[44px] items-center justify-between gap-3 border-t border-riga text-[16px]"}>
      <span className="min-w-0">
        {nome}
        {sotto && <span className="block text-[13px] text-spento">{sotto}</span>}
      </span>
      <span className="num shrink-0">{euro(valore)}</span>
    </li>
  );
}

function Blocco({ titolo, totaleNome, totale, children }: { titolo: string; totaleNome: string; totale: number; children: ReactNode }) {
  return (
    <section className="scheda min-w-0 flex-1 px-5 py-5 md:px-6" aria-label={titolo}>
      <h2 className="mb-2 text-[20px] font-bold">{titolo}</h2>
      <ul className="m-0 list-none p-0">{children}</ul>
      <div className="flex min-h-[52px] items-center justify-between gap-3 border-t-2 border-testo text-[17px] font-bold">
        <span>{totaleNome}</span>
        <span className="num">{euro(totale)}</span>
      </div>
    </section>
  );
}

function BarraProporzioni({ d }: { d: DatiRiepilogo }) {
  const ricavi = d.ricavi.totaleCent;
  // La barra e' sempre piena: se i costi superano i ricavi la base e' il totale dei costi.
  const base = Math.max(ricavi, d.costiCent);
  const variabili = d.costiVariabili.totaleCent;
  const fissi = d.costiFissi.totaleCent;
  const risultato = Math.max(d.risultatoCent, 0);
  const larghezza = (v: number) => (base > 0 ? `${(v / base) * 100}%` : "0%");
  return (
    <>
      <div className="mt-4 flex h-3.5 overflow-hidden rounded-[7px] bg-riga" role="img" aria-label={`Costi variabili ${percentuale(variabili, ricavi)}, costi fissi ${percentuale(fissi, ricavi)}, risultato ${percentuale(d.risultatoCent, ricavi)} dei ricavi`}>
        <div style={{ width: larghezza(variabili) }} className="bg-ambra" />
        <div style={{ width: larghezza(fissi) }} className="bg-verdebordo" />
        <div style={{ width: larghezza(risultato) }} className="bg-verde" />
      </div>
      <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-[13px] text-spento max-md:hidden">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-ambra" />Costi variabili {percentuale(variabili, ricavi)}</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-verdebordo" />Costi fissi {percentuale(fissi, ricavi)}</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-verde" />Risultato {percentuale(d.risultatoCent, ricavi)}</li>
      </ul>
    </>
  );
}

export default function Riepilogo() {
  const periodo = usePeriodo("settimana");
  const { da, a } = periodo.intervallo;
  const q = useQuery({ queryKey: chiavi.riepilogo(da, a), queryFn: () => api.riepilogo(da, a) });
  const d = q.data;
  const nomePeriodo = NOME_PERIODO[periodo.tipo];
  const altreFissi = d ? d.costiFissi.altreVoci.reduce((s, v) => s + v.importoCent, 0) : 0;

  return (
    <>
      <Testata titolo="Riepilogo" azioni={<PulsanteNuovoMovimento />} />
      <div className="px-4 pb-24 md:px-8 md:pb-8">
        <div className="pb-4">
          <SelettorePeriodo periodo={periodo} />
        </div>

        {q.isPending && <Caricamento />}
        {q.isError && <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />}

        {d && (
          <div className="flex flex-col gap-4">
            <section className="scheda px-5 py-5 md:px-6" aria-label={`Risultato ${nomePeriodo}`}>
              {/* Sul telefono il risultato e' in grande, ricavi e costi in una riga. */}
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3 md:gap-x-12">
                <div className="max-md:order-2">
                  <div className="etichettaMaiuscola">Ricavi</div>
                  <div className="num font-titolo text-[24px] font-bold md:text-[32px]">{euro(d.ricavi.totaleCent)}</div>
                </div>
                <div className="pb-1 text-[28px] text-spento max-md:hidden" aria-hidden="true">−</div>
                <div className="max-md:order-2">
                  <div className="etichettaMaiuscola">Costi</div>
                  <div className="num font-titolo text-[24px] font-bold md:text-[32px]">{euro(d.costiCent)}</div>
                </div>
                <div className="pb-1 text-[28px] text-spento max-md:hidden" aria-hidden="true">=</div>
                <div className="max-md:order-1 max-md:basis-full">
                  <div className="etichettaMaiuscola">Risultato {nomePeriodo}</div>
                  <div className={"num font-titolo text-[34px] font-bold md:text-[32px] " + (d.risultatoCent < 0 ? "text-rosso" : "text-verdescuro")}>{euro(d.risultatoCent)}</div>
                </div>
              </div>
              <BarraProporzioni d={d} />
            </section>

            <div className="flex flex-col gap-4 md:flex-row">
              <Blocco titolo="Ricavi" totaleNome="Totale ricavi" totale={d.ricavi.totaleCent}>
                <Riga nome="Fatturati" valore={d.ricavi.fatturatiCent} />
                <Riga nome="Extra" valore={d.ricavi.extraCent} />
              </Blocco>
              <Blocco titolo="Costi variabili" totaleNome="Totale variabili" totale={d.costiVariabili.totaleCent}>
                <Riga nome="Fatture" valore={d.costiVariabili.fattureCent} />
                <Riga nome="Scontrini" valore={d.costiVariabili.scontriniCent} />
              </Blocco>
              <Blocco titolo="Costi fissi" totaleNome="Totale fissi" totale={d.costiFissi.totaleCent}>
                <Riga nome="Retribuzione regolare" valore={d.costiFissi.retribuzioneRegolareCent} />
                <Riga nome="Retribuzione extra" valore={d.costiFissi.retribuzioneExtraCent} />
                {/* Computer: una riga per voce. Telefono: una riga unica. */}
                {d.costiFissi.altreVoci.map((v) => (
                  <Riga key={v.categoria} className="max-md:hidden" nome={v.categoria} valore={v.importoCent} />
                ))}
                {d.costiFissi.altreVoci.length > 0 && (
                  <Riga className="md:hidden" nome="Affitto, utenze, altre" valore={altreFissi} />
                )}
              </Blocco>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
