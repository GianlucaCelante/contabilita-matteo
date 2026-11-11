import type { FonteStatistica, RigaSettimana, SettimanaCompletaInput, VoceGiornoInput, VoceSettimanaInput } from "../api/tipi";
import { campiIniziali, etichettaStatoSede, rigaModificata, riassuntoRighe, scontrinoMedioCent, validaRiga, type CampiRiga, type RigaConRicavi, type RiassuntoRighe } from "./statistiche";

// Logica pura del modulo «Pizze e ordini» con i due modi di inserimento per sede: «Giorno per giorno» (sette righe, lunedi'-domenica)
// oppure «Totale della settimana» (una riga). Per una sede in una settimana vale un solo modo (docs/api.md, «Statistiche», regola 1):
// salvare i giorni con i numeri cancella il totale, salvare il totale con i numeri cancella i giorni. Il modulo tiene in memoria tutti e
// due i gruppi di campi (si puo' passare dall'uno all'altro senza perdere quello che si e' scritto), ma controlla, confronta e manda solo
// quelli del modo scelto.

export type ModoInserimento = FonteStatistica;

export interface StatoSede {
  modo: ModoInserimento;
  // Il totale della settimana.
  settimana: CampiRiga;
  // Sempre 7, da lunedi' a domenica.
  giorni: CampiRiga[];
  // Il totale messo da cambiaModo (la somma dei giorni): se resta com'e', a un nuovo passaggio al totale si ricalcola.
  precompilato?: CampiRiga;
}

const VUOTO: CampiRiga = { pizze: "", ordini: "" };

// Come si apre una sede: nel modo in uso (`fonte`; senza dati giorno per giorno) con i numeri gia' salvati. Il totale della settimana parte
// vuoto se la sede usa i giorni: `pizze` e `ordini` della riga li sommano, ma non sono un totale salvato (altrimenti passare al totale
// e salvare lo stesso numero non manderebbe niente e i giorni resterebbero).
export function statoIniziale(riga: RigaSettimana): StatoSede {
  return {
    modo: riga.fonte ?? "GIORNI",
    settimana: riga.fonte === "SETTIMANA" ? campiIniziali(riga) : VUOTO,
    giorni: riga.giorni.map((g) => campiIniziali(g)),
  };
}

// Le righe del modo scelto, con i loro ricavi: i sette giorni con i ricavi di ogni giorno, o il totale con i ricavi della settimana.
export function righeDelModo(riga: RigaSettimana, stato: StatoSede): RigaConRicavi[] {
  if (stato.modo === "SETTIMANA") return [{ ricaviCent: riga.ricaviTotaliCent, campi: stato.settimana }];
  return riga.giorni.map((g, i) => ({ ricaviCent: g.ricaviTotaliCent, campi: stato.giorni[i] ?? VUOTO }));
}

export function riassuntoSede(riga: RigaSettimana, stato: StatoSede): RiassuntoRighe {
  return riassuntoRighe(righeDelModo(riga, stato));
}

// Il badge accanto al nome della sede. Nel modo salvato (o se non c'e' niente di salvato) segue i campi, come prima. Se invece il modo
// scelto nel modulo non e' quello salvato, dice lo stato SALVATO finche' non si salva: passando a «Totale della settimana» i campi partono
// dalla somma dei giorni, ma non c'e' un totale salvato, quindi resta «2 giorni su 7» e non «Totale inserito» (e viceversa).
export function badgeSede(riga: RigaSettimana, stato: StatoSede): { testo: string; inserito: boolean } {
  if (riga.fonte !== null && riga.fonte !== stato.modo) {
    return etichettaStatoSede({ stato: "completa", inserite: riga.fonte === "GIORNI" ? riga.giorniInseriti : 1 }, riga.fonte);
  }
  return etichettaStatoSede(riassuntoSede(riga, stato), stato.modo);
}

// La somma dei giorni (pizze e ordini scritti): il totale con cui parte «Totale della settimana». Vuoto senza giorni, e anche se un
// giorno e' incompleto o sbagliato (una somma parziale sembrerebbe giusta e non lo e').
export function sommaGiorni(giorni: readonly CampiRiga[]): CampiRiga {
  let pizze = 0;
  let ordini = 0;
  let quanti = 0;
  for (const c of giorni) {
    const e = validaRiga(c);
    if (e.stato === "incompleta") return VUOTO;
    if (e.stato !== "completa") continue;
    pizze += e.pizze ?? 0;
    ordini += e.ordini ?? 0;
    quanti++;
  }
  return quanti === 0 ? VUOTO : { pizze: String(pizze), ordini: String(ordini) };
}

const stessiCampi = (a: CampiRiga, b: CampiRiga) => a.pizze === b.pizze && a.ordini === b.ordini;

// Il cambio di modo. Passando a «Totale della settimana» i campi partono dalla somma dei giorni inseriti (anche appena scritti), se il
// totale e' vuoto o e' ancora quello messo la volta prima; un totale scritto a mano non si tocca. Passando ai giorni restano quelli che
// c'erano (vuoti se la sede usava il totale).
export function cambiaModo(stato: StatoSede, modo: ModoInserimento): StatoSede {
  if (stato.modo === modo) return stato;
  if (modo !== "SETTIMANA") return { ...stato, modo };
  const vuoto = stessiCampi(stato.settimana, VUOTO);
  const precompilato = stato.precompilato && stessiCampi(stato.settimana, stato.precompilato);
  if (!vuoto && !precompilato) return { ...stato, modo };
  const somma = sommaGiorni(stato.giorni);
  return { ...stato, modo, settimana: somma, precompilato: somma };
}

function modificataNelModo(iniziale: StatoSede, attuale: StatoSede, modo: ModoInserimento): boolean {
  // Un totale uguale alla somma dei giorni salvati (il precompilato, senza toccare niente) non perde niente uscendo.
  if (modo === "SETTIMANA") {
    if (!rigaModificata(iniziale.settimana, attuale.settimana)) return false;
    const usavaIGiorni = stessiCampi(iniziale.settimana, VUOTO);
    return !usavaIGiorni || stessiCampi(sommaGiorni(iniziale.giorni), VUOTO) || rigaModificata(sommaGiorni(iniziale.giorni), attuale.settimana);
  }
  return attuale.giorni.some((c, i) => rigaModificata(iniziale.giorni[i] ?? VUOTO, c));
}

const altroModo = (modo: ModoInserimento): ModoInserimento => (modo === "SETTIMANA" ? "GIORNI" : "SETTIMANA");

// Qualcosa da salvare nel modo scelto (il salvataggio manda solo quello).
export function sedeDaSalvare(iniziale: StatoSede, attuale: StatoSede): boolean {
  return modificataNelModo(iniziale, attuale, attuale.modo);
}

// Qualcosa scritto nell'altro modo (si salva solo tornando a quel modo).
export function modificheNellAltroModo(iniziale: StatoSede, attuale: StatoSede): boolean {
  return modificataNelModo(iniziale, attuale, altroModo(attuale.modo));
}

// Qualcosa da perdere uscendo: quello scritto in uno qualsiasi dei due modi (passando all'altro modo i campi restano in memoria, ma
// uscendo si perdono). Cambiare solo il modo, senza scrivere, non e' una modifica.
export function sedeModificata(iniziale: StatoSede, attuale: StatoSede): boolean {
  return sedeDaSalvare(iniziale, attuale) || modificheNellAltroModo(iniziale, attuale);
}

// Un giorno dopo oggi non si compila nel modo «Giorno per giorno» (il grafico non lo mostra, ma i numeri del periodo lo conterebbero).
export function giornoFuturo(data: string, oggi: string): boolean {
  return data > oggi;
}

// Un salvataggio che cancella i dati dell'altro modo: va confermato prima.
export interface Sovrascrittura {
  sedeId: number;
  nome: string;
  // Il modo che si salva (e che cancella l'altro).
  salva: ModoInserimento;
  // Quanti giorni si cancellano (salvando il totale).
  giorni: number;
}

// Un errore da segnare: la sede e la riga (0-6 = il giorno, -1 = il totale della settimana).
export interface ErroreCampo {
  sedeId: number;
  riga: number;
}

export interface PianoSalvataggio {
  giorni: VoceGiornoInput[];
  settimana: VoceSettimanaInput[];
  errori: ErroreCampo[];
  sovrascritture: Sovrascrittura[];
}

// Il corpo di PUT /statistiche/settimana-completa: giorni e totali di tutte le sedi in una richiesta sola, tutto o niente (gli array
// ci sono anche vuoti).
export function corpoSettimanaCompleta(lunedi: string, piano: Pick<PianoSalvataggio, "giorni" | "settimana">): SettimanaCompletaInput {
  return { settimana: lunedi, giorni: piano.giorni, totali: piano.settimana };
}

// Il salvataggio della settimana: una sola chiamata all'endpoint unico (il servizio passato e' `api`; nei test un finto). Un errore
// passa com'e': tutto o niente, non c'e' niente di salvato a meta'.
export async function salvaPiano(
  lunedi: string,
  piano: Pick<PianoSalvataggio, "giorni" | "settimana">,
  servizio: { salvaSettimanaCompletaStatistiche: (corpo: SettimanaCompletaInput) => Promise<unknown> },
): Promise<void> {
  await servizio.salvaSettimanaCompletaStatistiche(corpoSettimanaCompleta(lunedi, piano));
}

// Cosa mandare al servizio: per ogni sede solo le righe cambiate del modo scelto (svuotata = cancella). Se il modo scelto non e' quello
// salvato (`fonte`) e si mandano dei numeri, i dati dell'altro modo si cancellano: e' una sovrascrittura da confermare.
export function preparaPiano(righe: readonly RigaSettimana[], iniziali: ReadonlyMap<number, StatoSede>, attuali: ReadonlyMap<number, StatoSede>): PianoSalvataggio {
  const piano: PianoSalvataggio = { giorni: [], settimana: [], errori: [], sovrascritture: [] };
  for (const riga of righe) {
    const sedeId = riga.sede.id;
    const attuale = attuali.get(sedeId);
    const iniziale = iniziali.get(sedeId);
    if (!attuale || !iniziale) continue;
    let conNumeri = false;
    if (attuale.modo === "SETTIMANA") {
      const e = validaRiga(attuale.settimana);
      if (e.stato === "incompleta") {
        piano.errori.push({ sedeId, riga: -1 });
        continue;
      }
      // Solo un totale toccato a mano: quello precompilato con la somma dei giorni salvati, lasciato com'e', non si manda (altrimenti
      // salvando per un'altra sede si cancellerebbero i giorni di questa). Come l'avviso di uscita.
      if (!sedeDaSalvare(iniziale, attuale)) continue;
      piano.settimana.push({ sedeId, pizze: e.pizze, ordini: e.ordini });
      conNumeri = e.stato === "completa";
      if (conNumeri && riga.fonte === "GIORNI" && riga.giorniInseriti > 0) {
        piano.sovrascritture.push({ sedeId, nome: riga.sede.nome, salva: "SETTIMANA", giorni: riga.giorniInseriti });
      }
      continue;
    }
    const voci: VoceGiornoInput[] = [];
    let sbagliata = false;
    attuale.giorni.forEach((campi, i) => {
      const e = validaRiga(campi);
      if (e.stato === "incompleta") {
        piano.errori.push({ sedeId, riga: i });
        sbagliata = true;
        return;
      }
      const giorno = riga.giorni[i];
      if (!giorno || !rigaModificata(iniziale.giorni[i] ?? VUOTO, campi)) return;
      voci.push({ sedeId, data: giorno.data, pizze: e.pizze, ordini: e.ordini });
      if (e.stato === "completa") conNumeri = true;
    });
    if (sbagliata) continue;
    piano.giorni.push(...voci);
    if (conNumeri && riga.fonte === "SETTIMANA") piano.sovrascritture.push({ sedeId, nome: riga.sede.nome, salva: "GIORNI", giorni: 0 });
  }
  return piano;
}

// «Salvando il totale della settimana si cancellano i 5 giorni inseriti per Via Roma.»
// «Salvando i giorni si cancella il totale della settimana inserito per Via Roma.»
export function testoSovrascrittura(s: Sovrascrittura): string {
  if (s.salva === "GIORNI") return `Salvando i giorni si cancella il totale della settimana inserito per ${s.nome}.`;
  const giorni = s.giorni === 1 ? "l'unico giorno inserito" : `i ${s.giorni} giorni inseriti`;
  return `Salvando il totale della settimana si cancella${s.giorni === 1 ? "" : "no"} ${giorni} per ${s.nome}.`;
}

export interface ScontrinoGiorno {
  // null = «—»: giorno non valido, senza ordini, o senza incassi registrati.
  valoreCent: number | null;
  // Ci sono ordini ma nessun incasso registrato quel giorno: lo scontrino sarebbe 0,00, ma e' quasi sempre un incasso registrato in un
  // altro giorno (lo scontrino del giorno e' giusto solo se gli incassi sono registrati nello stesso giorno delle pizze).
  senzaIncassi: boolean;
}

export function scontrinoGiorno(ricaviCent: number, campi: CampiRiga): ScontrinoGiorno {
  const e = validaRiga(campi);
  if (e.stato !== "completa" || !e.ordini) return { valoreCent: null, senzaIncassi: false };
  // «Nessun incasso registrato» solo con ricavi a zero; con ricavi negativi lo scontrino negativo, come il servizio.
  if (ricaviCent === 0) return { valoreCent: null, senzaIncassi: true };
  return { valoreCent: scontrinoMedioCent(ricaviCent, e.ordini), senzaIncassi: false };
}

const NOMI_GIORNI =["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const NOMI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// «Lunedì 2» (per le etichette dei campi) e «Lun» (sulla riga, accanto al numero del giorno).
export function nomeGiorno(indice: number, data: string): string {
  return `${NOMI_GIORNI[indice] ?? ""} ${Number(data.slice(8, 10))}`;
}
export function nomeGiornoBreve(indice: number): string {
  return NOMI_BREVI[indice] ?? "";
}
