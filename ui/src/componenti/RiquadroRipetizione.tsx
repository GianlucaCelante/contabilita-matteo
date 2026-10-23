import Interruttore from "./Interruttore";

interface ProprietaRiquadro {
  attiva: boolean;
  // Il giorno del mese come testo del campo, con l'eventuale errore.
  giorno: string;
  errore?: string;
  onGiorno: (valore: string) => void;
  // Le modifiche valgono anche per i movimenti dei prossimi mesi (e il giorno si puo' cambiare).
  estendi: boolean;
  onEstendi: () => void;
  onFerma: () => void;
  disabled?: boolean;
}

// La ripetizione mensile di un movimento, in tre cose separate e dette per esteso: quando si ripete (il giorno), se le
// modifiche valgono anche per i mesi dopo (un interruttore) e come fermarla (un pulsante, senza toccare questo movimento).
export default function RiquadroRipetizione({ attiva, giorno, errore, onGiorno, estendi, onEstendi, onFerma, disabled }: ProprietaRiquadro) {
  if (!attiva) {
    return (
      <section className="rounded-xl border border-bordo2 bg-crema px-[18px] py-4 max-md:px-3.5" aria-label="Ripetizione mensile">
        <div className="flex items-center gap-2.5">
          <h3 className="m-0 text-[16px] font-bold">Ripetizione mensile</h3>
          <span className="etichettaTipo bg-sabbia text-spento">Ferma</span>
        </div>
        <p className="m-0 mt-1.5 text-[15px] text-tenue">Non vengono più creati movimenti da soli. Quelli già registrati restano.</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3.5 rounded-xl border border-bordo2 bg-crema px-[18px] py-4 max-md:px-3.5" aria-label="Ripetizione mensile">
      <div>
        <div className="flex items-center gap-2.5">
          <h3 className="m-0 text-[16px] font-bold">Ripetizione mensile</h3>
          <span className="etichettaTipo bg-verdechiaro text-verdescuro">Attiva</span>
        </div>
        <p className="m-0 mt-1 text-[15px] text-tenue">Questo movimento si crea da solo ogni mese.</p>
      </div>

      <div>
        <label htmlFor="giorno-ricorrente" className="etichetta">
          Giorno del mese
        </label>
        <div className={"campo min-h-11 w-[96px] justify-center px-0" + (errore ? " errore" : "")}>
          <input
            id="giorno-ricorrente"
            type="number"
            min={1}
            max={31}
            inputMode="numeric"
            className="num h-10 min-h-0 text-center font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            value={giorno}
            disabled={!estendi}
            aria-describedby="nota-giorno"
            onChange={(e) => onGiorno(e.target.value)}
          />
        </div>
        <p id="nota-giorno" className="m-0 mt-1 text-[13px] text-spento">
          {estendi ? "Vale dal prossimo mese." : "Per cambiarlo accendi «Applica ai prossimi mesi» qui sotto."}
        </p>
        {errore && <p className="m-0 mt-1 text-[13px] font-bold text-rosso">{errore}</p>}
      </div>

      <Interruttore
        acceso={estendi}
        onCambia={onEstendi}
        titolo="Applica ai prossimi mesi"
        sotto={estendi ? "Le modifiche (importo, voce, giorno) valgono anche per i prossimi movimenti." : "Le modifiche valgono solo per questo movimento."}
        disabled={disabled}
      />

      <div className="border-t border-bordo pt-3.5">
        <button type="button" className="btn pericolo w-full md:w-auto" onClick={onFerma} disabled={disabled}>
          Ferma la ripetizione
        </button>
        <p className="m-0 mt-1.5 text-[13px] text-spento">Dal prossimo mese non vengono più creati movimenti. Questo e quelli già registrati restano.</p>
      </div>
    </section>
  );
}
