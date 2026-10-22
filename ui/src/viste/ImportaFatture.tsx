import SelettoreModalita from "../componenti/SelettoreModalita";
import { InArrivo } from "../componenti/Stati";
import Testata from "../componenti/Testata";

// Segnaposto: il servizio non ha ancora l'importazione (docs/api.md, «Fasi successive»).
export default function ImportaFatture() {
  return (
    <>
      <Testata titolo="Nuovo movimento" indietro="/movimenti" azioni={<SelettoreModalita attiva="importa" />} />
      <div className="px-4 pb-24 md:px-8 md:pb-8">
        <InArrivo
          titolo="Importa le fatture XML o ZIP"
          testo="Presto potrai trascinare qui i file XML delle fatture ricevute, oppure uno ZIP con dentro tutti gli XML: li leggiamo sul tuo computer, ti mostriamo un'anteprima e importi solo quello che confermi. Per ora i movimenti si inseriscono a mano."
        />
      </div>
    </>
  );
}
