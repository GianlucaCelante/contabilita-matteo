import type { ReactNode } from "react";

// Una riga delle schede laterali: etichetta a sinistra, valore a destra, filetto sopra (tranne la prima).
export function Riga({ nome, children, primo }: { nome: ReactNode; children: ReactNode; primo?: boolean }) {
  return (
    <div className={"flex items-center justify-between gap-3 text-[15px] " + (primo ? "h-[38px]" : "h-[39px] border-t border-riga")}>
      <dt>{nome}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </div>
  );
}

// La scheda bianca laterale: titolo piccolo (18 px) e righe.
export default function SchedaLaterale({ titolo, etichetta, children, className }: { titolo: string; etichetta: string; children: ReactNode; className?: string }) {
  return (
    <section className={"scheda px-[22px] py-5" + (className ? ` ${className}` : "")} aria-label={etichetta}>
      <h2 className="pb-2.5 text-[18px] font-bold leading-[22px]">{titolo}</h2>
      <dl className="m-0">{children}</dl>
    </section>
  );
}
