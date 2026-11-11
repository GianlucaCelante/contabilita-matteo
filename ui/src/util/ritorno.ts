// Da dove si arriva a una pagina aperta «sopra» un'altra (un movimento, il nuovo movimento): chi la apre passa il proprio
// indirizzo in `state.da`; «Annulla», la freccia indietro e il salvataggio riportano li'. Senza, si torna ai Movimenti.
export function daDoveTornare(stato: unknown, predefinito = "/movimenti"): string {
  return daValido(stato) ?? predefinito;
}

function daValido(stato: unknown): string | null {
  const da = (stato as { da?: unknown } | null | undefined)?.da;
  return typeof da === "string" && da.startsWith("/") && !da.startsWith("//") ? da : null;
}

// Lo stato da passare a una pagina sorella (fra «A mano» e «Importa»): lo stesso punto di partenza, se c'e'.
export function statoDaInoltrare(stato: unknown): { da: string } | undefined {
  const da = daValido(stato);
  return da === null ? undefined : { da };
}

// Come tornare a `verso` («Annulla», la freccia, dopo un salvataggio) senza lasciare la pagina nella cronologia, cosi' il tasto
// indietro del browser o del telefono non la riapre:
// - si e' arrivati da dentro l'app (la voce ha una chiave, `chiave` e' `location.key`: «default» solo sulla prima voce, cioe'
//   link diretto o scheda nuova) e la voce precedente e' proprio `verso` (`state.da`): un passo indietro;
// - altrimenti non si sa cosa c'e' prima: si va a `verso` sostituendo la voce corrente.
// Chi apre la pagina con un push mette `state.da`; il passaggio fra «A mano» e «Importa» sostituisce la voce e inoltra lo stato.
// Con modifiche non salvate (`conModifiche`) il passo indietro solo se la voce precedente e' sicuramente del router, cioe' ha un indice:
// il router da' alla voce nuova l'indice della precedente + 1, e una voce non sua (indirizzo scritto a mano, pagina aperta da fuori)
// non ha indice, quindi la voce dopo prende 1 (null + 1). Con `indiceVoce` (history.state.idx della voce corrente) >= 2 la precedente
// ha un indice e la conferma di uscita ferma il passo; altrimenti (1, assente) quel passo potrebbe non fermarsi e si va all'indirizzo
// sostituendo la voce, una navigazione che la conferma ferma sempre (uscendo cosi' la cronologia puo' avere `verso` due volte di fila).
export function comeTornare(chiave: string, stato: unknown, verso: string, conModifiche = false, indiceVoce: number | null = null): { indietro: true } | { indietro: false; a: string } {
  const precedenteDelRouter = typeof indiceVoce === "number" && indiceVoce >= 2;
  return (!conModifiche || precedenteDelRouter) && chiave !== "default" && daValido(stato) === verso ? { indietro: true } : { indietro: false, a: verso };
}

const percorsoDi = (indirizzo: string) => indirizzo.split(/[?#]/)[0] ?? "";

// Movimenti e Riepilogo mostrano il periodo salvato (util/filtriSalvati): dopo un salvataggio possono spostarsi sul mese del movimento.
export function seguePeriodoSalvato(indirizzo: string): boolean {
  const percorso = percorsoDi(indirizzo);
  return percorso === "/movimenti" || percorso === "/riepilogo";
}

// Lo stesso indirizzo senza il periodo (p, r, da, a): la pagina riparte da quello salvato. Gli altri filtri restano.
export function senzaPeriodo(indirizzo: string): string {
  const percorso = percorsoDi(indirizzo);
  const inizio = indirizzo.indexOf("?");
  const parametri = new URLSearchParams(inizio < 0 ? "" : indirizzo.slice(inizio + 1).split("#")[0]);
  for (const nome of ["p", "r", "da", "a"]) parametri.delete(nome);
  const resto = parametri.toString();
  return resto ? `${percorso}?${resto}` : percorso;
}
