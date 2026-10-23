import { useId, useMemo, type InputHTMLAttributes, type ReactNode } from "react";
import Combobox from "./Combobox";
import SceltaFrequenza from "./SceltaFrequenza";
import { useSchermoGrande } from "../hooks/useSchermoGrande";
import { useSuggerimentiCategorie, useSuggerimentiDipendenti, useSuggerimentiFornitori } from "../hooks/useSuggerimenti";
import {
  campiDaNomeVoce,
  chiedeCategoria,
  chiedeDescrizione,
  chiedeFornitore,
  nomeVoce,
  opzioniVoce,
  ripetibile,
  type CampiForm,
  type Errori,
  vociPersonalizzate,
} from "../util/modelloMovimento";
import type { Tipo } from "../api/tipi";

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
  ...input
}: {
  etichetta: ReactNode;
  facoltativo?: boolean;
  errore?: string | undefined;
  suffisso?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="etichetta">
        {etichetta} {facoltativo && <span className="font-normal">(facoltativo)</span>}
      </label>
      <div className={"campo" + (errore ? " errore" : "")}>
        <input id={id} aria-invalid={errore ? true : undefined} aria-describedby={errore ? `${id}-e` : undefined} {...input} />
        {suffisso && <span className="text-spento">{suffisso}</span>}
      </div>
      {errore && (
        <p id={`${id}-e`} className="m-0 mt-1 text-[13px] font-bold text-rosso">
          {errore}
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
            { valore: "RICAVO_FATTURATO", etichetta: "Fatturato" },
            { valore: "RICAVO_EXTRA", etichetta: "Extra (non fatturato)" },
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
      <button type="button" role="switch" aria-checked={campi.ripeti} className="flex min-h-14 w-full items-center gap-3.5 text-left max-md:gap-3" onClick={onAccendi}>
        <span className={"interruttoreCompatto" + (campi.ripeti ? "" : " off")} aria-hidden="true" />
        <span className="text-[16px] font-bold">Ripeti</span>
      </button>
      {campi.ripeti && (
        <div className="pb-3.5">
          <SceltaFrequenza campi={campi} errori={errori} onCambia={onCambia} />
        </div>
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
  // Le voci fisse create da chi usa l'app sono le categorie dei costi fissi: stanno nel campo «Voce fissa» accanto a Retribuzione, Affitto e Utenze.
  const categorieFisse = useSuggerimentiCategorie("COSTO_FISSO", "");
  const proprie = useMemo(() => vociPersonalizzate(categorieFisse.opzioni), [categorieFisse.opzioni]);
  const chiedeCategoriaForm = campi.tipo !== "COSTO_FISSO" && chiedeCategoria(campi);
  const fornitoreRichiesto = chiedeFornitore(campi);
  const retribuzione = campi.tipo === "COSTO_FISSO" && campi.voceFissa === "RETRIBUZIONE";
  const fattura = campi.tipo === "COSTO_VARIABILE" && campi.documentoVariabile !== "SCONTRINO";

  function cambiaTipo(tipo: Tipo) {
    onCambia({ tipo, ripeti: tipo === "COSTO_FISSO" ? campi.ripeti : false, categoria: "", fornitore: "" });
  }

  function accendiRipeti() {
    const acceso = !campi.ripeti;
    onCambia({ ripeti: acceso, giorno: acceso && !campi.giorno ? String(Number(campi.data.slice(8, 10)) || 1) : campi.giorno });
  }

  const campoData = <Campo key="data" etichetta="Data" type="date" value={campi.data} onChange={(e) => onCambia({ data: e.target.value })} errore={errori.data} className="num" />;
  const campoImporto = (
    <Campo
      key="importo"
      etichetta={
        campi.tipo === "COSTO_VARIABILE" ? (
          <>
            Importo<span className="max-md:hidden"> totale</span>
          </>
        ) : (
          "Importo"
        )
      }
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
    <Combobox key="dip" etichetta="Dipendente" cosa="dipendente" genere="m" value={campi.dipendente} onChange={(v) => onCambia({ dipendente: v })} facoltativo={!modifica} {...dipendenti} />
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
      {!modifica && <Scelte legenda="Cosa registri" valore={campi.tipo} opzioni={TIPI} onScegli={cambiaTipo} />}

      {campi.tipo === "RICAVO" && (
        <Scelte legenda="Che ricavo è" valore={campi.tipoRicavo} opzioni={OPZIONI_RICAVO} onScegli={(v) => onCambia({ tipoRicavo: v })} bassa={modifica} />
      )}

      {/* Nel dettaglio sul telefono il documento non si cambia: il modulo parte dai campi. */}
      {campi.tipo === "COSTO_VARIABILE" && (grande || !modifica) && (
        <Scelte legenda="Documento" valore={campi.documentoVariabile} opzioni={campi.documentoVariabile === "NOTA_DI_CREDITO" ? OPZIONI_CON_NOTA : OPZIONI_DOCUMENTO} onScegli={(v) => onCambia({ documentoVariabile: v })} />
      )}

      {campi.tipo === "COSTO_FISSO" && (
        <div className={modifica ? "grid items-start gap-4 md:grid-cols-2" : "contents"}>
          <Combobox
            etichetta="Voce fissa"
            cosa="voce" genere="f"
            value={nomeVoce(campi)}
            onChange={(v) => onCambia(campiDaNomeVoce(v))}
            opzioni={opzioniVoce(nomeVoce(campi), proprie)}
            inCaricamento={categorieFisse.inCaricamento}
            errore={categorieFisse.errore}
            invalido={!!errori.categoria}
            messaggioErrore={errori.categoria}
          />
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
              {...fornitori}
            />
          )}
          {chiedeCategoriaForm && (
            <Combobox
              etichetta={campi.tipo === "COSTO_FISSO" ? "Nome della voce" : "Categoria"}
              cosa={campi.tipo === "COSTO_FISSO" ? "voce" : "categoria"} genere="f"
              value={campi.categoria}
              onChange={(v) => onCambia({ categoria: v })}
              invalido={!!errori.categoria}
              messaggioErrore={errori.categoria}
              {...categorie}
            />
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

      {!modifica && ripetibile(campi) && <RigaRipeti campi={campi} onAccendi={accendiRipeti} onCambia={onCambia} errori={errori} />}
    </div>
  );
}
