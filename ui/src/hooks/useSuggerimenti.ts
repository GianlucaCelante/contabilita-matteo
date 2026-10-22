import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { Tipo } from "../api/tipi";
import { useDebounced } from "./useDebounced";

export interface Suggerimenti {
  opzioni: string[];
  inCaricamento: boolean;
  errore: boolean;
}

// Fornitori che contengono il testo scritto (GET /api/fornitori?q=).
export function useSuggerimentiFornitori(testo: string): Suggerimenti {
  const q = useDebounced(testo.trim(), 200);
  const r = useQuery({ queryKey: chiavi.fornitori(q), queryFn: () => api.fornitori(q), staleTime: 15_000 });
  const opzioni = useMemo(() => (r.data ?? []).map((f) => f.nome), [r.data]);
  return { opzioni, inCaricamento: r.isPending || q !== testo.trim(), errore: r.isError };
}

// Dipendenti che contengono il testo scritto (GET /api/dipendenti?q=).
export function useSuggerimentiDipendenti(testo: string): Suggerimenti {
  const q = useDebounced(testo.trim(), 200);
  const r = useQuery({ queryKey: chiavi.dipendenti(q), queryFn: () => api.dipendenti(q), staleTime: 15_000 });
  const opzioni = useMemo(() => (r.data ?? []).map((d) => d.nome), [r.data]);
  return { opzioni, inCaricamento: r.isPending || q !== testo.trim(), errore: r.isError };
}

// Le categorie del tipo di movimento (GET /api/categorie?tipo=), caricate una
// volta sola e filtrate qui per il testo scritto.
export function useSuggerimentiCategorie(tipo: Tipo, testo: string): Suggerimenti {
  const r = useQuery({ queryKey: chiavi.categorie(tipo), queryFn: () => api.categorie(tipo), staleTime: 15_000 });
  const cerca = testo.trim().toLowerCase();
  const opzioni = useMemo(
    () => (r.data ?? []).map((c) => c.nome).filter((n) => n.toLowerCase().includes(cerca)),
    [r.data, cerca],
  );
  return { opzioni, inCaricamento: r.isPending, errore: r.isError };
}
