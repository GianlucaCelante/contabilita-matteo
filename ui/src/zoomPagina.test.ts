/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// index.css letto dal disco: vitest svuota i CSS importati, anche con «?raw».
const sorgenteCss = readFileSync(new URL("./index.css", import.meta.url), "utf8");

// Lo zoom a scalini è per il layout da computer (da 1024 px, «md»). Partiva da 861 px: fra 861 e 1023 px rimpiccioliva il layout da
// telefono (bersagli da 44 px ridotti a 33), e così anche un telefono in orizzontale (932×430).
describe("lo zoom della pagina non tocca il layout da telefono", () => {
  const regole = [...sorgenteCss.matchAll(/@media([^{]+)\{\s*html\s*\{\s*zoom:\s*([\d.]+);?\s*\}\s*\}/g)].map((m) => ({ condizioni: (m[1] ?? "").split(","), zoom: Number(m[2]) }));

  it("ci sono i tre scalini", () => {
    expect(regole.map((x) => x.zoom)).toEqual([0.92, 0.84, 0.76]);
  });

  it("ogni condizione parte da 1024 px di larghezza, la stessa soglia del layout da computer", () => {
    expect(sorgenteCss).toMatch(/--breakpoint-md:\s*64rem/);
    for (const { condizioni } of regole) for (const c of condizioni) expect(c).toMatch(/\(min-width:\s*1024px\)/);
  });

  // Per ogni scalino basta una delle due misure: la larghezza (fino a 1366 / 1180 px; il terzo non ne ha) o l'altezza (760 / 680 / 600 px).
  it("le soglie degli scalini: larghezza fino a 1366 e 1180 px, altezza fino a 760, 680 e 600 px", () => {
    const soglie = (nome: string, condizioni: string[]) => condizioni.flatMap((c) => [...c.matchAll(new RegExp(`\\(max-${nome}:\\s*([\\d.]+)px\\)`, "g"))].map((m) => Number(m[1])));
    expect(regole.map((x) => soglie("width", x.condizioni))).toEqual([[1366], [1180], []]);
    expect(regole.map((x) => soglie("height", x.condizioni))).toEqual([[760], [680], [600]]);
  });

  it("nessuna condizione vale solo sotto i 1024 px", () => {
    for (const { condizioni } of regole)
      for (const c of condizioni) {
        const massima = /\(max-width:\s*([\d.]+)px\)/.exec(c);
        if (massima) expect(Number(massima[1])).toBeGreaterThanOrEqual(1024);
      }
  });
});
