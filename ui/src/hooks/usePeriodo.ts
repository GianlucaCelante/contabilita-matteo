import { useCallback, useMemo } from "react";
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

export interface StatoPeriodo {
  tipo: TipoPeriodo;
  intervallo: Intervallo;
  etichetta: string;
  imposta: (tipo: TipoPeriodo) => void;
  sposta: (verso: 1 | -1) => void;
  impostaLibero: (da: string, a: string) => void;
}

const TIPI: TipoPeriodo[] = ["settimana", "mese", "anno", "periodo"];

// Il periodo scelto vive nell'indirizzo (?p=mese&r=2026-10-21, oppure
// ?p=periodo&da=...&a=...): sopravvive al ricaricamento e al tasto indietro.
// Senza indirizzo vale `predefinito` attorno a oggi.
export function usePeriodo(predefinito: TipoPeriodo): StatoPeriodo {
  const [params, setParams] = useSearchParams();
  const grezzo = params.get("p");
  const tipo = TIPI.find((t) => t === grezzo) ?? predefinito;
  const rifGrezzo = params.get("r");
  const riferimento = rifGrezzo && dataValida(rifGrezzo) ? rifGrezzo : oggiIso();
  const daLibero = params.get("da");
  const aLibero = params.get("a");

  const intervallo = useMemo<Intervallo>(() => {
    if (tipo === "periodo") {
      const oggi = oggiIso();
      const da = daLibero && dataValida(daLibero) ? daLibero : intervalloDi("mese", oggi).da;
      const a = aLibero && dataValida(aLibero) ? aLibero : oggi;
      return da <= a ? { da, a } : { da: a, a: da };
    }
    return intervalloDi(tipo, riferimento);
  }, [tipo, riferimento, daLibero, aLibero]);

  const imposta = useCallback(
    (nuovo: TipoPeriodo) => {
      setParams(
        (prec) => {
          const p = new URLSearchParams(prec);
          p.set("p", nuovo);
          if (nuovo === "periodo") {
            p.set("da", intervallo.da);
            p.set("a", intervallo.a);
            p.delete("r");
          } else {
            p.set("r", tipo === "periodo" ? oggiIso() : riferimento);
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
