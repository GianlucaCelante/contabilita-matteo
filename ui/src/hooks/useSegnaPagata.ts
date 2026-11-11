import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, messaggioErrore } from "../api/client";
import type { Movimento } from "../api/tipi";
import { esitoRigaAttesa, fuocoPerso, vicinoRimasto } from "../util/fuoco";
import { useAvviso } from "./useAvviso";

// Dopo aver cambiato lo stato di una fattura cambiano l'elenco Movimenti, il dettaglio e il «Pagato / Da pagare» delle statistiche per voce.
export function invalidaPagamenti(client: QueryClient): Promise<unknown> {
  return Promise.all(["movimenti", "movimento", "statistiche"].map((k) => client.invalidateQueries({ queryKey: [k] })));
}

// «Segna pagata / da pagare» con un tocco, uguale ovunque (Ricevute, elenco Movimenti, dettaglio di una voce): si passa la fattura
// com'e' adesso e lo stato si inverte. `variables.id` (con `isPending`) dice quale fattura sta salvando; resta «in corso» finche' gli
// elenchi non sono stati riletti, cosi' un secondo tocco veloce non rimanda lo stato vecchio.
export function useSegnaPagata() {
  const client = useQueryClient();
  const avvisa = useAvviso();
  return useMutation({
    mutationFn: (m: Pick<Movimento, "id" | "pagata">) => api.segnaPagata(m.id, !m.pagata),
    onSuccess: (r) => {
      avvisa(r.pagata ? "Fattura segnata come pagata." : "Fattura segnata come da pagare.");
      return invalidaPagamenti(client);
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });
}

// «Segna pagata» dentro un elenco di movimenti (Movimenti, dettaglio di una voce): una sola azione per tutto l'elenco, cosi' si salva
// una fattura alla volta (`occupataId` dice quale; un altro badge toccato nel frattempo si ignora) e l'elenco sa dove mettere il fuoco
// se la riga sparisce. Il badge non e' mai `disabled` (perderebbe il fuoco, che finirebbe su <body>): resta dov'e'. Con «Da pagare»
// acceso, pero', la fattura segnata pagata esce dall'elenco insieme al suo badge: quando la riga non c'e' piu', se il fuoco si e'
// perso va sulla riga vicina rimasta (`[data-movimento]`: il collegamento della riga), o su `riserva` se l'elenco resta vuoto.
// Se il salvataggio fallisce la riga resta e l'attesa si annulla (util/fuoco.ts).
export function useSegnaPagataInElenco(elementi: readonly Pick<Movimento, "id">[] | undefined, riserva?: () => HTMLElement | null) {
  const salva = useSegnaPagata();
  const attesa = useRef<{ id: number; ordine: number[] } | null>(null);
  const inCorso = salva.isPending;
  const rifElementi = useRef(elementi);
  const rifRiserva = useRef(riserva);
  useEffect(() => {
    rifElementi.current = elementi;
    rifRiserva.current = riserva;
  });

  const { mutate } = salva;
  const cambia = useCallback(
    (m: Pick<Movimento, "id" | "pagata">) => {
      if (inCorso) return;
      attesa.current = { id: m.id, ordine: (rifElementi.current ?? []).map((x) => x.id) };
      mutate(m);
    },
    [inCorso, mutate],
  );

  // Effetto di layout: il fuoco si sposta prima che il browser ridisegni, senza passare un istante da <body>.
  useLayoutEffect(() => {
    const dopo = attesa.current;
    // Senza elenco (si sta rileggendo da capo) non si sa ancora se la riga c'e': si aspetta.
    if (!dopo || !elementi) return;
    const esito = esitoRigaAttesa(elementi.some((m) => m.id === dopo.id), inCorso);
    if (esito === "aspetta") return;
    attesa.current = null;
    if (esito === "annulla" || !fuocoPerso(document.activeElement)) return;
    const vicino = vicinoRimasto(dopo.ordine, dopo.id, elementi.map((m) => m.id));
    const riga = vicino === null ? null : document.querySelector<HTMLElement>(`[data-movimento="${vicino}"]`);
    (riga ?? rifRiserva.current?.())?.focus();
  }, [elementi, inCorso]);

  const occupataId = inCorso ? salva.variables.id : null;
  return useMemo(() => ({ cambia, occupataId }), [cambia, occupataId]);
}
