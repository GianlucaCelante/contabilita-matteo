import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { posizioneLista } from "../util/posizioneLista";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { Tipo } from "../api/tipi";
import { ElencoPerGiorno, IntestazioneElenco } from "../componenti/RigaMovimento";
import { IconaCerca, IconaPiu, IconaVia } from "../componenti/Icone";
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import SelettoreSedi from "../componenti/SelettoreSedi";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import FiltroCategorie from "../componenti/FiltroCategorie";
import Testata, { PulsanteNuovoMovimento } from "../componenti/Testata";
import { useDebounced } from "../hooks/useDebounced";
import { idValidi, leggiIdCategorie, scriviIdCategorie } from "../util/filtroCategorie";
import { chipDeiFiltri, leggiFiltriVoce, type ParametroVoce } from "../util/filtriMovimenti";
import { leggiFiltri, magazzinoBrowser, salvaFiltri, scartaIdInesistenti } from "../util/filtriSalvati";
import { usePeriodo } from "../hooks/usePeriodo";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { useSedi } from "../hooks/useSedi";
import { useSegnaPagataInElenco } from "../hooks/useSegnaPagata";
import { euro } from "../util/formato";

const FILTRI_TIPO: { valore: Tipo | ""; lungo: string; breve: string }[] = [
  { valore: "", lungo: "Tutti", breve: "Tutti" },
  { valore: "RICAVO", lungo: "Ricavi", breve: "Ricavi" },
  { valore: "COSTO_VARIABILE", lungo: "Costi variabili", breve: "Variabili" },
  { valore: "COSTO_FISSO", lungo: "Costi fissi", breve: "Fissi" },
];

// Le pillole dei filtri («Da pagare», i chip per voce e, sul telefono, il tipo): stessa forma del pulsante «Categoria», area di
// tocco di almeno 44 px. Sul telefono stanno in una fila che scorre: non si stringono e non vanno a capo.
const PILLOLA = "flex min-h-[48px] min-w-0 max-w-full items-center gap-2 rounded-xl border px-3.5 text-left text-[15px] font-bold max-md:min-h-[44px] max-md:shrink-0 max-md:whitespace-nowrap max-md:px-3 ";
const PILLOLA_ACCESA = "border-verde bg-verdechiaro text-verdescuro";
// Il tipo scelto, scuro come nei selettori a segmenti (e' una scelta fra quattro, non un filtro che si accende).
const PILLOLA_SCELTA = "border-testo bg-testo text-white";
const PILLOLA_SPENTA = "border-bordo2 bg-carta text-testo hover:bg-sabbia";

// Dove va il fuoco se, segnata pagata l'ultima fattura con «Da pagare» acceso, l'elenco resta vuoto: sul filtro, che c'e' sempre.
const filtroDaPagare = () => document.querySelector<HTMLElement>("[data-filtro-da-pagare]");

export default function Movimenti() {
  const periodo = usePeriodo("mese");
  const { pathname, search } = useLocation();
  const [params, setParams] = useSearchParams();
  // I filtri per voce (un fornitore, un dipendente, «senza…», solo retribuzioni) e «Da pagare» vivono solo nell'indirizzo:
  // ci si arriva da «Vedi in Movimenti» del dettaglio di una voce, e si tolgono dal loro chip.
  const filtriVoce = useMemo(() => leggiFiltriVoce(params), [params]);
  // tipo=COSTI (variabili + fissi) arriva solo da «Vedi in Movimenti» di una categoria con «Costi»: non e' un bottone del selettore di
  // tipo (nessuno resta acceso) ma il chip «Solo costi», e non si ricorda nel browser.
  const soloCosti = filtriVoce.tipo === "COSTI";
  const daPagare = filtriVoce.pagata === false;
  const conFiltriVoce = Object.keys(filtriVoce).length > 0;
  // Con un filtro per voce nell'indirizzo le ultime scelte ricordate (tipo, categorie) non valgono: l'elenco deve
  // corrispondere alla voce da cui si arriva, non restringersi di nascosto.
  const perVoce = filtriVoce.fornitore !== undefined || filtriVoce.dipendente !== undefined || filtriVoce.senza !== undefined || filtriVoce.retribuzione === true;
  // Il tipo scelto (Ricavi, Variabili…) si ricorda come il periodo: l'indirizzo vince, altrimenti l'ultima scelta.
  const tipoGrezzo = params.get("tipo") ?? (perVoce ? "" : leggiFiltri().tipo) ?? "";
  const tipo = FILTRI_TIPO.find((f) => f.valore === tipoGrezzo)?.valore ?? "";
  const sedi = useSedi();
  const [ricerca, setRicerca] = useState(posizioneLista.ricerca);
  const q = useDebounced(ricerca.trim(), 300);
  const { da, a } = periodo.intervallo;

  const filtroSedi = sedi.parametro;
  // Le categorie scelte: come il tipo, l'indirizzo vince, altrimenti l'ultima scelta (non con un filtro per voce, vedi sopra).
  // Una categoria che non esiste piu' (o non e' del tipo scelto in alto) si ignora.
  const tutteLeCategorie = useQuery({ queryKey: chiavi.categorie(), queryFn: () => api.categorie(), staleTime: 15_000 });
  const categorieGrezze = params.has("categorie") ? params.get("categorie") : perVoce ? "" : scriviIdCategorie(leggiFiltri().categorie ?? []);
  const idCategorie = useMemo(() => leggiIdCategorie(categorieGrezze), [categorieGrezze]);
  const categorieScelte = useMemo(() => idValidi(scartaIdInesistenti(idCategorie, tutteLeCategorie.data), tutteLeCategorie.data, tipo), [idCategorie, tutteLeCategorie.data, tipo]);
  const filtroCategorie = scriviIdCategorie(categorieScelte);
  // Con delle categorie da verificare si aspetta l'elenco (se non arriva, vale quello che c'e').
  const categoriePronte = idCategorie.length === 0 || !tutteLeCategorie.isPending;

  const filtro = useMemo(
    () => ({ da, a, ...(tipo ? { tipo } : {}), ...(q ? { q } : {}), ...(filtroSedi ? { sedi: filtroSedi } : {}), ...(filtroCategorie ? { categorie: filtroCategorie } : {}), ...filtriVoce }),
    [da, a, tipo, q, filtroSedi, filtroCategorie, filtriVoce],
  );
  const richiesta = useQuery({ queryKey: chiavi.movimenti(filtro), queryFn: () => api.movimenti(filtro), enabled: sedi.pronto && categoriePronte });
  const elenco = richiesta.data;
  // «Segna pagata» delle fatture dell'elenco. Con «Da pagare» acceso la fattura segnata pagata esce dall'elenco: il fuoco va sulla
  // riga vicina, o sul filtro «Da pagare» se non ne restano.
  const pagata = useSegnaPagataInElenco(elenco?.elementi, filtroDaPagare);

  // Il nome sul chip: dalle anagrafiche, o dal primo movimento dell'elenco se non sono ancora arrivate.
  const fornitori = useQuery({ queryKey: chiavi.fornitori(""), queryFn: () => api.fornitori(""), enabled: filtriVoce.fornitore !== undefined, staleTime: 15_000 });
  const dipendenti = useQuery({ queryKey: chiavi.dipendenti(""), queryFn: () => api.dipendenti(""), enabled: filtriVoce.dipendente !== undefined, staleTime: 15_000 });
  const chip = chipDeiFiltri(filtriVoce, {
    fornitore: fornitori.data?.find((f) => f.id === filtriVoce.fornitore)?.nome ?? elenco?.elementi.find((m) => m.fornitore?.id === filtriVoce.fornitore)?.fornitore?.nome,
    dipendente: dipendenti.data?.find((d) => d.id === filtriVoce.dipendente)?.nome ?? elenco?.elementi.find((m) => m.dipendente?.id === filtriVoce.dipendente)?.dipendente?.nome,
  });

  // Mette o toglie un filtro dell'indirizzo senza aggiungere un passo alla cronologia.
  function impostaParametro(nome: ParametroVoce, valore: string | null) {
    setParams(
      (prec) => {
        const p = new URLSearchParams(prec);
        if (valore === null) p.delete(nome);
        else p.set(nome, valore);
        return p;
      },
      { replace: true },
    );
  }

  function scegliTipo(valore: Tipo | "") {
    // Scegliendo un tipo le categorie scelte di altri tipi escono dal filtro.
    const restano = idValidi(categorieScelte, tutteLeCategorie.data, valore);
    salvaFiltri(magazzinoBrowser(), { tipo: valore, categorie: restano });
    setParams(
      (prec) => {
        const p = new URLSearchParams(prec);
        if (valore) p.set("tipo", valore);
        else p.delete("tipo");
        if (restano.length > 0) p.set("categorie", scriviIdCategorie(restano));
        else p.delete("categorie");
        return p;
      },
      { replace: true },
    );
  }

  function scegliCategorie(ids: number[]) {
    salvaFiltri(magazzinoBrowser(), { categorie: ids });
    setParams(
      (prec) => {
        const p = new URLSearchParams(prec);
        if (ids.length > 0) p.set("categorie", scriviIdCategorie(ids));
        else p.delete("categorie");
        return p;
      },
      { replace: true },
    );
  }

  const filtriAttivi = tipo !== "" || q !== "" || sedi.incluse !== null || filtroCategorie !== "" || conFiltriVoce;
  // L'indirizzo di questo elenco, filtri compresi: il movimento aperto (o quello nuovo) riporta qui.
  const daDove = pathname + search;
  const conTotali = !!elenco && elenco.elementi.length > 0;
  const conAnno = periodo.tipo === "anno" || periodo.tipo === "periodo";

  // Telefono: il tipo scelto deve vedersi anche quando la fila di pillole e' piu' larga dello schermo (per esempio «Fissi», l'ultima,
  // ricordata dall'altra volta): la fila scorre di quel poco che serve. I chip e «Da pagare» stanno all'inizio, gia' in vista.
  const grande = useSchermoGrande();
  const rifPillole = useRef<HTMLDivElement>(null);
  const numeroChip = chip.length;
  useLayoutEffect(() => {
    const fila = rifPillole.current;
    // «Tutti» non restringe l'elenco: per lui la fila non si muove (i chip all'inizio restano in vista).
    const scelto = tipo === "" ? null : fila?.querySelector<HTMLElement>('[aria-label="Tipo di movimento"] > [aria-pressed="true"]');
    if (!fila || !scelto) return;
    const f = fila.getBoundingClientRect();
    const s = scelto.getBoundingClientRect();
    if (s.right > f.right - 16) fila.scrollLeft += s.right - f.right + 16;
    else if (s.left < f.left + 16) fila.scrollLeft -= f.left + 16 - s.left;
  }, [tipo, grande, numeroChip]);

  // «Da pagare» e i chip dei filtri per voce: sul computer in coda alla riga dei filtri, sul telefono nella fila di pillole.
  const pulsanteDaPagare = (
    <button
      type="button"
      aria-pressed={daPagare}
      title="Solo le fatture ancora da pagare"
      data-filtro-da-pagare
      onClick={() => impostaParametro("pagata", daPagare ? null : "false")}
      className={PILLOLA + (daPagare ? PILLOLA_ACCESA : PILLOLA_SPENTA)}
    >
      Da pagare
    </button>
  );
  const chipDeiFiltriVoce = chip.map((c) => (
    <button key={c.parametro} type="button" aria-label={`Togli il filtro: ${c.testo}`} onClick={() => impostaParametro(c.parametro, c.parametro === "tipo" ? "" : null)} className={PILLOLA + PILLOLA_ACCESA + " !pr-2.5 max-md:!max-w-[60vw]"}>
      <span className="min-w-0 truncate">{c.testo}</span>
      <IconaVia larghezza={18} spessoreTratto={2.4} className="shrink-0" />
    </button>
  ));
  const ricercaECategoria = (
    <>
      <label className="campo min-w-0 flex-1 !min-h-[48px] corto:!min-h-[44px] !rounded-xl !border-bordo2 !px-4 md:min-w-[160px]">
        <IconaCerca larghezza={20} spessoreTratto={2} className="text-spento" />
        <span className="sr-only">Cerca fornitore, dipendente o nota</span>
        <input type="search" value={ricerca} onChange={(e) => {
            posizioneLista.ricerca = e.target.value;
            setRicerca(e.target.value);
          }} placeholder="Cerca…" className="!text-[16px]" />
      </label>
      <FiltroCategorie
        categorie={tutteLeCategorie.isError ? null : tutteLeCategorie.data}
        tipo={tipo}
        scelte={categorieScelte}
        onCambia={scegliCategorie}
      />
    </>
  );

  return (
    <div className="flex min-h-full flex-col">
      <Testata titoloSoloComputer titolo="Movimenti" azioni={<PulsanteNuovoMovimento />} />
      {/* Stesso ordine del Riepilogo: sedi, periodo, poi i filtri. */}
      <SelettoreSedi className="px-4 pb-3 corto:pb-2 md:px-8" />
      <div className="px-4 pb-3 corto:pb-2 md:px-8">
        <SelettorePeriodo periodo={periodo} />
      </div>
      {grande ? (
        // Computer: tipo, ricerca, «Categoria» e in coda «Da pagare» su una riga (la ricerca si stringe per fare posto); i chip dei
        // filtri per voce stanno dopo «Da pagare» e vanno a capo solo se non entrano.
        <div className="flex flex-wrap items-center gap-3 px-8 pb-4">
          <div className="segmenti" role="group" aria-label="Tipo di movimento">
            {FILTRI_TIPO.map((f) => (
              <button key={f.valore} type="button" aria-pressed={!soloCosti && tipo === f.valore} onClick={() => scegliTipo(f.valore)}>
                {/* Sotto i 1280 px i nomi brevi, cosi' la riga resta una sola. */}
                <span className="xl:hidden">{f.breve}</span>
                <span className="max-xl:hidden">{f.lungo}</span>
              </button>
            ))}
          </div>
          {ricercaECategoria}
          {pulsanteDaPagare}
          {chipDeiFiltriVoce}
        </div>
      ) : (
        // Telefono: la ricerca con «Categoria», poi una sola fila di pillole che scorre di lato: prima i filtri che si tolgono
        // (i chip per voce, sempre in vista), poi «Da pagare» e il tipo.
        <div className="flex flex-col gap-3 px-4 pb-3 corto:gap-2 corto:pb-2">
          <div className="flex min-w-0 gap-2">{ricercaECategoria}</div>
          <div ref={rifPillole} role="group" aria-label="Filtri" className="-mx-4 -my-1.5 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-1.5 [scrollbar-width:none]">
            {chipDeiFiltriVoce}
            {pulsanteDaPagare}
            <div role="group" aria-label="Tipo di movimento" className="flex shrink-0 gap-2">
              {FILTRI_TIPO.map((f) => {
                const acceso = !soloCosti && tipo === f.valore;
                return (
                  <button key={f.valore} type="button" aria-pressed={acceso} onClick={() => scegliTipo(f.valore)} className={PILLOLA + (acceso ? PILLOLA_SCELTA : PILLOLA_SPENTA)}>
                    {f.breve}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className={"flex flex-1 flex-col px-4 md:px-8 md:pb-0 " + (conTotali ? "pb-[84px]" : "pb-4")}>
        <div className={"scheda flex-1 overflow-hidden max-md:rounded-2xl" + (conTotali ? " md:rounded-b-none md:border-b-0" : "")}>
          {(richiesta.isPending || !sedi.pronto) && <Caricamento />}
          {richiesta.isError && <ErroreCaricamento errore={richiesta.error} onRiprova={() => void richiesta.refetch()} />}
          {elenco && elenco.elementi.length === 0 && (
            <Vuoto
              titolo={filtriAttivi ? "Nessun movimento corrisponde ai filtri" : "Nessun movimento in questo periodo"}
              testo={filtriAttivi ? (filtroCategorie || conFiltriVoce ? "Prova a togliere la ricerca o i filtri." : "Prova a togliere la ricerca o a scegliere «Tutti».") : "Quando registri un ricavo o un costo lo trovi qui."}
              azione={
                <Link to="/movimenti/nuovo" state={{ da: daDove }} className="btn primario">
                  <IconaPiu larghezza={20} spessoreTratto={2.25} />
                  <span>Nuovo movimento</span>
                </Link>
              }
            />
          )}
          {elenco && elenco.elementi.length > 0 && (
            <>
              <IntestazioneElenco />
              <ElencoPerGiorno elementi={elenco.elementi} conAnno={conAnno} conSede={sedi.piu} daDove={daDove} pagata={pagata} />
            </>
          )}
        </div>
      </div>

      {conTotali && (
        <div data-barra-fissa className="sticky bottom-0 z-10 md:bg-fondo md:px-8 md:pb-7">
          {/* Telefono: barra crema in fondo. Computer: barra scura attaccata alla tabella. L'avviso in basso non la copre
              (data-non-coprire, util/avviso.ts): ci sale sopra, e sul telefono si mette di fianco al pulsante «+». */}
          <footer
            data-non-coprire
            aria-label="Totali del periodo"
            className="flex flex-col gap-1 border-t border-bordo bg-crema px-4 py-2.5 md:h-16 md:flex-row md:items-center md:justify-between md:gap-6 md:rounded-b-[18px] md:border-t-0 md:bg-testo md:px-6 md:py-0 md:text-white"
          >
            <span className="text-[13px] text-spento corto:hidden md:hidden">
              {elenco.elementi.length} {elenco.elementi.length === 1 ? "movimento" : "movimenti"} · {periodo.etichetta}
              {sedi.incluse ? ` · ${sedi.incluse}` : ""}
            </span>
            <span className="text-[14px] max-md:hidden">
              {elenco.elementi.length} {elenco.elementi.length === 1 ? "movimento mostrato" : "movimenti mostrati"} · {periodo.etichetta.toLowerCase()}
              {sedi.incluse ? ` · ${sedi.incluse}` : ""}
            </span>
            <dl className="m-0 flex justify-between gap-3 md:justify-start md:gap-9 md:text-[15px]">
              <div className="flex min-w-0 flex-col md:flex-row md:items-baseline md:gap-1.5">
                <dt className="etichettaMaiuscola md:text-[15px] md:font-normal md:normal-case md:tracking-normal md:text-white">Ricavi</dt>
                <dd className="num m-0 whitespace-nowrap font-titolo text-[16px] font-bold max-[359px]:text-[14px] text-verdescuro md:font-testo md:text-[15px] md:text-white">{euro(elenco.totali.ricaviCent)}</dd>
              </div>
              <div className="flex min-w-0 flex-col md:flex-row md:items-baseline md:gap-1.5">
                <dt className="etichettaMaiuscola md:text-[15px] md:font-normal md:normal-case md:tracking-normal md:text-white">Costi</dt>
                <dd className="num m-0 whitespace-nowrap font-titolo text-[16px] font-bold max-[359px]:text-[14px] md:font-testo md:text-[15px]">{euro(elenco.totali.costiCent)}</dd>
              </div>
              <div className="flex min-w-0 flex-col md:flex-row md:items-baseline md:gap-1.5">
                <dt className="etichettaMaiuscola md:text-[15px] md:font-normal md:normal-case md:tracking-normal md:text-white">Saldo</dt>
                <dd className={"num m-0 whitespace-nowrap font-titolo text-[16px] font-bold max-[359px]:text-[14px] md:font-testo md:text-[15px] md:text-white " + (elenco.totali.saldoCent < 0 ? "text-rosso" : "text-verdescuro")}>{euro(elenco.totali.saldoCent)}</dd>
              </div>
            </dl>
          </footer>
        </div>
      )}
    </div>
  );
}
