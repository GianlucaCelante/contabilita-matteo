import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, messaggioErrore } from "../api/client";
import type { FiltroMovimenti } from "../api/tipi";
import { useAvviso } from "../hooks/useAvviso";
import { useSedi } from "../hooks/useSedi";
import { invalidaPagamenti } from "../hooks/useSegnaPagata";
import { dataRiga, euro } from "../util/formato";
import { avvisoErroreSegna, fattureDaPagare, filtraDaPagare, mostraPagato, partiDaSegnare, raggruppaPerFornitore, riepilogoRicevute, segnaInSerie, testoConfermaTutte, testoDivisa, testoNumeroFatture, voceDaPagare, type FatturaRicevuta, type GruppoFornitore } from "../util/fattureRicevute";
import { dataScadenza, meseCorrente, nomeMeseAnno } from "../util/fatture";
import { esitoRigaAttesa, fuocoPerso, vicinoDi } from "../util/fuoco";
import BadgePagata from "./BadgePagata";
import BadgeSede from "./BadgeSede";
import Conferma from "./Conferma";
import { IconaCarica, IconaDestra, IconaGiu, IconaOrologio, IconaSpunta } from "./Icone";
import { Caricamento, ErroreCaricamento, Vuoto } from "./Stati";

// Le fatture ricevute dai fornitori in un mese, per controllare a fine mese cosa e' stato davvero pagato. I dati sono i movimenti dei
// costi variabili del mese (fatture e note di credito) delle sedi scelte, raggruppati per fornitore: nessuna chiamata nuova oltre a
// «segna pagata».

// I fornitori aperti, mese per mese: restano aperti quando si apre una fattura e si torna indietro (finche' l'app e' aperta).
const NESSUNO: ReadonlySet<number | null> = new Set();
let apertiPerMese: ReadonlyMap<string, ReadonlySet<number | null>> = new Map();

// Il nome di un fornitore nell'elenco (anche per «Senza fornitore», che ha id null): la chiave di React e l'attributo `data-fornitore`
// della sua riga, a cui torna il fuoco dopo «Segna tutte pagate».
const chiaveFornitore = (g: GruppoFornitore) => String(g.id ?? "senza");

// ---- il riepilogo in cima ----

function CasellaRiepilogo({ pagate, importo, numero }: { pagate: boolean; importo: number; numero: number }) {
  const Icona = pagate ? IconaSpunta : IconaOrologio;
  const evidenza = !pagate && numero > 0;
  return (
    <div className={"scheda min-w-0 px-3 py-2 max-md:rounded-2xl md:px-5 md:py-3.5 " + (evidenza ? "!border-ambrabordo !bg-ambrachiaro" : "")}>
      <div className={"etichettaMaiuscola flex items-center gap-1.5 " + (evidenza ? "!text-ambra" : pagate ? "!text-verdescuro" : "")}>
        <Icona larghezza={14} spessoreTratto={2.5} />
        {pagate ? "Pagate" : "Da pagare"}
      </div>
      <div className={"num font-titolo text-[22px] font-bold leading-tight md:text-[28px] " + (evidenza ? "text-ambra" : "")}>{euro(importo)}</div>
      <div className="num text-[12px] text-spento md:text-[13px]">{testoNumeroFatture(numero)}</div>
    </div>
  );
}

// ---- una fattura di un fornitore ----

// Una riga per fattura. Una fattura divisa fra sedi (piu' movimenti, uno per sede: util/fattureRicevute.ts) e' una riga sola con il
// totale e «divisa fra Via Roma e Lungomare»; sotto, una riga piccola per sede porta al dettaglio di quella parte. Il badge segna
// pagate (o da pagare) tutte le parti insieme. `conSede`: con piu' sedi anche una fattura non divisa dice di che sede e'.
function RigaFattura({ f, occupata, onCambia, daDove, conSede }: { f: FatturaRicevuta; occupata: boolean; onCambia: (f: FatturaRicevuta) => void; daDove: string; conSede: boolean }) {
  const { nota } = f;
  const primo = f.parti[0]!;
  const divisa = testoDivisa(f);
  const numero = f.numeroDocumento ? `n. ${f.numeroDocumento}` : "senza numero";
  const nome = `${nota ? "Nota di credito" : "Fattura"} ${numero} del ${dataRiga(f.data, false)}${divisa ? `, ${divisa}` : ""}`;
  const testo = (
    <>
      <span className="block text-[15px] font-bold leading-snug [overflow-wrap:anywhere]">{nota ? "Nota di credito" : (f.numeroDocumento ?? "Fattura")}</span>
      {nota && f.numeroDocumento && <span className="block text-[12.5px] leading-snug text-spento [overflow-wrap:anywhere]">{f.numeroDocumento}</span>}
      <span className="num block whitespace-nowrap text-[12.5px] leading-snug text-spento md:hidden">{dataRiga(f.data, false)}</span>
      {divisa ? (
        <span className="block text-[12.5px] leading-snug text-spento">
          {divisa}
          {f.pagataInParte && " · pagata in parte"}
        </span>
      ) : (
        conSede && <span className="block text-[12.5px] leading-snug text-spento">{primo.sede.nome}</span>
      )}
    </>
  );
  return (
    <li data-fattura={f.id} className="border-t border-riga">
      <div className="flex items-center gap-2 px-3 py-1 md:gap-4 md:px-5">
        <span className="num w-[44px] shrink-0 whitespace-nowrap text-[14px] text-spento max-md:hidden">{dataRiga(f.data, false)}</span>
        {/* Numero e data per intero, mai con i puntini: un numero lungo va a capo. Sul telefono la data sta sotto il numero, che cosi' ha piu' posto. */}
        {divisa ? (
          <span className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center py-1">{testo}</span>
        ) : (
          <Link to={`/movimenti/${primo.id}`} state={{ da: daDove }} className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center py-1 text-inherit no-underline" aria-label={`${nome}. Apri il dettaglio`}>
            {testo}
          </Link>
        )}
        <span className="num shrink-0 text-right text-[15px] font-bold">{nota ? `−${euro(f.importoCent)}` : euro(f.importoCent)}</span>
        {nota ? (
          <span className="flex min-h-[44px] w-[104px] shrink-0 items-center justify-end text-[12px] text-spento">riduce il totale</span>
        ) : (
          <button
            type="button"
            className="flex min-h-[44px] w-[104px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 hover:brightness-95 aria-disabled:opacity-60"
            aria-label={`${nome}, ${euro(f.importoCent)}: ${f.pagata ? "Pagata. Segna come da pagare" : "Da pagare. Segna come pagata"}`}
            title={f.pagata ? "Segna come da pagare" : "Segna come pagata"}
            // Mentre salva non e' `disabled` (un pulsante spento perde il fuoco, che finirebbe su <body>): si ignora il secondo tocco.
            aria-disabled={occupata || undefined}
            onClick={() => {
              if (!occupata) onCambia(f);
            }}
          >
            <BadgePagata pagata={f.pagata} className="w-full justify-center" />
          </button>
        )}
      </div>
      {divisa && (
        <ul className="m-0 list-none p-0 pb-1" aria-label={`Le parti della ${nota ? "nota di credito" : "fattura"} ${numero}, una per sede`}>
          {f.parti.map((p) => (
            <li key={p.id}>
              <Link
                to={`/movimenti/${p.id}`}
                state={{ da: daDove }}
                className="flex min-h-[44px] items-center gap-2 px-3 text-[14px] text-inherit no-underline hover:bg-sabbia md:gap-4 md:pl-[80px] md:pr-5"
                aria-label={`${p.sede.nome}, ${euro(p.importoCent)}. Apri il dettaglio`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <BadgeSede id={p.sede.id} taglia="piccolo" decorativo />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{p.sede.nome}</span>
                </span>
                <span className="num shrink-0 text-right text-spento">{nota ? `−${euro(p.importoCent)}` : euro(p.importoCent)}</span>
                <span className="flex w-[104px] shrink-0 justify-end text-spento">
                  <IconaDestra larghezza={16} spessoreTratto={2} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ---- un fornitore ----

interface ProprietaFornitore {
  g: GruppoFornitore;
  aperto: boolean;
  onApriChiudi: () => void;
  occupataId: number | null;
  onCambia: (f: FatturaRicevuta) => void;
  onTuttePagate: (g: GruppoFornitore) => void;
  // L'indirizzo di questa scheda com'e' adesso (mese, «Solo da pagare»): ci riporta la freccia indietro del movimento.
  daDove: string;
  conSede: boolean;
}

function SchedaFornitore({ g, aperto, onApriChiudi, occupataId, onCambia, onTuttePagate, daDove, conSede }: ProprietaFornitore) {
  const idElenco = useId();
  const aPosto = g.nDaPagare === 0;
  return (
    <li className="scheda overflow-hidden p-0 max-md:rounded-2xl">
      <button type="button" data-fornitore={chiaveFornitore(g)} className="flex min-h-[64px] w-full items-center gap-3 border-0 bg-transparent px-3.5 py-2 text-left hover:bg-sabbia md:px-5" aria-expanded={aperto} aria-controls={idElenco} onClick={onApriChiudi}>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words text-[16px] font-bold leading-snug">{g.nome}</span>
            <span className="num shrink-0 text-[16px] font-bold">{euro(g.totaleCent)}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] leading-snug">
            <span className="text-spento">{testoNumeroFatture(g.nDaPagare + g.nPagate)}</span>
            {mostraPagato(g.pagataCent) && (
              <span className={"num inline-flex items-center gap-1 font-bold " + (aPosto ? "text-verdescuro" : "text-spento")}>
                <IconaSpunta larghezza={13} spessoreTratto={2.5} />
                Pagato {euro(g.pagataCent)}
              </span>
            )}
            {(() => {
              const d = voceDaPagare(g.daPagareCent);
              if (!d) return null;
              return d.credito ? (
                <span className="num inline-flex items-center gap-1 font-bold text-spento">
                  {d.etichetta} {euro(d.importoCent)}
                </span>
              ) : (
                <span className={"num inline-flex items-center gap-1 font-bold " + (g.nDaPagare > 0 ? "text-ambra" : "text-spento")}>
                  <IconaOrologio larghezza={13} spessoreTratto={2.5} />
                  {d.etichetta} {euro(d.importoCent)}
                </span>
              );
            })()}
          </span>
        </span>
        <IconaGiu larghezza={20} spessoreTratto={2} className={"shrink-0 text-spento transition-transform " + (aperto ? "rotate-180" : "")} />
      </button>
      {aperto && (
        <div id={idElenco}>
          <ul className="m-0 list-none p-0" aria-label={`Fatture di ${g.nome}`}>
            {g.fatture.map((f) => (
              <RigaFattura key={f.id} f={f} occupata={occupataId === f.id} onCambia={onCambia} daDove={daDove} conSede={conSede} />
            ))}
          </ul>
          {g.nDaPagare > 0 && (
            <div className="border-t border-riga px-3 py-2 md:px-5">
              <button type="button" className="btn w-full md:w-auto" onClick={() => onTuttePagate(g)}>
                <IconaSpunta larghezza={18} spessoreTratto={2.25} />
                <span>Segna tutte pagate</span>
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ---- la scheda «Ricevute» ----

export default function FattureRicevute({ mese }: { mese: string }) {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const sedi = useSedi();
  const posizione = useLocation();
  const qui = posizione.pathname + posizione.search;
  // «Solo da pagare» sta nell'indirizzo (?solo=1): resta dopo aver aperto una fattura ed essere tornati indietro.
  const [parametri, setParametri] = useSearchParams();
  const soloDaPagare = parametri.get("solo") === "1";
  const alternaSolo = () =>
    setParametri(
      (prec) => {
        const p = new URLSearchParams(prec);
        if (p.get("solo") === "1") p.delete("solo");
        else p.set("solo", "1");
        return p;
      },
      { replace: true },
    );
  const [apertiDeiMesi, setApertiDeiMesi] = useState(apertiPerMese);
  const aperti = apertiDeiMesi.get(mese) ?? NESSUNO;
  const [conferma, setConferma] = useState<GruppoFornitore | null>(null);

  const filtro: FiltroMovimenti = { da: `${mese}-01`, a: dataScadenza(mese, 31)!, tipo: "COSTO_VARIABILE", ...(sedi.parametro ? { sedi: sedi.parametro } : {}) };
  const q = useQuery({ queryKey: chiavi.movimenti(filtro), queryFn: () => api.movimenti(filtro), enabled: sedi.pronto });
  const tutti = useMemo(() => raggruppaPerFornitore(q.data?.elementi ?? []), [q.data]);
  const riepilogo = useMemo(() => riepilogoRicevute(tutti), [tutti]);
  const visibili = useMemo(() => (soloDaPagare ? filtraDaPagare(tutti) : tutti), [tutti, soloDaPagare]);

  // «Segna pagata / da pagare» di una fattura: come useSegnaPagata, ma una fattura divisa fra sedi cambia in tutte le sue parti (una
  // pagata in parte diventa pagata tutta). Resta «in corso» finche' l'elenco non e' riletto. Se una parte non si salva l'elenco si
  // rilegge lo stesso, cosi' si vede cosa e' rimasto, e se altre erano gia' riuscite l'avviso e' «Segnata solo in parte: riprova.».
  const cambia = useMutation({
    mutationFn: async (f: FatturaRicevuta) => {
      const { pagata, parti } = partiDaSegnare(f);
      await segnaInSerie(parti, (p) => api.segnaPagata(p.id, pagata));
      return pagata;
    },
    onSuccess: (pagata) => {
      avvisa(pagata ? "Fattura segnata come pagata." : "Fattura segnata come da pagare.");
      return invalidaPagamenti(client);
    },
    onError: (e) => {
      avvisa(avvisoErroreSegna(e, false) ?? messaggioErrore(e), { tipo: "errore" });
      return invalidaPagamenti(client);
    },
  });

  const tutte = useMutation({
    mutationFn: async (g: GruppoFornitore) => {
      // Tutte le parti ancora da pagare (anche quelle di una fattura divisa fra sedi); il numero detto nell'avviso e' quello delle fatture.
      await segnaInSerie(fattureDaPagare(g), (m) => api.segnaPagata(m.id, true));
      return g.nDaPagare;
    },
    onSuccess: (n, g) => {
      void invalidaPagamenti(client);
      // «Segna tutte pagate» sta per sparire (e con «Solo da pagare» sparisce tutto il fornitore): il fuoco va sulla riga del
      // fornitore, o su quella vicina se la sua non resta.
      const chiave = chiaveFornitore(g);
      fuocoDopo.current = { fornitore: soloDaPagare ? vicinoDi(visibili.map(chiaveFornitore), chiave) : chiave };
      setConferma(null);
      avvisa(`${g.nome}: ${n === 1 ? "1 fattura segnata come pagata" : `${n} fatture segnate come pagate`}.`);
    },
    onError: (e) => {
      void invalidaPagamenti(client);
      setConferma(null);
      avvisa(avvisoErroreSegna(e, true) ?? messaggioErrore(e), { tipo: "errore" });
    },
  });

  // Dove va il fuoco quando la conferma di «Segna tutte pagate» si chiude dopo aver salvato. Si sposta in un effetto di layout, cioe'
  // dopo che la finestra ha tolto «inert» alla pagina e prima che useModale lo restituisca al pulsante che l'aveva aperta (useModale
  // non tocca un fuoco gia' messo altrove): quel pulsante sparisce appena arrivano i dati nuovi, e il fuoco finirebbe su <body>.
  const fuocoDopo = useRef<{ fornitore: string | null } | null>(null);
  const rifElenco = useRef<HTMLUListElement>(null);
  const rifSolo = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (conferma || !fuocoDopo.current) return;
    const { fornitore } = fuocoDopo.current;
    fuocoDopo.current = null;
    const riga = fornitore === null ? null : rifElenco.current?.querySelector<HTMLElement>(`[data-fornitore="${fornitore}"]`);
    // Nessun fornitore resta in elenco: il fuoco va su «Solo da pagare», che c'e' sempre.
    (riga ?? rifSolo.current)?.focus();
  }, [conferma]);

  // Una fattura segnata pagata con «Solo da pagare» acceso esce dall'elenco, e con lei il pulsante che aveva il fuoco: quando la sua
  // riga non c'e' piu', se il fuoco si e' perso va sulla riga del fornitore (o sul fornitore vicino, se anche lui esce dall'elenco).
  const fuocoDopoRiga = useRef<{ fattura: number; fornitore: string | null } | null>(null);
  function cambiaUna(f: FatturaRicevuta) {
    // Una alla volta: un secondo badge toccato mentre il primo salva si ignora (lo stato resta «in corso» finche' l'elenco non e'
    // riletto), cosi' l'attesa qui sotto riguarda sempre una fattura sola e non viene sovrascritta.
    if (cambia.isPending) return;
    const gruppo = visibili.find((g) => g.fatture.some((v) => v.id === f.id));
    if (soloDaPagare && !f.pagata && gruppo) {
      const chiave = chiaveFornitore(gruppo);
      fuocoDopoRiga.current = { fattura: f.id, fornitore: gruppo.nDaPagare > 1 ? chiave : vicinoDi(visibili.map(chiaveFornitore), chiave) };
    } else fuocoDopoRiga.current = null;
    cambia.mutate(f);
  }
  useEffect(() => {
    const dopo = fuocoDopoRiga.current;
    if (!dopo) return;
    const esito = esitoRigaAttesa(!!rifElenco.current?.querySelector(`[data-fattura="${dopo.fattura}"]`), cambia.isPending);
    if (esito === "aspetta") return;
    // «annulla»: il salvataggio e' finito e la riga c'e' ancora (e' fallito): non c'e' piu' niente da aspettare.
    fuocoDopoRiga.current = null;
    if (esito === "annulla" || !fuocoPerso(document.activeElement)) return;
    const riga = dopo.fornitore === null ? null : rifElenco.current?.querySelector<HTMLElement>(`[data-fornitore="${dopo.fornitore}"]`);
    (riga ?? rifSolo.current)?.focus();
  }, [visibili, cambia.isPending]);

  const alternaApertura = (id: number | null) => {
    const dopo = new Set(aperti);
    if (!dopo.delete(id)) dopo.add(id);
    apertiPerMese = new Map(apertiPerMese).set(mese, dopo);
    setApertiDeiMesi(apertiPerMese);
  };

  if (q.isPending || !sedi.pronto) return <Caricamento />;
  if (q.isError) return <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />;

  if (tutti.length === 0) {
    return (
      <div className="scheda max-md:rounded-2xl">
        <Vuoto
          titolo={mese === meseCorrente() ? "Nessuna fattura ricevuta questo mese" : `Nessuna fattura ricevuta a ${nomeMeseAnno(mese).toLowerCase()}`}
          testo="Le fatture si aggiungono da Movimenti o importando le fatture elettroniche."
          azione={
            <Link to="/movimenti/importa" state={{ da: qui }} className="btn primario grande no-underline">
              <IconaCarica larghezza={20} spessoreTratto={2} />
              <span>Importa fatture elettroniche</span>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:gap-4" role="group" aria-label={`Fatture ricevute a ${nomeMeseAnno(mese)}`}>
        <CasellaRiepilogo pagate={false} importo={riepilogo.daPagareCent} numero={riepilogo.nDaPagare} />
        <CasellaRiepilogo pagate importo={riepilogo.pagateCent} numero={riepilogo.nPagate} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 md:mt-4">
        <button
          ref={rifSolo}
          type="button"
          aria-pressed={soloDaPagare}
          className={"inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[15px] font-bold " + (soloDaPagare ? "border-ambrabordo bg-ambrachiaro text-ambra" : "border-bordo2 bg-carta text-testo")}
          onClick={alternaSolo}
        >
          <IconaOrologio larghezza={16} spessoreTratto={2.25} />
          Solo da pagare
        </button>
        <Link to="/movimenti/importa" state={{ da: qui }} className="inline-flex min-h-[44px] items-center text-[14px] font-bold text-verdescuro underline">
          Importa fatture elettroniche
        </Link>
      </div>
      {visibili.length === 0 ? (
        <p className="scheda m-0 mt-2.5 px-4 py-6 text-center text-[15px] font-bold text-verdescuro max-md:rounded-2xl">Tutte le fatture di questo mese sono pagate.</p>
      ) : (
        <ul ref={rifElenco} className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0 md:mt-3" aria-label="Fornitori">
          {visibili.map((g) => (
            <SchedaFornitore
              key={chiaveFornitore(g)}
              g={g}
              aperto={aperti.has(g.id)}
              onApriChiudi={() => alternaApertura(g.id)}
              occupataId={cambia.isPending ? cambia.variables.id : null}
              onCambia={cambiaUna}
              onTuttePagate={setConferma}
              daDove={qui}
              conSede={sedi.piu}
            />
          ))}
        </ul>
      )}

      {conferma && (
        <Conferma
          titolo={`Segnare pagate le fatture di ${conferma.nome}?`}
          sottotitolo={testoConfermaTutte(conferma, nomeMeseAnno(mese).toLowerCase())}
          onAnnulla={() => setConferma(null)}
          occupato={tutte.isPending}
          azione={{ etichetta: "Segna pagate", stile: "primario", onClick: () => tutte.mutate(conferma) }}
        />
      )}
    </>
  );
}
