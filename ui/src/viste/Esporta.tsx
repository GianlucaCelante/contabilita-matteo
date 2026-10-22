import { InArrivo } from "../componenti/Stati";
import Testata from "../componenti/Testata";

// Segnaposto: il servizio non ha ancora l'esportazione (docs/api.md, «Fasi successive»).
export default function Esporta() {
  return (
    <>
      <Testata titolo="Esporta" />
      <div className="px-4 pb-24 md:px-8 md:pb-8">
        <InArrivo
          titolo="Scarica i dati per il commercialista"
          testo="Presto potrai scegliere il periodo e cosa includere (ricavi, costi variabili, costi fissi) e scaricare un file Excel con i fogli Movimenti e Riepilogo, oppure un CSV con i soli movimenti."
        />
      </div>
    </>
  );
}
