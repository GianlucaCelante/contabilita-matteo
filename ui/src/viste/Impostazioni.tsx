import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, chiavi, messaggioErrore, urlQr } from "../api/client";
import type { IndirizzoRete } from "../api/tipi";
import { Caricamento, ErroreCaricamento } from "../componenti/Stati";
import RipristinaDaCopia from "../componenti/RipristinaDaCopia";
import Testata from "../componenti/Testata";
import { useAvviso } from "../hooks/useAvviso";
import { dataOra } from "../util/formato";

const NOME_RETE: Record<IndirizzoRete["tipo"], string> = { WIFI: "Wi-Fi", CAVO: "Cavo", ALTRO: "Altra rete" };

function Sezione({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <section className="scheda min-w-0 flex-1 px-6 py-6" aria-label={titolo}>
      <h2 className="mb-3 text-[20px] font-bold">{titolo}</h2>
      {children}
    </section>
  );
}

// «Dal telefono»: il QR per aprire l'app dal telefono sulla stessa rete Wi-Fi,
// con la scelta dell'indirizzo quando il computer ne ha piu' di uno.
function DalTelefono() {
  const q = useQuery({ queryKey: chiavi.rete, queryFn: api.rete });
  const [scelto, setScelto] = useState<string | null>(null);
  const [qrRotto, setQrRotto] = useState(false);
  const indirizzi = q.data?.indirizzi ?? [];
  // Di norma il Wi-Fi, altrimenti il primo.
  const attuale = indirizzi.find((i) => i.ip === scelto) ?? indirizzi.find((i) => i.tipo === "WIFI") ?? indirizzi[0];

  useEffect(() => {
    setQrRotto(false);
  }, [attuale?.ip]);

  return (
    <Sezione titolo="Dal telefono">
      {q.isPending && <Caricamento />}
      {q.isError && <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />}
      {q.data && !attuale && (
        <p className="m-0 text-[16px] text-tenue">Il computer non risulta collegato a nessuna rete: collegalo al Wi-Fi e riprova.</p>
      )}
      {q.data && attuale && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex h-[200px] w-[200px] items-center justify-center rounded-xl border border-bordo bg-carta p-2">
              {qrRotto ? (
                <p className="m-0 text-center text-[14px] text-rosso">Non riesco a creare il codice QR.</p>
              ) : (
                <img src={urlQr(attuale.ip)} alt={`Codice QR per aprire l'app all'indirizzo http://${attuale.ip}:${q.data.porta}/`} width={184} height={184} onError={() => setQrRotto(true)} />
              )}
            </div>
            <div className="min-w-0 flex-1 basis-[200px]">
              <p className="m-0 text-[16px] leading-relaxed">Inquadra il codice o scrivi l&apos;indirizzo, con il telefono sulla stessa rete Wi-Fi.</p>
              <p className="num m-0 mt-2 break-all font-titolo text-[20px] font-bold">
                http://{attuale.ip}:{q.data.porta}/
              </p>
            </div>
          </div>
          {indirizzi.length > 1 && (
            <fieldset className="m-0 border-0 p-0">
              <legend className="etichetta">Indirizzo da usare</legend>
              <div className="flex flex-col gap-2">
                {indirizzi.map((i) => (
                  <label key={i.ip} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-bordo2 px-4 has-[:checked]:border-verde has-[:checked]:bg-verdechiaro">
                    <input type="radio" name="indirizzo" className="h-5 w-5 accent-verde" checked={attuale.ip === i.ip} onChange={() => setScelto(i.ip)} />
                    <span className="num font-bold">{i.ip}</span>
                    <span className="text-[14px] text-tenue">{NOME_RETE[i.tipo]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}
    </Sezione>
  );
}

function Dato({ nome, valore, azione }: { nome: string; valore: ReactNode; azione?: ReactNode }) {
  return (
    <div className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-t border-riga py-2">
      <div className="min-w-0">
        <div className="text-[16px] font-bold">{nome}</div>
        <div className="break-words text-[14px] text-tenue">{valore}</div>
      </div>
      {azione}
    </div>
  );
}

// «Dati e copie»: la copia di sicurezza (automatica alle 03:00) e quella fatta ora.
function DatiECopie() {
  const avvisa = useAvviso();
  const client = useQueryClient();
  const q = useQuery({ queryKey: chiavi.programma, queryFn: api.programma });
  const backup = useMutation({
    mutationFn: api.backupOra,
    onSuccess: (r) => {
      void client.invalidateQueries({ queryKey: chiavi.programma });
      avvisa(`Copia fatta in ${r.cartella}`);
    },
    onError: (e) => avvisa(messaggioErrore(e), { tipo: "errore" }),
  });
  const [ripristinoAperto, setRipristinoAperto] = useState(false);
  const p = q.data;

  return (
    <Sezione titolo="Dati e copie">
      {q.isPending && <Caricamento />}
      {q.isError && <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />}
      {p && (
        <div>
          <Dato
            nome="Ultima copia di sicurezza"
            valore={p.ultimoBackup ? `${dataOra(p.ultimoBackup.quando)} · in ${p.ultimoBackup.cartella}` : "Ancora nessuna copia. Ne viene fatta una ogni notte alle 03:00."}
            azione={
              <button type="button" className="btn" disabled={backup.isPending} onClick={() => backup.mutate()}>
                {backup.isPending ? "Copio…" : "Fai ora"}
              </button>
            }
          />
          <Dato nome="Dove vanno le copie" valore={p.cartellaBackup} />
          <Dato
            nome="Ripristina da una copia"
            valore="Sostituisce i dati attuali"
            azione={
              <button type="button" className="btn" onClick={() => setRipristinoAperto(true)}>
                Scegli copia
              </button>
            }
          />
          <Dato nome="Dove sono i dati" valore="Solo su questo computer, mai online" />
          <Dato nome="Versione del programma" valore={p.versione} />
        </div>
      )}
      {ripristinoAperto && <RipristinaDaCopia onChiudi={() => setRipristinoAperto(false)} />}
    </Sezione>
  );
}

export default function Impostazioni() {
  return (
    <>
      <Testata titolo="Impostazioni" />
      <div className="flex flex-col gap-4 px-4 pb-24 md:px-8 md:pb-8 xl:flex-row">
        <DalTelefono />
        <DatiECopie />
      </div>
    </>
  );
}
