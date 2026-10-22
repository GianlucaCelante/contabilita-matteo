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
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import { Caricamento, ErroreCaricamento } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { usePeriodo } from "../hooks/usePeriodo";

const FORMATI: { formato: FormatoFile; nome: string; estensione: string; descrizione: string }[] = [
  { formato: "xlsx", nome: "Excel", estensione: ".xlsx", descrizione: "con riepilogo" },
  { formato: "csv", nome: "CSV", estensione: ".csv", descrizione: "solo movimenti" },
];

function Gruppo({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="etichettaMaiuscola mb-2 p-0">{titolo}</legend>
      <div className="flex flex-col gap-2">{children}</div>
    </fieldset>
  );
}

// Una scelta (casella o opzione) con la riga intera cliccabile, alta almeno 48 px.
const CLASSE_SCELTA =
  "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border border-bordocampo bg-carta px-4 text-[16px] font-bold has-[:checked]:border-verde has-[:checked]:bg-verdechiaro has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-anello";

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
    <>
      <Testata titolo="Esporta" />
      <div className="px-4 pb-24 md:px-8 md:pb-8">
        <div className="flex flex-col gap-5 md:grid md:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] md:items-start md:gap-6">
          {/* Comandi */}
          <section className="scheda flex min-w-0 flex-col gap-6 px-5 py-5 md:px-6" aria-label="Cosa esportare">
            <div>
              <div className="etichettaMaiuscola mb-2">Periodo</div>
              <SelettorePeriodo periodo={periodo} conPeriodoLibero={false} />
            </div>

            <Gruppo titolo="Cosa includere">
              {TIPI_ESPORTAZIONE.map(({ tipo, etichetta }) => (
                <label key={tipo} className={CLASSE_SCELTA}>
                  <input
                    type="checkbox"
                    className="h-6 w-6 shrink-0 accent-verde"
                    checked={tipi.includes(tipo)}
                    onChange={(e) => cambiaTipo(tipo, e.target.checked)}
                  />
                  <span>{etichetta}</span>
                </label>
              ))}
              {nessunTipo && (
                <p role="alert" className="m-0 text-[14px] font-bold text-rosso">
                  Scegli almeno una voce da includere.
                </p>
              )}
            </Gruppo>

            <Gruppo titolo="Formato">
              {FORMATI.map((f) => (
                <label key={f.formato} className={CLASSE_SCELTA}>
                  <input
                    type="radio"
                    name="formato"
                    className="h-6 w-6 shrink-0 accent-verde"
                    checked={formato === f.formato}
                    onChange={() => {
                      setFormato(f.formato);
                      setScaricato(null);
                    }}
                  />
                  <span>
                    {f.nome} <span className="font-normal text-spento">({f.estensione}, {f.descrizione})</span>
                  </span>
                </label>
              ))}
            </Gruppo>

            <div className="flex flex-col gap-2">
              <button type="button" className="btn primario grande w-full" disabled={nessunTipo || scarica.isPending} onClick={() => scarica.mutate()}>
                {scarica.isPending ? "Preparo il file…" : "Scarica il file"}
              </button>
              <div aria-live="polite" className="min-h-[20px] text-[14px]">
                {scarica.isError && (
                  <p role="alert" className="m-0 font-bold text-rosso">
                    {messaggioErrore(scarica.error)}
                  </p>
                )}
                {scaricato && !scarica.isError && <p className="m-0 text-verdescuro">Scaricato: {scaricato}</p>}
              </div>
            </div>
          </section>

          {/* Anteprima */}
          <div className="flex min-w-0 flex-col gap-5">
            <section className="scheda px-5 py-5 md:px-6" aria-label="Il file">
              <h2 className="mb-3 text-[20px] font-bold">Il file</h2>
              <p className="num m-0 break-all font-titolo text-[18px] font-bold" data-testid="nome-file">
                {nomeFile}
              </p>
              <p className="m-0 mt-2 text-[15px] text-tenue">
                {formato === "xlsx"
                  ? "Due fogli: Movimenti (uno per riga) e Riepilogo (i totali del periodo)."
                  : "Un solo foglio con i movimenti, separati da punto e virgola."}
              </p>
              <p className="m-0 mt-1 text-[15px] text-tenue" aria-live="polite">
                {anteprima ? `${anteprima.totale} ${anteprima.totale === 1 ? "movimento" : "movimenti"} · ${periodo.etichetta}` : "Conto i movimenti…"}
              </p>
            </section>

            <section className="scheda min-w-0 px-5 py-5 md:px-6" aria-label="Anteprima">
              <h2 className="mb-3 text-[20px] font-bold">Anteprima del foglio «Movimenti»</h2>
              {elenco.isPending && <Caricamento />}
              {elenco.isError && <ErroreCaricamento errore={elenco.error} onRiprova={() => void elenco.refetch()} />}
              {anteprima && anteprima.totale === 0 && (
                <div className="py-6 text-center">
                  <p className="m-0 font-titolo text-[20px] font-semibold">Nessun movimento nel periodo</p>
                  <p className="m-0 mt-1 text-[15px] text-tenue">Il file si può scaricare lo stesso: avrà solo l&apos;intestazione.</p>
                </div>
              )}
              {anteprima && anteprima.totale > 0 && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] border-collapse text-[15px]">
                      <caption className="sr-only">Prime righe del file</caption>
                      <thead>
                        <tr className="text-left">
                          {["Data", "Tipo", "Fornitore", "Documento"].map((c) => (
                            <th key={c} scope="col" className="etichettaMaiuscola py-2 pr-3">
                              {c}
                            </th>
                          ))}
                          <th scope="col" className="etichettaMaiuscola py-2 text-right">
                            Importo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {anteprima.righe.map((r) => (
                          <tr key={r.id} className="riga min-h-[44px]">
                            <td className="num whitespace-nowrap py-2.5 pr-3">{r.data}</td>
                            <td className="whitespace-nowrap py-2.5 pr-3">{r.tipo}</td>
                            <td className="py-2.5 pr-3">{r.fornitore}</td>
                            <td className="py-2.5 pr-3">{r.documento}</td>
                            <td className={"num whitespace-nowrap py-2.5 text-right font-bold " + (r.negativo ? "text-rosso" : "text-verdescuro")}>{r.importo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {anteprima.totale > RIGHE_ANTEPRIMA && (
                    <p className="m-0 mt-3 text-[14px] text-spento">
                      Prime {RIGHE_ANTEPRIMA} righe di {anteprima.totale}: nel file ci sono tutte.
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
