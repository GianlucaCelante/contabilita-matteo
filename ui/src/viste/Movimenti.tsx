import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { Movimento, Tipo } from "../api/tipi";
import { IconaCerca, IconaPiu } from "../componenti/Icone";
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import Testata, { PulsanteNuovoMovimento } from "../componenti/Testata";
import { useDebounced } from "../hooks/useDebounced";
import { usePeriodo } from "../hooks/usePeriodo";
import { CLASSE_TIPO, documentoConNumero, nomeMovimento, NOME_ORIGINE, sottotitoloMovimento, TIPO_BREVE } from "../util/etichette";
import { dataGiorno, dataBreve, euro, euroConSegno } from "../util/formato";

const FILTRI_TIPO: { valore: Tipo | ""; lungo: string; breve: string }[] = [
  { valore: "", lungo: "Tutti", breve: "Tutti" },
  { valore: "RICAVO", lungo: "Ricavi", breve: "Ricavi" },
  { valore: "COSTO_VARIABILE", lungo: "Costi variabili", breve: "Variabili" },
  { valore: "COSTO_FISSO", lungo: "Costi fissi", breve: "Fissi" },
];

function RigaMovimento({ m }: { m: Movimento }) {
  const ricavo = m.tipo === "RICAVO";
  const sotto = sottotitoloMovimento(m);
  return (
    <li className="riga">
      <Link to={`/movimenti/${m.id}`} className="rigaMov" aria-label={`${nomeMovimento(m)}, ${dataBreve(m.data)}, ${euroConSegno(m.importoCent, ricavo)}. Apri il dettaglio`}>
        <span className="num text-[14px] text-spento max-md:hidden">{dataBreve(m.data)}</span>
        <span className="max-md:hidden">
          <span className={"etichettaTipo " + CLASSE_TIPO[m.tipo]}>{TIPO_BREVE[m.tipo]}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[16px] font-bold">{nomeMovimento(m)}</span>
          {sotto && <span className="block truncate text-[13px] text-spento max-md:hidden">{sotto}</span>}
          <span className="block truncate text-[13px] text-spento md:hidden">
            {[documentoConNumero(m), TIPO_BREVE[m.tipo]].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="truncate text-[14px] max-md:hidden">{documentoConNumero(m)}</span>
        <span className={"num text-right text-[16px] font-bold " + (ricavo ? "text-verdescuro" : "")}>{euroConSegno(m.importoCent, ricavo)}</span>
        <span className="text-right text-[13px] text-spento max-md:hidden">{NOME_ORIGINE[m.origine]}</span>
      </Link>
    </li>
  );
}

export default function Movimenti() {
  const periodo = usePeriodo("mese");
  const [params, setParams] = useSearchParams();
  const tipoGrezzo = params.get("tipo");
  const tipo = FILTRI_TIPO.find((f) => f.valore === tipoGrezzo)?.valore ?? "";
  const [ricerca, setRicerca] = useState("");
  const q = useDebounced(ricerca.trim(), 300);
  const { da, a } = periodo.intervallo;

  const filtro = useMemo(() => ({ da, a, ...(tipo ? { tipo } : {}), ...(q ? { q } : {}) }), [da, a, tipo, q]);
  const richiesta = useQuery({ queryKey: chiavi.movimenti(filtro), queryFn: () => api.movimenti(filtro) });
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
    setParams(
      (prec) => {
        const p = new URLSearchParams(prec);
        if (valore) p.set("tipo", valore);
        else p.delete("tipo");
        return p;
      },
      { replace: true },
    );
  }

  const filtriAttivi = tipo !== "" || q !== "";

  return (
    <div className="flex min-h-full flex-col">
      <Testata titolo="Movimenti" azioni={<PulsanteNuovoMovimento />} />
      <div className="flex flex-col gap-3 px-4 pb-3 md:px-8">
        <SelettorePeriodo periodo={periodo} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="segmenti" role="group" aria-label="Tipo di movimento">
            {FILTRI_TIPO.map((f) => (
              <button key={f.valore} type="button" aria-pressed={tipo === f.valore} onClick={() => scegliTipo(f.valore)}>
                <span className="md:hidden">{f.breve}</span>
                <span className="max-md:hidden">{f.lungo}</span>
              </button>
            ))}
          </div>
          <label className="campo min-w-0 flex-1 basis-[240px] md:max-w-sm">
            <IconaCerca larghezza={20} spessoreTratto={2} className="text-spento" />
            <span className="sr-only">Cerca fornitore o nota</span>
            <input type="search" value={ricerca} onChange={(e) => setRicerca(e.target.value)} placeholder="Cerca fornitore o nota…" />
          </label>
        </div>
      </div>

      <div className="flex-1 px-4 pb-24 md:px-8 md:pb-0">
        <div className="scheda overflow-hidden">
          {richiesta.isPending && <Caricamento />}
          {richiesta.isError && <ErroreCaricamento errore={richiesta.error} onRiprova={() => void richiesta.refetch()} />}
          {elenco && elenco.elementi.length === 0 && (
            <Vuoto
              titolo={filtriAttivi ? "Nessun movimento corrisponde ai filtri" : "Nessun movimento in questo periodo"}
              testo={filtriAttivi ? "Prova a togliere la ricerca o a scegliere «Tutti»." : "Quando registri un ricavo o un costo lo trovi qui."}
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
              <div className="intestazioneTabella etichettaMaiuscola grid items-center gap-3 bg-sabbia px-5 py-2.5 max-md:hidden">
                <span>Data</span>
                <span>Tipo</span>
                <span>Fornitore / descrizione</span>
                <span>Documento</span>
                <span className="text-right">Importo</span>
                <span className="text-right">Origine</span>
              </div>
              {gruppi.map(([data, righe]) => (
                <section key={data} aria-label={dataGiorno(data)}>
                  <h2 className="etichettaMaiuscola bg-sabbia px-5 py-2 !font-testo md:border-t md:border-riga">{dataGiorno(data)}</h2>
                  <ul className="m-0 list-none p-0">
                    {righe.map((m) => (
                      <RigaMovimento key={m.id} m={m} />
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>

      {elenco && elenco.elementi.length > 0 && (
        <footer className="sticky bottom-0 z-10 hidden items-center justify-between gap-6 border-t border-bordo bg-crema px-8 py-3 md:flex">
          <span className="text-[14px] text-spento">
            {elenco.elementi.length} {elenco.elementi.length === 1 ? "movimento" : "movimenti"} · {periodo.etichetta}
          </span>
          <dl className="m-0 flex gap-8">
            <div className="flex items-baseline gap-2">
              <dt className="etichettaMaiuscola">Ricavi</dt>
              <dd className="num m-0 font-titolo text-[18px] font-bold text-verdescuro">{euro(elenco.totali.ricaviCent)}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="etichettaMaiuscola">Costi</dt>
              <dd className="num m-0 font-titolo text-[18px] font-bold">{euro(elenco.totali.costiCent)}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="etichettaMaiuscola">Saldo</dt>
              <dd className={"num m-0 font-titolo text-[18px] font-bold " + (elenco.totali.saldoCent < 0 ? "text-rosso" : "text-verdescuro")}>{euro(elenco.totali.saldoCent)}</dd>
            </div>
          </dl>
        </footer>
      )}
    </div>
  );
}
