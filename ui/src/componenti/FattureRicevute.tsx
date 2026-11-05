import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, messaggioErrore } from "../api/client";
import type { Movimento } from "../api/tipi";
import { useAvviso } from "../hooks/useAvviso";
import { dataRiga, euro } from "../util/formato";
import { fattureDaPagare, filtraDaPagare, raggruppaPerFornitore, riepilogoRicevute, testoNumeroFatture, voceDaPagare, type GruppoFornitore } from "../util/fattureRicevute";
import { dataScadenza, meseCorrente, nomeMeseAnno } from "../util/fatture";
import BadgePagata from "./BadgePagata";
import Finestra from "./Finestra";
import { IconaCarica, IconaGiu, IconaOrologio, IconaSpunta } from "./Icone";
import { Caricamento, ErroreCaricamento, Vuoto } from "./Stati";

// Le fatture ricevute dai fornitori in un mese, per controllare a fine mese cosa e' stato davvero pagato. I dati sono i movimenti dei
// costi variabili del mese (fatture e note di credito), raggruppati per fornitore: nessuna chiamata nuova oltre a «segna pagata».

// Dopo aver cambiato lo stato di una fattura cambiano l'elenco Movimenti, il dettaglio e il «Pagato / Da pagare» delle statistiche per voce.
function invalida(client: ReturnType<typeof useQueryClient>) {
  for (const k of ["movimenti", "movimento", "statistiche"]) void client.invalidateQueries({ queryKey: [k] });
}

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

function RigaFattura({ m, occupata, onCambia }: { m: Movimento; occupata: boolean; onCambia: (m: Movimento) => void }) {
  const nota = m.documento === "NOTA_DI_CREDITO";
  const numero = m.numeroDocumento ? `n. ${m.numeroDocumento}` : "senza numero";
  const nome = `${nota ? "Nota di credito" : "Fattura"} ${numero} del ${dataRiga(m.data, false)}`;
  return (
    <li className="flex items-center gap-2 border-t border-riga px-3 py-1 md:gap-4 md:px-5">
      <span className="num w-[44px] shrink-0 text-[14px] text-spento">{dataRiga(m.data, false)}</span>
      <Link to={`/movimenti/${m.id}`} state={{ da: "/statistiche/fatture?scheda=ricevute" }} className="min-w-0 flex-1 py-2 text-inherit no-underline" aria-label={`${nome}. Apri il dettaglio`}>
        <span className="block truncate text-[15px] font-bold">{nota ? "Nota di credito" : (m.numeroDocumento ?? "Fattura")}</span>
        {nota && m.numeroDocumento && <span className="block truncate text-[12.5px] text-spento">{m.numeroDocumento}</span>}
      </Link>
      <span className="num shrink-0 text-right text-[15px] font-bold">{nota ? `−${euro(m.importoCent)}` : euro(m.importoCent)}</span>
      {nota ? (
        <span className="flex min-h-[44px] w-[104px] shrink-0 items-center justify-end text-[12px] text-spento">riduce il totale</span>
      ) : (
        <button
          type="button"
          className="flex min-h-[44px] w-[104px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 hover:brightness-95 disabled:opacity-60"
          aria-label={`${nome}, ${euro(m.importoCent)}: ${m.pagata ? "Pagata. Segna come da pagare" : "Da pagare. Segna come pagata"}`}
          title={m.pagata ? "Segna come da pagare" : "Segna come pagata"}
          disabled={occupata}
          onClick={() => onCambia(m)}
        >
          <BadgePagata pagata={m.pagata} className="w-full justify-center" />
        </button>
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
  onCambia: (m: Movimento) => void;
  onTuttePagate: (g: GruppoFornitore) => void;
}

function SchedaFornitore({ g, aperto, onApriChiudi, occupataId, onCambia, onTuttePagate }: ProprietaFornitore) {
  const idElenco = useId();
  const aPosto = g.nDaPagare === 0;
  return (
    <li className="scheda overflow-hidden p-0 max-md:rounded-2xl">
      <button type="button" className="flex min-h-[64px] w-full items-center gap-3 border-0 bg-transparent px-3.5 py-2 text-left hover:bg-sabbia md:px-5" aria-expanded={aperto} aria-controls={idElenco} onClick={onApriChiudi}>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words text-[16px] font-bold leading-snug">{g.nome}</span>
            <span className="num shrink-0 text-[16px] font-bold">{euro(g.totaleCent)}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] leading-snug">
            <span className="text-spento">{testoNumeroFatture(g.nDaPagare + g.nPagate)}</span>
            <span className={"num inline-flex items-center gap-1 font-bold " + (aPosto ? "text-verdescuro" : "text-spento")}>
              <IconaSpunta larghezza={13} spessoreTratto={2.5} />
              Pagato {euro(g.pagataCent)}
            </span>
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
            {g.voci.map((m) => (
              <RigaFattura key={m.id} m={m} occupata={occupataId === m.id} onCambia={onCambia} />
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
  const [soloDaPagare, setSoloDaPagare] = useState(false);
  const [aperti, setAperti] = useState<ReadonlySet<number | null>>(new Set());
  const [conferma, setConferma] = useState<GruppoFornitore | null>(null);

  const filtro = { da: `${mese}-01`, a: dataScadenza(mese, 31)!, tipo: "COSTO_VARIABILE" as const };
  const q = useQuery({ queryKey: chiavi.movimenti(filtro), queryFn: () => api.movimenti(filtro) });
  const tutti = useMemo(() => raggruppaPerFornitore(q.data?.elementi ?? []), [q.data]);
  const riepilogo = useMemo(() => riepilogoRicevute(tutti), [tutti]);
  const visibili = useMemo(() => (soloDaPagare ? filtraDaPagare(tutti) : tutti), [tutti, soloDaPagare]);

  const cambia = useMutation({
    mutationFn: (m: Movimento) => api.segnaPagata(m.id, !m.pagata),
    onSuccess: (r) => {
      invalida(client);
      avvisa(r.pagata ? "Fattura segnata come pagata." : "Fattura segnata come da pagare.");
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });

  const tutte = useMutation({
    mutationFn: async (g: GruppoFornitore) => {
      const daFare = fattureDaPagare(g);
      for (const m of daFare) await api.segnaPagata(m.id, true);
      return daFare.length;
    },
    onSuccess: (n, g) => {
      invalida(client);
      setConferma(null);
      avvisa(`${g.nome}: ${n === 1 ? "1 fattura segnata come pagata" : `${n} fatture segnate come pagate`}.`);
    },
    onError: (e) => {
      invalida(client);
      setConferma(null);
      avvisa(messaggioErrore(e), { tipo: "errore" });
    },
  });

  const alternaApertura = (id: number | null) =>
    setAperti((prima) => {
      const dopo = new Set(prima);
      if (!dopo.delete(id)) dopo.add(id);
      return dopo;
    });

  if (q.isPending) return <Caricamento />;
  if (q.isError) return <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />;

  if (tutti.length === 0) {
    return (
      <div className="scheda max-md:rounded-2xl">
        <Vuoto
          titolo={mese === meseCorrente() ? "Nessuna fattura ricevuta questo mese" : `Nessuna fattura ricevuta a ${nomeMeseAnno(mese).toLowerCase()}`}
          testo="Le fatture si aggiungono da Movimenti o importandole da XML."
          azione={
            <Link to="/movimenti/importa" className="btn primario grande no-underline">
              <IconaCarica larghezza={20} spessoreTratto={2} />
              <span>Importa fatture XML</span>
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
          type="button"
          aria-pressed={soloDaPagare}
          className={"inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[15px] font-bold " + (soloDaPagare ? "border-ambrabordo bg-ambrachiaro text-ambra" : "border-bordo2 bg-carta text-testo")}
          onClick={() => setSoloDaPagare((v) => !v)}
        >
          <IconaOrologio larghezza={16} spessoreTratto={2.25} />
          Solo da pagare
        </button>
        <Link to="/movimenti/importa" className="inline-flex min-h-[44px] items-center text-[14px] font-bold text-verdescuro underline">
          Importa fatture XML
        </Link>
      </div>
      {visibili.length === 0 ? (
        <p className="scheda m-0 mt-2.5 px-4 py-6 text-center text-[15px] font-bold text-verdescuro max-md:rounded-2xl">Tutte le fatture di questo mese sono pagate.</p>
      ) : (
        <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0 md:mt-3" aria-label="Fornitori">
          {visibili.map((g) => (
            <SchedaFornitore
              key={g.id ?? "senza"}
              g={g}
              aperto={aperti.has(g.id)}
              onApriChiudi={() => alternaApertura(g.id)}
              occupataId={cambia.isPending ? cambia.variables.id : null}
              onCambia={(m) => cambia.mutate(m)}
              onTuttePagate={setConferma}
            />
          ))}
        </ul>
      )}

      {conferma && (
        <Finestra
          titolo={`Segnare pagate le fatture di ${conferma.nome}?`}
          sottotitolo={`${testoNumeroFatture(conferma.nDaPagare)} da pagare, ${euro(conferma.daPagareCent)} in tutto, a ${nomeMeseAnno(mese).toLowerCase()}. Puoi ripensarci fattura per fattura.`}
          onChiudi={() => setConferma(null)}
          piede={
            <div className="flex w-full gap-3">
              <button type="button" className="btn max-md:flex-1" data-focus-iniziale onClick={() => setConferma(null)}>
                Annulla
              </button>
              <button type="button" className="btn primario max-md:flex-1" disabled={tutte.isPending} onClick={() => tutte.mutate(conferma)}>
                Segna pagate
              </button>
            </div>
          }
        />
      )}
    </>
  );
}
