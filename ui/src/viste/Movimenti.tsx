import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { posizioneLista } from "../util/posizioneLista";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { Movimento, Tipo } from "../api/tipi";
import BadgeSede from "../componenti/BadgeSede";
import { IconaCerca, IconaPiu } from "../componenti/Icone";
import SelettorePeriodo, { NavigatorePeriodo } from "../componenti/SelettorePeriodo";
import SelettoreSedi from "../componenti/SelettoreSedi";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import FiltroCategorie from "../componenti/FiltroCategorie";
import Testata, { PulsanteNuovoMovimento } from "../componenti/Testata";
import { useDebounced } from "../hooks/useDebounced";
import { idValidi, leggiIdCategorie, scriviIdCategorie } from "../util/filtroCategorie";
import { leggiFiltri, magazzinoBrowser, salvaFiltri } from "../util/filtriSalvati";
import { usePeriodo } from "../hooks/usePeriodo";
import { useSedi } from "../hooks/useSedi";
import { aumentaIlSaldo, CLASSE_TIPO, documentoConNumero, nomeMovimento, NOME_ORIGINE, sottotitoloMovimento, sottotitoloTelefono, TIPO_BREVE } from "../util/etichette";
import { dataBreve, dataGiorno, dataRiga, euro, euroConSegno } from "../util/formato";

const FILTRI_TIPO: { valore: Tipo | ""; lungo: string; breve: string }[] = [
  { valore: "", lungo: "Tutti", breve: "Tutti" },
  { valore: "RICAVO", lungo: "Ricavi", breve: "Ricavi" },
  { valore: "COSTO_VARIABILE", lungo: "Costi variabili", breve: "Variabili" },
  { valore: "COSTO_FISSO", lungo: "Costi fissi", breve: "Fissi" },
];

// Le date di riga sono brevi (gg/mm); con l'anno (gg/mm/aa) quando il periodo e' un anno o un intervallo libero.
// `conSede`: con almeno due sedi attive la riga porta il badge-lettera della sede; con una sola resta com'era.
function RigaMovimento({ m, conAnno, conSede }: { m: Movimento; conAnno: boolean; conSede: boolean }) {
  const ricavo = aumentaIlSaldo(m);
  const sotto = sottotitoloMovimento(m);
  const sottoTelefono = sottotitoloTelefono(m);
  const testi = (
    <span className="min-w-0">
      <span className="block truncate text-[16px] font-bold max-[359px]:line-clamp-2 max-[359px]:whitespace-normal md:text-[15px]">{nomeMovimento(m)}</span>
      {sotto && <span className="block truncate text-[13px] text-spento max-md:hidden">{sotto}</span>}
      <span className="flex gap-1 text-[13px] text-spento md:hidden">
        {sottoTelefono.documento && (
          <>
            <span className="min-w-0 truncate max-[359px]:whitespace-normal max-[359px]:break-words">{sottoTelefono.documento}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span className="shrink-0">{sottoTelefono.tipo}</span>
      </span>
    </span>
  );
  return (
    <li className="riga">
      <Link
        to={`/movimenti/${m.id}`}
        className="rigaMov"
        aria-label={`${nomeMovimento(m)}, ${dataBreve(m.data)}, ${euroConSegno(m.importoCent, ricavo)}${conSede ? `, sede ${m.sede.nome}` : ""}. Apri il dettaglio`}
      >
        <span className="num text-[15px] max-md:hidden">{dataRiga(m.data, conAnno)}</span>
        <span className="max-md:hidden">
          <span className={"etichettaTipo " + CLASSE_TIPO[m.tipo]}>{TIPO_BREVE[m.tipo]}</span>
        </span>
        {conSede ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <BadgeSede id={m.sede.id} taglia="grande" decorativo />
            {testi}
          </span>
        ) : (
          testi
        )}
        <span className="truncate text-[15px] max-md:hidden">{documentoConNumero(m)}</span>
        <span className={"num text-right text-[16px] font-bold md:text-[15px] " + (ricavo ? "text-verdescuro" : "")}>{euroConSegno(m.importoCent, ricavo)}</span>
        <span className="text-right text-[13px] text-spento max-md:hidden">{NOME_ORIGINE[m.origine]}</span>
      </Link>
    </li>
  );
}

export default function Movimenti() {
  const periodo = usePeriodo("mese");
  const [params, setParams] = useSearchParams();
  // Il tipo scelto (Ricavi, Variabili…) si ricorda come il periodo: l'indirizzo vince, altrimenti l'ultima scelta.
  const tipoGrezzo = params.get("tipo") ?? leggiFiltri().tipo ?? "";
  const tipo = FILTRI_TIPO.find((f) => f.valore === tipoGrezzo)?.valore ?? "";
  const sedi = useSedi();
  const [ricerca, setRicerca] = useState(posizioneLista.ricerca);
  const q = useDebounced(ricerca.trim(), 300);
  const { da, a } = periodo.intervallo;

  const filtroSedi = sedi.parametro;
  // Le categorie scelte: come il tipo, l'indirizzo vince, altrimenti l'ultima scelta. Una categoria che non esiste piu'
  // (o non e' del tipo scelto in alto) si ignora.
  const tutteLeCategorie = useQuery({ queryKey: chiavi.categorie(), queryFn: () => api.categorie(), staleTime: 15_000 });
  const categorieGrezze = params.has("categorie") ? params.get("categorie") : scriviIdCategorie(leggiFiltri().categorie ?? []);
  const idCategorie = useMemo(() => leggiIdCategorie(categorieGrezze), [categorieGrezze]);
  const categorieScelte = useMemo(() => idValidi(idCategorie, tutteLeCategorie.data, tipo), [idCategorie, tutteLeCategorie.data, tipo]);
  const filtroCategorie = scriviIdCategorie(categorieScelte);
  // Con delle categorie da verificare si aspetta l'elenco (se non arriva, vale quello che c'e').
  const categoriePronte = idCategorie.length === 0 || !tutteLeCategorie.isPending;

  const filtro = useMemo(
    () => ({ da, a, ...(tipo ? { tipo } : {}), ...(q ? { q } : {}), ...(filtroSedi ? { sedi: filtroSedi } : {}), ...(filtroCategorie ? { categorie: filtroCategorie } : {}) }),
    [da, a, tipo, q, filtroSedi, filtroCategorie],
  );
  const richiesta = useQuery({ queryKey: chiavi.movimenti(filtro), queryFn: () => api.movimenti(filtro), enabled: sedi.pronto && categoriePronte });
  const elenco = richiesta.data;

  const gruppi = useMemo(() => {
    const mappa = new Map<string, Movimento[]>();
    for (const m of elenco?.elementi ?? []) {
      const lista = mappa.get(m.data);
      if (lista) lista.push(m);
      else mappa.set(m.data, [m]);
    }
    return [...mappa.entries()];
  }, [elenco]);

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

  const filtriAttivi = tipo !== "" || q !== "" || sedi.incluse !== null || filtroCategorie !== "";
  const conTotali = !!elenco && elenco.elementi.length > 0;
  const conAnno = periodo.tipo === "anno" || periodo.tipo === "periodo";

  return (
    <div className="flex min-h-full flex-col">
      {/* Le frecce del periodo stanno nella testata sul computer, cosi' periodo, tipo e ricerca stanno su una riga sola. */}
      <Testata
        titoloSoloComputer
        titolo="Movimenti"
        azioni={
          <div className="flex items-center gap-4">
            <div className="max-md:hidden">
              <NavigatorePeriodo periodo={periodo} />
            </div>
            <PulsanteNuovoMovimento />
          </div>
        }
      />
      <SelettoreSedi className="px-4 pb-3 corto:pb-2 md:px-8" />
      <div className="flex flex-col gap-3 px-4 pb-3 corto:gap-2 corto:pb-2 md:flex-row md:flex-wrap md:gap-3 md:px-8 md:pb-4">
        {/* Telefono: prima il tipo a tutta larghezza, poi la ricerca, poi il periodo. */}
        <div className="flex flex-col gap-3 corto:gap-2 max-md:order-3">
          <SelettorePeriodo periodo={periodo} senzaNavigatore />
          <div className="md:hidden">
            <NavigatorePeriodo periodo={periodo} />
          </div>
        </div>
        <div className="segmenti max-md:order-1 max-md:flex max-md:h-[46px] max-md:min-h-0 corto:!h-[46px]" role="group" aria-label="Tipo di movimento">
          {FILTRI_TIPO.map((f) => (
            <button
              key={f.valore}
              type="button"
              aria-pressed={tipo === f.valore}
              onClick={() => scegliTipo(f.valore)}
              className="max-md:min-h-0 max-md:flex-1 max-md:justify-center max-md:px-0 max-md:text-[14px]"
            >
              <span className="md:hidden">{f.breve}</span>
              <span className="max-md:hidden">{f.lungo}</span>
            </button>
          ))}
        </div>
        {/* La ricerca e il pulsante «Categoria» stanno sulla stessa riga (telefono compreso). */}
        <div className="flex min-w-0 flex-1 gap-2 max-md:order-2 md:basis-[320px] md:gap-3">
          <label className="campo min-w-0 flex-1 !min-h-[48px] corto:!min-h-[42px] !rounded-xl !border-bordo2 !px-4">
            <IconaCerca larghezza={20} spessoreTratto={2} className="text-spento" />
            <span className="sr-only">Cerca fornitore o nota</span>
            <input type="search" value={ricerca} onChange={(e) => {
                posizioneLista.ricerca = e.target.value;
                setRicerca(e.target.value);
              }} placeholder="Cerca fornitore o nota…" className="!text-[16px]" />
          </label>
          <FiltroCategorie
            categorie={tutteLeCategorie.isError ? null : tutteLeCategorie.data}
            tipo={tipo}
            scelte={categorieScelte}
            onCambia={scegliCategorie}
          />
        </div>
      </div>

      <div className={"flex flex-1 flex-col px-4 md:px-8 md:pb-0 " + (conTotali ? "pb-[84px]" : "pb-4")}>
        <div className={"scheda flex-1 overflow-hidden max-md:rounded-2xl" + (conTotali ? " md:rounded-b-none md:border-b-0" : "")}>
          {(richiesta.isPending || !sedi.pronto) && <Caricamento />}
          {richiesta.isError && <ErroreCaricamento errore={richiesta.error} onRiprova={() => void richiesta.refetch()} />}
          {elenco && elenco.elementi.length === 0 && (
            <Vuoto
              titolo={filtriAttivi ? "Nessun movimento corrisponde ai filtri" : "Nessun movimento in questo periodo"}
              testo={filtriAttivi ? (filtroCategorie ? "Prova a togliere la ricerca o i filtri." : "Prova a togliere la ricerca o a scegliere «Tutti».") : "Quando registri un ricavo o un costo lo trovi qui."}
              azione={
                <Link to="/movimenti/nuovo" className="btn primario">
                  <IconaPiu larghezza={20} spessoreTratto={2.25} />
                  <span>Nuovo movimento</span>
                </Link>
              }
            />
          )}
          {elenco && elenco.elementi.length > 0 && (
            <>
              <div className="intestazioneTabella etichettaMaiuscola grid h-[42px] items-center gap-3 px-5 max-md:hidden">
                <span>Data</span>
                <span>Tipo</span>
                <span>Fornitore / descrizione</span>
                <span>Documento</span>
                <span className="text-right">Importo</span>
                <span className="text-right">
                  <span className="sr-only">Origine</span>
                </span>
              </div>
              {gruppi.map(([data, righe]) => (
                <section key={data} aria-label={dataGiorno(data)}>
                  <h2 className="etichettaMaiuscola flex h-[34px] items-center bg-sabbia px-4 !font-testo md:h-9 md:border-t md:border-riga md:px-5 md:text-[13px]">{dataGiorno(data)}</h2>
                  <ul className="m-0 list-none p-0">
                    {righe.map((m) => (
                      <RigaMovimento key={m.id} m={m} conAnno={conAnno} conSede={sedi.piu} />
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>

      {conTotali && (
        <div data-barra-fissa className="sticky bottom-0 z-10 md:bg-fondo md:px-8 md:pb-7">
          {/* Telefono: barra crema in fondo. Computer: barra scura attaccata alla tabella. */}
          <footer
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
