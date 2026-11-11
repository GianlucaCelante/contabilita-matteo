import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { Riepilogo as DatiRiepilogo, VoceRiepilogo } from "../api/tipi";
import { IconaDestra } from "../componenti/Icone";
import BadgeSede from "../componenti/BadgeSede";
import SchedaDaPagare from "../componenti/SchedaDaPagare";
import SchedaFattureDaFare from "../componenti/SchedaFattureDaFare";
import SchedaScontrinoMedio from "../componenti/SchedaScontrinoMedio";
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import SelettoreSedi from "../componenti/SelettoreSedi";
import { Caricamento, ErroreCaricamento } from "../componenti/Stati";
import Testata, { PulsanteNuovoMovimento } from "../componenti/Testata";
import { usePeriodo } from "../hooks/usePeriodo";
import { useSedi } from "../hooks/useSedi";
import { indirizzoStatisticheDelBlocco, type BloccoRiepilogo } from "../util/statisticheVoci";
import { euro, NOME_PERIODO, numeroCent } from "../util/formato";
import { proporzioniRiepilogo } from "../util/riepilogo";

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

// Una riga per categoria (dall'importo piu' alto; «Senza categoria» in fondo, in tono spento). Senza movimenti nel periodo: una riga che lo dice.
function RigheVoci({ voci }: { voci: VoceRiepilogo[] }) {
  if (voci.length === 0) return <li className="flex min-h-[44px] items-center border-t border-riga text-[15px] text-spento">Nessun movimento</li>;
  return (
    <>
      {voci.map((v) => (
        <Riga key={v.id ?? "senza"} nome={v.categoria} valore={v.importoCent} className={v.id === null ? "text-spento" : ""} />
      ))}
    </>
  );
}

// «di cui»: le somme per documento (fatturati/extra, fatture/scontrini, retribuzione regolare/extra) sono un dettaglio del totale, NON
// vanno aggiunte: stanno sotto le categorie, piu' piccole e piu' chiare, e si vedono solo se sono maggiori di zero.
function DiCui({ nomeA, valoreA, nomeB, valoreB }: { nomeA: string; valoreA: number; nomeB: string; valoreB: number }) {
  const presenti = [
    { nome: nomeA, valore: valoreA },
    { nome: nomeB, valore: valoreB },
  ].filter((r) => r.valore > 0);
  if (presenti.length === 0) return null;
  return (
    <li className="border-t border-dashed border-bordo2 pb-1 pt-2" aria-label="Di cui, già compreso nel totale">
      <div className="etichettaMaiuscola">di cui (già nel totale)</div>
      <ul className="m-0 list-none p-0">
        {presenti.map((r) => (
          <li key={r.nome} className="flex min-h-[32px] items-center justify-between gap-3 text-[14px] text-spento">
            <span className="min-w-0">{r.nome}</span>
            <span className="num shrink-0">{euro(r.valore)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

// Sul computer il totale e' ancorato al fondo della scheda (la scheda si allunga
// fino in fondo alla pagina); sul telefono sta nell'intestazione, accanto al titolo.
function Blocco({ titolo, totaleNome, totale, peso = 1, verso, children }: { titolo: string; totaleNome: string; totale: number; peso?: number; verso: string; children: ReactNode }) {
  return (
    <section
      className="scheda flex min-w-0 flex-col px-[18px] pb-1 pt-3.5 max-md:rounded-2xl md:flex-1 md:px-6 md:pb-5 md:pt-5"
      style={{ flexGrow: peso }}
      aria-label={titolo}
    >
      <Link
        to={verso}
        aria-label={`${titolo}: apri le statistiche del periodo`}
        className="-mx-2 flex min-h-[44px] items-center justify-between gap-3 rounded-lg px-2 hover:bg-sabbia md:mb-1"
      >
        <h2 className="text-[18px] font-bold md:text-[20px]">{titolo}</h2>
        <span className="flex items-center gap-1.5">
          <span className="num text-[18px] font-bold md:hidden" aria-hidden="true">
            {euro(totale)}
          </span>
          <span className="text-spento" aria-hidden="true">
            <IconaDestra larghezza={18} spessoreTratto={2.2} />
          </span>
        </span>
      </Link>
      <ul className="m-0 mt-2 list-none p-0 md:mt-0">{children}</ul>
      <div className="flex-1" />
      <div className="flex h-[52px] items-center justify-between gap-3 border-t-2 border-testo text-[17px] font-bold max-md:hidden">
        <span>{totaleNome}</span>
        <span className="num">{euro(totale)}</span>
      </div>
    </section>
  );
}

// Le voci della legenda (e il testo della barra): percentuali sui ricavi, o gli importi quando i costi superano i ricavi o non ci
// sono ricavi (util/riepilogo.ts).
const proporzioniDi = (d: DatiRiepilogo) =>
  proporzioniRiepilogo({ ricaviCent: d.ricavi.totaleCent, variabiliCent: d.costiVariabili.totaleCent, fissiCent: d.costiFissi.totaleCent, risultatoCent: d.risultatoCent });

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
      aria-label={proporzioniDi(d).descrizione}
    >
      <div style={{ width: larghezza(variabili) }} className="bg-ambra" />
      <div style={{ width: larghezza(fissi) }} className="bg-verdebordo" />
      <div style={{ width: larghezza(risultato) }} className="bg-verde" />
    </div>
  );
}

function Legenda({ d }: { d: DatiRiepilogo }) {
  const p = proporzioniDi(d);
  return (
    <ul className="num m-0 mt-2.5 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-[13px] text-spento max-md:hidden">
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-ambra" />Costi variabili {p.variabili}</li>
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-verdebordo" />Costi fissi {p.fissi}</li>
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-verde" />Risultato {p.risultato}</li>
    </ul>
  );
}

// «Per sede»: ricavi, costi e risultato di ogni sede scelta, con una barra proporzionale ai ricavi. Solo con almeno due sedi selezionate.
function PerSede({ righe }: { righe: NonNullable<DatiRiepilogo["perSede"]> }) {
  const maxRicavi = Math.max(...righe.map((r) => r.ricaviCent), 1);
  const info = useSedi().info;
  return (
    <section className="scheda px-[18px] pb-1.5 pt-3.5 max-md:rounded-2xl md:px-6 md:pt-5" aria-label="Confronto tra sedi">
      <h2 className="text-[18px] font-bold md:mb-1 md:text-[20px]">Per sede</h2>
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
              {/* Telefono: il nome intero sulla prima riga (va a capo, non si tronca), sotto «Ricavi … · Risultato …». */}
              <div className="md:hidden">
                <div className="flex items-start gap-2.5">
                  <BadgeSede id={r.sede.id} decorativo />
                  <span className="min-w-0 flex-1 break-words pt-0.5 font-bold leading-snug">{r.sede.nome}</span>
                </div>
                <div className="num mt-1 flex flex-wrap gap-x-1.5 text-[14px] text-spento">
                  <span>
                    Ricavi <b className="text-testo">{euro(r.ricaviCent)}</b>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Risultato <b className={r.risultatoCent < 0 ? "text-rosso" : "text-verdescuro"}>{euro(r.risultatoCent)}</b>
                  </span>
                </div>
              </div>
              {/* Computer: una riga con le colonne Ricavi, Costi e Risultato. */}
              <div className="hidden grid-cols-[26px_minmax(0,1fr)_110px_110px_110px] items-center gap-x-3 md:grid">
                <BadgeSede id={r.sede.id} decorativo />
                <span className="min-w-0 truncate font-bold">{r.sede.nome}</span>
                <span className="num text-right text-[15px] text-spento">
                  <span className="sr-only">Ricavi </span>
                  {euro(r.ricaviCent)}
                </span>
                <span className="num text-right text-[15px] text-spento">
                  <span className="sr-only">Costi </span>
                  {euro(r.costiCent)}
                </span>
                <span className={"num text-right font-bold " + (r.risultatoCent < 0 ? "text-rosso" : "text-verdescuro")}>
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
  const titoloRisultato = sedi.selettore ? `${nomePeriodo} · ${sedi.incluse ?? "tutte le sedi"}` : nomePeriodo;
  const perSede = sedi.piu && sedi.selezionate.length >= 2 ? (d?.perSede ?? []) : [];
  const verso = (b: BloccoRiepilogo) => indirizzoStatisticheDelBlocco(b, { tipo: periodo.tipo, da, a });
  const coloreRisultato = d && d.risultatoCent < 0 ? "text-rosso" : "text-verdescuro";

  return (
    <div className="flex min-h-full flex-col">
      <Testata titoloSoloComputer titolo="Riepilogo" azioni={<PulsanteNuovoMovimento />} />
      <div className="flex flex-1 flex-col px-4 pb-24 md:px-8 md:pb-7">
        <SelettoreSedi className="pb-3" />
        <div className="pb-3 md:pb-4">
          <SelettorePeriodo periodo={periodo} />
        </div>

        <SchedaFattureDaFare />
        <SchedaDaPagare />

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
                  <SchedaScontrinoMedio titolo={sedi.selettore ? `Scontrino medio · ${sedi.incluse ?? "tutte le sedi"}` : "Scontrino medio"} scontrinoCent={totaleStat.scontrinoMedioCent} ordini={totaleStat.ordini} pizze={totaleStat.pizze} />
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 md:flex-1 md:flex-row md:gap-4">
              <Blocco verso={verso("ricavi")} titolo="Ricavi" totaleNome="Totale ricavi" totale={d.ricavi.totaleCent}>
                <RigheVoci voci={d.ricavi.voci} />
                <DiCui nomeA="Fatturati" valoreA={d.ricavi.fatturatiCent} nomeB="Extra" valoreB={d.ricavi.extraCent} />
              </Blocco>
              <Blocco verso={verso("variabili")} titolo="Costi variabili" totaleNome="Totale variabili" totale={d.costiVariabili.totaleCent}>
                <RigheVoci voci={d.costiVariabili.voci} />
                <DiCui nomeA="Fatture" valoreA={d.costiVariabili.fattureCent} nomeB="Scontrini" valoreB={d.costiVariabili.scontriniCent} />
              </Blocco>
              <Blocco verso={verso("fissi")} titolo="Costi fissi" totaleNome="Totale fissi" totale={d.costiFissi.totaleCent} peso={1.15}>
                <RigheVoci voci={d.costiFissi.voci} />
                <DiCui nomeA="Retribuzione regolare" valoreA={d.costiFissi.retribuzioneRegolareCent} nomeB="Retribuzione extra" valoreB={d.costiFissi.retribuzioneExtraCent} />
              </Blocco>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
