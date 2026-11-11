import { useId, useState } from "react";
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
import Conferma from "../componenti/Conferma";
import { IconaDestra, IconaSinistra } from "../componenti/Icone";
import { Caricamento, ErroreCaricamento } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { dataValida, etichettaIntervallo, euro, oggiIso } from "../util/formato";
import {
  badgeSede,
  nomeGiorno,
  nomeGiornoBreve,
  preparaPiano,
  riassuntoSede,
  righeDelModo,
  scontrinoGiorno,
  cambiaModo,
  giornoFuturo,
  salvaPiano,
  modificheNellAltroModo,
  sedeModificata,
  statoIniziale,
  testoSovrascrittura,
  type ModoInserimento,
  type PianoSalvataggio,
  type StatoSede,
} from "../util/pizzeOrdini";
import {
  domenicaDi,
  intervalloUltimeSettimane,
  lunediDellaSettimana,
  nomeRelativoSettimana,
  numeroSettimanaIso,
  puoAndareAvanti,
  righeModificabili,
  settimaneInserite,
  spostaSettimana,
  testoConteggio,
  testoPizzePerOrdine,
  titoloTotaleSettimana,
  totaleParziale,
  validaRiga,
  type CampiRiga,
  type RiassuntoRighe,
} from "../util/statistiche";

// Sotto questa larghezza una scheda per sede con i giorni in colonna; da qui in su i giorni in orizzontale (sotto i 1024 px non entrano).
const LARGHEZZA_TABELLA = 1024;
const PERCORSO = "/statistiche/pizze-ordini";

const testoEuro = (cent: number | null) => (cent === null ? "—" : euro(cent));

// «Totale inserito», «5 giorni su 7» o «Da inserire» (badgeSede): mai «Completa», la settimana puo' essere in corso.
function Stato({ testo, inserito }: { testo: string; inserito: boolean }) {
  return (
    <span className={"inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 text-[12px] font-bold " + (inserito ? "bg-verdechiaro text-verdescuro" : "bg-ambrachiaro text-ambra")}>
      {testo}
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

// ---- i campi ----

function CampoNumero({
  etichetta,
  valore,
  errore,
  onCambia,
  stretto = false,
  descrittoDa,
  className = "",
  futuro = false,
}: {
  // Per lo screen reader: «Pizze Lunedì 9, Via Roma».
  etichetta: string;
  valore: string;
  errore: string | null;
  onCambia: (v: string) => void;
  // I campi dei giorni: meno spazio ai lati (a 320 px ne stanno due per riga accanto al giorno).
  stretto?: boolean;
  // I campi dei giorni: il testo dell'errore sta sotto tutta la riga (o sotto la tabella), con questo id; il campo resta solo rosso.
  descrittoDa?: string;
  className?: string;
  // Un giorno dopo oggi: il campo e' spento («non ancora»).
  futuro?: boolean;
}) {
  const idProprio = useId();
  const idErrore = descrittoDa ?? idProprio;
  return (
    <div className={"min-w-0 " + className}>
      <label className={"campo" + (stretto ? " !min-h-[48px] !px-2.5" : "") + (errore ? " errore" : "") + (futuro ? " opacity-60" : "")}>
        <input
          className="num"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={futuro}
          placeholder={futuro ? "—" : stretto ? "" : "0"}
          aria-label={futuro ? `${etichetta}, non ancora` : etichetta}
          aria-invalid={errore ? true : undefined}
          aria-describedby={errore ? idErrore : undefined}
          value={valore}
          onChange={(e) => onCambia(e.target.value)}
        />
      </label>
      {errore && !descrittoDa && (
        <p id={idErrore} role="alert" className="m-0 mt-1 text-[13px] font-bold leading-snug text-rosso">
          {errore}
        </p>
      )}
    </div>
  );
}

// Gli errori di un giorno, uniti in una frase: «Pizze: … Ordini: …» (o uno solo).
function testoErroriGiorno(errorePizze: string | null, erroreOrdini: string | null): string | null {
  if (errorePizze && erroreOrdini) return `Pizze: ${errorePizze} Ordini: ${erroreOrdini}`;
  return errorePizze ?? erroreOrdini;
}

// «Giorno per giorno» / «Totale della settimana».
function SceltaModo({ nome, modo, onCambia }: { nome: string; modo: ModoInserimento; onCambia: (m: ModoInserimento) => void }) {
  return (
    <div className="segmenti max-md:flex max-md:w-full" role="group" aria-label={`Come inserisci ${nome}`}>
      {(
        [
          ["GIORNI", "Giorno per giorno"],
          ["SETTIMANA", "Totale della settimana"],
        ] as const
      ).map(([valore, testo]) => (
        <button
          key={valore}
          type="button"
          aria-pressed={modo === valore}
          onClick={() => onCambia(valore)}
          className="max-md:min-w-0 max-md:flex-1 max-md:justify-center max-md:whitespace-normal max-md:px-2 max-md:text-center max-md:text-[14px] max-md:leading-tight"
        >
          <span className="text-center">{testo}</span>
        </button>
      ))}
    </div>
  );
}

// L'avviso quando il modo scelto non e' quello salvato: salvando con i numeri i dati dell'altro modo si cancellano.
function AvvisoAltroModo({ riga, modo }: { riga: RigaSettimana; modo: ModoInserimento }) {
  if (riga.fonte === null || riga.fonte === modo) return null;
  const testo =
    riga.fonte === "GIORNI"
      ? `Ci ${riga.giorniInseriti === 1 ? "è 1 giorno inserito" : `sono ${riga.giorniInseriti} giorni inseriti`}: salvando un totale della settimana ${riga.giorniInseriti === 1 ? "si cancella" : "si cancellano"}.`
      : `C'è un totale della settimana (${testoConteggio(riga.pizze ?? 0)} pizze, ${testoConteggio(riga.ordini ?? 0)} ordini): salvando dei giorni si cancella.`;
  return <p className="m-0 rounded-xl bg-ambrachiaro px-3 py-2 text-[13px] font-bold leading-snug text-ambra">{testo}</p>;
}

interface ProprietaSede {
  riga: RigaSettimana;
  stato: StatoSede;
  mostraErrori: boolean;
  onModo: (m: ModoInserimento) => void;
  onGiorno: (indice: number, parziale: Partial<CampiRiga>) => void;
  onSettimana: (parziale: Partial<CampiRiga>) => void;
}

// Il riassunto della sede sotto i campi: «Settimana: 312 pizze · 98 ordini · scontrino € 24,50».
function RiassuntoSede({ riga, stato, riassunto }: { riga: RigaSettimana; stato: StatoSede; riassunto: RiassuntoRighe }) {
  if (stato.modo === "SETTIMANA") {
    return (
      <p className="num m-0 text-[13px] text-spento" aria-live="polite">
        Ricavi della settimana {euro(riga.ricaviTotaliCent)} · scontrino medio <b className="whitespace-nowrap text-testo">{testoEuro(riassunto.scontrinoMedioCent)}</b>
      </p>
    );
  }
  return (
    <p className="num m-0 text-[13px] text-spento" aria-live="polite">
      Settimana: <b className="text-testo">{testoConteggio(riassunto.pizze)}</b> pizze · <b className="text-testo">{testoConteggio(riassunto.ordini)}</b> ordini · scontrino medio{" "}
      <b className="whitespace-nowrap text-testo">{testoEuro(riassunto.scontrinoMedioCent)}</b>
      {riassunto.inserite > 0 && riassunto.inserite < 7 && <> (sui ricavi {riassunto.inserite === 1 ? "del giorno inserito" : `dei ${riassunto.inserite} giorni inseriti`})</>}
    </p>
  );
}

// La nota discreta sotto i giorni: lo scontrino di un giorno divide gli incassi registrati in quel giorno per i suoi ordini.
function NotaScontrinoGiorno() {
  return <p className="m-0 mt-2 text-[12px] leading-snug text-spento">Lo scontrino del giorno è giusto se gli incassi sono registrati nello stesso giorno.</p>;
}

const NESSUN_INCASSO = "nessun incasso registrato in questo giorno";

// Telefono e tablet: i sette giorni in colonna, ogni giorno su una riga con pizze e ordini e sotto ricavi e scontrino del giorno.
function GiorniInColonna({ riga, stato, mostraErrori, onGiorno }: Omit<ProprietaSede, "onModo" | "onSettimana">) {
  const nome = riga.sede.nome;
  const oggi = oggiIso();
  const base = useId();
  return (
    <div>
      <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 pb-1" aria-hidden="true">
        <span />
        <span className="etichettaMaiuscola">Pizze</span>
        <span className="etichettaMaiuscola">Ordini</span>
      </div>
      <ol className="m-0 list-none p-0">
        {riga.giorni.map((g, i) => {
          const campi = stato.giorni[i]!;
          const e = validaRiga(campi);
          const scontrino = scontrinoGiorno(g.ricaviTotaliCent, campi);
          const etichetta = `${nomeGiorno(i, g.data)}, ${nome}`;
          const errore = mostraErrori ? testoErroriGiorno(e.errorePizze, e.erroreOrdini) : null;
          const idErrore = `${base}-${i}`;
          const futuro = giornoFuturo(g.data, oggi);
          return (
            <li key={g.data} className="grid grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 border-t border-riga py-1.5">
              <div className="flex flex-col justify-center leading-tight">
                <b className="text-[15px]">{nomeGiornoBreve(i)}</b>
                <span className="num text-[13px] text-spento">{Number(g.data.slice(8, 10))}</span>
              </div>
              <CampoNumero stretto futuro={futuro} descrittoDa={idErrore} etichetta={`Pizze ${etichetta}`} valore={campi.pizze} errore={mostraErrori ? e.errorePizze : null} onCambia={(v) => onGiorno(i, { pizze: v })} />
              <CampoNumero stretto futuro={futuro} descrittoDa={idErrore} etichetta={`Ordini ${etichetta}`} valore={campi.ordini} errore={mostraErrori ? e.erroreOrdini : null} onCambia={(v) => onGiorno(i, { ordini: v })} />
              {errore && (
                <p id={idErrore} role="alert" className="col-start-2 col-end-4 m-0 mt-1 text-[13px] font-bold leading-snug text-rosso">
                  {errore}
                </p>
              )}
              {futuro ? (
                <p className="col-start-2 col-end-4 m-0 mt-0.5 text-[12px] leading-snug text-spento">non ancora</p>
              ) : (
              <p className="num col-start-2 col-end-4 m-0 mt-0.5 text-[12px] leading-snug text-spento">
                Ricavi {euro(g.ricaviTotaliCent)}
                {scontrino.valoreCent !== null && (
                  <>
                    {" "}
                    · scontrino <b className="text-testo">{euro(scontrino.valoreCent)}</b>
                  </>
                )}
                {scontrino.senzaIncassi && (
                  <>
                    {" "}
                    · scontrino <b className="text-testo">—</b> <span className="font-bold text-ambra">({NESSUN_INCASSO})</span>
                  </>
                )}
              </p>
              )}
            </li>
          );
        })}
      </ol>
      {/* Detto una volta sola, sotto l'elenco: ogni giorno futuro ha gia' il suo «non ancora». */}
      {riga.giorni.some((g) => giornoFuturo(g.data, oggi)) && <p className="m-0 mt-2 text-[12px] leading-snug text-spento">I giorni «non ancora» si compilano da quel giorno in poi.</p>}
      <NotaScontrinoGiorno />
    </div>
  );
}

// Computer largo: i sette giorni in orizzontale, una colonna per giorno e in fondo la settimana.
function GiorniInRiga({ riga, stato, mostraErrori, onGiorno, riassunto }: Omit<ProprietaSede, "onModo" | "onSettimana"> & { riassunto: RiassuntoRighe }) {
  const nome = riga.sede.nome;
  const oggi = oggiIso();
  const base = useId();
  const esiti = stato.giorni.map((c) => validaRiga(c));
  const errori = mostraErrori
    ? riga.giorni.flatMap((g, i) => {
        const testo = testoErroriGiorno(esiti[i]!.errorePizze, esiti[i]!.erroreOrdini);
        return testo ? [{ id: `${base}-${i}`, testo: `${nomeGiorno(i, g.data)}: ${testo}` }] : [];
      })
    : [];
  const scontrini = riga.giorni.map((g, i) => scontrinoGiorno(g.ricaviTotaliCent, stato.giorni[i]!));
  const th = "etichettaMaiuscola py-1.5 pr-2 text-left align-middle font-bold";
  const td = "px-1 py-1 align-top";
  return (
    <div>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">Pizze e ordini di {nome}, giorno per giorno</caption>
        <colgroup>
          <col className="w-[7.5rem]" />
          {riga.giorni.map((g) => (
            <col key={g.data} />
          ))}
          <col className="w-[7rem]" />
        </colgroup>
        <thead>
          <tr>
            <td />
            {riga.giorni.map((g, i) => (
              <th key={g.data} scope="col" className="px-1 pb-1.5 text-left font-bold">
                {nomeGiornoBreve(i)} <span className="num font-normal text-spento">{Number(g.data.slice(8, 10))}</span>
                {giornoFuturo(g.data, oggi) && <span className="block text-[11px] font-normal leading-tight text-spento">non ancora</span>}
              </th>
            ))}
            <th scope="col" className="pb-1.5 pl-3 text-right font-bold">Settimana</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className={th}>Pizze</th>
            {riga.giorni.map((g, i) => (
              <td key={g.data} className={td}>
                <CampoNumero stretto futuro={giornoFuturo(g.data, oggi)} descrittoDa={`${base}-${i}`} className="[&_input]:text-right" etichetta={`Pizze ${nomeGiorno(i, g.data)}, ${nome}`} valore={stato.giorni[i]!.pizze} errore={mostraErrori ? esiti[i]!.errorePizze : null} onCambia={(v) => onGiorno(i, { pizze: v })} />
              </td>
            ))}
            <td className="num pl-3 text-right align-middle text-[16px] font-bold">{testoConteggio(riassunto.pizze)}</td>
          </tr>
          <tr>
            <th scope="row" className={th}>Ordini</th>
            {riga.giorni.map((g, i) => (
              <td key={g.data} className={td}>
                <CampoNumero stretto futuro={giornoFuturo(g.data, oggi)} descrittoDa={`${base}-${i}`} className="[&_input]:text-right" etichetta={`Ordini ${nomeGiorno(i, g.data)}, ${nome}`} valore={stato.giorni[i]!.ordini} errore={mostraErrori ? esiti[i]!.erroreOrdini : null} onCambia={(v) => onGiorno(i, { ordini: v })} />
              </td>
            ))}
            <td className="num pl-3 text-right align-middle text-[16px] font-bold">{testoConteggio(riassunto.ordini)}</td>
          </tr>
          <tr className="border-t border-riga">
            <th scope="row" className={th}>Ricavi</th>
            {riga.giorni.map((g) => (
              <td key={g.data} className="num px-1 py-1.5 text-right text-[13px]">{euro(g.ricaviTotaliCent)}</td>
            ))}
            <td className="num py-1.5 pl-3 text-right text-[13px]">{euro(riga.ricaviTotaliCent)}</td>
          </tr>
          <tr>
            <th scope="row" className={th}>Scontrino</th>
            {riga.giorni.map((g, i) => (
              <td key={g.data} className="num px-1 py-1.5 text-right text-[13px] font-bold">
                {testoEuro(scontrini[i]!.valoreCent)}
                {scontrini[i]!.senzaIncassi && <span className="block text-[11px] font-bold leading-tight text-ambra">{NESSUN_INCASSO}</span>}
              </td>
            ))}
            <td className="num py-1.5 pl-3 text-right text-[15px] font-bold">{testoEuro(riassunto.scontrinoMedioCent)}</td>
          </tr>
        </tbody>
      </table>
      {errori.length > 0 && (
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
          {errori.map((x) => (
            <li key={x.id} id={x.id} role="alert" className="text-[13px] font-bold leading-snug text-rosso">
              {x.testo}
            </li>
          ))}
        </ul>
      )}
      <NotaScontrinoGiorno />
    </div>
  );
}

// Il totale della settimana: due campi, come prima di novembre 2026.
function TotaleSettimana({ riga, stato, mostraErrori, onSettimana, larga }: Omit<ProprietaSede, "onModo" | "onGiorno"> & { larga: boolean }) {
  const e = validaRiga(stato.settimana);
  const nome = riga.sede.nome;
  return (
    <div className={"grid gap-2.5 " + (larga ? "max-w-[34rem] grid-cols-2" : "grid-cols-2")}>
      <div className="min-w-0">
        <span className="etichetta" aria-hidden="true">Pizze</span>
        <CampoNumero etichetta={`Pizze della settimana, ${nome}`} valore={stato.settimana.pizze} errore={mostraErrori ? e.errorePizze : null} onCambia={(v) => onSettimana({ pizze: v })} />
      </div>
      <div className="min-w-0">
        <span className="etichetta" aria-hidden="true">Ordini</span>
        <CampoNumero etichetta={`Ordini della settimana, ${nome}`} valore={stato.settimana.ordini} errore={mostraErrori ? e.erroreOrdini : null} onCambia={(v) => onSettimana({ ordini: v })} />
      </div>
    </div>
  );
}

// Una sede: nome, stato, il modo e i suoi campi.
function SchedaSede(p: ProprietaSede & { larga: boolean }) {
  // Con una sede vera e una personale e' come con una sede sola: la personale non ha pizze e ordini.
  const { piuLocale: piu } = useSedi();
  const { riga, stato, larga } = p;
  const riassunto = riassuntoSede(riga, stato);
  // Il badge (e il bordo ambra) dicono lo stato salvato finche' il modo scelto non e' quello salvato.
  const badge = badgeSede(riga, stato);
  const nome = riga.sede.nome;
  return (
    <section className={"scheda flex flex-col gap-3 px-4 py-3.5 max-md:rounded-2xl md:px-6 md:py-5 " + (badge.inserito ? "" : "!border-ambrabordo")} aria-label={nome}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {piu && <BadgeSede id={riga.sede.id} decorativo />}
          {/* Il nome intero, mai con i puntini: a 320 px va a capo accanto al badge. */}
          <h2 className="min-w-0 flex-1 text-[18px] font-bold leading-tight [overflow-wrap:anywhere] md:text-[20px]">{nome}</h2>
          <Stato {...badge} />
        </div>
        <SceltaModo nome={nome} modo={stato.modo} onCambia={p.onModo} />
      </div>
      <AvvisoAltroModo riga={riga} modo={stato.modo} />
      {stato.modo === "SETTIMANA" ? (
        <TotaleSettimana {...p} />
      ) : larga ? (
        <GiorniInRiga {...p} riassunto={riassunto} />
      ) : (
        <GiorniInColonna {...p} />
      )}
      {(stato.modo === "SETTIMANA" || !larga) && <RiassuntoSede riga={riga} stato={stato} riassunto={riassunto} />}
    </section>
  );
}

// ---- le settimane già inserite ----

function SettimaneInserite({ correnteLunedi }: { correnteLunedi: string }) {
  const sedi = useSedi();
  const larga = useLarghezzaMinima(LARGHEZZA_TABELLA);
  const intervallo = intervalloUltimeSettimane();
  const q = useQuery({ queryKey: chiavi.statistiche(intervallo.da, intervallo.a), queryFn: () => api.statistiche(intervallo.da, intervallo.a), enabled: sedi.pronto });
  const righe = q.data ? settimaneInserite(q.data.settimane, sedi.locale.length) : [];
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
              {sedi.piuLocale && <th scope="col" className="etichettaMaiuscola pb-2 text-right">Sedi</th>}
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
                {sedi.piuLocale && (
                  <td className="py-1.5 text-right">
                    <ChipSedi inserite={r.inserite} totali={sedi.locale.length} />
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
                  {sedi.piuLocale && (
                    <span className="ml-2 align-middle">
                      <ChipSedi inserite={r.inserite} totali={sedi.locale.length} />
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
  // Righe e valori di partenza sono quelli del montaggio della settimana (il modulo ha la chiave `lunedi`): un aggiornamento dei dati
  // in sottofondo non deve cambiare la base del confronto mentre si scrive, altrimenti il salvataggio confronterebbe con dati nuovi.
  const [righe] = useState(() => righeModificabili(settimana, (id) => sedi.info(id)?.archiviata ?? false));
  const [iniziali] = useState(() => new Map(righe.map((r) => [r.sede.id, statoIniziale(r)])));
  const [stati, setStati] = useState<Record<number, StatoSede>>(() => Object.fromEntries(iniziali));
  const [mostraErrori, setMostraErrori] = useState(false);
  const [daConfermare, setDaConfermare] = useState<PianoSalvataggio | null>(null);
  const statoDi = (r: RigaSettimana) => stati[r.sede.id] ?? iniziali.get(r.sede.id)!;
  const modificato = righe.some((r) => sedeModificata(iniziali.get(r.sede.id)!, statoDi(r)));
  const { blocker, consenti } = useBloccoUscita(modificato);
  const totale = totaleParziale(righe.map((r) => righeDelModo(r, statoDi(r))));

  const salva = useMutation({
    mutationFn: (piano: PianoSalvataggio) => salvaPiano(lunedi, piano, api),
    onSettled: () => void client.invalidateQueries({ queryKey: ["statistiche"] }),
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });

  function cambia(id: number, f: (s: StatoSede) => StatoSede) {
    setStati((s) => ({ ...s, [id]: f(s[id] ?? iniziali.get(id)!) }));
  }

  async function esegui(piano: PianoSalvataggio) {
    setDaConfermare(null);
    try {
      await salva.mutateAsync(piano);
    } catch {
      return; // l'avviso d'errore e' gia' mostrato da onError
    }
    consenti();
    avvisa("Settimana salvata.");
    void navigate("/statistiche");
  }

  function invia() {
    setMostraErrori(true);
    const piano = preparaPiano(righe, iniziali, new Map(righe.map((r) => [r.sede.id, statoDi(r)])));
    if (piano.errori.length > 0) {
      avvisa("Controlla i campi segnati in rosso.", { tipo: "errore", posizione: "alto" });
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('input[aria-invalid="true"]')?.focus());
      return;
    }
    if (piano.giorni.length === 0 && piano.settimana.length === 0) {
      // Quello scritto nell'altro modo non si salva da qui: lo si dice, invece di «nessuna modifica».
      const altro = righe.find((r) => modificheNellAltroModo(iniziali.get(r.sede.id)!, statoDi(r)));
      if (altro) {
        const modo = statoDi(altro).modo === "SETTIMANA" ? "«Giorno per giorno»" : "«Totale della settimana»";
        avvisa(`Nel modo scelto non c'è niente da salvare. Quello che hai scritto in ${modo} (${altro.sede.nome}) si salva tornando a quel modo.`, { tipo: "errore" });
      } else avvisa("Nessuna modifica da salvare.");
      return;
    }
    if (piano.sovrascritture.length > 0) {
      setDaConfermare(piano);
      return;
    }
    void esegui(piano);
  }

  return (
    <>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          invia();
        }}
        className="flex flex-col gap-3 md:gap-4"
      >
        <NavigatoreSettimana lunedi={lunedi} onVai={onVai} />

        {righe.map((r) => (
          <SchedaSede
            key={r.sede.id}
            larga={larga}
            riga={r}
            stato={statoDi(r)}
            mostraErrori={mostraErrori}
            onModo={(modo) => cambia(r.sede.id, (s) => cambiaModo(s, modo))}
            onGiorno={(i, p) => cambia(r.sede.id, (s) => ({ ...s, giorni: s.giorni.map((c, k) => (k === i ? { ...c, ...p } : c)) }))}
            onSettimana={(p) => cambia(r.sede.id, (s) => ({ ...s, settimana: { ...s.settimana, ...p } }))}
          />
        ))}

        {sedi.piuLocale && (
          <section className="scheda bg-crema px-4 py-3.5 max-md:rounded-2xl md:px-6" aria-label="Totale della settimana, tutte le sedi">
            <div className="etichettaMaiuscola">{titoloTotaleSettimana(totale.sediComplete, totale.sediTotali)}</div>
            <div className="num mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[14px] text-spento md:text-[15px]">
              <span>
                Pizze <b className="text-testo">{testoConteggio(totale.pizze)}</b>
              </span>
              <span>
                Ordini <b className="text-testo">{testoConteggio(totale.ordini)}</b>
              </span>
              <span>
                Scontrino <b className="text-testo">{totale.sediComplete === 0 ? "—" : testoEuro(totale.scontrinoMedioCent)}</b>
              </span>
              <span>
                Pizze / ordine <b className="text-testo">{testoPizzePerOrdine(totale.pizzePerOrdine)}</b>
              </span>
            </div>
          </section>
        )}

        {/* Computer: i pulsanti dopo le sedi, Annulla e poi Salva a destra come nei moduli. Telefono: la barra fissa in fondo (come in Nuovo movimento). */}
        <div data-azioni-modulo className="flex flex-wrap justify-end gap-3 max-md:hidden">
          <Link to="/statistiche" className="btn grande px-[22px]">
            Annulla
          </Link>
          <button type="submit" className="btn primario grande px-[22px]" disabled={salva.isPending}>
            {salva.isPending ? "Salvo…" : "Salva la settimana"}
          </button>
        </div>
        <div data-barra-fissa data-azioni-modulo className="fixed inset-x-0 bottom-[var(--sotto-tastiera)] z-40 flex gap-2.5 border-t border-bordo bg-crema p-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:hidden">
          <Link to="/statistiche" className="btn min-h-[var(--d-barra)] px-5 text-[16px]">
            Annulla
          </Link>
          <button type="submit" className="btn primario min-h-[var(--d-barra)] flex-1 text-[17px]" disabled={salva.isPending}>
            {salva.isPending ? "Salvo…" : "Salva la settimana"}
          </button>
        </div>
      </form>
      {daConfermare && (
        <Conferma
          titolo="Sostituire i dati già inseriti?"
          onAnnulla={() => setDaConfermare(null)}
          azione={{ etichetta: "Salva e cancella", stile: "distruttiva", onClick: () => void esegui(daConfermare) }}
        >
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] leading-snug">
            {daConfermare.sovrascritture.map((s) => (
              <li key={s.sedeId}>{testoSovrascrittura(s)}</li>
            ))}
          </ul>
        </Conferma>
      )}
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
