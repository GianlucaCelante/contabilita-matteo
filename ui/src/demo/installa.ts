// Mette la demo al posto del servizio: ogni fetch verso /api/... va a demo/backend.ts, il resto passa com'e'.
// Si importa solo dalla pagina della demo (main.tsx con VITE_DEMO), mai nell'app vera.
import { rispondi } from "./backend";

const fetchVera = window.fetch.bind(window);

async function corpoDi(init?: RequestInit): Promise<unknown> {
  const b = init?.body;
  if (b == null) return undefined;
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      return undefined;
    }
  }
  if (b instanceof FormData) {
    // Le fatture: la demo non legge i file, le servono solo i nomi.
    return b.getAll("files").map((f) => (f instanceof File ? f.name : String(f)));
  }
  return undefined;
}

export function installaDemo(): void {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, window.location.href);
    if (!url.pathname.startsWith("/api/")) return fetchVera(input, init);
    const metodo = (init?.method ?? "GET").toUpperCase();
    await new Promise((r) => setTimeout(r, 60)); // un attimo, come un servizio vero
    const r = rispondi(metodo, url.pathname.slice(4), url.searchParams, await corpoDi(init));
    if (r.testo) {
      return new Response(new Blob([r.testo.contenuto as BlobPart], { type: r.testo.tipo }), {
        status: r.stato,
        headers: { "Content-Type": r.testo.tipo, "Content-Disposition": `attachment; filename="${r.testo.nomeFile}"` },
      });
    }
    if (r.stato === 204 || r.corpo === undefined) return new Response(null, { status: r.stato });
    return new Response(JSON.stringify(r.corpo), { status: r.stato, headers: { "Content-Type": "application/json" } });
  };
}
