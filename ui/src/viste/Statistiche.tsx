import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi, messaggioErrore } from "../api/client";
import type { IntervalloSerie, SerieStatistiche } from "../api/tipi";
import BadgeSede from "../componenti/BadgeSede";
import GraficoAndamento from "../componenti/GraficoAndamento";
import GraficoScontrino from "../componenti/GraficoScontrino";
import { IconaDestra } from "../componenti/Icone";
import SelettorePeriodo from "../componenti/SelettorePeriodo";
import SelettoreSedi from "../componenti/SelettoreSedi";
import { Caricamento, ErroreCaricamento, Vuoto } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { usePeriodo } from "../hooks/usePeriodo";
import { useSedi } from "../hooks/useSedi";
import { meseCorrente } from "../util/fatture";
import { euro, NOME_PERIODO, oggiIso, type Intervallo, type TipoPeriodo } from "../util/formato";
import { barreGrafico, intervalloSerie, MASSIMO_INTERVALLI, numeriPossibili, PASSI_GRAFICO, passoPredefinito, type MisuraGrafico } from "../util/graficoStatistiche";
import {
  bannerUtile,
  elencoNomi,
  intervalloUltimeSettimane,
  ricavoPerPizzaCent,
  settimanaCorta,
  testoConteggio,
  testoPizzePerOrdine,
  ultimaIncompleta,
  ultimeSettimane,
} from "../util/statistiche";

const NESSUN_NOME: string[] = [];
const PERCORSO_INSERIMENTO = "/statistiche/pizze-ordini";

const testoEuro = (cent: number | null) => (cent === null ? "—" : euro(cent));

// «Settimana 26 ott – 1 nov: mancano pizze e ordini di Lungomare e Mercato.» Porta a «Pizze e ordini» di quella settimana.
function Banner({ lunedi, nomi }: { lunedi: string; nomi: string[] }) {
  return (
    <Link
      to={`${PERCORSO_INSERIMENTO}?s=${lunedi}`}
      className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-ambrabordo bg-ambrachiaro px-3.5 py-3 text-[14px] font-bold text-ambra no-underline md:px-4"
    >
      <span className="min-w-[12rem] flex-1">
        Settimana {settimanaCorta(lunedi)}: mancano pizze e ordini
        {nomi.length > 0 ? ` di ${elencoNomi(nomi)}` : ""}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap">
        Inserisci
        <IconaDestra larghezza={18} spessoreTratto={2.4} />
      </span>
    </Link>
  );
}

// Porta a «Costi e ricavi per voce»: quanto per ogni fornitore, dipendente o categoria, mese per mese.
function CollegamentoVoci() {
  return (
    <Link
      to="/statistiche/voci"
      className="scheda flex min-h-[64px] items-center gap-3 px-[18px] py-3 text-testo no-underline hover:bg-sabbia max-md:rounded-2xl md:px-6"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-titolo text-[18px] font-bold leading-tight md:text-[20px]">Costi e ricavi per voce</span>
        <span className="mt-0.5 block text-[14px] text-spento">Quanto per ogni fornitore, dipendente o categoria, mese per mese</span>
      </span>
      <span className="shrink-0 text-verdescuro">
        <IconaDestra larghezza={22} spessoreTratto={2.2} />
      </span>
    </Link>
  );
}

// Porta a «Fatture»: le fatture da emettere (le caselle di ogni cliente) e quelle ricevute dai fornitori, mese per mese. Con «N da
// emettere» nel mese in corso.
function CollegamentoFatture() {
  const mese = meseCorrente();
  const q = useQuery({ queryKey: chiavi.fatture(mese, mese), queryFn: () => api.fatture(mese, mese), staleTime: 15_000 });
  const n = q.data?.daFare ?? 0;
  return (
    <Link
      to="/statistiche/fatture"
      className="scheda flex min-h-[64px] items-center gap-3 px-[18px] py-3 text-testo no-underline hover:bg-sabbia max-md:rounded-2xl md:px-6"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-titolo text-[18px] font-bold leading-tight md:text-[20px]">Fatture</span>
        <span className="mt-0.5 block text-[14px] text-spento">Da emettere e ricevute dai fornitori, mese per mese</span>
      </span>
      {n > 0 && (
        <span className="num shrink-0 whitespace-nowrap rounded-full border border-ambrabordo bg-ambrachiaro px-2.5 py-1 text-[13px] font-bold text-ambra">
          {n} da emettere
        </span>
      )}
      <span className="shrink-0 text-verdescuro">
        <IconaDestra larghezza={22} spessoreTratto={2.2} />
      </span>
    </Link>
  );
}

// Un riquadro del riassunto: il nome, il numero e, se serve, una riga sotto («di cui extra …»).
function Numero({ nome, valore, sotto, grande = false, className = "" }: { nome: string; valore: string; sotto?: string; grande?: boolean; className?: string }) {
  return (
    <div className={"min-w-0 rounded-xl bg-crema px-3 py-2.5 md:rounded-[14px] md:px-4 md:py-3 " + className}>
      <div className="etichettaMaiuscola !text-[11px]">{nome}</div>
      <div className={"num font-titolo font-bold leading-tight " + (grande ? "text-[26px] text-verdescuro md:text-[30px]" : "text-[20px] md:text-[24px]")}>{valore}</div>
      {sotto && <div className="num mt-0.5 text-[13px] text-spento">{sotto}</div>}
    </div>
  );
}

// I numeri del periodo sulle date esatte scelte (GET /statistiche/serie, `totale`, come il grafico): pizze, ricavo totale con la parte
// extra, ordini e scontrino medio. Le pizze di un periodo senza dati inseriti sono «—», non 0; i ricavi ci sono comunque.
function Riassunto({ t, titolo }: { t: IntervalloSerie; titolo: string }) {
  const perPizza = t.conDati ? ricavoPerPizzaCent(t.ricaviConDatiCent, t.pizze) : null;
  const conteggio = (n: number) => (t.conDati ? testoConteggio(n) : "—");
  return (
    <section className="scheda min-w-0 px-[18px] py-4 max-md:rounded-2xl md:px-6 md:py-5" aria-label={titolo}>
      <div className="etichettaMaiuscola">{titolo}</div>
      <div className="mt-2.5 grid grid-cols-2 gap-2 md:gap-2.5">
        <Numero grande nome="Pizze" valore={conteggio(t.pizze)} />
        <Numero grande nome="Ricavo totale" valore={euro(t.ricaviTotaliCent)} sotto={`di cui extra ${euro(t.ricaviExtraCent)}`} className="max-[479px]:order-first max-[479px]:col-span-2" />
        <Numero nome="Ordini" valore={conteggio(t.ordini)} />
        <Numero nome="Scontrino medio" valore={testoEuro(t.scontrinoMedioCent)} />
        <Numero nome="Pizze / ordine" valore={t.conDati ? testoPizzePerOrdine(t.pizzePerOrdine) : "—"} />
        <Numero nome="Ricavo per pizza" valore={testoEuro(perPizza)} className="max-[479px]:hidden" />
      </div>
      {perPizza !== null && (
        <div className="num mt-2.5 text-[14px] text-spento min-[480px]:hidden">
          Ogni pizza porta in media <b className="text-testo">{euro(perPizza)}</b>
        </div>
      )}
      {!t.conDati && (
        <div className="mt-2.5 text-[14px] text-spento">
          Pizze e ordini non ancora inseriti in questo periodo.{" "}
          <Link to={PERCORSO_INSERIMENTO} className="inline-flex min-h-[44px] items-center font-bold text-verdescuro">
            Inserisci
          </Link>
        </div>
      )}
    </section>
  );
}

// Il grafico di pizze e ricavi con i due selettori: il passo (Giorno, Settimana, Mese, Anno) e la misura (Pizze, Ricavi). Le scelte
// stanno nell'indirizzo (?g=…&m=…), cosi' restano ricaricando la pagina; senza scelta il passo viene dal periodo (passoPredefinito).
function Andamento({ tipo, intervallo, filtro, abilitato }: { tipo: TipoPeriodo; intervallo: Intervallo; filtro: string | undefined; abilitato: boolean }) {
  const [params, setParams] = useSearchParams();
  const passo = PASSI_GRAFICO.find((p) => p.passo === params.get("g"))?.passo ?? passoPredefinito(tipo, intervallo);
  const misura: MisuraGrafico = params.get("m") === "ricavi" ? "ricavi" : "pizze";
  const oggi = oggiIso();
  const richiesta = intervalloSerie(passo, intervallo, oggi);
  const q = useQuery({
    queryKey: chiavi.serieStatistiche(richiesta.da, richiesta.a, richiesta.passo, filtro),
    queryFn: () => api.serieStatistiche(richiesta.da, richiesta.a, richiesta.passo, filtro),
    enabled: abilitato,
    placeholderData: (prima) => prima,
  });
  const imposta = (chiave: "g" | "m", valore: string) =>
    setParams(
      (prec) => {
        const p = new URLSearchParams(prec);
        p.set(chiave, valore);
        return p;
      },
      { replace: true },
    );
  const dati = q.data ? barreGrafico(q.data.intervalli, q.data.passo, misura, oggi) : null;
  const nomeMisura = misura === "pizze" ? "Pizze" : "Ricavi";

  return (
    <section className="scheda min-w-0 px-[18px] py-4 max-md:rounded-2xl md:px-6 md:py-5" aria-label={`${nomeMisura}: andamento`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold md:text-[20px]">
            {nomeMisura} · {richiesta.titolo}
          </h2>
          <div className="text-[13px] text-spento">{richiesta.date}</div>
        </div>
        <div className="segmenti max-md:flex max-md:min-h-0 max-md:w-full" role="group" aria-label="Cosa mostra il grafico">
          {(
            [
              ["pizze", "Pizze"],
              ["ricavi", "Ricavi"],
            ] as const
          ).map(([valore, testo]) => (
            <button key={valore} type="button" aria-pressed={misura === valore} onClick={() => imposta("m", valore)} className="max-md:flex-1 max-md:justify-center">
              {testo}
            </button>
          ))}
        </div>
      </div>
      <div className="segmenti mt-3 max-md:flex max-md:min-h-0 max-md:w-full" role="group" aria-label="Una barra per">
        {PASSI_GRAFICO.map((p) => (
          <button key={p.passo} type="button" aria-pressed={passo === p.passo} onClick={() => imposta("g", p.passo)} className="max-md:min-w-0 max-md:flex-1 max-md:justify-center max-md:px-0 max-md:text-[13px] max-md:tracking-tight max-[339px]:text-[12px]">
            {p.etichetta}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {q.isPending && <Caricamento />}
        {q.isError && <p className="m-0 text-[14px] font-bold text-rosso">Non riesco a leggere il grafico: {messaggioErrore(q.error)}</p>}
        {dati &&
          (dati.qualcosa ? (
            <GraficoAndamento dati={dati} misura={misura} descrizione={`${nomeMisura}, ${richiesta.titolo.toLowerCase()}, ${richiesta.date}`} />
          ) : (
            <p className="m-0 py-6 text-center text-[14px] text-spento">{misura === "pizze" ? "Nessuna pizza inserita in queste date." : "Nessun ricavo in queste date."}</p>
          ))}
      </div>
    </section>
  );
}

// «Per sede»: scontrino medio di ogni sede scelta con una barra (da zero) e, in fondo, il totale delle sedi scelte. Sulle date esatte
// del periodo (GET /statistiche/serie, `perSede` e `totale`), come i numeri in cima: la somma delle sedi e' il totale. Le sedi
// personali non ci sono (non hanno pizze e ordini: il servizio le toglie).
function ConfrontoSedi({ d, etichettaTotale }: { d: SerieStatistiche; etichettaTotale: string }) {
  const info = useSedi().info;
  const righe = d.perSede;
  const massimo = Math.max(...righe.map((r) => r.scontrinoMedioCent ?? 0), d.totale.scontrinoMedioCent ?? 0, 1);
  const larghezza = (cent: number | null) => `${((cent ?? 0) / massimo) * 100}%`;
  const dettaglio = (m: Pick<IntervalloSerie, "ordini" | "pizze" | "pizzePerOrdine">) => `${testoConteggio(m.ordini)} ordini · ${testoConteggio(m.pizze)} pizze · ${testoPizzePerOrdine(m.pizzePerOrdine)} a ordine`;
  const coloreDi = (id: number) => info(id)?.colore.testo ?? "var(--color-verdescuro)";

  return (
    <section className="scheda px-[18px] pb-2 pt-3.5 max-md:rounded-2xl md:px-6 md:pb-3 md:pt-5" aria-label="Confronto tra sedi">
      {/* Sul telefono l'etichetta a destra dice che cos'e' l'importo di ogni riga (sul computer lo dice la colonna). */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[18px] font-bold md:mb-2 md:text-[20px]">
          <span className="md:hidden">Per sede</span>
          <span className="max-md:hidden">Confronto tra sedi</span>
        </h2>
        <span className="etichettaMaiuscola md:hidden">Scontrino medio</span>
      </div>

      {/* Telefono: una riga per sede con la barra e sotto il dettaglio. */}
      <ul className="m-0 mt-1.5 list-none p-0 md:hidden">
        {righe.map((r) => (
          <li key={r.sedeId} className="border-t border-riga py-2.5">
            {/* Il nome intero, a capo se lungo (come «Per sede» del Riepilogo). */}
            <div className="flex items-start gap-2.5">
              <BadgeSede id={r.sedeId} decorativo />
              <span className="min-w-0 flex-1 break-words pt-0.5 font-bold leading-snug">{r.nome}</span>
              <b className="num">{testoEuro(r.scontrinoMedioCent)}</b>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-riga" aria-hidden="true">
              <div className="h-full" style={{ width: larghezza(r.scontrinoMedioCent), background: coloreDi(r.sedeId) }} />
            </div>
            <div className="num mt-1 text-[13px] text-spento">{r.ordini > 0 ? dettaglio(r) : "Nessun dato in questo periodo"}</div>
          </li>
        ))}
        <li className="border-t-2 border-testo py-2.5">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="inline-flex h-[26px] min-w-[26px] shrink-0 items-center justify-center rounded-lg bg-riga font-titolo text-[13px] font-bold text-testo">
              ∑
            </span>
            <span className="min-w-0 flex-1 truncate font-bold">{etichettaTotale}</span>
            <b className="num">{testoEuro(d.totale.scontrinoMedioCent)}</b>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-riga" aria-hidden="true">
            <div className="h-full bg-testo" style={{ width: larghezza(d.totale.scontrinoMedioCent) }} />
          </div>
          <div className="num mt-1 text-[13px] text-spento">{dettaglio(d.totale)}</div>
        </li>
      </ul>

      {/* Computer: tabella. */}
      <table className="w-full border-collapse max-md:hidden">
        <caption className="sr-only">Scontrino medio, ordini e pizze di ogni sede nel periodo</caption>
        <thead>
          <tr className="text-left">
            <th scope="col" className="etichettaMaiuscola w-[34px] pb-2" />
            <th scope="col" className="etichettaMaiuscola pb-2 pr-3">Sede</th>
            <th scope="col" className="etichettaMaiuscola pb-2 pr-3">Scontrino medio</th>
            <th scope="col" className="etichettaMaiuscola w-[110px] pb-2 text-right">Valore</th>
            <th scope="col" className="etichettaMaiuscola w-[90px] pb-2 text-right">Ordini</th>
            <th scope="col" className="etichettaMaiuscola w-[90px] pb-2 text-right">Pizze</th>
            <th scope="col" className="etichettaMaiuscola w-[120px] pb-2 text-right">Pizze / ordine</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.sedeId} className="border-t border-riga">
              <td className="py-3"><BadgeSede id={r.sedeId} decorativo /></td>
              <th scope="row" className="py-3 pr-3 text-left font-bold">{r.nome}</th>
              <td className="py-3 pr-3">
                <div className="h-2.5 overflow-hidden rounded-[5px] bg-riga" aria-hidden="true">
                  <div className="h-full" style={{ width: larghezza(r.scontrinoMedioCent), background: coloreDi(r.sedeId) }} />
                </div>
              </td>
              <td className="num py-3 text-right font-bold">{testoEuro(r.scontrinoMedioCent)}</td>
              <td className="num py-3 text-right">{testoConteggio(r.ordini)}</td>
              <td className="num py-3 text-right">{testoConteggio(r.pizze)}</td>
              <td className="num py-3 text-right">{testoPizzePerOrdine(r.pizzePerOrdine)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-testo font-bold">
            <td className="py-3"><span aria-hidden="true" className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-lg bg-riga font-titolo text-[13px]">∑</span></td>
            <th scope="row" className="py-3 pr-3 text-left">{etichettaTotale}</th>
            <td className="py-3 pr-3">
              <div className="h-2.5 overflow-hidden rounded-[5px] bg-riga" aria-hidden="true">
                <div className="h-full bg-testo" style={{ width: larghezza(d.totale.scontrinoMedioCent) }} />
              </div>
            </td>
            <td className="num py-3 text-right">{testoEuro(d.totale.scontrinoMedioCent)}</td>
            <td className="num py-3 text-right">{testoConteggio(d.totale.ordini)}</td>
            <td className="num py-3 text-right">{testoConteggio(d.totale.pizze)}</td>
            <td className="num py-3 text-right">{testoPizzePerOrdine(d.totale.pizzePerOrdine)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export default function Statistiche() {
  const periodo = usePeriodo("settimana", true);
  const { da, a } = periodo.intervallo;
  const sedi = useSedi();
  const filtro = sedi.parametro;
  const ultime = intervalloUltimeSettimane();

  // I numeri in cima e «Per sede» sulle date esatte del periodo (come il grafico): la somma delle sedi e' il totale in cima. Mese per
  // mese: oltre 400 mesi (un periodo libero di piu' di 33 anni) il servizio non risponde, e la schermata lo dice senza chiedere.
  // Cambiando periodo o sedi restano i numeri di prima finche' arrivano i nuovi (la schermata non sparisce e ricompare).
  const possibili = numeriPossibili(periodo.intervallo);
  const numeri = useQuery({
    queryKey: chiavi.serieStatistiche(da, a, "MESE", filtro),
    queryFn: () => api.serieStatistiche(da, a, "MESE", filtro),
    enabled: sedi.pronto && possibili,
    placeholderData: (prima) => prima,
  });
  // Il grafico segue le sedi scelte; il banner guarda sempre tutte (se manca una sede, manca, anche se non la stai guardando).
  const grafico = useQuery({ queryKey: chiavi.statistiche(ultime.da, ultime.a, filtro), queryFn: () => api.statistiche(ultime.da, ultime.a, filtro), enabled: sedi.pronto });
  const tutte = useQuery({ queryKey: chiavi.statistiche(ultime.da, ultime.a), queryFn: () => api.statistiche(ultime.da, ultime.a), enabled: sedi.pronto });

  const t = possibili ? numeri.data?.totale : undefined;
  const punti = ultimeSettimane(grafico.data?.settimane ?? []);
  // Anche con ordini ma nessun incasso (scontrino null): il grafico resta e lo dice («nessun incasso registrato»).
  const haDatiNelGrafico = punti.some((p) => p.ordini > 0);
  const incompleta = tutte.data ? ultimaIncompleta(tutte.data.settimane) : null;
  // Con una sola sede non servono i nomi: il banner dice solo quale settimana manca.
  const nomiMancanti = sedi.piuLocale && incompleta ? incompleta.sediMancanti.map((x) => x.nome) : NESSUN_NOME;
  const titolo = `Pizze e ricavi ${NOME_PERIODO[periodo.tipo]}` + (sedi.selettore ? ` · ${sedi.incluse ?? "tutte le sedi"}` : "");
  // «Per sede» con almeno due sedi del locale scelte (una personale non ha pizze e ordini e non conta).
  const sceltePerSede = sedi.selezionate.filter((s) => !s.personale);
  const conConfronto = possibili && sedi.piuLocale && sceltePerSede.length >= 2 && !!numeri.data && numeri.data.totale.ordini > 0;
  const etichettaTotale = sceltePerSede.length === sedi.locale.length ? "Tutte le sedi" : "Sedi scelte";
  // Senza pizze ne' ricavi nel periodo un solo invito: la scheda vuota con il suo pulsante (sul telefono; sul computer c'e' quello
  // della testata). Il grafico del periodo e il pulsante in fondo non ci sono, e il banner resta solo se parla di un'altra settimana.
  const vuoto = !!t && !t.conDati && t.ricaviTotaliCent === 0;
  // Non si toglie se alla settimana mancano dati anche di una sede non scelta («vuoto» riguarda le sole sedi scelte).
  const mancaSedeNonScelta = !!incompleta && incompleta.sediMancanti.some((x) => !sedi.selezionate.some((s) => s.id === x.id));
  const conBanner = !!incompleta && bannerUtile(vuoto, incompleta.settimana, periodo.intervallo, mancaSedeNonScelta);
  // Quando il banner non si ripete, i pulsanti (testata sul computer, scheda vuota sul telefono) portano alla settimana che avrebbe indicato.
  const settimanaDaInserire = incompleta && !conBanner ? incompleta.settimana : undefined;

  const pulsante = (className: string, settimana?: string) => (
    <Link to={settimana ? `${PERCORSO_INSERIMENTO}?s=${settimana}` : PERCORSO_INSERIMENTO} className={"btn primario " + className}>
      Inserisci pizze e ordini
    </Link>
  );

  return (
    <div className="flex min-h-full flex-col">
      <Testata titoloSoloComputer titolo="Statistiche" azioni={<span className="max-md:hidden">{pulsante("", settimanaDaInserire)}</span>} />
      <div className="flex flex-1 flex-col px-4 pb-24 md:px-8 md:pb-7">
        <SelettoreSedi className="pb-3" />
        <div className="pb-3 md:pb-4">
          <SelettorePeriodo periodo={periodo} senzaGiorno />
        </div>

        {!sedi.pronto && <Caricamento />}

        {/* Un errore dei numeri in cima (o del grafico, che ha il suo) non nasconde il resto della schermata. */}
        {sedi.pronto && (
          <div className="flex flex-1 flex-col gap-3 md:gap-4">
            {incompleta && conBanner && <Banner lunedi={incompleta.settimana} nomi={nomiMancanti} />}
            <CollegamentoVoci />
            <CollegamentoFatture />

            {/* Telefono e tablet: numeri, grafico, «Per sede», scontrino delle ultime settimane. Computer largo: numeri e scontrino
                affiancati, sotto il grafico e «Per sede». */}
            <div className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              {!possibili ? (
                <section className="scheda min-w-0 px-[18px] py-4 max-md:rounded-2xl md:px-6 md:py-5" aria-label={titolo}>
                  <div className="etichettaMaiuscola">{titolo}</div>
                  <p className="m-0 mt-2.5 text-[14px] text-spento">Il periodo è troppo lungo per i numeri: al massimo {MASSIMO_INTERVALLI} mesi (più di 33 anni). Scegli un periodo più breve.</p>
                </section>
              ) : numeri.isError ? (
                <section className="scheda min-w-0 max-md:rounded-2xl" aria-label={titolo}>
                  <ErroreCaricamento errore={numeri.error} onRiprova={() => void numeri.refetch()} />
                </section>
              ) : !t ? (
                <section className="scheda min-w-0 max-md:rounded-2xl" aria-label={titolo}>
                  <Caricamento />
                </section>
              ) : vuoto ? (
                // Senza lo scontrino delle ultime settimane accanto, la scheda vuota prende tutta la larghezza (non resta sola a sinistra).
                <section className={"scheda min-w-0 max-md:rounded-2xl" + (haDatiNelGrafico ? "" : " lg:col-span-2")} aria-label={titolo}>
                  <Vuoto
                    titolo="Ancora nessun dato di pizze e ordini"
                    testo="Scrivi per ogni sede quante pizze e quanti ordini, giorno per giorno o con il totale della settimana: l'app calcola lo scontrino medio dai ricavi."
                    azione={pulsante("grande md:hidden", settimanaDaInserire)}
                  />
                </section>
              ) : (
                <Riassunto t={t} titolo={titolo} />
              )}

              {haDatiNelGrafico && (
                <section className="scheda min-w-0 px-[18px] py-4 max-lg:order-4 max-md:rounded-2xl md:px-6 md:py-5" aria-label="Andamento dello scontrino medio">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="text-[18px] font-bold md:text-[20px]">Scontrino medio, ultime 8 settimane</h2>
                    <span className="etichettaMaiuscola">€ per ordine</span>
                  </div>
                  <GraficoScontrino punti={punti} />
                </section>
              )}

              {!vuoto && (
                <div className="min-w-0 max-lg:order-2 lg:col-span-2">
                  <Andamento tipo={periodo.tipo} intervallo={periodo.intervallo} filtro={filtro} abilitato={sedi.pronto} />
                </div>
              )}

              {conConfronto && (
                <div className="min-w-0 max-lg:order-3 lg:col-span-2">
                  <ConfrontoSedi d={numeri.data!} etichettaTotale={etichettaTotale} />
                </div>
              )}
            </div>

            {!vuoto && pulsante("grande w-full md:hidden")}
          </div>
        )}
        {grafico.isError && <p className="m-0 mt-3 text-[13px] text-rosso">Non riesco a leggere lo scontrino delle ultime settimane.</p>}
      </div>
    </div>
  );
}
