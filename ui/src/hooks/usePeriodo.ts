import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  dataValida,
  etichettaIntervallo,
  intervalloDi,
  oggiIso,
  spostaRiferimento,
  type Intervallo,
  type TipoPeriodo,
} from "../util/formato";
import { leggiFiltri, magazzinoBrowser, salvaFiltri } from "../util/filtriSalvati";

export interface StatoPeriodo {
  tipo: TipoPeriodo;
  intervallo: Intervallo;
  etichetta: string;
  imposta: (tipo: TipoPeriodo) => void;
  sposta: (verso: 1 | -1) => void;
  impostaLibero: (da: string, a: string) => void;
}

const TIPI: TipoPeriodo[] = ["giorno", "settimana", "mese", "anno", "periodo"];

// Il periodo scelto vive nell'indirizzo (?p=mese&r=2026-10-21, oppure
// ?p=periodo&da=...&a=...): sopravvive al ricaricamento e al tasto indietro.
// Si ricorda anche nel browser (util/filtriSalvati): se l'indirizzo non dice nulla, per esempio perche' si arriva
// da un'altra pagina o si riapre l'applicazione, si riparte dall'ultimo periodo scelto, uguale in tutte le pagine.
// Con `senzaGiorno` (dati settimanali) un «Oggi» arrivato dall'indirizzo o dal salvato vale `predefinito`.
// Senza niente di salvato vale `predefinito` attorno a oggi. Scegliere «Oggi» (tipo «giorno») porta sempre al giorno corrente.
export function usePeriodo(predefinito: TipoPeriodo, senzaGiorno = false): StatoPeriodo {
  const [params, setParams] = useSearchParams();
  const salvati = leggiFiltri();
  const grezzo = params.get("p") ?? salvati.p;
  const tipo = TIPI.find((t) => t === grezzo && !(senzaGiorno && t === "giorno")) ?? predefinito;
  const rifGrezzo = params.get("r") ?? salvati.r;
  const riferimento = rifGrezzo && dataValida(rifGrezzo) ? rifGrezzo : oggiIso();
  const daLibero = params.get("da") ?? salvati.da ?? null;
  const aLibero = params.get("a") ?? salvati.a ?? null;
  const nellIndirizzo = params.has("p");

  const intervallo = useMemo<Intervallo>(() => {
    if (tipo === "periodo") {
      const oggi = oggiIso();
      const da = daLibero && dataValida(daLibero) ? daLibero : intervalloDi("mese", oggi).da;
      const a = aLibero && dataValida(aLibero) ? aLibero : oggi;
      return da <= a ? { da, a } : { da: a, a: da };
    }
    return intervalloDi(tipo, riferimento);
  }, [tipo, riferimento, daLibero, aLibero]);

  // Un indirizzo che dice il periodo (link, tasto indietro) diventa l'ultimo periodo scelto.
  useEffect(() => {
    if (!nellIndirizzo) return;
    salvaFiltri(magazzinoBrowser(), tipo === "periodo" ? { p: tipo, da: intervallo.da, a: intervallo.a } : { p: tipo, r: riferimento });
  }, [nellIndirizzo, tipo, riferimento, intervallo]);

  const imposta = useCallback(
    (nuovo: TipoPeriodo) => {
      salvaFiltri(
        magazzinoBrowser(),
        nuovo === "periodo" ? { p: nuovo, da: intervallo.da, a: intervallo.a } : { p: nuovo, r: nuovo === "giorno" || tipo === "periodo" ? oggiIso() : riferimento },
      );
      setParams(
        (prec) => {
          const p = new URLSearchParams(prec);
          p.set("p", nuovo);
          if (nuovo === "periodo") {
            p.set("da", intervallo.da);
            p.set("a", intervallo.a);
            p.delete("r");
          } else {
            p.set("r", nuovo === "giorno" || tipo === "periodo" ? oggiIso() : riferimento);
            p.delete("da");
            p.delete("a");
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams, intervallo, tipo, riferimento],
  );

  const sposta = useCallback(
    (verso: 1 | -1) => {
      if (tipo === "periodo") return;
      salvaFiltri(magazzinoBrowser(), { p: tipo, r: spostaRiferimento(tipo, riferimento, verso) });
      setParams(
        (prec) => {
          const p = new URLSearchParams(prec);
          p.set("p", tipo);
          p.set("r", spostaRiferimento(tipo, riferimento, verso));
          return p;
        },
        { replace: true },
      );
    },
    [setParams, tipo, riferimento],
  );

  const impostaLibero = useCallback(
    (da: string, a: string) => {
      salvaFiltri(magazzinoBrowser(), { p: "periodo", da, a });
      setParams(
        (prec) => {
          const p = new URLSearchParams(prec);
          p.set("p", "periodo");
          p.set("da", da);
          p.set("a", a);
          p.delete("r");
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { tipo, intervallo, etichetta: etichettaIntervallo(tipo, intervallo), imposta, sposta, impostaLibero };
}
