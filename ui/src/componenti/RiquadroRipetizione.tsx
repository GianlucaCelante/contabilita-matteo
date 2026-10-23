import type { CampiForm, Errori } from "../util/modelloMovimento";
import Interruttore from "./Interruttore";
import SceltaFrequenza from "./SceltaFrequenza";

interface ProprietaRiquadro {
  attiva: boolean;
  // La frequenza com'e' salvata: «Ogni mese, il giorno 10», «Ogni 2 settimane»…
  descrizione: string;
  // I campi della frequenza (modificabili solo con l'interruttore acceso) e i loro errori.
  campi: Pick<CampiForm, "frequenza" | "intervallo" | "unita" | "giorno">;
  errori: Pick<Errori, "intervallo" | "giorno">;
  onCambia: (parziale: Partial<CampiForm>) => void;
  // Le modifiche valgono anche per i movimenti dei prossimi mesi (e la frequenza si puo' cambiare).
  estendi: boolean;
  onEstendi: () => void;
  onFerma: () => void;
  onRiattiva: () => void;
  disabled?: boolean;
}

// La ripetizione di un movimento, in cose separate e dette per esteso: ogni quanto (la frequenza), se le modifiche valgono anche
// per i movimenti dopo (un interruttore) e come fermarla o riattivarla (un pulsante, senza toccare questo movimento).
export default function RiquadroRipetizione({ attiva, descrizione, campi, errori, onCambia, estendi, onEstendi, onFerma, onRiattiva, disabled }: ProprietaRiquadro) {
  if (!attiva) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-bordo2 bg-crema px-[18px] py-4 max-md:px-3.5" aria-label="Ripetizione">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="m-0 text-[16px] font-bold">Ripetizione</h3>
            <span className="etichettaTipo bg-sabbia text-spento">Ferma</span>
          </div>
          <p className="m-0 mt-1 text-[15px] text-tenue">{descrizione}. Non vengono più creati movimenti da soli: quelli già registrati restano.</p>
        </div>
        <div className="border-t border-bordo pt-3.5">
          <button type="button" className="btn primario w-full md:w-auto" onClick={onRiattiva} disabled={disabled}>
            Riattiva la ripetizione
          </button>
          <p className="m-0 mt-1.5 text-[13px] text-spento">Riparte dalla prossima scadenza: i movimenti che sarebbero caduti mentre era ferma non vengono creati.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3.5 rounded-xl border border-bordo2 bg-crema px-[18px] py-4 max-md:px-3.5" aria-label="Ripetizione">
      <div>
        <div className="flex items-center gap-2.5">
          <h3 className="m-0 text-[16px] font-bold">Ripetizione</h3>
          <span className="etichettaTipo bg-verdechiaro text-verdescuro">Attiva</span>
        </div>
        <p className="m-0 mt-1 text-[15px] text-tenue">Questo movimento si crea da solo. {descrizione}.</p>
      </div>

      <div className={estendi ? "" : "opacity-70"}>
        <SceltaFrequenza campi={campi} errori={errori} onCambia={onCambia} disabled={!estendi} />
        <p id="nota-giorno" className="m-0 mt-2 text-[13px] text-spento">
          {estendi ? "Vale dal prossimo movimento." : "Per cambiare la frequenza accendi «Applica ai prossimi movimenti» qui sotto."}
        </p>
      </div>

      <Interruttore
        acceso={estendi}
        onCambia={onEstendi}
        titolo="Applica ai prossimi movimenti"
        sotto={estendi ? "Le modifiche (importo, voce, frequenza) valgono anche per i prossimi movimenti." : "Le modifiche valgono solo per questo movimento."}
        disabled={disabled}
      />

      <div className="border-t border-bordo pt-3.5">
        <button type="button" className="btn pericolo w-full md:w-auto" onClick={onFerma} disabled={disabled}>
          Ferma la ripetizione
        </button>
        <p className="m-0 mt-1.5 text-[13px] text-spento">Non vengono più creati movimenti. Questo e quelli già registrati restano; si può riattivare.</p>
      </div>
    </section>
  );
}
