import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { Anagrafica, Tipo } from "../api/tipi";
import { testoMovimenti } from "../util/voci";
import AzioniVoce, { type FaseVoce, type VoceGestita } from "./AzioniVoce";
import { Caricamento, ErroreCaricamento } from "./Stati";
import { BOTTONE_RIGA, DETTAGLIO_RIGA, TESTO_INTRO, TITOLO_RIGA, TITOLO_SCHEDA } from "./stileImpostazioni";

// Impostazioni > «Elenchi»: le categorie, i fornitori e i dipendenti in un posto solo, con quanti movimenti li usano, per correggere
// un errore di battitura (Rinomina), fondere due doppioni (Unisci) o togliere una voce (Elimina). Solo computer: sul telefono le stesse
// azioni stanno nelle statistiche per voce e nella matita dei campi del movimento (docs/interfaccia.md).

const SCHEDE: { valore: Anagrafica; etichetta: string; cerca: string }[] = [
  { valore: "categorie", etichetta: "Categorie", cerca: "Cerca una categoria" },
  { valore: "fornitori", etichetta: "Fornitori", cerca: "Cerca un fornitore" },
  { valore: "dipendenti", etichetta: "Dipendenti", cerca: "Cerca un dipendente" },
];

const GRUPPI_CATEGORIE: { tipo: Tipo; titolo: string }[] = [
  { tipo: "RICAVO", titolo: "Ricavi" },
  { tipo: "COSTO_VARIABILE", titolo: "Costi variabili" },
  { tipo: "COSTO_FISSO", titolo: "Costi fissi (voci fisse)" },
];

type Riga = VoceGestita;

interface Aperta {
  anagrafica: Anagrafica;
  voce: Riga;
  fase: FaseVoce;
}

function RigaVoce({ anagrafica, voce, onApri }: { anagrafica: Anagrafica; voce: Riga; onApri: (fase: FaseVoce) => void }) {
  const classe = BOTTONE_RIGA;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-riga py-2">
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="flex items-center gap-2">
          <span className={`min-w-0 truncate ${TITOLO_RIGA}`}>{voce.nome}</span>
          {/* Un contrassegno a parole, non solo di colore: la categoria chiede dipendente, regolare ed extra. */}
          {voce.retribuzione && <span className="shrink-0 rounded-md border border-verdebordo bg-verdechiaro px-1.5 py-px text-[12px] font-bold text-verdescuro">Retribuzione</span>}
        </div>
        <div className={`num ${DETTAGLIO_RIGA}`}>{testoMovimenti(voce.usi)}</div>
      </div>
      <div className="ml-auto flex shrink-0 gap-2">
        <button type="button" className={classe} aria-label={`Rinomina «${voce.nome}»`} onClick={() => onApri("rinomina")}>
          Rinomina
        </button>
        <button type="button" className={classe} aria-label={`Unisci «${voce.nome}» con ${anagrafica === "categorie" ? "un'altra" : "un altro"}`} onClick={() => onApri("unisci")}>
          Unisci…
        </button>
        <button type="button" className={classe + " pericolo"} aria-label={`Elimina «${voce.nome}»`} onClick={() => onApri("elimina")}>
          Elimina
        </button>
      </div>
    </li>
  );
}

function ElencoScheda({ anagrafica, filtro, onApri }: { anagrafica: Anagrafica; filtro: string; onApri: (voce: Riga, fase: FaseVoce) => void }) {
  const q = useQuery({
    queryKey: anagrafica === "categorie" ? chiavi.categorie(undefined) : anagrafica === "fornitori" ? chiavi.fornitori("") : chiavi.dipendenti(""),
    queryFn: (): Promise<Riga[]> => (anagrafica === "categorie" ? api.categorie() : anagrafica === "fornitori" ? api.fornitori("") : api.dipendenti("")),
  });
  const cerca = filtro.trim().toLowerCase();
  const voci = useMemo(
    () => (q.data ?? []).filter((v) => !cerca || v.nome.toLowerCase().includes(cerca)).sort((x, y) => x.nome.localeCompare(y.nome, "it")),
    [q.data, cerca],
  );

  if (q.isPending) return <Caricamento />;
  if (q.isError) return <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />;
  if (voci.length === 0) {
    return <p className="m-0 py-6 text-center text-[15px] text-tenue">{cerca ? `Niente con «${filtro.trim()}».` : "L'elenco è vuoto: si riempie da solo, scrivendo un nome nuovo in un movimento."}</p>;
  }

  if (anagrafica !== "categorie") {
    return (
      <ul className="m-0 list-none p-0 [&>li:first-child]:border-t-0">
        {voci.map((v) => (
          <RigaVoce key={v.id} anagrafica={anagrafica} voce={v} onApri={(fase) => onApri(v, fase)} />
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {GRUPPI_CATEGORIE.map((g) => {
        const delGruppo = voci.filter((v) => v.tipo === g.tipo);
        if (delGruppo.length === 0) return null;
        return (
          <section key={g.tipo} aria-label={g.titolo}>
            <h3 className="mb-1 flex items-baseline gap-2 text-[16px] font-bold">
              {g.titolo}
              <span className="num text-[13px] font-normal text-spento">{delGruppo.length}</span>
            </h3>
            <ul className="m-0 list-none p-0">
              {delGruppo.map((v) => (
                <RigaVoce key={v.id} anagrafica={anagrafica} voce={v} onApri={(fase) => onApri(v, fase)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default function SezioneElenchi() {
  const [scheda, setScheda] = useState<Anagrafica>("categorie");
  const [filtro, setFiltro] = useState("");
  const [aperta, setAperta] = useState<Aperta | null>(null);
  const idCerca = useId();
  const corrente = SCHEDE.find((s) => s.valore === scheda) ?? SCHEDE[0]!;

  return (
    <section className="scheda min-w-0 px-6 py-[22px]" aria-label="Elenchi">
      <h2 className={TITOLO_SCHEDA}>Elenchi</h2>
      <p className={TESTO_INTRO}>
        Correggi un nome scritto male, unisci due voci uguali o togli quelle che non servono. I movimenti già registrati restano: se elimini una voce, restano senza.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Quale elenco" className="segmenti max-md:w-full max-md:[&>button]:flex-1 max-md:[&>button]:justify-center max-md:[&>button]:!px-2">
          {SCHEDE.map((s) => (
            <button
              key={s.valore}
              type="button"
              aria-pressed={scheda === s.valore}
              onClick={() => {
                setScheda(s.valore);
                setFiltro("");
              }}
            >
              {s.etichetta}
            </button>
          ))}
        </div>
        <div className="min-w-[220px] flex-1 basis-[260px] md:max-w-[340px]">
          <label htmlFor={idCerca} className="sr-only">
            {corrente.cerca}
          </label>
          <div className="campo">
            <input id={idCerca} type="search" autoComplete="off" placeholder={corrente.cerca} value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          </div>
        </div>
      </div>

      <div aria-live="polite">
        <ElencoScheda anagrafica={scheda} filtro={filtro} onApri={(voce, fase) => setAperta({ anagrafica: scheda, voce, fase })} />
      </div>

      {aperta && (
        <AzioniVoce
          key={`${aperta.anagrafica}-${aperta.voce.id}-${aperta.fase}`}
          anagrafica={aperta.anagrafica}
          voce={aperta.voce}
          inizio={aperta.fase}
          onChiudi={() => setAperta(null)}
        />
      )}
    </section>
  );
}
