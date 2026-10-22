import { useId, type InputHTMLAttributes } from "react";
import Combobox from "./Combobox";
import Interruttore from "./Interruttore";
import { useSuggerimentiCategorie, useSuggerimentiDipendenti, useSuggerimentiFornitori } from "../hooks/useSuggerimenti";
import {
  chiedeCategoria,
  chiedeDescrizione,
  chiedeFornitore,
  NOME_VOCE,
  ripetibile,
  type CampiForm,
  type Errori,
  type VoceFissa,
} from "../util/modelloMovimento";
import type { Tipo } from "../api/tipi";

interface Opzione<T extends string> {
  valore: T;
  etichetta: string;
  ambra?: boolean;
}

// Scelta esclusiva a pulsanti grandi (radiogroup).
function Scelte<T extends string>({ legenda, valore, opzioni, onScegli }: { legenda: string; valore: T; opzioni: Opzione<T>[]; onScegli: (v: T) => void }) {
  const id = useId();
  return (
    <div>
      <div id={id} className="etichetta">
        {legenda}
      </div>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2.5">
        {opzioni.map((o) => (
          <button
            key={o.valore}
            type="button"
            role="radio"
            aria-checked={valore === o.valore}
            className={"scelta" + (o.ambra ? " ambra" : "")}
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
  etichetta: string;
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
  { valore: "COSTO_FISSO", etichetta: "Costo fisso" },
];

const VOCI: { valore: VoceFissa; etichetta: string }[] = (Object.keys(NOME_VOCE) as VoceFissa[]).map((v) => ({ valore: v, etichetta: NOME_VOCE[v] }));

const OPZIONI_RICAVO: Opzione<"RICAVO_FATTURATO" | "RICAVO_EXTRA">[] = [
            { valore: "RICAVO_FATTURATO", etichetta: "Fatturato" },
            { valore: "RICAVO_EXTRA", etichetta: "Extra (non fatturato)" },
          ];

const OPZIONI_DOCUMENTO: Opzione<"FATTURA" | "SCONTRINO">[] = [
            { valore: "FATTURA", etichetta: "Fattura" },
            { valore: "SCONTRINO", etichetta: "Scontrino" },
          ];

const OPZIONI_RETRIBUZIONE: Opzione<"REGOLARE" | "EXTRA">[] = [
                { valore: "REGOLARE", etichetta: "Regolare (in busta)" },
                { valore: "EXTRA", etichetta: "Extra (fuori busta)" },
              ];

interface ProprietaForm {
  campi: CampiForm;
  onCambia: (parziale: Partial<CampiForm>) => void;
  errori: Errori;
  // In modifica il tipo di movimento non si cambia e la ripetizione si gestisce a parte.
  modifica?: boolean;
}

// Il modulo di un movimento, uguale per «Nuovo» e per il dettaglio. I campi
// cambiano col tipo: variabile = documento + fornitore + categoria;
// fisso = voce fissa (+ retribuzione e dipendente); ricavo = fatturato/extra.
export default function FormMovimento({ campi, onCambia, errori, modifica }: ProprietaForm) {
  const fornitori = useSuggerimentiFornitori(campi.fornitore);
  const dipendenti = useSuggerimentiDipendenti(campi.dipendente);
  const categorie = useSuggerimentiCategorie(campi.tipo, campi.categoria);
  const fornitoreRichiesto = chiedeFornitore(campi);
  const retribuzione = campi.tipo === "COSTO_FISSO" && campi.voceFissa === "RETRIBUZIONE";

  function cambiaTipo(tipo: Tipo) {
    onCambia({ tipo, ripeti: tipo === "COSTO_FISSO" ? campi.ripeti : false, categoria: "", fornitore: "" });
  }

  function accendiRipeti() {
    const acceso = !campi.ripeti;
    onCambia({ ripeti: acceso, giorno: acceso && !campi.giorno ? String(Number(campi.data.slice(8, 10)) || 1) : campi.giorno });
  }

  return (
    <div className="flex flex-col gap-5">
      {!modifica && <Scelte legenda="Cosa registri" valore={campi.tipo} opzioni={TIPI} onScegli={cambiaTipo} />}

      {campi.tipo === "RICAVO" && (
        <Scelte
          legenda="Che ricavo è"
          valore={campi.tipoRicavo}
          opzioni={OPZIONI_RICAVO}
          onScegli={(v) => onCambia({ tipoRicavo: v })}
        />
      )}

      {campi.tipo === "COSTO_VARIABILE" && (
        <Scelte
          legenda="Documento"
          valore={campi.documentoVariabile}
          opzioni={OPZIONI_DOCUMENTO}
          onScegli={(v) => onCambia({ documentoVariabile: v })}
        />
      )}

      {campi.tipo === "COSTO_FISSO" && (
        <>
          <div>
            <label htmlFor="voce-fissa" className="etichetta">
              Voce fissa
            </label>
            <div className="campo">
              <select id="voce-fissa" value={campi.voceFissa} onChange={(e) => onCambia({ voceFissa: e.target.value as VoceFissa, categoria: "" })}>
                {VOCI.map((v) => (
                  <option key={v.valore} value={v.valore}>
                    {v.etichetta}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {retribuzione && (
            <Scelte
              legenda="Tipo di retribuzione"
              valore={campi.retribuzione}
              opzioni={OPZIONI_RETRIBUZIONE}
              onScegli={(v) => onCambia({ retribuzione: v, ripeti: v === "EXTRA" ? false : campi.ripeti })}
            />
          )}
        </>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Campo etichetta="Data" type="date" value={campi.data} onChange={(e) => onCambia({ data: e.target.value })} errore={errori.data} className="num" />
        <Campo
          etichetta={campi.tipo === "COSTO_VARIABILE" ? "Importo totale" : "Importo"}
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
        {campi.tipo === "COSTO_VARIABILE" && campi.documentoVariabile === "FATTURA" && (
          <Campo etichetta="N. fattura" facoltativo type="text" value={campi.numeroDocumento} onChange={(e) => onCambia({ numeroDocumento: e.target.value })} />
        )}
      </div>

      {(fornitoreRichiesto !== "no" || chiedeCategoria(campi)) && (
        <div className="grid gap-4 md:grid-cols-2">
          {fornitoreRichiesto !== "no" && (
            <Combobox
              etichetta="Fornitore"
              cosa="fornitore"
              value={campi.fornitore}
              onChange={(v) => onCambia({ fornitore: v })}
              facoltativo={fornitoreRichiesto === "facoltativo"}
              invalido={!!errori.fornitore}
              messaggioErrore={errori.fornitore}
              {...fornitori}
            />
          )}
          {chiedeCategoria(campi) && (
            <Combobox
              etichetta="Categoria"
              cosa="categoria"
              value={campi.categoria}
              onChange={(v) => onCambia({ categoria: v })}
              facoltativo
              invalido={!!errori.categoria}
              messaggioErrore={errori.categoria}
              {...categorie}
            />
          )}
        </div>
      )}

      {retribuzione && (
        <div>
          <Combobox etichetta="Dipendente" cosa="dipendente" value={campi.dipendente} onChange={(v) => onCambia({ dipendente: v })} facoltativo {...dipendenti} />
          <p className="m-0 mt-1.5 text-[13px] text-tenue">Se lo lasci vuoto il costo conta nel totale ma non nel dettaglio per persona.</p>
        </div>
      )}

      {chiedeDescrizione(campi) && (
        <Campo etichetta="Descrizione" facoltativo type="text" value={campi.descrizione} onChange={(e) => onCambia({ descrizione: e.target.value })} />
      )}

      <div>
        <label htmlFor="note-movimento" className="etichetta">
          Note <span className="font-normal">(facoltative)</span>
        </label>
        <div className="campo">
          <textarea id="note-movimento" rows={2} value={campi.note} onChange={(e) => onCambia({ note: e.target.value })} />
        </div>
      </div>

      {!modifica && ripetibile(campi) && (
        <div className="flex flex-col gap-3">
          <Interruttore
            acceso={campi.ripeti}
            onCambia={accendiRipeti}
            titolo="Ripeti ogni mese"
            sotto="Registra da solo il movimento ogni mese, senza chiedere conferma. Lo correggi poi in Movimenti."
          />
          {campi.ripeti && (
            <div className="max-w-[220px]">
              <Campo
                etichetta="Il giorno del mese"
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                value={campi.giorno}
                onChange={(e) => onCambia({ giorno: e.target.value })}
                errore={errori.giorno}
                className="num"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
