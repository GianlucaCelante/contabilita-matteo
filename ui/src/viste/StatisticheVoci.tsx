import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { RaggruppaVoci, StatisticheVoci as DatiVoci, VoceStatistica } from "../api/tipi";
import { IconaDestra, IconaOrologio, IconaSpunta } from "../componenti/Icone";
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import SelettoreSedi from "../componenti/SelettoreSedi";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import Testata, { PulsanteNuovoMovimento } from "../componenti/Testata";
import { usePeriodo } from "../hooks/usePeriodo";
import { useSedi } from "../hooks/useSedi";
import { euro, NOME_PERIODO, oggiIso } from "../util/formato";
import { indirizzoDettaglioVoce, type SceltaTipo } from "../util/dettaglioVoce";
import {
  basePositiva,
  colonnaInEvidenza,
  cosaSomma,
  intestazioneVoce,
  larghezzaBarra,
  meseBreve,
  meseInEvidenza,
  nomeMeseDi,
  opzioniTipoCategoria,
  periodoDelDettaglio,
  piuAnni,
  quotaVoce,
  RAGGRUPPAMENTI,
  tipoCategoriaDa,
  tipoPerServizio,
  scorrimentoIniziale,
  sommaRicavi,
  totaliPerMese,
  vociDelMese,
} from "../util/statisticheVoci";
import { mostraPagato, pagatoDaPagare, voceDaPagare, type Pagamento } from "../util/fattureRicevute";
import { testoMovimenti } from "../util/voci";

// «Costi e ricavi per voce»: quanto per ogni fornitore, dipendente o categoria nel periodo, con la griglia voce x mese
// (docs/api.md, «Statistiche per voce»). Toccando una voce si apre il suo dettaglio: la lista dei movimenti che la compongono
// (StatisticheVoceDettaglio). Rinomina / Unisci / Elimina stanno nel dettaglio, dietro «Modifica voce».

const PLURALE: Record<RaggruppaVoci, string> = { FORNITORE: "fornitori", DIPENDENTE: "dipendenti", CATEGORIA: "categorie" };
const SINGOLARE: Record<RaggruppaVoci, string> = { FORNITORE: "fornitore", DIPENDENTE: "dipendente", CATEGORIA: "categoria" };
const contaVoci = (r: RaggruppaVoci, n: number) => `${n} ${n === 1 ? SINGOLARE[r] : PLURALE[r]}`;

const chiaveVoce = (v: VoceStatistica) => (v.id === null ? "senza" : String(v.id));

interface RigaLista {
  voce: VoceStatistica;
  cent: number;
  // I movimenti della riga: del mese scelto o, senza mese, di tutto il periodo.
  movimenti: number;
}

// I mesi di una voce, uno sotto l'altro con la loro barretta: la griglia letta per riga, leggibile anche a 320 px. `mesi` e `importi`
// vanno insieme, posizione per posizione (il dettaglio passa solo i mesi dal primo all'ultimo con dati: mesiConDati).
export function MesiDellaVoce({ nome, mesi, importi }: { nome: string; mesi: string[]; importi: number[] }) {
  const anni = piuAnni(mesi);
  const massimo = Math.max(0, ...importi);
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={`${nome}, mese per mese`}>
      {mesi.map((m, i) => {
        const cent = importi[i] ?? 0;
        return (
          <li key={m} className="grid grid-cols-[3.4rem_minmax(0,1fr)_auto] items-center gap-2.5">
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

// Una riga tenue sotto il totale di un fornitore: «Pagato € X · Da pagare € Y» (parole e icona, non solo colore). Contano le fatture
// (meno le note di credito), non gli scontrini. La usa anche il dettaglio della voce.
export function PagatoDaPagare({ pagamento, className = "" }: { pagamento: Pagamento; className?: string }) {
  return (
    <span className={`num flex flex-wrap items-center justify-end gap-x-2 text-[12.5px] text-spento ${className}`}>
      {mostraPagato(pagamento.pagatoCent) && (
        <span className="inline-flex items-center gap-1">
          <IconaSpunta larghezza={12} spessoreTratto={2.5} />
          Pagato {euro(pagamento.pagatoCent)}
        </span>
      )}
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

interface ProprietaRigaTelefono {
  riga: RigaLista;
  // La base delle quote: la somma delle voci positive dell'elenco (basePositiva).
  base: number;
  massimo: number;
  dati: DatiVoci;
  // La posizione del mese scelto con i chip; -1 = tutto il periodo.
  indiceMese: number;
  colore: string;
  verso: string;
  dettaglio: string;
}

function RigaTelefono({ riga, base, massimo, dati, indiceMese, colore, verso, dettaglio }: ProprietaRigaTelefono) {
  const { voce, cent, movimenti } = riga;
  const senza = voce.id === null;
  const dipendente = dati.raggruppa === "DIPENDENTE";
  // Per i fornitori una riga tenue «Pagato / Da pagare»: del periodo intero o, con un mese scelto, di quel mese.
  const pagamento = indiceMese >= 0 ? pagatoDaPagare(voce, indiceMese) : pagatoDaPagare(voce);
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
            <b className="font-bold text-testo">{quotaVoce(cent, base)}</b> · {testoMovimenti(movimenti)}
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

// La griglia del computer mostra sempre il periodo intero; il mese scelto nell'indirizzo (m=, dai chip del telefono) e' solo una colonna
// in evidenza, portata in vista all'apertura.
function TabellaComputer({ dati, base, colore, verso, meseScelto, dettaglioDi }: { dati: DatiVoci; base: number; colore: string; verso: string; meseScelto: string | null; dettaglioDi: (v: VoceStatistica) => string }) {
  const anni = piuAnni(dati.mesi);
  const dipendente = dati.raggruppa === "DIPENDENTE";
  const massimo = Math.max(1, ...dati.voci.map((v) => v.totaleCent));
  const totaliMesi = totaliPerMese(dati);
  const th = "etichettaMaiuscola whitespace-nowrap px-3 pb-2 pt-1 text-right";
  const mesi = dati.mesi;
  const evidenza = colonnaInEvidenza(mesi, totaliMesi, oggiIso(), meseScelto);
  // Lo sfondo della colonna solo per un mese scelto davvero (m=), non per quello scelto da solo all'apertura.
  const colonnaScelta = meseScelto ? mesi.indexOf(meseScelto) : -1;
  const sfondoMese = (i: number) => (i === colonnaScelta ? " bg-crema" : "");
  // Nelle righe delle voci la cella del mese scelto prende anche il colore del passaggio del mouse della sua riga.
  const sfondoMeseRiga = (i: number) => (i === colonnaScelta ? " bg-crema group-hover:bg-sabbia" : "");
  const rif = useRef<HTMLDivElement>(null);
  // C'e' altro da scorrere a destra / a sinistra: lo dicono un'ombra al bordo e, all'apertura, il mese in evidenza gia' in vista.
  const [bordi, setBordi] = useState({ sinistra: false, destra: false });
  // Con colonne nascoste a sinistra (Movim., Quota, Totale, i primi mesi) la colonna fissa ha un'ombra sul bordo destro.
  const ombraFissa = bordi.sinistra
    ? " after:pointer-events-none after:absolute after:inset-y-0 after:-right-2.5 after:w-2.5 after:bg-[linear-gradient(to_right,rgba(0,0,0,0.14),transparent)] after:content-['']"
    : "";
  const aggiorna = useCallback(() => {
    const e = rif.current;
    if (!e) return;
    setBordi({ sinistra: e.scrollLeft > 1, destra: e.scrollLeft + e.clientWidth < e.scrollWidth - 1 });
  }, []);
  useLayoutEffect(() => {
    const e = rif.current;
    if (!e) return;
    // Finche' chi guarda non scorre a mano, lo scorrimento iniziale si rifa' quando le larghezze cambiano (caratteri caricati dopo,
    // righe «Pagato / Da pagare»): altrimenti resterebbe di nuovo una colonna tagliata sotto quella fissa.
    let toccato = false;
    const portaInVista = () => {
      // Si misura senza il margine a destra messo la volta prima; lo scorrimento finisce sempre all'inizio di una colonna
      // (scorrimentoIniziale), cosi' sotto la colonna fissa non resta una colonna tagliata a meta'.
      const spazio = e.querySelector<HTMLElement>("[data-margine]");
      if (spazio) spazio.style.width = "0px";
      const [fissa, ...altre] = [...e.querySelectorAll<HTMLElement>("thead th")];
      const { scorri, margine } = scorrimentoIniziale({
        fissa: fissa?.offsetWidth ?? 0,
        larghezza: e.clientWidth,
        colonne: altre.map((c) => ({ inizio: c.offsetLeft, fine: c.offsetLeft + c.offsetWidth })),
        indice: evidenza >= 0 ? altre.findIndex((c) => c.dataset.mese === mesi[evidenza]) : -1,
        massimo: e.scrollWidth - e.clientWidth,
        meseScelto: colonnaScelta >= 0,
      });
      // Il margine e' un elemento vero accanto alla tabella (non il padding dell'area che scorre, che non tutti i browser contano).
      if (spazio) spazio.style.width = `${margine}px`;
      e.scrollLeft = scorri;
      aggiorna();
    };
    const ancora = () => {
      if (toccato) aggiorna();
      else portaInVista();
    };
    // Solo un gesto di chi guarda conta (rotellina, tocco, clic sulla barra, tasti, il fuoco portato dentro con Tab): lo scorrimento
    // che il browser corregge da solo quando cambia la finestra no.
    const gesti = ["wheel", "pointerdown", "touchstart", "keydown", "focusin"] as const;
    const allaMano = () => {
      toccato = true;
    };
    portaInVista();
    for (const g of gesti) e.addEventListener(g, allaMano, { passive: true });
    // dopo il primo disegno (larghezze definitive) una seconda volta, e quando i caratteri sono pronti
    const quadro = requestAnimationFrame(ancora);
    void document.fonts?.ready.then(ancora);
    const o = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(ancora);
    o?.observe(e);
    const tabella = e.querySelector("table");
    if (tabella) o?.observe(tabella);
    return () => {
      cancelAnimationFrame(quadro);
      for (const g of gesti) e.removeEventListener(g, allaMano);
      o?.disconnect();
      toccato = true; // un then dei caratteri arrivato dopo non scorre piu'
    };
  }, [mesi, evidenza, colonnaScelta, aggiorna]);
  return (
    <div className="relative">
    <div ref={rif} className="flex items-start overflow-x-auto" onScroll={aggiorna}>
      <table className="w-full border-collapse">
        <caption className="sr-only">Importo di ogni voce nel periodo e in ogni mese</caption>
        <thead>
          <tr>
            <th scope="col" className={"etichettaMaiuscola sticky left-0 z-[1] min-w-[210px] bg-carta px-3 pb-2 pt-1 text-left" + ombraFissa}>
              {intestazioneVoce(dati.raggruppa)}
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
            {dati.mesi.map((m, i) => (
              <th
                key={m}
                scope="col"
                data-mese={m}
                className={th + " border-l border-riga first-of-type:border-l-0" + sfondoMese(i)}
                aria-label={nomeMeseDi(m, true) + (i === colonnaScelta ? ", mese scelto" : "")}
              >
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
                  <th scope="row" className={"sticky left-0 z-[1] bg-carta p-0 text-left font-bold group-hover:bg-sabbia" + ombraFissa}>
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
                      <span className="num w-[52px] shrink-0 text-right text-[14px]">{quotaVoce(v.totaleCent, base)}</span>
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
                    <td key={dati.mesi[i]} className={"num whitespace-nowrap border-l border-riga px-3 text-right " + (cent === 0 ? "text-spento" : "") + sfondoMeseRiga(i)}>
                      {cent === 0 ? "—" : euro(cent)}
                    </td>
                  ))}
                </tr>
            );
          })}
          <tr className="border-t-2 border-testo font-bold">
            <th scope="row" className={"sticky left-0 z-[1] bg-carta px-3 py-3 text-left" + ombraFissa}>Totale</th>
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
              <td key={dati.mesi[i]} className={"num whitespace-nowrap border-l border-riga px-3 text-right" + sfondoMese(i)}>
                {cent === 0 ? "—" : euro(cent)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div data-margine aria-hidden="true" className="shrink-0 self-stretch" style={{ width: 0 }} />
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
  const tipoScelto: SceltaTipo = tipoCategoriaDa(params.get("t"));
  const tipoServizio = tipoPerServizio(raggruppa, tipoScelto);
  // «Guarda un mese solo» sta nell'indirizzo (m=yyyy-MM): resta dopo aver aperto una voce ed essere tornati indietro. Un mese che non e'
  // fra quelli del periodo non conta.
  const meseScelto = params.get("m");
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
    return { righe: d.voci.map((voce) => ({ voce, cent: voce.totaleCent, movimenti: voce.movimenti })), totale: d.totaleCent };
  }, [d, indiceMese]);
  const massimo = Math.max(1, ...righe.map((r) => r.cent));
  // Le quote si calcolano sulle sole voci positive (una nota di credito non le porta sopra 100% ne' sotto zero).
  const baseTelefono = basePositiva(righe.map((r) => r.cent));
  // Il verde e' dei ricavi (come in Riepilogo e Movimenti): barre e totale sono verdi solo quando si sommano ricavi.
  const ricavi = sommaRicavi(raggruppa, tipoScelto);
  const colore = ricavi ? "bg-verde" : "bg-ambra";
  const coloreTotale = ricavi ? " text-verdescuro" : "";
  // Un mese scelto (telefono) senza niente: resta solo la scheda «Nessun movimento», senza il riquadro del totale a zero sopra.
  const meseVuoto = indiceMese >= 0 && righe.length === 0;

  // Cambiando raggruppamento o tipo si torna a tutto il periodo: il mese scelto si toglie nello stesso passo.
  function impostaParametro(chiave: string, valore: string) {
    setParams(
      (prec) => {
        const p = new URLSearchParams(prec);
        p.set(chiave, valore);
        p.delete("m");
        return p;
      },
      { replace: true },
    );
  }

  function scegliMese(mese: string | null) {
    setParams(
      (prec) => {
        const p = new URLSearchParams(prec);
        if (mese === null) p.delete("m");
        else p.set("m", mese);
        return p;
      },
      { replace: true },
    );
  }

  // Il dettaglio di una voce: stesso periodo (sul telefono il mese scelto con i chip), stesse sedi e stesso tipo della lista. La griglia
  // del computer mostra il periodo intero, quindi apre sempre il periodo intero.
  const meseDelTelefono = indiceMese >= 0 && d ? (d.mesi[indiceMese] ?? null) : null;
  function dettaglioDi(v: VoceStatistica, mese: string | null): string {
    return indirizzoDettaglioVoce({ raggruppa, id: v.id, tipo: tipoScelto, ...periodoDelDettaglio(da, a, mese), ...(filtro ? { sedi: filtro } : {}) });
  }
  const dettaglioDelTelefono = (v: VoceStatistica) => dettaglioDi(v, meseDelTelefono);
  const dettaglioDelPeriodo = (v: VoceStatistica) => dettaglioDi(v, null);

  const numeroVoci = d ? d.voci.filter((v) => v.id !== null).length : 0;
  const etichettaTotale = `${cosaSomma(raggruppa, tipoScelto)} ${NOME_PERIODO[periodo.tipo]}` + (sedi.selettore ? ` · ${sedi.incluse ?? "tutte le sedi"}` : "");

  return (
    <div className="flex min-h-full flex-col">
      <Testata compatta titolo="Per voce" indietro="/statistiche" azioni={<PulsanteNuovoMovimento />} />
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
            {opzioniTipoCategoria(tipoScelto).map((o) => (
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
            {/* Senza dati nel periodo il riquadro del totale non c'e' («€ 0,00 · Nessun movimento · 0 fornitori» ripeteva la scheda
                vuota qui sotto). */}
            {d.voci.length > 0 && (
            <section className={"scheda min-w-0 px-[18px] py-4 max-md:rounded-2xl md:px-6 md:py-5" + (meseVuoto ? " max-md:hidden" : "")} aria-label={etichettaTotale}>
              {/* Con un mese scelto (m=) il telefono mostra il totale di quel mese; il computer resta sul periodo intero, come la griglia. */}
              {indiceMese >= 0 && (
                <div className="md:hidden">
                  <div className="etichettaMaiuscola">
                    {etichettaTotale} · {nomeMeseDi(d.mesi[indiceMese] ?? "", true)}
                  </div>
                  <div className={"num font-titolo text-[36px] font-bold leading-[1.15]" + coloreTotale}>{euro(totale)}</div>
                  <div className="num mt-1 text-[14px] text-spento">
                    {testoMovimenti(righe.reduce((t, r) => t + r.movimenti, 0))} · {contaVoci(raggruppa, righe.filter((r) => r.voce.id !== null).length)}
                  </div>
                </div>
              )}
              <div className={indiceMese >= 0 ? "max-md:hidden" : ""}>
                <div className="etichettaMaiuscola">{etichettaTotale}</div>
                <div className={"num font-titolo text-[36px] font-bold leading-[1.15] md:text-[44px]" + coloreTotale}>{euro(d.totaleCent)}</div>
                <div className="num mt-1 text-[14px] text-spento">{`${testoMovimenti(d.movimenti)} · ${contaVoci(raggruppa, numeroVoci)}`}</div>
              </div>
              {raggruppa === "CATEGORIA" && tipoScelto === "TUTTI" && (
                <div className="mt-1 text-[13px] text-spento">Ricavi e costi sommati insieme: non è un saldo.</div>
              )}
              {raggruppa === "DIPENDENTE" && d.voci.length > 0 && (
                <div className={"num mt-3 grid grid-cols-2 gap-2" + (indiceMese >= 0 ? " max-md:hidden" : "")}>
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
            )}

            {d.mesi.length > 1 && d.voci.length > 0 && (
              <div className="md:hidden">
                <div className="etichetta" id="etichetta-mese">
                  Guarda un mese solo
                </div>
                <ChipMesi mesi={d.mesi} totali={totaliPerMese(d)} scelto={indiceMese >= 0 ? meseScelto : null} indiceMese={indiceMese} onScegli={scegliMese} />
              </div>
            )}

            {/* Telefono: una riga per voce (del periodo o del mese scelto), toccandola si apre la lista dei movimenti che la compongono. */}
            {righe.length === 0 ? (
              <section className={"scheda max-md:rounded-2xl" + (d.voci.length > 0 ? " md:hidden" : "")}>
                <Vuoto titolo="Nessun movimento" testo="In questo periodo non c'è niente da mostrare. Cambia periodo o sede." />
              </section>
            ) : (
              <section className="scheda overflow-hidden max-md:rounded-2xl md:hidden" aria-label="Voci del periodo">
                <ul className="m-0 list-none p-0 [&>li:first-child]:border-t-0">
                  {righe.map((r) => (
                    <RigaTelefono key={chiaveVoce(r.voce)} riga={r} base={baseTelefono} massimo={massimo} dati={d} indiceMese={indiceMese} colore={colore} verso={verso} dettaglio={dettaglioDelTelefono(r.voce)} />
                  ))}
                </ul>
              </section>
            )}

            {/* Computer: la griglia voce x mese, sempre sul periodo intero (anche con un mese scelto e vuoto). */}
            {d.voci.length > 0 && (
              <section className="scheda min-w-0 px-3 py-3 max-md:hidden" aria-label="Griglia per mese">
                <TabellaComputer dati={d} base={basePositiva(d.voci.map((v) => v.totaleCent))} colore={colore} verso={verso} meseScelto={indiceMese >= 0 ? meseScelto : null} dettaglioDi={dettaglioDelPeriodo} />
              </section>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
