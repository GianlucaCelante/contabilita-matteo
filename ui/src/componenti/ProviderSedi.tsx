import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import { Contesto, type ContestoSedi, type InfoSede } from "./contestoSedi";
import {
  alternaSede,
  coloreSede,
  conPiuSedi,
  etichettaSedi,
  idSelezionati,
  leggiScelta,
  lettereSedi,
  magazzinoSedi,
  parametroSedi,
  salvaScelta,
  sediAttive,
  sediIncluse,
  sedePreselezionata,
  soloSede,
  type Scelta,
} from "../util/sedi";

// L'elenco delle sedi e quali sono selezionate (vista singola o mista), per tutta l'app. La scelta si ricorda nel browser.
// Con una sola sede attiva non cambia niente: `piu` e' falso e le viste restano quelle di prima.
export function ProviderSedi({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: chiavi.sedi, queryFn: api.sedi, staleTime: 30_000 });
  const [scelta, setScelta] = useState<Scelta>(() => leggiScelta());
  const sedi = useMemo(() => q.data ?? [], [q.data]);

  const cambia = useCallback((nuova: Scelta) => {
    setScelta(nuova);
    salvaScelta(magazzinoSedi(), nuova);
  }, []);

  const valore = useMemo<ContestoSedi>(() => {
    const attive = sediAttive(sedi);
    const ids = idSelezionati(sedi, scelta);
    const lettere = lettereSedi(sedi);
    const info = (id: number): InfoSede | undefined => {
      const s = sedi.find((x) => x.id === id);
      return s ? { id: s.id, nome: s.nome, lettera: lettere.get(s.id) ?? "?", colore: coloreSede(sedi, s.id), archiviata: s.archiviata } : undefined;
    };
    return {
      pronto: !q.isPending,
      sedi,
      attive,
      piu: conPiuSedi(sedi),
      selezionate: attive.filter((s) => ids.includes(s.id)),
      tutteSelezionate: ids.length === attive.length,
      parametro: parametroSedi(sedi, scelta),
      etichetta: etichettaSedi(sedi, scelta),
      incluse: sediIncluse(sedi, scelta),
      sedePreselezionata: sedePreselezionata(sedi, scelta),
      info,
      alterna: (id) => cambia(alternaSede(sedi, scelta, id)),
      solo: (id) => cambia(soloSede(sedi, id)),
      tutte: () => cambia(null),
    };
  }, [sedi, scelta, q.isPending, cambia]);

  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
}
