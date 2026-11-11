import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, messaggioErrore } from "../api/client";
import type { CasellaConMesi, CasellaFattura, Fatture as DatiFatture, MeseFattura } from "../api/tipi";
import BadgeStatoFattura from "../componenti/BadgeStatoFattura";
import FattureRicevute from "../componenti/FattureRicevute";
import { CLASSI_TONO, iconaStato } from "../componenti/statoFattura";
import { FinestraCasellaFattura, FinestraMeseFattura } from "../componenti/FinestreFatture";
import { IconaAllarme, IconaDestra, IconaMatita, IconaOrologio, IconaPiu, IconaSinistra } from "../componenti/Icone";
import SelettoreSedi from "../componenti/SelettoreSedi";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { useAvviso } from "../hooks/useAvviso";
import { euro, oggiIso } from "../util/formato";
import {
  aggiungiMesiMese,
  conteggioMese,
  ETICHETTA_STATO,
  etichettaComandoStato,
  meseBreve,
  meseCorrente,
  meseDiCasella,
  MESI_PANORAMICA,
  nomeMeseAnno,
  nomeRelativoMese,
  passoSuccessivo,
  puoAndareAvantiMese,
  STATI,
  testoScadenza,
  tonoScadenza,
  tonoVoce,
  ultimiMesi,
} from "../util/fatture";

// Fatture da emettere: un promemoria mensile. L'utente crea le sue caselle (un cliente, un tipo di fattura) e ogni mese ne segna lo stato:
// Da fare, Emessa, Pagata. Due viste: «Mese» (una lista, una riga per casella: il tocco sul badge porta allo stato dopo) e «Panoramica»
// (caselle per ultimi mesi, per controllare a colpo d'occhio cosa e' rimasto indietro).

const MESE_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

type Vista = "mese" | "panoramica";
type Scheda = "emettere" | "ricevute";
interface MeseAperto {
  casella: CasellaFattura;
  mese: string;
}

// ---- il mese, con le frecce ----

function NavigatoreMese({ mese, oggiMese, onVai }: { mese: string; oggiMese: string; onVai: (mese: string) => void }) {
  const corrente = mese === oggiMese;
  return (
    <div className="flex items-center justify-between gap-2 md:justify-start md:gap-3" role="group" aria-label="Mese">
      <button type="button" className="btnIcona" aria-label="Mese precedente" onClick={() => onVai(aggiungiMesiMese(mese, -1))}>
        <IconaSinistra larghezza={20} spessoreTratto={2} />
      </button>
      <div className="min-w-0 flex-1 text-center md:min-w-[14rem] md:flex-none" aria-live="polite">
        <div className="font-titolo text-[18px] font-semibold leading-tight md:text-[20px]">{nomeMeseAnno(mese)}</div>
        {corrente ? (
          <div className="flex min-h-[28px] items-center justify-center text-[13px] text-spento">{nomeRelativoMese(mese, oggiMese)}</div>
        ) : (
          <button type="button" className="mx-auto flex min-h-[28px] items-center text-[13px] font-bold text-verdescuro underline" onClick={() => onVai(oggiMese)}>
            Torna a questo mese
          </button>
        )}
      </div>
      <button type="button" className="btnIcona" aria-label="Mese successivo" disabled={!puoAndareAvantiMese(mese, oggiMese)} onClick={() => onVai(aggiungiMesiMese(mese, 1))}>
        <IconaDestra larghezza={20} spessoreTratto={2} />
      </button>
    </div>
  );
}

// ---- i tre contatori del mese ----

function Contatore({ etichetta, valore, sotto, evidenza }: { etichetta: string; valore: number; sotto: string; evidenza?: boolean }) {
  return (
    // Sui telefoni stretti «Da emettere» va su due righe: il numero resta in basso, allineato a quello degli altri contatori.
    <div className={"scheda flex min-w-0 flex-col px-2.5 py-1.5 max-md:rounded-2xl md:px-5 md:py-3.5 " + (evidenza ? "!border-ambrabordo !bg-ambrachiaro" : "")}>
      <div className={"etichettaMaiuscola leading-tight " + (evidenza ? "!text-ambra" : "")}>{etichetta}</div>
      <div className={"num mt-auto font-titolo text-[24px] font-bold leading-tight md:text-[32px] " + (evidenza ? "text-ambra" : "")}>{valore}</div>
      <div className="num truncate text-[11px] text-spento md:text-[13px]">{sotto}</div>
    </div>
  );
}

// ---- vista «Mese» ----

interface ProprietaRiga {
  casella: CasellaConMesi;
  mese: string;
  oggiMese: string;
  occupata: boolean;
  onAvanza: (casella: CasellaConMesi, voce: MeseFattura) => void;
  onDettagli: (casella: CasellaConMesi) => void;
}

// Una riga della lista: a sinistra nome e (in piccolo) importo e nota; a destra il badge-comando (un tocco = stato dopo) e il tasto dei dettagli.
// Il posto del badge e' largo quanto «Da emettere» (il piu' lungo), cosi' i badge delle righe restano in colonna. Sul telefono il
// badge e' piu' compatto (e il posto piu' stretto) per lasciare spazio al nome della casella.
function RigaCasella({ casella, mese, oggiMese, occupata, onAvanza, onDettagli }: ProprietaRiga) {
  const voce = meseDiCasella(casella, mese);
  const tono = tonoVoce(voce, oggiMese);
  const passo = passoSuccessivo(voce.stato);
  const dettaglio = [voce.importoCent !== null ? euro(voce.importoCent) : null, voce.nota].filter(Boolean).join(" · ");
  // Con una scadenza e ancora Da fare, in un mese non passato: «Scade tra 3 giorni» (ambra), «Scaduta da 2 giorni» (rosso), «Scade il 28».
  const oggi = oggiIso();
  const scadenza = voce.attiva && voce.stato === "DA_FARE" && voce.scadenza && tono !== "ritardo" ? voce.scadenza : null;
  const tonoScad = scadenza ? tonoScadenza(scadenza, oggi) : "neutro";
  return (
    <li className="flex items-center gap-2 border-b border-bordo px-3 py-1.5 last:border-b-0 md:gap-4 md:px-5 md:py-2">
      <div className="min-w-0 flex-1 py-1">
        <h3 className="m-0 break-words text-[16px] font-bold leading-snug md:text-[17px]">{casella.nome}</h3>
        {dettaglio && <p className="num m-0 break-words text-[13px] leading-snug text-spento">{dettaglio}</p>}
        {tono === "ritardo" && (
          <p className="m-0 flex items-center gap-1 text-[12px] font-bold leading-snug text-rosso">
            <IconaAllarme larghezza={13} spessoreTratto={2.25} />
            In ritardo
          </p>
        )}
        {scadenza && (
          <p className={"m-0 flex items-center gap-1 text-[12px] leading-snug " + (tonoScad === "scaduta" ? "font-bold text-rosso" : tonoScad === "vicina" ? "font-bold text-ambra" : "text-spento")}>
            {tonoScad === "scaduta" ? <IconaAllarme larghezza={13} spessoreTratto={2.25} /> : tonoScad === "vicina" ? <IconaOrologio larghezza={13} spessoreTratto={2.25} /> : null}
            {testoScadenza(scadenza, oggi)}
          </p>
        )}
      </div>
      {tono === "inattiva" ? (
        <span className="flex min-h-[44px] min-w-[114px] md:min-w-[128px] shrink-0 items-center justify-center text-[18px] text-spento" role="img" aria-label={`${casella.nome}: non attiva in questo mese, la casella parte da ${nomeMeseAnno(casella.dalMese).toLowerCase()}`}>
          —
        </span>
      ) : passo ? (
        <button
          type="button"
          className="flex min-h-[44px] min-w-[114px] md:min-w-[128px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 hover:brightness-95 disabled:opacity-60"
          aria-label={etichettaComandoStato(casella.nome, voce.stato)}
          title={passo.azione}
          disabled={occupata}
          onClick={() => onAvanza(casella, voce)}
        >
          <BadgeStatoFattura stato={voce.stato} tono={tono} className="!h-[36px] w-full justify-center max-md:gap-1 max-md:px-2 max-md:text-[13px]" />
        </button>
      ) : (
        <span className="flex min-h-[44px] min-w-[114px] md:min-w-[128px] shrink-0 items-center justify-center" role="img" aria-label={etichettaComandoStato(casella.nome, voce.stato)}>
          <BadgeStatoFattura stato={voce.stato} tono={tono} className="!h-[36px] w-full justify-center max-md:gap-1 max-md:px-2 max-md:text-[13px]" />
        </span>
      )}
      <button type="button" className="btnIcona shrink-0 !border-transparent !bg-transparent hover:!bg-sabbia" aria-label={`Importo, nota e stato: ${casella.nome}`} title="Importo, nota e stato" onClick={() => onDettagli(casella)}>
        <IconaMatita larghezza={18} spessoreTratto={2} />
      </button>
    </li>
  );
}

function VistaMese({ dati, mese, oggiMese, occupataId, onAvanza, onDettagli }: Omit<ProprietaRiga, "casella" | "occupata"> & { dati: DatiFatture; occupataId: number | null }) {
  const c = conteggioMese(dati.caselle, mese);
  const attive = dati.caselle.filter((x) => meseDiCasella(x, mese).attiva).length;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 md:gap-4" role="group" aria-label={`Riepilogo di ${nomeMeseAnno(mese)}`}>
        <Contatore etichetta="Da emettere" valore={c.daFare} sotto={attive === 0 ? "—" : c.daFare === 0 ? "tutto fatto" : c.daFare === 1 ? "fattura" : "fatture"} evidenza={c.daFare > 0} />
        <Contatore etichetta="Emesse" valore={c.emesse} sotto={c.emesse === 0 ? "nessuna" : c.daIncassareCent > 0 ? euro(c.daIncassareCent) : "da incassare"} />
        <Contatore etichetta="Pagate" valore={c.pagate} sotto={c.pagateCent > 0 ? euro(c.pagateCent) : c.pagate === 0 ? "nessuna" : "pagate"} />
      </div>
      <ul className="scheda m-0 mt-2.5 list-none overflow-hidden p-0 max-md:rounded-2xl md:mt-4" aria-label="Caselle">
        {dati.caselle.map((casella) => (
          <RigaCasella key={casella.id} casella={casella} mese={mese} oggiMese={oggiMese} occupata={occupataId === casella.id} onAvanza={onAvanza} onDettagli={onDettagli} />
        ))}
      </ul>
    </>
  );
}

// ---- vista «Panoramica»: caselle per ultimi mesi ----
// Nei riquadri, icona e parola stanno una sopra l'altra fino a xl: fra 1024 e 1280 px accanto all'icona «Da emettere» non ci sta.

function Legenda() {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Legenda">
      {STATI.map((s) => (
        <li key={s}>
          <BadgeStatoFattura stato={s} tono={s === "DA_FARE" ? "fare" : s === "EMESSA" ? "emessa" : "pagata"} />
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <BadgeStatoFattura stato="DA_FARE" tono="ritardo" />
        <span className="text-[13px] text-tenue">mese passato</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span className={`inline-flex h-[30px] min-w-[44px] items-center justify-center rounded-lg border text-[14px] font-bold ${CLASSI_TONO.inattiva}`}>—</span>
        <span className="text-[13px] text-tenue">prima della casella</span>
      </li>
    </ul>
  );
}

function Panoramica({ dati, mese, oggiMese, onApri }: { dati: DatiFatture; mese: string; oggiMese: string; onApri: (casella: CasellaConMesi, mese: string) => void }) {
  const colonne = "md:grid-cols-[minmax(180px,1.3fr)_repeat(6,minmax(0,1fr))]";
  return (
    <>
      <p className="m-0 mb-3 text-[14px] text-tenue md:text-[15px]">
        Gli ultimi mesi, fino a {nomeMeseAnno(mese).toLowerCase()}. Tocca un riquadro per cambiarne lo stato.
      </p>
      <div className={"hidden gap-2 px-4 pb-1.5 md:grid " + colonne} aria-hidden="true">
        <span className="etichettaMaiuscola">Casella</span>
        {dati.mesi.map((m) => (
          <span key={m} className={"etichettaMaiuscola " + (m === mese ? "!text-testo" : "")}>
            {meseBreve(m)} {m.slice(2, 4)}
          </span>
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {dati.caselle.map((casella) => (
          <li key={casella.id} className={"scheda px-3.5 py-3 max-md:rounded-2xl md:grid md:items-center md:gap-2 md:rounded-xl md:px-4 md:py-2.5 " + colonne}>
            <h3 className="min-w-0 break-words text-[16px] font-bold leading-snug md:pr-2 md:text-[16px]">{casella.nome}</h3>
            <div className="mt-2.5 grid grid-cols-5 gap-1.5 md:contents">
              {dati.mesi.map((m, i) => {
                const voce = meseDiCasella(casella, m);
                const tono = tonoVoce(voce, oggiMese);
                const Icona = tono === "inattiva" ? null : iconaStato(voce.stato, tono);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-label={`${casella.nome}, ${nomeMeseAnno(m).toLowerCase()}: ${tono === "inattiva" ? "non attivo, prima della casella" : ETICHETTA_STATO[voce.stato]}${voce.importoCent !== null ? `, ${euro(voce.importoCent)}` : ""}`}
                    className={`${i === 0 ? "max-md:hidden " : ""}flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-0.5 text-[11px] font-bold hover:brightness-95 md:min-h-[46px] md:px-1 md:text-[13px] xl:flex-row xl:gap-1.5 ${CLASSI_TONO[tono]} ${m === mese ? "ring-2 ring-testo ring-offset-1" : ""}`}
                    onClick={() => onApri(casella, m)}
                  >
                    {Icona ? <Icona larghezza={18} spessoreTratto={2.25} /> : <span aria-hidden="true">—</span>}
                    <span className="md:hidden">{meseBreve(m)}</span>
                    <span className="max-w-full truncate max-md:hidden">{Icona ? ETICHETTA_STATO[voce.stato] : ""}</span>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
        <Legenda />
        <p className="m-0 text-[14px] font-bold text-tenue" aria-live="polite">
          {dati.daFare === 0 ? "In questi mesi non c'è niente da emettere." : `Ancora da emettere in questi mesi: ${dati.daFare}`}
        </p>
      </div>
    </>
  );
}

// ---- la schermata ----

export default function Fatture() {
  const client = useQueryClient();
  const avvisa = useAvviso();
  const oggiMese = meseCorrente();
  const [vista, setVista] = useState<Vista>("mese");
  // Scheda e mese stanno nell'indirizzo, cosi' restano dopo aver aperto una fattura ed essere tornati indietro: `scheda=ricevute` apre
  // le Ricevute (assente = «Da emettere», le caselle), `mese=yyyy-MM` e' il mese scelto (assente o non valido = il mese corrente).
  const [parametri, setParametri] = useSearchParams();
  const scheda: Scheda = parametri.get("scheda") === "ricevute" ? "ricevute" : "emettere";
  const meseGrezzo = parametri.get("mese");
  const mese = meseGrezzo && MESE_VALIDO.test(meseGrezzo) ? meseGrezzo : oggiMese;
  // Cambia un parametro senza toccare gli altri (null = lo toglie).
  const impostaParametro = (nome: string, valore: string | null) =>
    setParametri(
      (prec) => {
        const p = new URLSearchParams(prec);
        if (valore === null) p.delete(nome);
        else p.set(nome, valore);
        return p;
      },
      { replace: true },
    );
  const setMese = (nuovo: string) => impostaParametro("mese", nuovo === oggiMese ? null : nuovo);
  const vaiA = (nuova: Scheda) => impostaParametro("scheda", nuova === "ricevute" ? "ricevute" : null);
  const [aperto, setAperto] = useState<MeseAperto | null>(null);
  const [casellaAperta, setCasellaAperta] = useState<CasellaFattura | "nuova" | null>(null);

  const da = ultimiMesi(mese, MESI_PANORAMICA)[0]!;
  const q = useQuery({ queryKey: chiavi.fatture(da, mese), queryFn: () => api.fatture(da, mese), placeholderData: keepPreviousData, enabled: scheda === "emettere" });
  const dati = q.data;

  // Un tocco: la fattura passa allo stato dopo (importo e nota restano).
  const avanza = useMutation({
    mutationFn: ({ casella, voce }: { casella: CasellaConMesi; voce: MeseFattura }) => {
      const passo = passoSuccessivo(voce.stato)!;
      return api.salvaMeseFattura(casella.id, voce.mese, { stato: passo.stato, importoCent: voce.importoCent, nota: voce.nota });
    },
    onSuccess: async (_r, { casella, voce }) => {
      await client.invalidateQueries({ queryKey: ["fatture"] });
      avvisa(`«${casella.nome}»: segnata come ${passoSuccessivo(voce.stato)!.fatto}.`);
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });

  const apriMese = (casella: CasellaFattura, m: string) => setAperto({ casella, mese: m });
  const casellaDelMese = aperto ? dati?.caselle.find((c) => c.id === aperto.casella.id) : undefined;

  return (
    <div className="flex min-h-full flex-col">
      <Testata
        compatta
        titolo="Fatture"
        indietro="/statistiche"
        azioni={
          scheda === "emettere" ? (
            <button type="button" className="btn primario hidden md:inline-flex" onClick={() => setCasellaAperta("nuova")}>
              <IconaPiu larghezza={20} spessoreTratto={2.25} />
              <span>Nuova casella</span>
            </button>
          ) : undefined
        }
      />
      <div className="flex flex-1 flex-col px-4 pb-24 pt-2 md:px-8 md:pb-7 md:pt-0">
        <div className="segmenti mb-3 max-md:w-full md:mb-4 md:self-start" role="group" aria-label="Fatture">
          <button type="button" className="max-md:flex-1 max-md:justify-center" aria-pressed={scheda === "emettere"} onClick={() => vaiA("emettere")}>
            Da emettere
          </button>
          <button type="button" className="max-md:flex-1 max-md:justify-center" aria-pressed={scheda === "ricevute"} onClick={() => vaiA("ricevute")}>
            Ricevute
          </button>
        </div>
        {/* Le Ricevute sono movimenti: valgono le sedi scelte, come nelle altre viste. */}
        {scheda === "ricevute" && <SelettoreSedi className="pb-3" />}
        <div className="flex flex-col gap-3 pb-3 md:flex-row md:items-center md:justify-between md:pb-4">
          <NavigatoreMese mese={mese} oggiMese={oggiMese} onVai={setMese} />
          {scheda === "emettere" && (
            <div className="segmenti max-md:w-full" role="group" aria-label="Vista">
              <button type="button" className="max-md:flex-1 max-md:justify-center" aria-pressed={vista === "mese"} onClick={() => setVista("mese")}>
                Mese
              </button>
              <button type="button" className="max-md:flex-1 max-md:justify-center" aria-pressed={vista === "panoramica"} onClick={() => setVista("panoramica")}>
                Panoramica
              </button>
            </div>
          )}
        </div>

        {scheda === "ricevute" && <FattureRicevute mese={mese} />}

        {scheda === "emettere" && q.isPending && <Caricamento />}
        {scheda === "emettere" && q.isError && <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />}

        {scheda === "emettere" && dati && dati.caselle.length === 0 && (
          <div className="scheda max-md:rounded-2xl">
            <Vuoto
              titolo="Nessuna casella"
              testo="Crea una casella per ogni cliente o tipo di fattura da ricordare (per esempio «Fatture eventi»). Ogni mese vedrai cosa hai già fatto, cosa devi ancora fare e se è stato pagato."
              azione={
                <button type="button" className="btn primario grande" onClick={() => setCasellaAperta("nuova")}>
                  <IconaPiu larghezza={20} spessoreTratto={2.25} />
                  <span>Crea la prima casella</span>
                </button>
              }
            />
          </div>
        )}

        {scheda === "emettere" && dati && dati.caselle.length > 0 && (
          <>
            {vista === "mese" ? (
              <VistaMese
                dati={dati}
                mese={mese}
                oggiMese={oggiMese}
                occupataId={avanza.isPending ? avanza.variables.casella.id : null}
                onAvanza={(casella, voce) => avanza.mutate({ casella, voce })}
                onDettagli={(casella) => apriMese(casella, mese)}
              />
            ) : (
              <Panoramica dati={dati} mese={mese} oggiMese={oggiMese} onApri={(casella, m) => apriMese(casella, m)} />
            )}
            <button
              type="button"
              className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-tratteggio bg-transparent text-[15px] font-bold text-tenue hover:bg-sabbia md:hidden"
              onClick={() => setCasellaAperta("nuova")}
            >
              <IconaPiu larghezza={18} spessoreTratto={2.25} />
              Nuova casella
            </button>
          </>
        )}
      </div>

      {aperto && casellaDelMese && (
        <FinestraMeseFattura
          key={`${aperto.casella.id}-${aperto.mese}`}
          casella={aperto.casella}
          mese={aperto.mese}
          attuale={meseDiCasella(casellaDelMese, aperto.mese)}
          onChiudi={() => setAperto(null)}
          onModificaCasella={() => {
            setAperto(null);
            setCasellaAperta(aperto.casella);
          }}
        />
      )}
      {casellaAperta && <FinestraCasellaFattura key={casellaAperta === "nuova" ? "nuova" : casellaAperta.id} casella={casellaAperta === "nuova" ? null : casellaAperta} onChiudi={() => setCasellaAperta(null)} />}
    </div>
  );
}
