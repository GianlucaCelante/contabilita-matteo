import { Navigate, Route, Routes } from "react-router-dom";
import Guscio from "./componenti/Guscio";
import DettaglioMovimento from "./viste/DettaglioMovimento";
import Esporta from "./viste/Esporta";
import Fatture from "./viste/Fatture";
import Impostazioni from "./viste/Impostazioni";
import ImportaFatture from "./viste/ImportaFatture";
import Movimenti from "./viste/Movimenti";
import NuovoMovimento from "./viste/NuovoMovimento";
import PizzeOrdini from "./viste/PizzeOrdini";
import Riepilogo from "./viste/Riepilogo";
import Statistiche from "./viste/Statistiche";
import StatisticheVoceDettaglio from "./viste/StatisticheVoceDettaglio";
import StatisticheVoci from "./viste/StatisticheVoci";

// Le viste dietro un solo guscio. Riepilogo e' la rotta di partenza.
export default function App() {
  return (
    <Routes>
      <Route element={<Guscio />}>
        <Route index element={<Navigate to="/riepilogo" replace />} />
        <Route path="/riepilogo" element={<Riepilogo />} />
        <Route path="/movimenti" element={<Movimenti />} />
        <Route path="/movimenti/nuovo" element={<NuovoMovimento />} />
        <Route path="/movimenti/importa" element={<ImportaFatture />} />
        <Route path="/movimenti/:id" element={<DettaglioMovimento />} />
        <Route path="/statistiche" element={<Statistiche />} />
        <Route path="/statistiche/pizze-ordini" element={<PizzeOrdini />} />
        <Route path="/statistiche/voci" element={<StatisticheVoci />} />
        <Route path="/statistiche/voci/dettaglio" element={<StatisticheVoceDettaglio />} />
        <Route path="/statistiche/fatture" element={<Fatture />} />
        <Route path="/fatture" element={<Navigate to="/statistiche/fatture" replace />} />
        <Route path="/esporta" element={<Esporta />} />
        <Route path="/impostazioni" element={<Impostazioni />} />
        <Route path="*" element={<Navigate to="/riepilogo" replace />} />
      </Route>
    </Routes>
  );
}
