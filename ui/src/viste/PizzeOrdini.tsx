import { useId, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, messaggioErrore } from "../api/client";
import type { RigaSettimana, Settimana } from "../api/tipi";
import { useAvviso } from "../hooks/useAvviso";
import { useBloccoUscita } from "../hooks/useBloccoUscita";
import { useLarghezzaMinima } from "../hooks/useLarghezzaMinima";
import { useSedi } from "../hooks/useSedi";
import BadgeSede from "../componenti/BadgeSede";
import ConfermaUscita from "../componenti/ConfermaUscita";
import { IconaDestra, IconaSinistra } from "../componenti/Icone";
import { Caricamento, ErroreCaricamento } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { dataValida, etichettaIntervallo, euro } from "../util/formato";
import {
  campiIniziali,
  domenicaDi,
  intervalloUltimeSettimane,
  lunediDellaSettimana,
  nomeRelativoSettimana,
  numeroSettimanaIso,
  pizzePerOrdine,
  preparaSalvataggio,
  puoAndareAvanti,
  rigaModificata,
  righeModificabili,
  scontrinoLive,
  settimaneInserite,
  spostaSettimana,
  testoConteggio,
  testoPizzePerOrdine,
  totaleParziale,
  validaRiga,
  type CampiRiga,
} from "../util/statistiche";

// Sotto questa larghezza una scheda per sede, da qui in su una tabella (con 7 colonne sotto i 1024 px non entra).
const LARGHEZZA_TABELLA = 1024;
const PERCORSO = "/statistiche/pizze-ordini";

const testoEuro = (cent: number | null) => (cent === null ? "—" : euro(cent));

function Stato({ completa }: { completa: boolean }) {
  return (
    <span className={"inline-flex h-[26px] items-center whitespace-nowrap rounded-lg px-2.5 text-[12px] font-bold " + (completa ? "bg-verdechiaro text-verdescuro" : "bg-ambrachiaro text-ambra")}>
      {completa ? "Completa" : "Da inserire"}
    </span>
  );
}

// ---- la settimana, con le frecce ----

function NavigatoreSettimana({ lunedi, onVai }: { lunedi: string; onVai: (lunedi: string) => void }) {
  const etichetta = etichettaIntervallo("settimana", { da: lunedi, a: domenicaDi(lunedi) });
  const relativa = nomeRelativoSettimana(lunedi) ?? `Settimana ${numeroSettimanaIso(lunedi)}`;
  return (
    <div className="flex items-center justify-between gap-2 md:justify-start md:gap-3" role="group" aria-label="Settimana">
      <button type="button" className="btnIcona" aria-label="Settimana precedente" onClick={() => onVai(spostaSettimana(lunedi, -1))}>
        <IconaSinistra larghezza={20} spessoreTratto={2} />
      </button>
      <div className="min-w-0 flex-1 text-center md:min-w-[17rem] md:flex-none" aria-live="polite">
        <div className="font-titolo text-[16px] font-semibold leading-tight md:text-[18px]">{etichetta}</div>
        <div className="text-[13px] text-spento">{relativa}</div>
      </div>
      <button type="button" className="btnIcona" aria-label="Settimana successiva" disabled={!puoAndareAvanti(lunedi)} onClick={() => onVai(spostaSettimana(lunedi, 1))}>
        <IconaDestra larghezza={20} spessoreTratto={2} />
      </button>
    </div>
  );
}

// ---- i campi di una sede ----

interface ProprietaCampi {
  riga: RigaSettimana;
  campi: CampiRiga;
  mostraErrori: boolean;
  onCambia: (parziale: Partial<CampiRiga>) => void;
}

function CampoNumero({
  nome,
  nomeSede,
  valore,
  errore,
  onCambia,
  className = "",
}: {
  nome: "Pizze" | "Ordini";
  nomeSede: string;
  valore: string;
  errore: string | null;
  onCambia: (v: string) => void;
  className?: string;
}) {
  const idErrore = useId();
  return (
    <div className={"min-w-0 " + className}>
      <label className={"campo" + (errore ? " errore" : "")}>
        <input
          className="num"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          aria-label={`${nome} ${nomeSede}`}
          aria-invalid={errore ? true : undefined}
          aria-describedby={errore ? idErrore : undefined}
          value={valore}
          onChange={(e) => onCambia(e.target.value)}
        />
      </label>
      {errore && (
        <p id={idErrore} role="alert" className="m-0 mt-1 text-[13px] font-bold text-rosso">
          {errore}
        </p>
      )}
    </div>
  );
}

// Telefono (e tablet): una scheda per sede.
function SchedaSede({ riga, campi, mostraErrori, onCambia }: ProprietaCampi) {
  const { piu } = useSedi();
  const esito = validaRiga(campi);
  const scontrino = scontrinoLive(riga.ricaviCent, campi);
  const nome = riga.sede.nome;
  return (
    <section className={"scheda px-4 py-3.5 max-md:rounded-2xl " + (esito.stato === "completa" ? "" : "!border-ambrabordo")} aria-label={nome}>
      <div className="flex items-center gap-2.5">
        {piu && <BadgeSede id={riga.sede.id} decorativo />}
        <h2 className="min-w-0 flex-1 truncate text-[18px] font-bold">{nome}</h2>
        <Stato completa={esito.stato === "completa"} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="min-w-0">
          <span className="etichetta" aria-hidden="true">Pizze</span>
          <CampoNumero nome="Pizze" nomeSede={nome} valore={campi.pizze} errore={mostraErrori ? esito.errorePizze : null} onCambia={(v) => onCambia({ pizze: v })} />
        </div>
        <div className="min-w-0">
          <span className="etichetta" aria-hidden="true">Ordini</span>
          <CampoNumero nome="Ordini" nomeSede={nome} valore={campi.ordini} errore={mostraErrori ? esito.erroreOrdini : null} onCambia={(v) => onCambia({ ordini: v })} />
        </div>
      </div>
      <p className="num m-0 mt-2.5 text-[13px] text-spento" aria-live="polite">
        Ricavi della settimana {euro(riga.ricaviCent)} · scontrino medio <b className="whitespace-nowrap text-testo">{testoEuro(scontrino)}</b>
      </p>
    </section>
  );
}

// Computer largo: una tabella, una riga per sede.
function TabellaSedi({ righe, campi, mostraErrori, onCambia, totale }: {
  righe: RigaSettimana[];
  campi: Record<number, CampiRiga>;
  mostraErrori: boolean;
  onCambia: (id: number, parziale: Partial<CampiRiga>) => void;
  totale: ReturnType<typeof totaleParziale>;
}) {
  const { piu } = useSedi();
  const th = "etichettaMaiuscola pb-2 text-right align-bottom";
  return (
    <section className="scheda px-6 pb-3 pt-5" aria-label="Dati della settimana">
      <table className="w-full border-collapse">
        <caption className="sr-only">Pizze e ordini della settimana, una riga per sede</caption>
        <thead>
          <tr>
            {piu && <th scope="col" className="etichettaMaiuscola pb-2 text-left align-bottom">Sede</th>}
            <th scope="col" className={th + " w-[140px]"}>Pizze</th>
            <th scope="col" className={th + " w-[140px]"}>Ordini</th>
            <th scope="col" className={th + " w-[120px]"}>Ricavi</th>
            <th scope="col" className={th + " w-[130px]"}>Scontrino medio</th>
            <th scope="col" className={th + " w-[110px]"}>Pizze / ordine</th>
            <th scope="col" className={th + " w-[120px]"}>Stato</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => {
            const c = campi[r.sede.id]!;
            const e = validaRiga(c);
            const nome = r.sede.nome;
            return (
              <tr key={r.sede.id} className="border-t border-riga">
                {piu && (
                  <th scope="row" className="py-2.5 pr-3 text-left font-bold">
                    <span className="flex items-center gap-2.5">
                      <BadgeSede id={r.sede.id} decorativo />
                      {nome}
                    </span>
                  </th>
                )}
                <td className="py-2.5 pl-3 align-top">
                  <div className="ml-auto w-[120px]">
                    <CampoNumero nome="Pizze" nomeSede={nome} valore={c.pizze} errore={mostraErrori ? e.errorePizze : null} onCambia={(v) => onCambia(r.sede.id, { pizze: v })} className="[&_input]:text-right" />
                  </div>
                </td>
                <td className="py-2.5 pl-3 align-top">
                  <div className="ml-auto w-[120px]">
                    <CampoNumero nome="Ordini" nomeSede={nome} valore={c.ordini} errore={mostraErrori ? e.erroreOrdini : null} onCambia={(v) => onCambia(r.sede.id, { ordini: v })} className="[&_input]:text-right" />
                  </div>
                </td>
                <td className="num py-2.5 pl-3 text-right align-top leading-[52px]">{euro(r.ricaviCent)}</td>
                <td className="num py-2.5 pl-3 text-right align-top font-bold leading-[52px]">{testoEuro(scontrinoLive(r.ricaviCent, c))}</td>
                <td className="num py-2.5 pl-3 text-right align-top leading-[52px]">
                  {e.stato === "completa" && e.pizze !== null && e.ordini !== null ? testoPizzePerOrdine(pizzePerOrdine(e.pizze, e.ordini)) : "—"}
                </td>
                <td className="py-2.5 pl-3 text-right align-top leading-[52px]">
                  <Stato completa={e.stato === "completa"} />
                </td>
              </tr>
            );
          })}
          {piu && (
            <tr className="border-t-2 border-testo font-bold">
              <th scope="row" className="py-3.5 pr-3 text-left">
                Tutte le sedi{totale.sediComplete < totale.sediTotali ? " · parziale" : ""}
              </th>
              <td className="num py-3.5 pl-3 text-right">{testoConteggio(totale.pizze)}</td>
              <td className="num py-3.5 pl-3 text-right">{testoConteggio(totale.ordini)}</td>
              <td className="num py-3.5 pl-3 text-right">{euro(totale.ricaviCent)}</td>
              <td className="num py-3.5 pl-3 text-right">{totale.sediComplete === 0 ? "—" : testoEuro(totale.scontrinoMedioCent)}</td>
              <td className="num py-3.5 pl-3 text-right">{testoPizzePerOrdine(totale.pizzePerOrdine)}</td>
              <td className="py-3.5 pl-3 text-right">{totale.sediComplete} su {totale.sediTotali}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

// ---- le settimane già inserite ----

function SettimaneInserite({ correnteLunedi }: { correnteLunedi: string }) {
  const sedi = useSedi();
  const larga = useLarghezzaMinima(LARGHEZZA_TABELLA);
  const intervallo = intervalloUltimeSettimane();
  const q = useQuery({ queryKey: chiavi.statistiche(intervallo.da, intervallo.a), queryFn: () => api.statistiche(intervallo.da, intervallo.a), enabled: sedi.pronto });
  const righe = q.data ? settimaneInserite(q.data.settimane, sedi.attive.length) : [];
  if (righe.length === 0) return null;
  const nomeSettimana = (lunedi: string) => etichettaIntervallo("settimana", { da: lunedi, a: domenicaDi(lunedi) }).replace(/ \d{4}$/, "");

  return (
    <section className="scheda px-4 pb-1 pt-3.5 max-md:rounded-2xl md:px-6 md:pb-2 md:pt-5" aria-label="Settimane già inserite">
      <h2 className="text-[18px] font-bold md:mb-1 md:text-[20px]">Settimane già inserite</h2>
      {larga ? (
        <table className="mt-1 w-full border-collapse">
          <caption className="sr-only">Le ultime settimane con pizze e ordini inseriti</caption>
          <thead>
            <tr>
              <th scope="col" className="etichettaMaiuscola pb-2 text-left">Settimana</th>
              <th scope="col" className="etichettaMaiuscola pb-2 text-right">Pizze</th>
              <th scope="col" className="etichettaMaiuscola pb-2 text-right">Ordini</th>
              <th scope="col" className="etichettaMaiuscola pb-2 text-right">Scontrino medio</th>
              {sedi.piu && <th scope="col" className="etichettaMaiuscola pb-2 text-right">Sedi</th>}
              <th scope="col" className="sr-only">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.settimana} className="border-t border-riga text-[15px]">
                <th scope="row" className="min-h-[48px] py-1.5 text-left font-bold">
                  {nomeSettimana(r.settimana)}
                  {r.settimana === correnteLunedi && <span className="ml-2 text-[12px] font-normal text-spento">(in modifica)</span>}
                </th>
                <td className="num py-1.5 text-right">{testoConteggio(r.pizze)}</td>
                <td className="num py-1.5 text-right">{testoConteggio(r.ordini)}</td>
                <td className="num py-1.5 text-right font-bold">{testoEuro(r.scontrinoMedioCent)}</td>
                {sedi.piu && (
                  <td className="py-1.5 text-right">
                    <ChipSedi inserite={r.inserite} totali={sedi.attive.length} />
                  </td>
                )}
                <td className="py-1.5 text-right">
                  <Link to={`${PERCORSO}?s=${r.settimana}`} className="inline-flex min-h-[44px] items-center px-2 font-bold text-verdescuro" aria-label={`Modifica la settimana ${nomeSettimana(r.settimana)}`}>
                    Modifica
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="m-0 mt-1 list-none p-0">
          {righe.map((r) => (
            <li key={r.settimana} className="flex min-h-[56px] items-center gap-3 border-t border-riga py-1.5">
              <div className="min-w-0 flex-1">
                <div className="font-bold">
                  {nomeSettimana(r.settimana)}
                  {sedi.piu && (
                    <span className="ml-2 align-middle">
                      <ChipSedi inserite={r.inserite} totali={sedi.attive.length} />
                    </span>
                  )}
                </div>
                <div className="num text-[13px] text-spento">
                  {testoConteggio(r.pizze)} pizze · {testoConteggio(r.ordini)} ordini · {testoEuro(r.scontrinoMedioCent)}
                </div>
              </div>
              <Link to={`${PERCORSO}?s=${r.settimana}`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-1 font-bold text-verdescuro" aria-label={`Modifica la settimana ${nomeSettimana(r.settimana)}`}>
                Modifica
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChipSedi({ inserite, totali }: { inserite: number; totali: number }) {
  const tutte = inserite >= totali;
  return (
    <span className={"inline-flex h-[24px] items-center whitespace-nowrap rounded-lg px-2 text-[12px] font-bold " + (tutte ? "bg-verdechiaro text-verdescuro" : "bg-ambrachiaro text-ambra")}>
      {inserite} su {totali}
    </span>
  );
}

// ---- il modulo ----

function Modulo({ lunedi, settimana, onVai }: { lunedi: string; settimana: Settimana; onVai: (lunedi: string) => void }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const avvisa = useAvviso();
  const sedi = useSedi();
  const larga = useLarghezzaMinima(LARGHEZZA_TABELLA);
  const righe = useMemo(() => righeModificabili(settimana, (id) => sedi.info(id)?.archiviata ?? false), [settimana, sedi]);
  const iniziali = useMemo(() => new Map(righe.map((r) => [r.sede.id, campiIniziali(r)])), [righe]);
  const [campi, setCampi] = useState<Record<number, CampiRiga>>(() => Object.fromEntries(iniziali));
  const [mostraErrori, setMostraErrori] = useState(false);
  const modificato = righe.some((r) => rigaModificata(iniziali.get(r.sede.id)!, campi[r.sede.id]!));
  const { blocker, consenti } = useBloccoUscita(modificato);
  const totale = totaleParziale(righe.map((r) => ({ ricaviCent: r.ricaviCent, campi: campi[r.sede.id]! })));

  const salva = useMutation({
    mutationFn: (voci: ReturnType<typeof preparaSalvataggio>["voci"]) => api.salvaSettimanaStatistiche({ settimana: lunedi, voci }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["statistiche"] }),
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });

  function cambia(id: number, parziale: Partial<CampiRiga>) {
    setCampi((c) => ({ ...c, [id]: { ...c[id]!, ...parziale } }));
  }

  async function invia() {
    setMostraErrori(true);
    const { voci, errori } = preparaSalvataggio(iniziali, new Map(Object.entries(campi).map(([k, v]) => [Number(k), v])));
    if (errori.size > 0) {
      avvisa("Controlla i campi segnati in rosso.", { tipo: "errore", posizione: "alto" });
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('input[aria-invalid="true"]')?.focus());
      return;
    }
    if (voci.length === 0) {
      avvisa("Nessuna modifica da salvare.");
      return;
    }
    try {
      await salva.mutateAsync(voci);
    } catch {
      return; // l'avviso d'errore e' gia' mostrato da onError
    }
    consenti();
    avvisa("Settimana salvata.");
    void navigate("/statistiche");
  }

  const parziale = totale.sediComplete < totale.sediTotali;
  return (
    <>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void invia();
        }}
        className="flex flex-col gap-3 md:gap-4"
      >
        <NavigatoreSettimana lunedi={lunedi} onVai={onVai} />

        {larga ? (
          <TabellaSedi righe={righe} campi={campi} mostraErrori={mostraErrori} onCambia={cambia} totale={totale} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {righe.map((r) => (
              <SchedaSede key={r.sede.id} riga={r} campi={campi[r.sede.id]!} mostraErrori={mostraErrori} onCambia={(p) => cambia(r.sede.id, p)} />
            ))}
          </div>
        )}

        {!larga && sedi.piu && (
          <section className="scheda bg-crema px-4 py-3.5 max-md:rounded-2xl" aria-label="Totale della settimana">
            <div className="etichettaMaiuscola">{parziale ? `Totale parziale, ${totale.sediComplete} sedi su ${totale.sediTotali}` : "Totale della settimana, tutte le sedi"}</div>
            <div className="num mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[14px] text-spento">
              <span>
                Pizze <b className="text-testo">{testoConteggio(totale.pizze)}</b>
              </span>
              <span>
                Ordini <b className="text-testo">{testoConteggio(totale.ordini)}</b>
              </span>
              <span>
                Scontrino <b className="text-testo">{totale.sediComplete === 0 ? "—" : testoEuro(totale.scontrinoMedioCent)}</b>
              </span>
            </div>
          </section>
        )}

        {/* Computer: i pulsanti dopo la tabella. Telefono: la barra fissa in fondo (come in Nuovo movimento). */}
        <div className="flex flex-wrap gap-3 max-md:hidden">
          <button type="submit" className="btn primario grande px-[22px]" disabled={salva.isPending}>
            {salva.isPending ? "Salvo…" : "Salva la settimana"}
          </button>
          <Link to="/statistiche" className="btn grande px-[22px]">
            Annulla
          </Link>
        </div>
        <div data-barra-fissa className="fixed inset-x-0 bottom-[var(--sotto-tastiera)] z-40 flex gap-2.5 border-t border-bordo bg-crema p-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:hidden">
          <Link to="/statistiche" className="btn min-h-[var(--d-barra)] px-5 text-[16px]">
            Annulla
          </Link>
          <button type="submit" className="btn primario min-h-[var(--d-barra)] flex-1 text-[17px]" disabled={salva.isPending}>
            {salva.isPending ? "Salvo…" : "Salva la settimana"}
          </button>
        </div>
      </form>
      <ConfermaUscita blocker={blocker} />
    </>
  );
}

export default function PizzeOrdini() {
  const [params, setParams] = useSearchParams();
  const sedi = useSedi();
  const richiesta = params.get("s");
  const lunedi = lunediDellaSettimana(richiesta && dataValida(richiesta) ? richiesta : null);
  // Sempre dati freschi quando si apre la schermata: il modulo parte da quello che c'e' nel servizio in quel momento.
  const q = useQuery({
    queryKey: chiavi.settimanaStatistiche(lunedi),
    queryFn: () => api.settimanaStatistiche(lunedi),
    enabled: sedi.pronto,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const vai = (nuovo: string) => setParams({ s: nuovo }, { replace: true });

  return (
    <div className="flex min-h-full flex-col">
      <Testata compatta titolo="Pizze e ordini" indietro="/statistiche" />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-28 pt-2 md:gap-4 md:px-8 md:pb-7 md:pt-0">
        {(q.isPending || !sedi.pronto) && (
          <>
            <NavigatoreSettimana lunedi={lunedi} onVai={vai} />
            <Caricamento />
          </>
        )}
        {q.isError && (
          <>
            <NavigatoreSettimana lunedi={lunedi} onVai={vai} />
            <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />
          </>
        )}
        {q.data && sedi.pronto && <Modulo key={lunedi} lunedi={lunedi} settimana={q.data} onVai={vai} />}
        <SettimaneInserite correnteLunedi={lunedi} />
      </div>
    </div>
  );
}
