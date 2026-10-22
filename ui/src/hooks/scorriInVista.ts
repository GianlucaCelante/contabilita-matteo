// Porta un elemento in vista dentro il suo contenitore che scorre (il <main>
// del Guscio, il corpo di una finestra), solo se serve: se si vede gia' per
// intero non si muove niente. Conta solo cio' che si vede DAVVERO:
//  - in alto e in basso il bordo del contenitore e quello del visual viewport
//    (la tastiera virtuale lo accorcia);
//  - le barre fisse in basso (Annulla/Salva, totali dei movimenti), marcate
//    data-barra-fissa e con position fixed o sticky, che coprono il contenitore.
// L'elemento va al centro della parte libera. Senza animazione se l'utente ha
// chiesto meno moto.

// Il primo antenato che scorre in verticale.
export function contenitoreScorrevole(nodo: HTMLElement): HTMLElement | null {
  for (let p = nodo.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

// Le barre fisse in basso che stanno davvero sopra il contenitore.
function bordoBassoBarre(contenitore: HTMLElement, basso: number): number {
  let limite = basso;
  for (const barra of document.querySelectorAll<HTMLElement>("[data-barra-fissa]")) {
    const posizione = getComputedStyle(barra).position;
    if (posizione !== "fixed" && posizione !== "sticky") continue;
    const r = barra.getBoundingClientRect();
    if (r.height === 0 || r.top >= limite) continue;
    // Una barra di un altro contenitore (la barra di navigazione, una finestra) non conta.
    const area = contenitore.getBoundingClientRect();
    if (r.bottom < area.top || r.top > area.bottom) continue;
    limite = Math.min(limite, r.top);
  }
  return limite;
}

// Il tratto [alto, basso] del contenitore che l'utente vede davvero.
export function areaLibera(contenitore: HTMLElement): { alto: number; basso: number } {
  const vv = window.visualViewport;
  const area = contenitore.getBoundingClientRect();
  const alto = Math.max(area.top, vv ? vv.offsetTop : 0);
  const basso = bordoBassoBarre(contenitore, Math.min(area.bottom, vv ? vv.offsetTop + vv.height : area.bottom));
  return { alto, basso };
}

// Di quanto scorrere il contenitore perche' il nodo sia al centro dell'area libera.
export function scostamentoPerCentrare(nodo: HTMLElement, alto: number, basso: number): number {
  const r = nodo.getBoundingClientRect();
  // Se il nodo e' piu' alto dell'area libera (una textarea grande) conta il
  // bordo alto: deve almeno cominciare a vedersi.
  return r.height > basso - alto ? r.top - alto : r.top + r.height / 2 - (alto + basso) / 2;
}

export function scorriInVista(nodo: HTMLElement, soloSeServe = true) {
  const contenitore = contenitoreScorrevole(nodo);
  const ridotto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const comportamento: ScrollBehavior = ridotto || !soloSeServe ? "auto" : "smooth";
  if (!contenitore) {
    nodo.scrollIntoView({ block: "nearest", behavior: comportamento });
    return;
  }
  const { alto, basso } = areaLibera(contenitore);
  const r = nodo.getBoundingClientRect();
  if (soloSeServe && r.top >= alto && r.bottom <= basso) return;
  const delta = scostamentoPerCentrare(nodo, alto, basso);
  if (Math.abs(delta) > 1) contenitore.scrollBy({ top: delta, behavior: comportamento });
}
