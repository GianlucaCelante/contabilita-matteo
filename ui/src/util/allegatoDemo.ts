// La demo (docs/demo.md) non salva gli allegati: lo si dice sotto il campo, prima di scegliere il file, e nel messaggio dopo il
// salvataggio. Nell'app vera non cambia niente: il campo non ha note e il messaggio e' quello di sempre.

export function notaAllegato(demo: boolean): string | null {
  return demo ? "Nella demo gli allegati non si salvano." : null;
}

// Il file scelto e' stato rifiutato dal campo (formato non ammesso, vuoto, troppo grande: il motivo e' gia' scritto sotto il campo) e
// si e' salvato lo stesso: il movimento c'e', senza allegato, e l'avviso finale lo ricorda con il nome del file. Il salvataggio non
// si blocca: l'allegato e' facoltativo e si aggiunge dal dettaglio, come quando il caricamento fallisce (avviso qui sotto).
export function avvisoAllegatoRifiutato(demo: boolean, nomeFile: string, movimenti: number): string {
  const inizio = movimenti > 1 ? `Movimento diviso fra ${movimenti} sedi` : "Movimento salvato";
  // Nella demo niente rimando al dettaglio (li' gli allegati non si salvano) e niente frase sulla demo: e' gia' scritta sotto il campo
  // (notaAllegato), e l'avviso deve stare in tre righe anche a 320 px.
  return `${inizio}. File «${nomeFile}» non accettato.${demo ? "" : " Puoi aggiungerne un altro dal dettaglio."}`;
}

// Il movimento e' salvato ma il file non e' partito. Nella demo il testo e' corto apposta: a 320 px deve stare in tre righe anche con
// la divisione fra sedi e con «Ora vedi …» in coda (avvisoSalvataggio.ts). Con «Tutte, dividi» (piu' movimenti) dice della divisione, come gli altri avvisi.
export function avvisoAllegatoNonCaricato(demo: boolean, movimenti = 1): string {
  const inizio = movimenti > 1 ? `Movimento diviso fra ${movimenti} sedi` : "Movimento salvato";
  return demo ? `${inizio}. Nella demo l'allegato non si salva.` : `${inizio}, ma l'allegato non è stato caricato: puoi aggiungerlo dal dettaglio.`;
}

// Il riquadro del dettaglio (telefono) di una fattura arrivata dall'importazione. `creatoIl` e' il giorno dell'importazione, non la
// data della fattura. Nell'app vera il file XML resta allegato al movimento; nella demo no (gli allegati non si salvano), quindi non lo
// si promette: altrimenti contraddirebbe la nota qui sopra.
export function testiFatturaImportata(demo: boolean, creatoIl: string): { titolo: string; sotto: string } {
  const [, mese = "", giorno = ""] = creatoIl.slice(0, 10).split("-");
  // «l'8/11», «l'11/11», «l'1/11» (otto, undici, uno cominciano per vocale); per gli altri giorni «il 03/11».
  const quando = ["01", "08", "11"].includes(giorno) ? `l'${Number(giorno)}/${mese}` : `il ${giorno}/${mese}`;
  return { titolo: "Importata dal file della fattura elettronica", sotto: `Importata ${quando}${demo ? "" : " · il file resta allegato"}` };
}
