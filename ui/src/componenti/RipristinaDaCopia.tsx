import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, chiavi, messaggioErrore } from "../api/client";
import type { CopiaBackup } from "../api/tipi";
import { dataOra, dimensioneLeggibile } from "../util/formato";
import Finestra from "./Finestra";
import { Caricamento, ErroreCaricamento, Vuoto } from "./Stati";

// Dopo la richiesta il servizio si chiude e riparte da solo (anche 20-30 secondi):
// si aspetta che prima smetta di rispondere e poi torni, al massimo un minuto.
const INTERVALLO_MS = 1000;
const LIMITE_MS = 60_000;

const PREFISSO_SICUREZZA = "prima-del-ripristino-";

function etichetta(c: CopiaBackup): string {
  return c.nome.startsWith(PREFISSO_SICUREZZA) ? `${dataOra(c.quando)} · fatta prima di un ripristino` : dataOra(c.quando);
}

// Il servizio sta riavviandosi: interroga /api/versione fino a quando risponde di nuovo, poi ricarica la pagina.
function Riavvio({ onChiudi }: { onChiudi: () => void }) {
  const [scaduto, setScaduto] = useState(false);

  useEffect(() => {
    let attivo = true;
    let eraSpento = false;
    const inizio = Date.now();
    const giro = async () => {
      const risponde = await api.servizioRisponde();
      if (!attivo) return;
      if (!risponde) {
        eraSpento = true;
      } else if (eraSpento) {
        window.location.reload();
        return;
      }
      if (Date.now() - inizio > LIMITE_MS) {
        setScaduto(true);
        return;
      }
      timer = window.setTimeout(() => void giro(), INTERVALLO_MS);
    };
    let timer = window.setTimeout(() => void giro(), INTERVALLO_MS);
    return () => {
      attivo = false;
      window.clearTimeout(timer);
    };
  }, []);

  if (scaduto) {
    return (
      <Finestra
        titolo="Il riavvio sta richiedendo troppo"
        onChiudi={onChiudi}
        piede={
          <>
            <button type="button" className="btn" onClick={onChiudi}>
              Chiudi
            </button>
            <button type="button" className="btn primario" data-focus-iniziale onClick={() => window.location.reload()}>
              Ricarica la pagina
            </button>
          </>
        }
      >
        <p role="alert" className="m-0 text-[16px] leading-relaxed text-rosso">
          L&apos;app non è tornata entro un minuto. I dati sono al sicuro. Prova a ricaricare la pagina; se non si apre, riavvia il computer.
        </p>
      </Finestra>
    );
  }
  return (
    <Finestra titolo="Riavvio in corso…" sottotitolo="Non chiudere questa pagina: si riapre da sola appena l'app è pronta.">
      <Caricamento testo="Un momento, ci vuole circa mezzo minuto…" />
    </Finestra>
  );
}

// «Ripristina da una copia»: scelta della copia, conferma a due passi, richiesta e attesa del riavvio.
export default function RipristinaDaCopia({ onChiudi }: { onChiudi: () => void }) {
  const q = useQuery({ queryKey: chiavi.copie, queryFn: api.copie, staleTime: 0, gcTime: 0 });
  const [scelta, setScelta] = useState<string | null>(null);
  const [passo, setPasso] = useState<"scelta" | "conferma" | "ultima" | "riavvio">("scelta");
  const ripristina = useMutation({
    mutationFn: (nome: string) => api.ripristina(nome),
    onSuccess: () => setPasso("riavvio"),
  });
  const copie = q.data ?? [];
  const copia = copie.find((c) => c.nome === scelta);

  if (passo === "riavvio") return <Riavvio onChiudi={onChiudi} />;

  if (passo !== "scelta" && copia) {
    const ultima = passo === "ultima";
    return (
      <Finestra
        titolo={ultima ? "Ultima conferma" : "Sostituire i dati attuali?"}
        onChiudi={ripristina.isPending ? undefined : onChiudi}
        piede={
          <>
            <button type="button" className="btn" data-focus-iniziale disabled={ripristina.isPending} onClick={() => (ultima ? setPasso("conferma") : setPasso("scelta"))}>
              Indietro
            </button>
            {ultima ? (
              <button type="button" className="btn pericolo pieno" disabled={ripristina.isPending} onClick={() => ripristina.mutate(copia.nome)}>
                {ripristina.isPending ? "Un momento…" : "Sì, sostituisci i dati"}
              </button>
            ) : (
              <button type="button" className="btn pericolo" onClick={() => setPasso("ultima")}>
                Continua
              </button>
            )}
          </>
        }
      >
        {ultima ? (
          <p className="m-0 text-[16px] leading-relaxed">
            Stai per sostituire i dati con quelli del <strong>{dataOra(copia.quando)}</strong>. Tutto quello che è stato registrato dopo quel momento non
            sarà più nell&apos;app (resta nella copia di sicurezza). L&apos;app si riavvia.
          </p>
        ) : (
          <p className="m-0 text-[16px] leading-relaxed">
            I dati attuali vengono sostituiti da quelli del <strong>{dataOra(copia.quando)}</strong>. Prima ne viene fatta una copia di sicurezza. L&apos;app si
            riavvia.
          </p>
        )}
        {ripristina.isError && (
          <p role="alert" className="m-0 text-[15px] font-bold text-rosso">
            {messaggioErrore(ripristina.error)}
          </p>
        )}
      </Finestra>
    );
  }

  return (
    <Finestra
      titolo="Ripristina da una copia"
      sottotitolo="Scegli la copia da cui ripartire."
      onChiudi={onChiudi}
      piede={
        <>
          <button type="button" className="btn" data-focus-iniziale onClick={onChiudi}>
            Annulla
          </button>
          <button type="button" className="btn primario" disabled={!copia} onClick={() => setPasso("conferma")}>
            Avanti
          </button>
        </>
      }
    >
      {q.isPending && <Caricamento />}
      {q.isError && <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />}
      {q.data && copie.length === 0 && <Vuoto titolo="Nessuna copia trovata" testo="Fai prima una copia con «Fai ora», oppure controlla la cartella delle copie." />}
      {copie.length > 0 && (
        <fieldset className="m-0 flex max-h-[calc(50*var(--d-vh))] flex-col gap-2 overflow-auto border-0 p-0">
          <legend className="sr-only">Copie disponibili</legend>
          {copie.map((c) => (
            <label key={c.nome} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-bordo2 px-4 py-2 has-[:checked]:border-verde has-[:checked]:bg-verdechiaro">
              <input type="radio" name="copia" className="h-5 w-5 shrink-0 accent-verde" checked={scelta === c.nome} onChange={() => setScelta(c.nome)} />
              <span className="min-w-0 flex-1 font-bold">
                {etichetta(c)}
                <span className="block text-[14px] font-normal text-tenue">{dimensioneLeggibile(c.dimensioneByte)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </Finestra>
  );
}
