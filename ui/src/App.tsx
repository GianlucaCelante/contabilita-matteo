import { Navigate, Route, Routes } from "react-router-dom";
import Guscio from "./componenti/Guscio";
import DettaglioMovimento from "./viste/DettaglioMovimento";
import Esporta from "./viste/Esporta";
import Impostazioni from "./viste/Impostazioni";
import ImportaFatture from "./viste/ImportaFatture";
import Movimenti from "./viste/Movimenti";
import NuovoMovimento from "./viste/NuovoMovimento";
import Riepilogo from "./viste/Riepilogo";

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
        <Route path="/esporta" element={<Esporta />} />
        <Route path="/impostazioni" element={<Impostazioni />} />
        <Route path="*" element={<Navigate to="/riepilogo" replace />} />
      </Route>
    </Routes>
  );
}
