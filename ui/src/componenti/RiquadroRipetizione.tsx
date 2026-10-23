import type { CampiForm, Errori } from "../util/modelloMovimento";
import SceltaFrequenza from "./SceltaFrequenza";

interface ProprietaRiquadro {
  attiva: boolean;
  // La frequenza com'e' salvata: «Ogni mese, il giorno 10», «Ogni 2 settimane»… (si vede quando la ripetizione e' ferma).
  descrizione: string;
  campi: Pick<CampiForm, "frequenza" | "intervallo" | "unita" | "giorno">;
  errori: Pick<Errori, "intervallo" | "giorno">;
  onCambia: (parziale: Partial<CampiForm>) => void;
  onFerma: () => void;
  onRiattiva: () => void;
  disabled?: boolean;
}

// La ripetizione di un movimento: lo stato, la frequenza (sempre modificabile: e' della ripetizione) e il pulsante per fermarla
// o riattivarla. Se si cambiano anche importo o voce, la domanda «solo questo o anche i prossimi» arriva al salvataggio.
export default function RiquadroRipetizione({ attiva, descrizione, campi, errori, onCambia, onFerma, onRiattiva, disabled }: ProprietaRiquadro) {
  if (!attiva) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-bordo2 bg-crema px-[18px] py-4 max-md:px-3.5" aria-label="Ripetizione">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="m-0 text-[16px] font-bold">Ripetizione</h3>
          <span className="etichettaTipo bg-sabbia text-spento">Ferma</span>
          <span className="text-[15px] text-tenue">{descrizione}</span>
        </div>
        <button type="button" className="btn primario self-start max-md:w-full" onClick={onRiattiva} disabled={disabled}>
          Riattiva la ripetizione
        </button>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3.5 rounded-xl border border-bordo2 bg-crema px-[18px] py-4 max-md:px-3.5" aria-label="Ripetizione">
      <div className="flex items-center gap-2.5">
        <h3 className="m-0 text-[16px] font-bold">Ripetizione</h3>
        <span className="etichettaTipo bg-verdechiaro text-verdescuro">Attiva</span>
      </div>
      <SceltaFrequenza campi={campi} errori={errori} onCambia={onCambia} />
      <button type="button" className="btn pericolo self-start max-md:w-full" onClick={onFerma} disabled={disabled}>
        Ferma la ripetizione
      </button>
    </section>
  );
}
