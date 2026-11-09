// La password della demo: un semplice cancello nel browser (il sito e' statico, non c'e' un servizio che la controlli:
// non protegge niente di segreto, serve solo a non far entrare chi capita per caso). La demo parte senza dati inventati.
import type { Risposta } from "./backend";

export const PASSWORD_DEMO = "123";
const CHIAVE = "contabilita-demo-accesso";

function dentro(): boolean {
  try {
    return sessionStorage.getItem(CHIAVE) === "1";
  } catch {
    return false;
  }
}

function segna(valore: boolean): void {
  try {
    if (valore) sessionStorage.setItem(CHIAVE, "1");
    else sessionStorage.removeItem(CHIAVE);
  } catch {
    // memoria bloccata: si rientra a ogni apertura
  }
}

// Le richieste a /api/accesso; per tutte le altre torna null e se ne occupa il servizio finto.
export function rispondiAccesso(metodo: string, percorso: string, corpo: unknown): Risposta | null {
  if (percorso !== "/accesso" && percorso !== "/accesso/password") return null;
  if (percorso === "/accesso/password") {
    return { stato: 403, corpo: { errore: "Nella demo la password non si cambia." } };
  }
  if (metodo === "GET") return { stato: 200, corpo: { protetta: true, autenticato: dentro() } };
  if (metodo === "DELETE") {
    segna(false);
    return { stato: 204 };
  }
  if ((corpo as { password?: string } | undefined)?.password === PASSWORD_DEMO) {
    segna(true);
    return { stato: 200, corpo: { protetta: true, autenticato: true } };
  }
  return { stato: 401, corpo: { errore: "Password sbagliata." } };
}

// Le altre API restano chiuse finche' non si e' entrati, come nel servizio vero.
export function demoAperta(): boolean {
  return dentro();
}
