import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, chiavi, messaggioErrore } from "../api/client";
import {
  nomeFileEsportazione,
  righeAnteprima,
  RIGHE_ANTEPRIMA,
  scaricaEsportazione,
  TIPI_ESPORTAZIONE,
  type FormatoFile,
} from "../api/esporta";
import type { Tipo } from "../api/tipi";
import { IconaEsporta } from "../componenti/Icone";
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import { Caricamento, ErroreCaricamento } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { usePeriodo } from "../hooks/usePeriodo";

const FORMATI: { formato: FormatoFile; nome: string; estensione: string; descrizione: string }[] = [
  { formato: "xlsx", nome: "Excel", estensione: ".xlsx", descrizione: "con riepilogo" },
  { formato: "csv", nome: "CSV", estensione: ".csv", descrizione: "solo movimenti" },
];

function Gruppo({ titolo, children, className = "" }: { titolo: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="etichetta mb-2 p-0">{titolo}</legend>
      <div className={className}>{children}</div>
    </fieldset>
  );
}

export default function Esporta() {
  const periodo = usePeriodo("mese");
  const { da, a } = periodo.intervallo;
  const [formato, setFormato] = useState<FormatoFile>("xlsx");
  const [tipi, setTipi] = useState<Tipo[]>(TIPI_ESPORTAZIONE.map((t) => t.tipo));
  const [scaricato, setScaricato] = useState<string | null>(null);

  const elenco = useQuery({ queryKey: chiavi.movimenti({ da, a }), queryFn: () => api.movimenti({ da, a }) });
  const scarica = useMutation({
    mutationFn: () => scaricaEsportazione({ formato, da, a, tipi }),
    onMutate: () => setScaricato(null),
    onSuccess: (nome) => setScaricato(nome),
  });

  const anteprima = elenco.data ? righeAnteprima(elenco.data.elementi, tipi, formato) : null;
  const nessunTipo = tipi.length === 0;
  const nomeFile = nomeFileEsportazione({ formato, da, a });

  function cambiaTipo(tipo: Tipo, acceso: boolean) {
    setScaricato(null);
    setTipi((prec) => (acceso ? TIPI_ESPORTAZIONE.map((t) => t.tipo).filter((t) => t === tipo || prec.includes(t)) : prec.filter((t) => t !== tipo)));
  }

  return (
    <div className="flex min-h-full flex-col">
      <Testata titolo="Esporta" />
      <div className="flex flex-1 flex-col gap-5 px-4 pb-24 md:flex-row md:px-8 md:pb-7">
        {/* Comandi */}
        <section className="scheda flex min-w-0 flex-col gap-[22px] px-5 py-5 md:w-[500px] md:shrink-0 md:px-7 md:py-6" aria-label="Cosa esportare">
          <div>
            <div className="etichetta mb-2">Periodo</div>
            <SelettorePeriodo periodo={periodo} className="items-start md:flex-col md:gap-2.5" />
          </div>

          <Gruppo titolo="Cosa includere">
            {TIPI_ESPORTAZIONE.map(({ tipo, etichetta }) => (
              <label key={tipo} className="flex h-11 cursor-pointer items-center gap-3 text-[16px]">
                <input type="checkbox" className="h-6 w-6 shrink-0 accent-verde" checked={tipi.includes(tipo)} onChange={(e) => cambiaTipo(tipo, e.target.checked)} />
                <span>{etichetta}</span>
              </label>
            ))}
            {nessunTipo && (
              <p role="alert" className="m-0 text-[14px] font-bold text-rosso">
                Scegli almeno una voce da includere.
              </p>
            )}
          </Gruppo>

          <Gruppo titolo="Formato" className="flex gap-2.5">
            {FORMATI.map((f) => (
              <label
                key={f.formato}
                className="flex h-[72px] min-w-0 flex-1 cursor-pointer items-center rounded-xl border border-bordo2 bg-carta px-4 text-[16px] font-bold text-testo hover:bg-sabbia has-[:checked]:border-verde has-[:checked]:bg-verdechiaro has-[:checked]:text-verdescuro has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-verde)] has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-anello"
              >
                <input
                  type="radio"
                  name="formato"
                  className="peer sr-only"
                  checked={formato === f.formato}
                  onChange={() => {
                    setFormato(f.formato);
                    setScaricato(null);
                  }}
                />
                <span>
                  {f.nome}
                  <span className="block text-[13px] font-normal text-spento">
                    {f.estensione} · {f.descrizione}
                  </span>
                </span>
              </label>
            ))}
          </Gruppo>

          <div className="flex flex-1 flex-col justify-end gap-2">
            <div aria-live="polite" className="min-h-[20px] text-[14px]">
              {scarica.isError && (
                <p role="alert" className="m-0 font-bold text-rosso">
                  {messaggioErrore(scarica.error)}
                </p>
              )}
              {scaricato && !scarica.isError && <p className="m-0 text-verdescuro">Scaricato: {scaricato}</p>}
            </div>
            <button type="button" className="btn primario h-14 w-full !text-[17px]" disabled={nessunTipo || scarica.isPending} onClick={() => scarica.mutate()}>
              <IconaEsporta larghezza={22} spessoreTratto={2} />
              <span>{scarica.isPending ? "Preparo il file…" : "Scarica il file"}</span>
            </button>
          </div>
        </section>

        {/* Anteprima */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="scheda px-6 py-5" aria-label="Il file">
            <h2 className="mb-1 text-[18px] font-bold">Il file</h2>
            <p className="num m-0 break-all text-[15px] text-spento" data-testid="nome-file">
              {nomeFile}
            </p>
            <ul className="m-0 mt-3.5 flex list-none flex-wrap gap-2.5 p-0 text-[14px]">
              <li className="rounded-lg border border-bordo bg-crema px-3 py-1.5">
                <b>Movimenti</b> · uno per riga{formato === "csv" ? ", separati da punto e virgola" : ""}
              </li>
              {formato === "xlsx" && (
                <li className="rounded-lg border border-bordo bg-crema px-3 py-1.5">
                  <b>Riepilogo</b> · totali del periodo
                </li>
              )}
            </ul>
          </section>

          <section className="scheda flex min-w-0 flex-1 flex-col overflow-hidden" aria-label="Anteprima">
            <h2 className="etichettaMaiuscola flex h-12 items-center px-4 !font-testo">Anteprima del foglio «Movimenti»</h2>
            {elenco.isPending && <Caricamento />}
            {elenco.isError && <ErroreCaricamento errore={elenco.error} onRiprova={() => void elenco.refetch()} />}
            {anteprima && anteprima.totale === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="m-0 font-titolo text-[20px] font-semibold">Nessun movimento nel periodo</p>
                <p className="m-0 mt-1 text-[15px] text-tenue">Il file si può scaricare lo stesso: avrà solo l&apos;intestazione.</p>
              </div>
            )}
            {anteprima && anteprima.totale > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse font-[Consolas,'Courier_New',monospace] text-[13px]">
                    <caption className="sr-only">Prime righe del file</caption>
                    <thead>
                      <tr className="bg-sabbia text-left">
                        {["Data", "Tipo", "Fornitore", "Documento"].map((c) => (
                          <th key={c} scope="col" className="h-10 px-2.5 font-testo text-[12px] font-bold uppercase first:pl-4">
                            <span className="text-spento">{c}</span>
                          </th>
                        ))}
                        <th scope="col" className="h-10 px-2.5 pr-4 text-right font-testo text-[12px] font-bold uppercase text-spento">
                          Importo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {anteprima.righe.map((r) => (
                        <tr key={r.id} className="riga h-10">
                          <td className="num whitespace-nowrap px-2.5 pl-4">{r.data}</td>
                          <td className="whitespace-nowrap px-2.5">{r.tipo}</td>
                          <td className="px-2.5">{r.fornitore}</td>
                          <td className="px-2.5">{r.documento}</td>
                          <td className="num whitespace-nowrap px-2.5 pr-4 text-right">{r.importo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {anteprima.totale > RIGHE_ANTEPRIMA && (
                  <p className="m-0 border-t border-riga px-4 py-3 text-[14px] text-spento">
                    Prime {RIGHE_ANTEPRIMA} righe di {anteprima.totale}: nel file ci sono tutte.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
