// I titoli delle viste, per la scheda del browser: «<titolo> · Contabilità» (le viste con un nome proprio, come il dettaglio
// di una voce, lo impostano da sole con useTitoloPagina).
const TITOLI_PAGINA: [string, string][] = [
  ["/movimenti/nuovo", "Nuovo movimento"],
  ["/movimenti/importa", "Importa fatture"],
  ["/movimenti/", "Movimento"],
  ["/movimenti", "Movimenti"],
  ["/statistiche/pizze-ordini", "Pizze e ordini"],
  ["/statistiche/voci/dettaglio", "Dettaglio voce"],
  ["/statistiche/voci", "Costi e ricavi per voce"],
  ["/statistiche/fatture", "Fatture"],
  ["/statistiche", "Statistiche"],
  ["/riepilogo", "Riepilogo"],
  ["/esporta", "Esporta"],
  ["/impostazioni", "Impostazioni"],
];

// Il titolo della vista; stringa vuota se il percorso non e' noto.
export function titoloPer(percorso: string): string {
  return TITOLI_PAGINA.find(([p]) => percorso === p || (p.endsWith("/") && percorso.startsWith(p)))?.[1] ?? "";
}

export function titoloDocumento(titolo: string): string {
  return titolo ? `${titolo} · Contabilità` : "Contabilità";
}

// Le viste che scrivono da sole il titolo (con il nome di cio' che mostrano): il Guscio non lo tocca, cosi' non lo sovrascrive.
export function titoloDellaVista(percorso: string): boolean {
  return percorso === "/statistiche/voci/dettaglio";
}
