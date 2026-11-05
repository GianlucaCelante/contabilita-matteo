import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { RaggruppaVoci, StatisticheVoci as DatiVoci, VoceStatistica } from "../api/tipi";
import { IconaDestra, IconaOrologio, IconaSpunta } from "../componenti/Icone";
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import SelettoreSedi from "../componenti/SelettoreSedi";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { usePeriodo } from "../hooks/usePeriodo";
import { useSedi } from "../hooks/useSedi";
import { euro, NOME_PERIODO, oggiIso, percentuale } from "../util/formato";
import { indirizzoDettaglioVoce, type SceltaTipo } from "../util/dettaglioVoce";
import {
  larghezzaBarra,
  massimoMese,
  meseBreve,
  meseInEvidenza,
  nomeMeseDi,
  OPZIONI_TIPO_CATEGORIA,
  piuAnni,
  RAGGRUPPAMENTI,
  tipoPerServizio,
  totaliPerMese,
  vociDelMese,
} from "../util/statisticheVoci";
import { pagatoDaPagare, voceDaPagare } from "../util/fattureRicevute";
import { testoMovimenti } from "../util/voci";

// «Costi e ricavi per voce»: quanto per ogni fornitore, dipendente o categoria nel periodo, con la griglia voce x mese
// (docs/api.md, «Statistiche per voce»). Toccando una voce si apre il suo dettaglio: la lista dei movimenti che la compongono
// (StatisticheVoceDettaglio). Rinomina / Unisci / Elimina stanno nel dettaglio, dietro «Modifica voce».

const PLURALE: Record<RaggruppaVoci, string> = { FORNITORE: "fornitori", DIPENDENTE: "dipendenti", CATEGORIA: "categorie" };
const SINGOLARE: Record<RaggruppaVoci, string> = { FORNITORE: "fornitore", DIPENDENTE: "dipendente", CATEGORIA: "categoria" };
const contaVoci = (r: RaggruppaVoci, n: number) => `${n} ${n === 1 ? SINGOLARE[r] : PLURALE[r]}`;

const chiaveVoce = (v: VoceStatistica) => (v.id === null ? "senza" : String(v.id));

// «Costi», «Retribuzioni», «Ricavi», «Ricavi e costi»: che cosa sta sommando il totale.
function cosaSomma(raggruppa: RaggruppaVoci, tipo: SceltaTipo): string {
  if (raggruppa === "DIPENDENTE") return "Retribuzioni";
  if (raggruppa === "FORNITORE") return "Costi";
  return tipo === "RICAVO" ? "Ricavi" : tipo === "TUTTI" ? "Ricavi e costi" : "Costi";
}

interface RigaLista {
  voce: VoceStatistica;
  cent: number;
}

// I mesi di una voce, uno sotto l'altro con la loro barretta: la griglia letta per riga, leggibile anche a 320 px.
export function MesiDellaVoce({ voce, mesi, scelto }: { voce: VoceStatistica; mesi: string[]; scelto: number }) {
  const anni = piuAnni(mesi);
  const massimo = massimoMese(voce);
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={`${voce.nome}, mese per mese`}>
      {mesi.map((m, i) => {
        const cent = voce.perMese[i] ?? 0;
        return (
          <li key={m} className={"grid grid-cols-[3.4rem_minmax(0,1fr)_auto] items-center gap-2.5 " + (i === scelto ? "font-bold" : "")}>
            <span className="text-[13px] capitalize text-tenue" aria-label={nomeMeseDi(m, true)}>
              {meseBreve(m, anni)}
            </span>
            <span className="h-2 overflow-hidden rounded bg-riga" aria-hidden="true">
              <span className="block h-full rounded bg-tenue/70" style={{ width: `${larghezzaBarra(cent, massimo)}%` }} />
            </span>
            <span className={"num min-w-[5.2rem] text-right text-[14px] " + (cent === 0 ? "text-spento" : "")}>{cent === 0 ? "—" : euro(cent)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// «Guarda un mese solo» sul telefono: i chip scorrono di lato; all'apertura si porta in vista il mese corrente (o l'ultimo con dati),
// cosi' con l'Anno non si deve scorrere a mano fino a ottobre / novembre.
function ChipMesi({ mesi, totali, scelto, indiceMese, onScegli }: { mesi: string[]; totali: number[]; scelto: string | null; indiceMese: number; onScegli: (m: string | null) => void }) {
  const rif = useRef<HTMLDivElement>(null);
  const evidenza = meseInEvidenza(mesi, totali, oggiIso());
  const chiaveMesi = mesi.join(",");
  useLayoutEffect(() => {
    const e = rif.current;
    const chip = evidenza >= 0 ? e?.querySelector<HTMLElement>(`[data-mese="${mesi[evidenza]}"]`) : null;
    if (e && chip) e.scrollLeft = Math.max(0, chip.offsetLeft + chip.offsetWidth - e.clientWidth + 16);
    // solo all'apertura e quando cambiano i mesi: non toglie lo scorrimento a chi sta scorrendo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiaveMesi]);
  return (
    <div ref={rif} role="group" aria-labelledby="etichetta-mese" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button type="button" className="pillaSede senzaBadge shrink-0" aria-pressed={indiceMese < 0} onClick={() => onScegli(null)}>
        Tutto il periodo
      </button>
      {mesi.map((m) => (
        <button
          key={m}
          type="button"
          data-mese={m}
          className="pillaSede senzaBadge shrink-0 capitalize"
          aria-pressed={scelto === m}
          aria-label={nomeMeseDi(m, true)}
          onClick={() => onScegli(m)}
        >
          {meseBreve(m, piuAnni(mesi))}
        </button>
      ))}
    </div>
  );
}

// Una riga tenue sotto il totale di un fornitore: «Pagato € X · Da pagare € Y» (parole e icona, non solo colore).
function PagatoDaPagare({ pagamento, className = "" }: { pagamento: { pagatoCent: number; daPagareCent: number }; className?: string }) {
  return (
    <span className={`num flex flex-wrap items-center justify-end gap-x-2 text-[12.5px] text-spento ${className}`}>
      <span className="inline-flex items-center gap-1">
        <IconaSpunta larghezza={12} spessoreTratto={2.5} />
        Pagato {euro(pagamento.pagatoCent)}
      </span>
      {(() => {
        const d = voceDaPagare(pagamento.daPagareCent);
        if (!d) return null;
        return d.credito ? (
          <span className="inline-flex items-center gap-1">{d.etichetta} {euro(d.importoCent)}</span>
        ) : (
          <span className="inline-flex items-center gap-1 font-bold text-ambra">
            <IconaOrologio larghezza={12} spessoreTratto={2.5} />
            {d.etichetta} {euro(d.importoCent)}
          </span>
        );
      })()}
    </span>
  );
}

function RigaTelefono({ riga, totale, massimo, dati, colore, verso, dettaglio }: { riga: RigaLista; totale: number; massimo: number; dati: DatiVoci; colore: string; verso: string; dettaglio: string }) {
  const { voce, cent } = riga;
  const senza = voce.id === null;
  const dipendente = dati.raggruppa === "DIPENDENTE";
  // Per i fornitori, sul periodo intero (non su un mese scelto), una riga tenue «Pagato / Da pagare».
  const pagamento = cent === voce.totaleCent ? pagatoDaPagare(voce) : null;
  return (
    <li className="border-t border-riga">
      <Link to={dettaglio} state={{ lista: verso }} aria-label={`${voce.nome}, ${euro(cent)}. Vedi i movimenti`} className="block w-full min-w-0 px-4 py-3 text-left">
        <span className="flex items-baseline gap-3">
          <span className={"min-w-0 flex-1 break-words text-[16px] font-bold leading-tight " + (senza ? "italic text-tenue" : "")}>{voce.nome}</span>
          <span className="num shrink-0 text-[16px] font-bold">{euro(cent)}</span>
        </span>
        <span className="mt-2 block h-2.5 overflow-hidden rounded bg-riga" aria-hidden="true">
          <span className={"block h-full rounded " + colore} style={{ width: `${larghezzaBarra(cent, massimo)}%` }} />
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[13px] text-spento">
          <span className="num min-w-0 flex-1 truncate">
            <b className="font-bold text-testo">{percentuale(cent, totale)}</b> · {testoMovimenti(voce.movimenti)}
          </span>
          <span className="shrink-0" aria-hidden="true">
            <IconaDestra larghezza={18} spessoreTratto={2.2} />
          </span>
        </span>
        {pagamento && <PagatoDaPagare pagamento={pagamento} className="mt-1 !justify-start" />}
        {dipendente && (voce.regolareCent !== 0 || voce.extraCent !== 0) && (
          <span className="num mt-1 block text-[13px] text-tenue">
            Regolare <b className="text-testo">{euro(voce.regolareCent)}</b> · Extra <b className="text-testo">{euro(voce.extraCent)}</b>
          </span>
        )}
      </Link>
    </li>
  );
}

function TabellaComputer({ dati, totale, colore, verso, dettaglioDi }: { dati: DatiVoci; totale: number; colore: string; verso: string; dettaglioDi: (v: VoceStatistica) => string }) {
  const anni = piuAnni(dati.mesi);
  const dipendente = dati.raggruppa === "DIPENDENTE";
  const massimo = Math.max(1, ...dati.voci.map((v) => v.totaleCent));
  const totaliMesi = totaliPerMese(dati);
  const th = "etichettaMaiuscola whitespace-nowrap px-3 pb-2 pt-1 text-right";
  const mesi = dati.mesi;
  const evidenza = meseInEvidenza(mesi, totaliMesi, oggiIso());
  const rif = useRef<HTMLDivElement>(null);
  // C'e' altro da scorrere a destra / a sinistra: lo dicono un'ombra al bordo e, all'apertura, il mese in evidenza gia' in vista.
  const [bordi, setBordi] = useState({ sinistra: false, destra: false });
  const aggiorna = useCallback(() => {
    const e = rif.current;
    if (!e) return;
    setBordi({ sinistra: e.scrollLeft > 1, destra: e.scrollLeft + e.clientWidth < e.scrollWidth - 1 });
  }, []);
  useLayoutEffect(() => {
    const e = rif.current;
    if (!e) return;
    const portaInVista = () => {
      const th = evidenza >= 0 ? e.querySelector<HTMLElement>(`th[data-mese="${mesi[evidenza]}"]`) : null;
      if (th) e.scrollLeft = Math.max(0, th.offsetLeft + th.offsetWidth - e.clientWidth);
      aggiorna();
    };
    portaInVista();
    // dopo il primo disegno (larghezze definitive) una seconda volta
    const quadro = requestAnimationFrame(portaInVista);
    if (typeof ResizeObserver === "undefined") return () => cancelAnimationFrame(quadro);
    const o = new ResizeObserver(aggiorna);
    o.observe(e);
    return () => {
      cancelAnimationFrame(quadro);
      o.disconnect();
    };
  }, [mesi, evidenza, aggiorna]);
  return (
    <div className="relative">
    <div ref={rif} className="overflow-x-auto" onScroll={aggiorna}>
      <table className="w-full border-collapse">
        <caption className="sr-only">Importo di ogni voce nel periodo e in ogni mese</caption>
        <thead>
          <tr>
            <th scope="col" className="etichettaMaiuscola sticky left-0 z-[1] min-w-[210px] bg-carta px-3 pb-2 pt-1 text-left">
              {RAGGRUPPAMENTI.find((r) => r.valore === dati.raggruppa)?.etichetta.slice(0, -1) ?? "Voce"}
            </th>
            <th scope="col" className={th}>Movim.</th>
            <th scope="col" className={th + " min-w-[170px] !text-left"}>Quota</th>
            <th scope="col" className={th}>Totale</th>
            {dipendente && (
              <>
                <th scope="col" className={th}>Regolare</th>
                <th scope="col" className={th}>Extra</th>
              </>
            )}
            {dati.mesi.map((m) => (
              <th key={m} scope="col" data-mese={m} className={th + " border-l border-riga first-of-type:border-l-0"} aria-label={nomeMeseDi(m, true)}>
                <span className="capitalize">{meseBreve(m, anni)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dati.voci.map((v) => {
            const chiave = chiaveVoce(v);
            const senza = v.id === null;
            return (
                <tr key={chiave} className="group border-t border-riga hover:bg-sabbia">
                  <th scope="row" className="sticky left-0 z-[1] bg-carta p-0 text-left font-bold group-hover:bg-sabbia">
                    <Link to={dettaglioDi(v)} state={{ lista: verso }} aria-label={`${v.nome}: vedi i movimenti`} className="flex min-h-[48px] w-full items-center gap-2 px-3 text-left">
                      <span className={"min-w-0 flex-1 truncate " + (senza ? "italic text-tenue" : "")}>{v.nome}</span>
                      <span className="shrink-0 text-spento" aria-hidden="true">
                        <IconaDestra larghezza={16} spessoreTratto={2.2} />
                      </span>
                    </Link>
                  </th>
                  <td className="num px-3 text-right">{v.movimenti}</td>
                  <td className="px-3">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-[5px] bg-riga" aria-hidden="true">
                        <span className={"block h-full rounded-[5px] " + colore} style={{ width: `${larghezzaBarra(v.totaleCent, massimo)}%` }} />
                      </span>
                      <span className="num w-[52px] shrink-0 text-right text-[14px]">{percentuale(v.totaleCent, totale)}</span>
                    </div>
                  </td>
                  <td className="num whitespace-nowrap px-3 text-right font-bold">
                    {euro(v.totaleCent)}
                    {pagatoDaPagare(v) && <PagatoDaPagare pagamento={pagatoDaPagare(v)!} className="font-normal" />}
                  </td>
                  {dipendente && (
                    <>
                      <td className="num whitespace-nowrap px-3 text-right">{euro(v.regolareCent)}</td>
                      <td className="num whitespace-nowrap px-3 text-right">{euro(v.extraCent)}</td>
                    </>
                  )}
                  {v.perMese.map((cent, i) => (
                    <td key={dati.mesi[i]} className={"num whitespace-nowrap border-l border-riga px-3 text-right " + (cent === 0 ? "text-spento" : "")}>
                      {cent === 0 ? "—" : euro(cent)}
                    </td>
                  ))}
                </tr>
            );
          })}
          <tr className="border-t-2 border-testo font-bold">
            <th scope="row" className="sticky left-0 z-[1] bg-carta px-3 py-3 text-left">Totale</th>
            <td className="num px-3 text-right">{dati.movimenti}</td>
            <td />
            <td className="num whitespace-nowrap px-3 text-right">{euro(dati.totaleCent)}</td>
            {dipendente && (
              <>
                <td className="num whitespace-nowrap px-3 text-right">{euro(dati.voci.reduce((t, v) => t + v.regolareCent, 0))}</td>
                <td className="num whitespace-nowrap px-3 text-right">{euro(dati.voci.reduce((t, v) => t + v.extraCent, 0))}</td>
              </>
            )}
            {totaliMesi.map((cent, i) => (
              <td key={dati.mesi[i]} className="num whitespace-nowrap border-l border-riga px-3 text-right">
                {cent === 0 ? "—" : euro(cent)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
    {bordi.destra && (
      <div aria-hidden="true" data-ombra="destra" className="pointer-events-none absolute inset-y-0 right-0 w-10" style={{ background: "linear-gradient(to left, rgba(0,0,0,0.16), transparent)" }} />
    )}
    {bordi.sinistra && <span className="sr-only">Scorri a sinistra per le colonne precedenti.</span>}
    {bordi.destra && <span className="sr-only">Scorri a destra per gli altri mesi.</span>}
    </div>
  );
}

export default function StatisticheVoci() {
  const periodo = usePeriodo("mese");
  const { da, a } = periodo.intervallo;
  const sedi = useSedi();
  const filtro = sedi.parametro;
  const [params, setParams] = useSearchParams();
  const raggruppa = RAGGRUPPAMENTI.find((r) => r.valore === params.get("v"))?.valore ?? "FORNITORE";
  const tipoScelto: SceltaTipo = OPZIONI_TIPO_CATEGORIA.find((o) => o.valore === params.get("t"))?.valore ?? "COSTI";
  const tipoServizio = tipoPerServizio(raggruppa, tipoScelto);
  const [meseScelto, setMeseScelto] = useState<string | null>(null);
  const posizione = useLocation();
  // Dove riporta la freccia indietro del dettaglio: questa lista, con il suo periodo.
  const verso = posizione.pathname + posizione.search;

  const q = useQuery({
    queryKey: chiavi.statisticheVoci(da, a, raggruppa, tipoServizio, filtro),
    queryFn: () => api.statisticheVoci(da, a, raggruppa, tipoServizio, filtro),
    enabled: sedi.pronto,
  });
  const d = q.data;
  const indiceMese = d && meseScelto ? d.mesi.indexOf(meseScelto) : -1;

  const { righe, totale } = useMemo(() => {
    if (!d) return { righe: [] as RigaLista[], totale: 0 };
    if (indiceMese >= 0) {
      const r = vociDelMese(d, indiceMese);
      return { righe: r.righe, totale: r.totaleCent };
    }
    return { righe: d.voci.map((voce) => ({ voce, cent: voce.totaleCent })), totale: d.totaleCent };
  }, [d, indiceMese]);
  const massimo = Math.max(1, ...righe.map((r) => r.cent));
  const colore = raggruppa === "CATEGORIA" && tipoScelto === "RICAVO" ? "bg-verde" : "bg-ambra";

  function impostaParametro(chiave: string, valore: string) {
    setParams(
      (prec) => {
        const p = new URLSearchParams(prec);
        p.set(chiave, valore);
        return p;
      },
      { replace: true },
    );
    setMeseScelto(null);
  }

  // Il dettaglio di una voce: stesso periodo (o il mese scelto con i chip), stesse sedi e stesso tipo della lista.
  const meseDelDettaglio = indiceMese >= 0 && d ? d.mesi[indiceMese] : undefined;
  function dettaglioDi(v: VoceStatistica): string {
    const [anno, mese] = (meseDelDettaglio ?? "").split("-").map(Number);
    return indirizzoDettaglioVoce({
      raggruppa,
      id: v.id,
      tipo: tipoScelto,
      da: meseDelDettaglio ? `${meseDelDettaglio}-01` : da,
      a: meseDelDettaglio && anno && mese ? `${meseDelDettaglio}-${String(new Date(anno, mese, 0).getDate()).padStart(2, "0")}` : a,
      ...(filtro ? { sedi: filtro } : {}),
    });
  }

  const numeroVoci = d ? d.voci.filter((v) => v.id !== null).length : 0;
  const etichettaTotale = `${cosaSomma(raggruppa, tipoScelto)} ${NOME_PERIODO[periodo.tipo]}` + (sedi.piu ? ` · ${sedi.incluse ?? "tutte le sedi"}` : "");

  return (
    <div className="flex min-h-full flex-col">
      <Testata compatta titolo="Per voce" indietro="/statistiche" />
      <div className="flex flex-1 flex-col px-4 pb-24 pt-2 md:px-8 md:pb-7 md:pt-0">
        <SelettoreSedi className="pb-3" />

        <div role="group" aria-label="Raggruppa per" className="segmenti mb-3 w-full md:w-auto md:self-start">
          {RAGGRUPPAMENTI.map((r) => (
            <button
              key={r.valore}
              type="button"
              aria-pressed={raggruppa === r.valore}
              className="flex-1 justify-center !px-1.5 md:flex-none md:!px-6"
              onClick={() => impostaParametro("v", r.valore)}
            >
              {r.etichetta}
            </button>
          ))}
        </div>

        <div className="pb-3 md:pb-4">
          <SelettorePeriodo periodo={periodo} />
        </div>

        {raggruppa === "CATEGORIA" && (
          <div role="group" aria-label="Che cosa" className="segmenti mb-3 w-full md:mb-4 md:w-auto md:self-start">
            {OPZIONI_TIPO_CATEGORIA.map((o) => (
              <button
                key={o.valore}
                type="button"
                aria-pressed={tipoScelto === o.valore}
                className="flex-1 justify-center !px-1.5 md:flex-none md:!px-6"
                onClick={() => impostaParametro("t", o.valore)}
              >
                {o.etichetta}
              </button>
            ))}
          </div>
        )}

        {(q.isPending || !sedi.pronto) && <Caricamento />}
        {q.isError && <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />}

        {d && (
          <div className="flex flex-1 flex-col gap-3 md:gap-4">
            <section className="scheda min-w-0 px-[18px] py-4 max-md:rounded-2xl md:px-6 md:py-5" aria-label={etichettaTotale}>
              <div className="etichettaMaiuscola">
                {etichettaTotale}
                {indiceMese >= 0 && d && <> · {nomeMeseDi(d.mesi[indiceMese] ?? "", true)}</>}
              </div>
              <div className="num font-titolo text-[36px] font-bold leading-[1.15] text-verdescuro md:text-[44px]">{euro(totale)}</div>
              <div className="num mt-1 text-[14px] text-spento">
                {indiceMese >= 0 ? contaVoci(raggruppa, righe.length) : `${testoMovimenti(d.movimenti)} · ${contaVoci(raggruppa, numeroVoci)}`}
              </div>
              {raggruppa === "CATEGORIA" && tipoScelto === "TUTTI" && (
                <div className="mt-1 text-[13px] text-spento">Ricavi e costi sommati insieme: non è un saldo.</div>
              )}
              {raggruppa === "DIPENDENTE" && d.voci.length > 0 && indiceMese < 0 && (
                <div className="num mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-crema px-3 py-2.5">
                    <div className="etichettaMaiuscola !text-[11px]">Regolare</div>
                    <div className="num font-titolo text-[18px] font-bold">{euro(d.voci.reduce((t, v) => t + v.regolareCent, 0))}</div>
                  </div>
                  <div className="rounded-xl bg-crema px-3 py-2.5">
                    <div className="etichettaMaiuscola !text-[11px]">Extra</div>
                    <div className="num font-titolo text-[18px] font-bold">{euro(d.voci.reduce((t, v) => t + v.extraCent, 0))}</div>
                  </div>
                </div>
              )}
            </section>

            {d.mesi.length > 1 && d.voci.length > 0 && (
              <div className="md:hidden">
                <div className="etichetta" id="etichetta-mese">
                  Guarda un mese solo
                </div>
                <ChipMesi mesi={d.mesi} totali={totaliPerMese(d)} scelto={meseScelto} indiceMese={indiceMese} onScegli={setMeseScelto} />
              </div>
            )}

            {righe.length === 0 ? (
              <section className="scheda max-md:rounded-2xl">
                <Vuoto titolo="Nessun movimento" testo="In questo periodo non c'è niente da mostrare. Cambia periodo o sede." />
              </section>
            ) : (
              <>
                {/* Telefono: una riga per voce, toccandola si apre la lista dei movimenti che la compongono. */}
                <section className="scheda overflow-hidden max-md:rounded-2xl md:hidden" aria-label="Voci del periodo">
                  <ul className="m-0 list-none p-0 [&>li:first-child]:border-t-0">
                    {righe.map((r) => (
                      <RigaTelefono key={chiaveVoce(r.voce)} riga={r} totale={totale} massimo={massimo} dati={d} colore={colore} verso={verso} dettaglio={dettaglioDi(r.voce)} />
                    ))}
                  </ul>
                </section>

                {/* Computer: la griglia voce x mese. */}
                <section className="scheda min-w-0 px-3 py-3 max-md:hidden" aria-label="Griglia per mese">
                  <TabellaComputer dati={d} totale={d.totaleCent} colore={colore} verso={verso} dettaglioDi={dettaglioDi} />
                </section>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
