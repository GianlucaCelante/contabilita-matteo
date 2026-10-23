import type { CampiForm, Errori } from "../util/modelloMovimento";
import { UNITA, usaIlGiornoDelMese, type UnitaRipetizione } from "../util/ripetizione";
import { IconaGiu } from "./Icone";

interface ProprietaFrequenza {
  campi: Pick<CampiForm, "frequenza" | "intervallo" | "unita" | "giorno">;
  errori: Pick<Errori, "intervallo" | "giorno">;
  onCambia: (parziale: Partial<CampiForm>) => void;
  disabled?: boolean;
}

const CAMPO_NUMERO = "num h-10 min-h-0 text-center font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none";

// Ogni quanto si ripete: «Ogni mese» (basta il giorno) oppure «Personalizzata» (ogni N giorni, settimane, mesi o anni).
export default function SceltaFrequenza({ campi, errori, onCambia, disabled }: ProprietaFrequenza) {
  const mensile = campi.frequenza === "MESE";
  const unita: UnitaRipetizione = mensile ? "MESI" : campi.unita;
  const plurale = campi.intervallo.trim() !== "1";
  const conGiorno = usaIlGiornoDelMese(unita);

  function scegli(frequenza: CampiForm["frequenza"]) {
    if (frequenza === campi.frequenza) return;
    // Passando a «Personalizzata» si parte da «ogni settimana»; tornando a «Ogni mese» si rimette il mese.
    if (frequenza === "MESE") onCambia({ frequenza, unita: "MESI", intervallo: "1" });
    else onCambia({ frequenza, unita: "SETTIMANE", intervallo: "1" });
  }

  const campoGiorno = (
    <label className="flex shrink-0 items-center gap-2.5 text-[15px] max-md:gap-2">
      <span>il giorno</span>
      <span className={"campo min-h-11 w-[72px] justify-center px-0" + (errori.giorno ? " errore" : "")}>
        <input
          id="giorno-ricorrente"
          type="number"
          min={1}
          max={31}
          inputMode="numeric"
          aria-label="Il giorno del mese"
          aria-invalid={errori.giorno ? true : undefined}
          className={CAMPO_NUMERO}
          value={campi.giorno}
          disabled={disabled}
          onChange={(e) => onCambia({ giorno: e.target.value })}
        />
      </span>
    </label>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="segmenti max-w-full self-start max-md:min-h-0" role="group" aria-label="Frequenza">
        {(
          [
            ["MESE", "Ogni mese"],
            ["PERSONALIZZATA", "Personalizzata"],
          ] as const
        ).map(([valore, testo]) => (
          <button key={valore} type="button" aria-pressed={campi.frequenza === valore} disabled={disabled} onClick={() => scegli(valore)}>
            {testo}
          </button>
        ))}
      </div>

      {mensile ? (
        campoGiorno
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <label className="flex shrink-0 items-center gap-2.5 text-[15px] max-md:gap-2">
            <span>Ogni</span>
            <span className={"campo min-h-11 w-[72px] justify-center px-0" + (errori.intervallo ? " errore" : "")}>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                aria-label="Ogni quanti"
                aria-invalid={errori.intervallo ? true : undefined}
                className={CAMPO_NUMERO}
                value={campi.intervallo}
                disabled={disabled}
                onChange={(e) => onCambia({ intervallo: e.target.value })}
              />
            </span>
          </label>
          <label className="campo min-h-11 min-w-[140px]">
            <span className="sr-only">Unità di tempo</span>
            <select className="appearance-none" value={campi.unita} disabled={disabled} onChange={(e) => onCambia({ unita: e.target.value as UnitaRipetizione })}>
              {UNITA.map((u) => (
                <option key={u.valore} value={u.valore}>
                  {plurale ? u.plurale : u.singolare}
                </option>
              ))}
            </select>
            <IconaGiu larghezza={18} spessoreTratto={2} className="text-spento" />
          </label>
          {conGiorno && campoGiorno}
        </div>
      )}

      {errori.intervallo && <p className="m-0 text-[13px] font-bold text-rosso">{errori.intervallo}</p>}
      {errori.giorno && <p className="m-0 text-[13px] font-bold text-rosso">{errori.giorno}</p>}
    </div>
  );
}
