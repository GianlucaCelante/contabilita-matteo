import { useSedi } from "../hooks/useSedi";

// La lettera della sede in un riquadro colorato: la sede si riconosce dalla lettera, non solo dal colore.
// `grande` per gli elenchi e le schede, `piccolo` dentro le pillole e sulle righe dei movimenti.
// Con `nome` visibile accanto basta aria-hidden (decorativo); da solo (riga di movimento) ha il nome come etichetta.
export default function BadgeSede({ id, taglia = "grande", decorativo }: { id: number; taglia?: "piccolo" | "grande"; decorativo?: boolean }) {
  const info = useSedi().info(id);
  if (!info) return null;
  const lungo = info.lettera.length > 1;
  const misura = taglia === "grande" ? "h-[26px] min-w-[26px] text-[13px]" : "h-[22px] min-w-[22px] text-[12px]";
  return (
    <span
      {...(decorativo ? { "aria-hidden": true } : { role: "img", "aria-label": `Sede ${info.nome}` })}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-titolo font-bold leading-none ${misura} ${lungo ? "px-1" : ""}`}
      style={{ background: info.colore.sfondo, color: info.colore.testo }}
    >
      {info.lettera}
    </span>
  );
}
