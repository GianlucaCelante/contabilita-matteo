import { useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { accesso, CHIAVE_ACCESSO, EVENTO_ACCESSO_RICHIESTO, impostaAccesso } from "../api/accesso";
import { Caricamento, ErroreCaricamento } from "./Stati";
import SchermataAccesso from "./SchermataAccesso";

// Sta davanti a tutta l'app: se il servizio ha una password e non si e' entrati mostra solo la schermata della password.
// Senza password impostata lascia passare (come prima). Un 401 in qualunque momento riporta qui.
export default function Cancello({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const q = useQuery({ queryKey: CHIAVE_ACCESSO, queryFn: accesso.stato, staleTime: Infinity });

  useEffect(() => {
    const scaduta = () => {
      impostaAccesso(client, { protetta: true, autenticato: false });
    };
    window.addEventListener(EVENTO_ACCESSO_RICHIESTO, scaduta);
    return () => window.removeEventListener(EVENTO_ACCESSO_RICHIESTO, scaduta);
  }, [client]);

  if (q.isPending) return <Caricamento />;
  if (q.isError) return <ErroreCaricamento errore={q.error} onRiprova={() => void q.refetch()} />;
  if (q.data.protetta && !q.data.autenticato) {
    return (
      <SchermataAccesso
        onEntra={async (password) => {
          const stato = await accesso.entra(password);
          impostaAccesso(client, stato); // niente avanzi dei dati di prima: l'app riparte pulita
        }}
      />
    );
  }
  return <>{children}</>;
}
