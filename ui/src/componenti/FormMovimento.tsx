import { useId, useMemo, useState, type InputHTMLAttributes, type ReactNode } from "react";
import AzioniVoce, { type EsitoVoce } from "./AzioniVoce";
import BadgeSede from "./BadgeSede";
import Combobox, { type ModificaVoci } from "./Combobox";
import Interruttore from "./Interruttore";
import SceltaFrequenza from "./SceltaFrequenza";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { useSedi } from "../hooks/useSedi";
import { useSuggerimentiCategorie, useSuggerimentiDipendenti, useSuggerimentiFornitori, type VoceSuggerita } from "../hooks/useSuggerimenti";
import {
  alternaSede,
  campiDaVoceFissa,
  chiedeDescrizione,
  chiedeFornitore,
  opzioniVoce,
  ripetibile,
  sediDelleDivisione,
  voceFissaNuova,
  type CampiForm,
  type Errori,
} from "../util/modelloMovimento";
import type { Anagrafica, Tipo } from "../api/tipi";
import { leggiEuro } from "../util/formato";
import { anteprimaDivisione } from "../util/sedi";

interface Opzione<T extends string> {
  valore: T;
  etichetta: string;
  ambra?: boolean;
  bruno?: boolean;
}

// Scelta esclusiva a pulsanti grandi (radiogroup).
function Scelte<T extends string>({
  legenda,
  valore,
  opzioni,
  onScegli,
  bassa,
}: {
  legenda: string;
  valore: T;
  opzioni: Opzione<T>[];
  onScegli: (v: T) => void;
  // 52 px invece di 56 (dettaglio)
  bassa?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <div id={id} className="etichetta">
        {legenda}
      </div>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2 md:gap-2.5">
        {opzioni.map((o) => (
          <button
            key={o.valore}
            type="button"
            role="radio"
            aria-checked={valore === o.valore}
            className={"scelta max-md:min-h-[52px] max-md:px-0 max-md:text-[15px]" + (bassa ? " min-h-[52px]" : "") + (o.ambra ? " ambra" : "") + (o.bruno ? " bruno" : "")}
            onClick={() => onScegli(o.valore)}
          >
            {o.etichetta}
          </button>
        ))}
      </div>
    </div>
  );
}

function Campo({
  etichetta,
  facoltativo,
  errore,
  suffisso,
  nota,
  ...input
}: {
  etichetta: ReactNode;
  facoltativo?: boolean;
  errore?: string | undefined;
  suffisso?: string;
  // Una riga di spiegazione sotto il campo (se non c'e' un errore).
  nota?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="etichetta">
        {etichetta} {facoltativo && <span className="font-normal">(facoltativo)</span>}
      </label>
      <div className={"campo" + (errore ? " errore" : "")}>
        <input id={id} aria-invalid={errore ? true : undefined} aria-describedby={errore ? `${id}-e` : nota ? `${id}-n` : undefined} {...input} />
        {suffisso && <span className="text-spento">{suffisso}</span>}
      </div>
      {errore && (
        <p id={`${id}-e`} className="m-0 mt-1 text-[13px] font-bold text-rosso">
          {errore}
        </p>
      )}
      {nota && !errore && (
        <p id={`${id}-n`} className="m-0 mt-1 text-[13px] text-spento">
          {nota}
        </p>
      )}
    </div>
  );
}

const TIPI: Opzione<Tipo>[] = [
  { valore: "RICAVO", etichetta: "Ricavo" },
  { valore: "COSTO_VARIABILE", etichetta: "Costo variabile", ambra: true },
  { valore: "COSTO_FISSO", etichetta: "Costo fisso", bruno: true },
];


const OPZIONI_RICAVO: Opzione<"RICAVO_FATTURATO" | "RICAVO_EXTRA">[] = [
            { valore: "RICAVO_FATTURATO", etichetta: "Con fattura" },
            { valore: "RICAVO_EXTRA", etichetta: "Senza fattura (extra)" },
          ];

const OPZIONI_DOCUMENTO: Opzione<"FATTURA" | "NOTA_DI_CREDITO" | "SCONTRINO">[] = [
            { valore: "FATTURA", etichetta: "Fattura" },
            { valore: "SCONTRINO", etichetta: "Scontrino" },
          ];
// Una nota di credito arriva dall'importazione: a mano non si crea, ma se c'e' si puo' modificare senza cambiarne il documento.
const OPZIONI_CON_NOTA: Opzione<"FATTURA" | "NOTA_DI_CREDITO" | "SCONTRINO">[] = [
  ...OPZIONI_DOCUMENTO,
  { valore: "NOTA_DI_CREDITO", etichetta: "Nota di credito" },
];

const OPZIONI_RETRIBUZIONE: Opzione<"REGOLARE" | "EXTRA">[] = [
                { valore: "REGOLARE", etichetta: "Regolare" },
                { valore: "EXTRA", etichetta: "Extra" },
              ];

// Il campo del modulo che contiene il nome di una voce (la voce fissa e' la categoria di un costo fisso).
type CampoVoce = "fornitore" | "dipendente" | "categoria" | "voceFissa";

interface ProprietaForm {
  campi: CampiForm;
  onCambia: (parziale: Partial<CampiForm>) => void;
  errori: Errori;
  // In modifica il tipo di movimento non si cambia e la ripetizione si gestisce a parte.
  modifica?: boolean;
  // Il campo dell'allegato (solo in «Nuovo»): sul computer sta accanto alle Note, sul telefono accanto al N. fattura.
  allegato?: ReactNode;
}

// La riga «Ripeti»: interruttore e, da acceso, la frequenza («Ogni mese, il giorno N» oppure personalizzata).
function RigaRipeti({ campi, onAccendi, onCambia, errori }: { campi: CampiForm; onAccendi: () => void; onCambia: (parziale: Partial<CampiForm>) => void; errori: Errori }) {
  return (
    <div className="rounded-xl border border-bordo2 bg-crema px-[18px] py-1 max-md:px-3">
      <button
        type="button"
        role="switch"
        aria-checked={campi.ripeti}
        className="flex min-h-14 w-full items-center gap-3.5 text-left max-md:gap-3"
        onClick={onAccendi}
      >
        <span className={"interruttoreCompatto" + (campi.ripeti ? "" : " off")} aria-hidden="true" />
        <span className="text-[16px] font-bold">Ripeti</span>
      </button>
      {campi.dividi && campi.ripeti && (
        <p className="m-0 pb-3 text-[13px] text-spento">Ogni sede ripete la sua parte: i mesi dopo escono già divisi.</p>
      )}
      {campi.ripeti && (
        <div className="pb-3.5">
          <SceltaFrequenza campi={campi} errori={errori} onCambia={onCambia} />
        </div>
      )}
    </div>
  );
}

// «Di quale sede»: una pillola con la lettera per ogni sede attiva. In creazione si possono scegliere una, due o tutte le sedi
// (si toccano le pillole che servono; «Tutte, dividi» le sceglie in un colpo): con due o piu' un movimento per sede, importo
// diviso in parti uguali. In modifica la sede si puo' cambiare ma non dividere. Compare solo con almeno due sedi attive.
function SceltaSede({ campi, onCambia, errore, modifica }: { campi: CampiForm; onCambia: (parziale: Partial<CampiForm>) => void; errore?: string | undefined; modifica?: boolean }) {
  const sedi = useSedi();
  const id = useId();
  if (!sedi.piu) return null;
  // Una sede archiviata resta visibile se e' quella del movimento che si sta modificando.
  const archiviataAttuale = modifica ? sedi.sedi.find((s) => s.archiviata && s.id === campi.sedeId) : undefined;
  const opzioni = archiviataAttuale ? [archiviataAttuale, ...sedi.attive] : sedi.attive;
  const idAttive = sedi.attive.map((s) => s.id);
  const divise = campi.dividi ? sediDelleDivisione(campi, idAttive) : [];
  const importo = leggiEuro(campi.importo);
  const anteprima = campi.dividi && importo !== null && importo > 0 ? anteprimaDivisione(importo, divise.length) : "";
  const tutteScelte = campi.dividi && divise.length === idAttive.length;
  const nomi = sedi.attive.filter((s) => divise.includes(s.id)).map((s) => s.nome);
  const nomiDivise = nomi.length > 1 ? `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}` : nomi.join("");
  return (
    <div>
      <div id={id} className="etichetta">
        {modifica ? "Di quale sede" : "Di quale sede (una o più)"}
      </div>
      <div role={modifica ? "radiogroup" : "group"} aria-labelledby={id} aria-describedby={errore ? `${id}-e` : undefined} className="flex flex-wrap gap-2">
        {opzioni.map((s) => {
          const scelta = campi.dividi ? divise.includes(s.id) : campi.sedeId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role={modifica ? "radio" : "checkbox"}
              aria-checked={scelta}
              className="pillaSede"
              onClick={() => onCambia(modifica ? { sedeId: s.id, dividi: false, sediDivise: [] } : alternaSede(campi, s.id, idAttive))}
            >
              <BadgeSede id={s.id} taglia="piccolo" decorativo />
              {s.nome}
              {s.archiviata ? " (archiviata)" : ""}
            </button>
          );
        })}
        {!modifica && (
          <button
            type="button"
            role="checkbox"
            aria-checked={tutteScelte}
            className="pillaSede senzaBadge"
            onClick={() => onCambia(tutteScelte ? { dividi: false, sedeId: null, sediDivise: [] } : { dividi: true, sedeId: null, sediDivise: [] })}
          >
            Tutte, dividi
          </button>
        )}
      </div>
      {campi.dividi && (
        <p className="m-0 mt-1.5 text-[13px] text-spento" aria-live="polite">
          {anteprima ? (
            <>
              Diviso fra {tutteScelte ? `le ${divise.length} sedi` : nomiDivise}: <b className="num text-testo">{anteprima}</b>
            </>
          ) : (
            `Scrivi l'importo: lo divido in parti uguali fra ${tutteScelte ? `le ${divise.length} sedi` : nomiDivise}.`
          )}
        </p>
      )}
      {errore && (
        <p id={`${id}-e`} className="m-0 mt-1 text-[13px] font-bold text-rosso">
          {errore}
        </p>
      )}
    </div>
  );
}

// Il modulo di un movimento, uguale per «Nuovo» e per il dettaglio. I campi
// cambiano col tipo: variabile = documento + fornitore + categoria;
// fisso = voce fissa (+ retribuzione e dipendente); ricavo = fatturato/extra.
// Sul computer l'ordine segue il mockup a tre colonne, sul telefono quello a due.
export default function FormMovimento({ campi, onCambia, errori, modifica, allegato }: ProprietaForm) {
  const grande = useSchermoGrande();
  const fornitori = useSuggerimentiFornitori(campi.fornitore);
  const dipendenti = useSuggerimentiDipendenti(campi.dipendente);
  const categorie = useSuggerimentiCategorie(campi.tipo, campi.categoria);
  // La voce fissa e' una categoria dei costi fissi, scelta o creata da chi usa l'app (nessun nome e' scritto nel codice).
  const categorieFisse = useSuggerimentiCategorie("COSTO_FISSO", "");
  const vociFisse = useMemo(() => opzioniVoce(campi.categoria, categorieFisse.opzioni), [campi.categoria, categorieFisse.opzioni]);
  // La matita dei campi di scelta: rinomina, unisci o elimina la voce. Se il campo conteneva proprio quella voce, si aggiorna.
  const [gestita, setGestita] = useState<{ anagrafica: Anagrafica; campo: CampoVoce; voce: VoceSuggerita } | null>(null);
  const modificaPer = (anagrafica: Anagrafica, campo: CampoVoce, voci: VoceSuggerita[]): ModificaVoci => {
    const cerca = (nome: string) => voci.find((v) => v.nome.toLowerCase() === nome.trim().toLowerCase());
    return { puo: (nome) => !!cerca(nome), apri: (nome) => { const voce = cerca(nome); if (voce) setGestita({ anagrafica, campo, voce }); } };
  };
  function dopoGestione(esito: EsitoVoce) {
    if (!gestita) return;
    const { campo, voce } = gestita;
    const attuale = campo === "voceFissa" ? campi.categoria : campi[campo];
    if (attuale.trim().toLowerCase() !== voce.nome.toLowerCase()) return;
    const nuovo = esito.azione === "elimina" ? "" : esito.nome;
    if (campo === "voceFissa") {
      // Rinominata: il flag e' quello appena salvato. Unita a un'altra: quello dell'altra. Eliminata: il nome non c'e' piu'.
      const flag = esito.azione === "rinomina" ? esito.retribuzione : esito.azione === "unisci" ? categorieFisse.voci.find((v) => v.nome.toLowerCase() === nuovo.toLowerCase())?.retribuzione : false;
      onCambia({ categoria: nuovo, eRetribuzione: flag ?? campi.eRetribuzione });
    }
    else onCambia({ [campo]: nuovo });
  }
  const chiedeCategoriaForm = campi.tipo !== "COSTO_FISSO";
  const fornitoreRichiesto = chiedeFornitore(campi);
  // Il flag retribuzione della categoria scelta (o, per un nome nuovo, l'interruttore) governa Regolare/Extra e Dipendente.
  const retribuzione = campi.tipo === "COSTO_FISSO" && campi.eRetribuzione;
  const nomeNuovo = campi.tipo === "COSTO_FISSO" && voceFissaNuova(campi, categorieFisse.voci);
  const fattura = campi.tipo === "COSTO_VARIABILE" && campi.documentoVariabile !== "SCONTRINO";

  function cambiaTipo(tipo: Tipo) {
    onCambia({ tipo, ripeti: tipo === "COSTO_FISSO" ? campi.ripeti : false, categoria: "", eRetribuzione: false, fornitore: "" });
  }

  function accendiRipeti() {
    const acceso = !campi.ripeti;
    onCambia({ ripeti: acceso, giorno: acceso && !campi.giorno ? String(Number(campi.data.slice(8, 10)) || 1) : campi.giorno });
  }

  const campoData = <Campo key="data" etichetta="Data" type="date" value={campi.data} onChange={(e) => onCambia({ data: e.target.value })} errore={errori.data} className="num max-[359px]:!text-[15px]" />;
  const campoImporto = (
    <Campo
      key="importo"
      etichetta="Importo"
      nota={campi.dividi ? "Totale da dividere" : undefined}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder="0,00"
      value={campi.importo}
      onChange={(e) => onCambia({ importo: e.target.value })}
      errore={errori.importo}
      suffisso="€"
      className="num"
    />
  );
  const campoFattura = fattura ? (
    <Campo key="fattura" etichetta="N. fattura" type="text" value={campi.numeroDocumento} onChange={(e) => onCambia({ numeroDocumento: e.target.value })} />
  ) : null;
  const campoDipendente = retribuzione ? (
    <Combobox key="dip" etichetta="Dipendente" cosa="dipendente" genere="m" value={campi.dipendente} onChange={(v) => onCambia({ dipendente: v })} facoltativo={!modifica} nota={campi.dipendente.trim() ? undefined : "Indica chi: serve per le statistiche per dipendente."} modifica={modificaPer("dipendenti", "dipendente", dipendenti.voci)} {...dipendenti} />
  ) : null;
  const campoNote = (
    <Campo
      key="note"
      etichetta={
        grande ? (
          <>
            Note <span className="font-normal">(facoltative)</span>
          </>
        ) : (
          "Note"
        )
      }
      type="text"
      value={campi.note}
      onChange={(e) => onCambia({ note: e.target.value })}
    />
  );

  return (
    <div className={"flex flex-col [&_.etichetta]:leading-4 " + (modifica ? "gap-[18px] max-md:gap-3.5" : "gap-5 max-md:gap-4")}>
      {!modifica && <Scelte legenda="Che cos'è" valore={campi.tipo} opzioni={TIPI} onScegli={cambiaTipo} />}

      {campi.tipo === "RICAVO" && (
        <div>
          <Scelte legenda="Che ricavo è" valore={campi.tipoRicavo} opzioni={OPZIONI_RICAVO} onScegli={(v) => onCambia({ tipoRicavo: v })} bassa={modifica} />
          <p className="m-0 mt-1.5 text-[13px] text-spento">Nel Riepilogo: «Fatturati» se c&apos;è la fattura, «Extra» se no.</p>
        </div>
      )}

      {/* Nel dettaglio sul telefono il documento non si cambia: il modulo parte dai campi. */}
      {campi.tipo === "COSTO_VARIABILE" && (grande || !modifica) && (
        <Scelte legenda="Documento" valore={campi.documentoVariabile} opzioni={campi.documentoVariabile === "NOTA_DI_CREDITO" ? OPZIONI_CON_NOTA : OPZIONI_DOCUMENTO} onScegli={(v) => onCambia({ documentoVariabile: v })} />
      )}

      {campi.tipo === "COSTO_FISSO" && (
        <div className={modifica ? "grid items-start gap-4 md:grid-cols-2" : "contents"}>
          <div className="min-w-0">
            <Combobox
              etichetta="Voce fissa"
              cosa="voce" genere="f"
              esempi="Affitto, Luce, Commercialista"
              value={campi.categoria}
              onChange={(v) => onCambia(campiDaVoceFissa(v, campi, categorieFisse.voci))}
              opzioni={vociFisse}
              inCaricamento={categorieFisse.inCaricamento}
              errore={categorieFisse.errore}
              invalido={!!errori.categoria}
              messaggioErrore={errori.categoria}
              modifica={modificaPer("categorie", "voceFissa", categorieFisse.voci)}
              // Per un nome nuovo l'interruttore sta fra il campo e la lista: la tendina si apre sotto e non lo copre.
              sotto={
                nomeNuovo && !categorieFisse.inCaricamento ? (
                  <div className="mt-2">
                    <Interruttore
                      acceso={campi.eRetribuzione}
                      onCambia={() => onCambia({ eRetribuzione: !campi.eRetribuzione, ripeti: campi.eRetribuzione ? campi.ripeti : campi.retribuzione === "EXTRA" ? false : campi.ripeti })}
                      titolo="È una retribuzione"
                      sotto="Con dipendente, regolare ed extra."
                    />
                  </div>
                ) : undefined
              }
            />
          </div>
          {retribuzione && (
            <Scelte
              legenda="Tipo di retribuzione"
              valore={campi.retribuzione}
              opzioni={OPZIONI_RETRIBUZIONE}
              onScegli={(v) => onCambia({ retribuzione: v, ripeti: v === "EXTRA" ? false : campi.ripeti })}
              bassa={modifica}
            />
          )}
        </div>
      )}

      <SceltaSede campi={campi} onCambia={onCambia} errore={errori.sedeId} modifica={modifica} />

      {grande ? (
        <div className="grid grid-cols-3 gap-4">
          {retribuzione ? [campoDipendente, campoData, campoImporto] : [campoData, campoImporto, campoFattura]}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {campoData}
            {campoImporto}
          </div>
          {campoDipendente}
        </>
      )}

      {(fornitoreRichiesto !== "no" || chiedeCategoriaForm) && (
        <div className={"grid gap-4 md:grid-cols-2 " + (modifica ? "max-md:gap-3.5" : "")}>
          {fornitoreRichiesto !== "no" && (
            <Combobox
              etichetta="Fornitore"
              cosa="fornitore" genere="m"
              value={campi.fornitore}
              onChange={(v) => onCambia({ fornitore: v })}
              facoltativo={fornitoreRichiesto === "facoltativo"}
              invalido={!!errori.fornitore}
              messaggioErrore={errori.fornitore}
              modifica={modificaPer("fornitori", "fornitore", fornitori.voci)}
              {...fornitori}
            />
          )}
          {chiedeCategoriaForm && (
            <div className="min-w-0">
              <Combobox
                etichetta="Categoria"
                cosa="categoria" genere="f"
                value={campi.categoria}
                onChange={(v) => onCambia({ categoria: v })}
                facoltativo={campi.tipo === "RICAVO"}
                invalido={!!errori.categoria}
                messaggioErrore={errori.categoria}
                modifica={modificaPer("categorie", "categoria", categorie.voci)}
                {...categorie}
              />
            </div>
          )}
        </div>
      )}

      {chiedeDescrizione(campi) && !retribuzione && (
        <Campo etichetta="Descrizione" facoltativo type="text" value={campi.descrizione} onChange={(e) => onCambia({ descrizione: e.target.value })} />
      )}

      {grande ? (
        allegato ? (
          <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
            {campoNote}
            {allegato}
          </div>
        ) : (
          campoNote
        )
      ) : (
        <>
          {modifica ? (
            <div className="grid grid-cols-2 gap-3">
              {campoFattura}
              <div className={campoFattura ? "" : "col-span-2"}>{campoNote}</div>
            </div>
          ) : (
            allegato && (
              <div className="grid grid-cols-2 gap-3">
                {campoFattura}
                <div className={campoFattura ? "" : "col-span-2"}>{allegato}</div>
              </div>
            )
          )}
        </>
      )}

      {campi.tipo === "COSTO_VARIABILE" && campi.documentoVariabile === "FATTURA" && (
        <Interruttore
          acceso={campi.pagata}
          onCambia={() => onCambia({ pagata: !campi.pagata })}
          titolo={modifica ? "Fattura pagata" : "Già pagata"}
          sotto={campi.pagata ? "Segnata come pagata." : "Da pagare: la segni pagata quando paghi, da Fatture › Ricevute."}
        />
      )}

      {!modifica && ripetibile(campi) && <RigaRipeti campi={campi} onAccendi={accendiRipeti} onCambia={onCambia} errori={errori} />}

      {gestita && <AzioniVoce key={`${gestita.anagrafica}-${gestita.voce.id}`} anagrafica={gestita.anagrafica} voce={gestita.voce} onChiudi={() => setGestita(null)} onFatto={dopoGestione} />}
    </div>
  );
}
