import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import { Contesto, type ContestoSedi, type InfoSede } from "./contestoSedi";
import { sceltaConSedi } from "../util/sedeDopoSalvataggio";
import {
  alternaSede,
  coloreSede,
  conPiuSedi,
  conPiuSediDelLocale,
  conSelettore,
  etichettaSedi,
  idSelezionati,
  leggiScelta,
  lettereSedi,
  magazzinoSedi,
  parametroSedi,
  salvaScelta,
  sediAttive,
  sediDelLocale,
  sediSelezionabili,
  senzaSede,
  sediIncluse,
  soloSede,
  tutteDelLocale,
  type Scelta,
} from "../util/sedi";

// L'elenco delle sedi e quali sono selezionate (vista singola o mista), per tutta l'app. La scelta si ricorda nel browser.
// Con una sola sede attiva non cambia niente: `piu` e' falso e le viste restano quelle di prima. «Tutte le sedi» e' il locale (le
// attive non personali); una sede personale entra nella selezione solo se la si accende a mano.
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
      return s ? { id: s.id, nome: s.nome, lettera: lettere.get(s.id) ?? "?", colore: coloreSede(sedi, s.id), archiviata: s.archiviata, personale: s.personale } : undefined;
    };
    return {
      pronto: !q.isPending,
      sedi,
      attive,
      locale: sediDelLocale(sedi),
      piu: conPiuSedi(sedi),
      piuLocale: conPiuSediDelLocale(sedi),
      selezionabili: sediSelezionabili(sedi),
      selettore: conSelettore(sedi),
      selezionate: sediSelezionabili(sedi).filter((s) => ids.includes(s.id)),
      tutteSelezionate: tutteDelLocale(sedi, scelta),
      parametro: parametroSedi(sedi, scelta),
      etichetta: etichettaSedi(sedi, scelta),
      incluse: sediIncluse(sedi, scelta),
      info,
      alterna: (id) => cambia(alternaSede(sedi, scelta, id)),
      solo: (id) => cambia(soloSede(sedi, id)),
      tutte: () => cambia(null),
      aggiungi: (nuove) => cambia(sceltaConSedi(sedi, ids, nuove)),
      togliDallaScelta: (id) => cambia(senzaSede(scelta, id)),
    };
  }, [sedi, scelta, q.isPending, cambia]);

  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
}
