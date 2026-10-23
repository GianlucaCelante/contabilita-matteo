import { useId, useMemo, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ErroreRichiesta, messaggioErrore } from "../api/client";
import { apiImporta, type AnteprimaImportazione, type ErroreFileImportato, type FatturaLetta } from "../api/importa";
import Combobox from "../componenti/Combobox";
import { IconaAllarme, IconaCarica, IconaCerca, IconaCercaDiNuovo, IconaGiu, IconaInfo } from "../componenti/Icone";
import SelettoreModalita from "../componenti/SelettoreModalita";
import { Caricamento, Vuoto } from "../componenti/Stati";
import Testata from "../componenti/Testata";
import { useAvviso } from "../hooks/useAvviso";
import { useSuggerimentiCategorie } from "../hooks/useSuggerimenti";
import { conteggiFiltri, filtraFatture, raggruppaErrori, riassuntoSelezione, testoRiassunto, type Filtro } from "../util/anteprimaImportazione";
import { dataBreve, euro } from "../util/formato";

const PAGINA = 50; // quante righe dell'anteprima si disegnano alla volta: con centinaia di fatture la pagina sarebbe lentissima
const FILTRI: { valore: Filtro; etichetta: string }[] = [
  { valore: "tutte", etichetta: "Tutte" },
  { valore: "daImportare", etichetta: "Da importare" },
  { valore: "giaPresenti", etichetta: "Già presenti" },
  { valore: "noteDiCredito", etichetta: "Note di credito" },
  { valore: "integrazioni", etichetta: "Integrazioni" },
  { valore: "escluse", etichetta: "Escluse" },
];
const INVALIDA = ["movimenti", "movimento", "riepilogo", "fornitori", "categorie"];
const SITO_AGENZIA = "https://www.agenziaentrate.gov.it";

// ---- riquadro «Dove trovo le fatture?» ----
// I nomi delle voci del portale (Fatture e Corrispettivi, «ricevute», esportazione) sono quelli del mockup
// approvato e NON sono stati verificati sul sito vivo dell'Agenzia delle Entrate: controllarli prima del rilascio.

const PASSI: { id: string; testo: ReactNode }[] = [
  {
    id: "accesso",
    testo: (
      <>
        Entra nell&apos;area riservata con SPID, CIE o CNS e apri <b>Fatture e Corrispettivi</b>.
      </>
    ),
  },
  {
    id: "ricerca",
    testo: (
      <>
        Scegli le fatture <b>ricevute</b> e il periodo, poi richiedi l&apos;esportazione di tutte le fatture.
      </>
    ),
  },
  {
    id: "scarico",
    testo: (
      <>
        Scarica il file <b>.zip</b> e trascinalo qui: dentro ci sono tutti gli XML.
      </>
    ),
  },
];

function RiquadroDove({ id }: { id: string }) {
  return (
    <section id={id} aria-label="Dove trovo le fatture?" className="scheda flex flex-col gap-4 px-5 py-4 md:flex-row md:gap-7 md:px-6">
      <div className="md:w-[240px] md:shrink-0">
        <h2 className="text-[18px] font-bold">Dove trovo le fatture?</h2>
        <p className="m-0 mt-1.5 text-[14px] leading-snug text-spento">
          Sul sito dell&apos;Agenzia delle Entrate, nell&apos;area riservata. Se non hai l&apos;accesso, il commercialista può scaricarle per te.
        </p>
        <a href={SITO_AGENZIA} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[14px] font-bold text-verde underline">
          Apri il sito dell&apos;Agenzia delle Entrate
        </a>
      </div>
      <ol className="m-0 flex min-w-0 flex-1 list-none flex-col gap-3 p-0 md:flex-row md:gap-3.5">
        {PASSI.map((p, i) => (
          <li key={p.id} className="flex min-w-0 flex-1 gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-verdechiaro text-[14px] font-bold text-verdescuro" aria-hidden="true">
              {i + 1}
            </span>
            <span className="text-[14px] leading-snug">
              <span className="sr-only">Passo {i + 1}: </span>
              {p.testo}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- zona di caricamento ----

function ZonaCaricamento({ onFile, occupato }: { onFile: (file: File[]) => void; occupato: boolean }) {
  const idInput = useId();
  const idRiquadro = useId();
  const [aperto, setAperto] = useState(false);
  const [sopra, setSopra] = useState(false);

  function suDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setSopra(false);
    if (!occupato && e.dataTransfer.files.length > 0) onFile([...e.dataTransfer.files]);
  }
  function suScelta(e: ChangeEvent<HTMLInputElement>) {
    const scelti = e.target.files ? [...e.target.files] : [];
    e.target.value = ""; // cosi' si puo' scegliere di nuovo lo stesso file
    if (scelti.length > 0) onFile(scelti);
  }

  return (
    <>
      <section
        aria-label="Carica le fatture"
        onDragOver={(e) => {
          e.preventDefault();
          setSopra(true);
        }}
        onDragLeave={() => setSopra(false)}
        onDrop={suDrop}
        className={
          "flex flex-col gap-4 rounded-[18px] border-2 border-dashed px-5 py-4 md:min-h-[88px] md:flex-row md:items-center md:justify-between md:gap-6 md:px-7 md:py-2 " +
          (sopra ? "border-verde bg-verdechiaro" : "border-tratteggio bg-crema")
        }
      >
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verdechiaro text-verdescuro">
            <IconaCarica larghezza={24} />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[17px] font-bold">Trascina qui gli XML o lo ZIP delle fatture</p>
            <p className="m-0 text-[14px] text-spento">
              Uno o più file .xml (anche firmati, .xml.p7m), oppure uno .zip con dentro tutti gli XML. Vengono lette sul computer, non inviate da nessuna parte.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:shrink-0 md:flex-nowrap">
          <button type="button" className="btn grande !gap-2 !px-[18px] !text-[15px] text-verdescuro" aria-expanded={aperto} aria-controls={idRiquadro} onClick={() => setAperto((a) => !a)}>
            <IconaInfo larghezza={20} spessoreTratto={2} />
            <span>Dove trovo i file?</span>
          </button>
          <input id={idInput} type="file" multiple accept=".xml,.p7m,.zip" className="peer sr-only" disabled={occupato} onChange={suScelta} />
          <label
            htmlFor={idInput}
            className="btn grande !px-[22px] peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-verde peer-disabled:opacity-55"
          >
            Scegli i file
          </label>
        </div>
      </section>
      {aperto && <RiquadroDove id={idRiquadro} />}
    </>
  );
}

// ---- riga dell'anteprima ----

interface ProprietaRiga {
  f: FatturaLetta;
  selezionata: boolean;
  categoria: string;
  onSeleziona: (valore: boolean) => void;
  onCategoria: (valore: string) => void;
}

function RigaFattura({ f, selezionata, categoria, onSeleziona, onCategoria }: ProprietaRiga) {
  const sugg = useSuggerimentiCategorie("COSTO_VARIABILE", categoria);
  const nota = f.notaDiCredito;
  const etichetta = `Categoria della fattura ${f.numero} di ${f.fornitore.nome}`;
  return (
    <li
      className={
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-riga px-4 py-3 " +
        "@min-[1000px]:min-h-[72px] @min-[1000px]:grid-cols-[44px_minmax(0,1.4fr)_minmax(0,0.8fr)_64px_minmax(0,96px)_minmax(0,80px)_minmax(0,104px)_minmax(0,1.2fr)] @min-[1000px]:gap-y-0 @min-[1000px]:px-5 " +
        (f.duplicata ? "bg-ambrachiaro" : "")
      }
    >
      <input
        type="checkbox"
        className="h-6 w-6 accent-verde"
        checked={selezionata}
        disabled={f.duplicata}
        onChange={(e) => onSeleziona(e.target.checked)}
        aria-label={`Importa la fattura ${f.numero} di ${f.fornitore.nome}`}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-bold" title={f.fornitore.nome}>{f.fornitore.nome}</span>
          {nota && <span className="etichettaTipo shrink-0 bg-verdechiaro text-verdescuro">Nota di credito</span>}
          {f.integrazione && <span className="etichettaTipo shrink-0 bg-sabbia text-spento" title="Autofattura per un acquisto dall'estero: conta come costo">Integrazione</span>}
        </div>
        {f.duplicata ? (
          <div className="text-[13px] font-bold text-ambra">{f.motivo ?? "Già registrata"}: non verrà aggiunta</div>
        ) : (
          f.fornitore.partitaIva && <div className="text-[13px] text-spento">P.IVA {f.fornitore.partitaIva}</div>
        )}
      </div>
      <span className="num truncate text-[15px] @max-[999px]:hidden" title={f.numero}>{f.numero}</span>
      <span className="num text-[15px] @max-[999px]:hidden">{dataBreve(f.data).slice(0, 5)}</span>
      <span className="num text-right text-[15px] @max-[999px]:hidden">{euro(f.imponibileCent)}</span>
      <span className="num text-right text-[15px] @max-[999px]:hidden">{euro(f.ivaCent)}</span>
      <b className="num whitespace-nowrap text-right text-[15px]">{euro(f.totaleCent)}</b>

      <p className="num col-span-2 col-start-2 m-0 text-[13px] text-spento @min-[1000px]:hidden">
        N. {f.numero} · {dataBreve(f.data)} · imponibile {euro(f.imponibileCent)} · IVA {euro(f.ivaCent)}
      </p>

      <div className="col-span-3 min-w-0 @min-[1000px]:col-span-1">
        <span className="etichettaMaiuscola @min-[1000px]:hidden">Categoria</span>
        {f.duplicata ? (
          <span className="text-[14px] text-spento">{f.categoriaSuggerita ?? "–"}</span>
        ) : (
          <div className="[&_.etichetta]:sr-only">
            <Combobox
              etichetta={etichetta}
              cosa="categoria" genere="f"
              value={categoria}
              onChange={onCategoria}
              opzioni={sugg.opzioni}
              inCaricamento={sugg.inCaricamento}
              errore={sugg.errore}
              facoltativo
            />
          </div>
        )}
      </div>
    </li>
  );
}

// ---- file non importati, raggruppati per motivo ----

function Scarti({ errori }: { errori: ErroreFileImportato[] }) {
  const gruppi = useMemo(() => raggruppaErrori(errori), [errori]);
  const [aperto, setAperto] = useState<string | null>(null);
  return (
    <section aria-label="File non importati" className="rounded-[18px] border border-ambrabordo bg-ambrachiaro px-5 py-4">
      <h2 className="flex items-center gap-2 text-[17px] font-bold text-ambra">
        <IconaAllarme larghezza={20} spessoreTratto={2} />
        {errori.length === 1 ? "1 file non importato" : `${errori.length} file non importati`}
      </h2>
      <ul className="m-0 mt-2 flex list-none flex-col p-0">
        {gruppi.map((g) => {
          const espanso = aperto === g.messaggio;
          return (
            <li key={g.messaggio} className="border-t border-ambrabordo first:border-t-0">
              <button
                type="button"
                aria-expanded={espanso}
                onClick={() => setAperto(espanso ? null : g.messaggio)}
                className="flex min-h-[44px] w-full items-center gap-3 py-1.5 text-left text-[14px]"
              >
                <b className="num min-w-[2ch] text-right">{g.file.length}</b>
                <span className="min-w-0 flex-1">{g.messaggio}</span>
                <span className="text-[13px] font-bold underline">{espanso ? "Nascondi i file" : "Mostra i file"}</span>
                <IconaGiu larghezza={16} spessoreTratto={2} className={espanso ? "rotate-180" : ""} />
              </button>
              {espanso && (
                <ul className="m-0 mb-2 max-h-48 list-none overflow-auto rounded-lg bg-carta p-2 text-[13px]">
                  {g.file.map((nome, i) => (
                    <li key={nome + i} className="break-all py-0.5">
                      {nome}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- anteprima con conferma ----

function Anteprima({ dati, fonte, onScaduta, onAltri }: { dati: AnteprimaImportazione; fonte: string; onScaduta: () => void; onAltri: () => void }) {
  const navigate = useNavigate();
  const avvisa = useAvviso();
  const client = useQueryClient();
  const [escluse, setEscluse] = useState<Set<number>>(() => new Set());
  const [categorie, setCategorie] = useState<Record<number, string>>(() =>
    Object.fromEntries(dati.fatture.map((f) => [f.indice, f.categoriaSuggerita ?? ""])),
  );

  const [testo, setTesto] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [mostrate, setMostrate] = useState(PAGINA);

  const selezionate = useMemo(() => dati.fatture.filter((f) => !f.duplicata && !escluse.has(f.indice)), [dati.fatture, escluse]);
  const riassunto = useMemo(() => riassuntoSelezione(selezionate), [selezionate]);
  const conteggi = useMemo(() => conteggiFiltri(dati.fatture, escluse), [dati.fatture, escluse]);
  const visibili = useMemo(() => filtraFatture(dati.fatture, { testo, filtro }, escluse), [dati.fatture, testo, filtro, escluse]);
  const cosa = riassunto.note > 0 ? "documenti" : "fatture";

  const conferma = useMutation({
    mutationFn: () =>
      apiImporta.conferma(
        dati.importazioneId,
        selezionate.map((f) => ({ indice: f.indice, categoria: (categorie[f.indice] ?? "").trim() || null })),
      ),
    onSuccess: (esito) => {
      for (const k of INVALIDA) void client.invalidateQueries({ queryKey: [k] });
      const non = esito.ignorate.length;
      if (esito.importati === 0) {
        avvisa(non > 0 ? `Nessuna fattura importata: ${esito.ignorate[0]?.motivo ?? "controlla le righe"}` : "Nessuna fattura importata.", { tipo: "errore" });
        return;
      }
      avvisa(
        `${esito.importati === 1 ? "Importato 1 documento" : `Importati ${esito.importati} ${cosa}`}` +
          (non > 0 ? `; ${non === 1 ? "1 non è stata aggiunta" : `${non} non sono state aggiunte`} (${esito.ignorate[0]?.motivo ?? "già presenti"}).` : "."),
      );
      void navigate("/movimenti");
    },
    onError: (e) => {
      if (e instanceof ErroreRichiesta && e.stato === 404) onScaduta();
      else avvisa(messaggioErrore(e), { tipo: "errore" });
    },
  });

  function imposta(indice: number, selezionata: boolean) {
    setEscluse((prima) => {
      const dopo = new Set(prima);
      if (selezionata) dopo.delete(indice);
      else dopo.add(indice);
      return dopo;
    });
  }

  // Seleziona o deseleziona tutte le righe che si vedono (quelle gia' registrate non si possono selezionare).
  function impostaVisibili(selezionata: boolean) {
    setEscluse((prima) => {
      const dopo = new Set(prima);
      for (const f of visibili) {
        if (f.duplicata) continue;
        if (selezionata) dopo.delete(f.indice);
        else dopo.add(f.indice);
      }
      return dopo;
    });
  }
  function cambiaFiltro(valore: Filtro) {
    setFiltro(valore);
    setMostrate(PAGINA);
  }

  const n = dati.fatture.length;
  const mostraFiltri = FILTRI.filter((f) => f.valore === "tutte" || conteggi[f.valore] > 0);
  const selezionabiliVisibili = visibili.filter((f) => !f.duplicata);
  const tutteVisibiliSelezionate = selezionabiliVisibili.length > 0 && selezionabiliVisibili.every((f) => !escluse.has(f.indice));
  return (
    <>
      {dati.errori.length > 0 && <Scarti errori={dati.errori} />}

      {n === 0 ? (
        <section className="scheda">
          <Vuoto
            titolo="Nessuna fattura da importare"
            testo="Nei file scelti non ho trovato fatture che si possano importare. Prova con altri file."
            azione={
              <button type="button" className="btn" onClick={onAltri}>
                Scegli altri file
              </button>
            }
          />
        </section>
      ) : (
        <section className="scheda" aria-label="Fatture lette">
          <div className="flex min-h-[52px] items-center px-5 py-3">
            <h2 className="text-[18px] font-bold">
              {n === 1 ? "1 fattura letta" : `${n} fatture lette`} da {fonte} · controlla e conferma
            </h2>
          </div>
          {n > 8 && (
            <div className="flex flex-col gap-3 border-t border-riga px-5 py-3 md:flex-row md:items-center">
              <label className="campo min-w-0 flex-1 !min-h-[44px] !rounded-xl !border-bordo2 !px-4 md:max-w-[340px]">
                <IconaCerca larghezza={20} spessoreTratto={2} className="text-spento" />
                <span className="sr-only">Cerca per fornitore o numero</span>
                <input
                  type="search"
                  value={testo}
                  onChange={(e) => {
                    setTesto(e.target.value);
                    setMostrate(PAGINA);
                  }}
                  placeholder="Cerca fornitore o numero…"
                  className="!text-[16px]"
                />
              </label>
              <div className="segmenti max-w-full overflow-x-auto max-md:min-h-0" role="group" aria-label="Quali fatture mostrare">
                {mostraFiltri.map((f) => (
                  <button key={f.valore} type="button" aria-pressed={filtro === f.valore} onClick={() => cambiaFiltro(f.valore)}>
                    {f.etichetta} <span className="num ml-1.5 font-normal">{conteggi[f.valore]}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn md:ml-auto" disabled={selezionabiliVisibili.length === 0} onClick={() => impostaVisibili(!tutteVisibiliSelezionate)}>
                {tutteVisibiliSelezionate ? "Deseleziona" : "Seleziona"} {testo.trim() || filtro !== "tutte" ? "le visibili" : "tutte"}
              </button>
            </div>
          )}
          <div role="table" aria-label="Fatture lette" className="@container">
            <div role="row" className="hidden h-[42px] grid-cols-[44px_minmax(0,1.4fr)_minmax(0,0.8fr)_64px_minmax(0,96px)_minmax(0,80px)_minmax(0,104px)_minmax(0,1.2fr)] items-center gap-x-3 px-5 @min-[1000px]:grid">
              {["Importa", "Fornitore", "N. fattura", "Data", "Imponibile", "IVA", "Totale", "Categoria"].map((t, i) => (
                <span key={t} role="columnheader" className={"etichettaMaiuscola" + (i >= 4 && i <= 6 ? " text-right" : "")}>
                  {i === 0 ? <span className="sr-only">{t}</span> : t}
                </span>
              ))}
            </div>
            <ul className="m-0 list-none p-0">
              {visibili.slice(0, mostrate).map((f) => (
                <RigaFattura
                  key={f.indice}
                  f={f}
                  selezionata={!f.duplicata && !escluse.has(f.indice)}
                  categoria={categorie[f.indice] ?? ""}
                  onSeleziona={(v) => imposta(f.indice, v)}
                  onCategoria={(v) => setCategorie((c) => ({ ...c, [f.indice]: v }))}
                />
              ))}
            </ul>
            {visibili.length === 0 && <p className="m-0 border-t border-riga px-5 py-6 text-center text-[15px] text-spento">Nessuna fattura corrisponde alla ricerca.</p>}
            {visibili.length > mostrate && (
              <div className="flex justify-center border-t border-riga px-5 py-4">
                <button type="button" className="btn" onClick={() => setMostrate((m) => m + PAGINA)}>
                  Mostra altre {Math.min(PAGINA, visibili.length - mostrate)} (ne restano {visibili.length - mostrate})
                </button>
              </div>
            )}
          </div>
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-[18px] border-t border-riga bg-crema px-5 py-4 max-md:bottom-[calc(var(--d-nav)+env(safe-area-inset-bottom))]">
            <p className="m-0 text-[15px]" role="status">
              {selezionate.length} da importare · <b className="num">{testoRiassunto(riassunto)}</b>
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn grande" onClick={() => void navigate("/movimenti")}>
                Annulla
              </button>
              <button type="button" className="btn primario grande" disabled={selezionate.length === 0 || conferma.isPending} onClick={() => conferma.mutate()}>
                {conferma.isPending ? "Importo…" : selezionate.length === 1 ? "Importa 1 documento" : `Importa ${selezionate.length} ${cosa}`}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

// ---- schermata ----

export default function ImportaFatture() {
  const avvisa = useAvviso();
  const [file, setFile] = useState<File[]>([]);
  const [dati, setDati] = useState<AnteprimaImportazione | null>(null);
  const [scaduta, setScaduta] = useState(false);

  const leggi = useMutation({
    mutationFn: (scelti: File[]) => apiImporta.anteprima(scelti),
    onSuccess: (risposta) => {
      setDati(risposta);
      setScaduta(false);
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });

  function carica(scelti: File[]) {
    setFile(scelti);
    setDati(null);
    setScaduta(false);
    leggi.mutate(scelti);
  }
  function altri() {
    setDati(null);
    setFile([]);
    leggi.reset();
  }

  const fonte = file.length === 1 ? (file[0]?.name ?? "il file") : `${file.length} file`;

  return (
    <>
      <Testata titolo="Nuovo movimento" indietro="/movimenti" azioni={<SelettoreModalita attiva="importa" />} />
      <div className="flex flex-col gap-4 px-4 pb-28 md:px-8 md:pb-8">
        <ZonaCaricamento onFile={carica} occupato={leggi.isPending} />

        {leggi.isPending && (
          <div className="scheda">
            <Caricamento testo="Leggo i file…" />
          </div>
        )}

        {leggi.isError && !leggi.isPending && (
          <div role="alert" className="scheda flex flex-col items-center gap-3 p-8 text-center">
            <p className="m-0 text-[16px] font-bold text-rosso">{messaggioErrore(leggi.error)}</p>
            <button type="button" className="btn" onClick={() => leggi.mutate(file)}>
              <IconaCercaDiNuovo larghezza={18} spessoreTratto={2} />
              <span>Riprova</span>
            </button>
          </div>
        )}

        {scaduta && (
          <div role="alert" className="rounded-[18px] border border-ambrabordo bg-ambrachiaro px-5 py-4">
            <p className="m-0 text-[16px] font-bold text-ambra">L&apos;importazione è scaduta: rileggi i file.</p>
            <p className="m-0 mt-1 text-[14px]">Per sicurezza le fatture lette restano in memoria solo 30 minuti. Non è stato importato nulla.</p>
            <button type="button" className="btn primario mt-3" onClick={() => carica(file)}>
              <IconaCercaDiNuovo larghezza={18} spessoreTratto={2} />
              <span>Rileggi i file</span>
            </button>
          </div>
        )}

        {dati && !scaduta && !leggi.isPending && <Anteprima key={dati.importazioneId} dati={dati} fonte={fonte} onScaduta={() => setScaduta(true)} onAltri={altri} />}
      </div>
    </>
  );
}
