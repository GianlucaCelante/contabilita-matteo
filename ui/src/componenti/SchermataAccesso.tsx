import { useEffect, useRef, useState, type FormEvent } from "react";
import { messaggioErrore } from "../api/client";

// La schermata della password. Di proposito non dice «contabilità»: e' una pagina da tifosi, con un campo da calcio
// disegnato qui (SVG, nessuna immagine da fuori) e un pallone. Chi la vede per sbaglio non pensa a conti e fatture.
function Campo() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="erba-luce" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f6b34" />
          <stop offset="1" stopColor="#15501f" />
        </linearGradient>
        <radialGradient id="faro" cx="50%" cy="40%" r="75%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.38" />
        </radialGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#erba-luce)" />
      {/* le strisce dell'erba tagliata */}
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={i * 150} y="0" width="75" height="800" fill="#ffffff" opacity="0.045" />
      ))}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="5">
        <rect x="60" y="60" width="1080" height="680" />
        <line x1="600" y1="60" x2="600" y2="740" />
        <circle cx="600" cy="400" r="95" />
        <rect x="60" y="215" width="170" height="370" />
        <rect x="60" y="310" width="62" height="180" />
        <rect x="970" y="215" width="170" height="370" />
        <rect x="1078" y="310" width="62" height="180" />
        <path d="M230 335 A95 95 0 0 1 230 465" />
        <path d="M970 335 A95 95 0 0 0 970 465" />
        <path d="M60 85 A25 25 0 0 0 85 60" />
        <path d="M1115 60 A25 25 0 0 0 1140 85" />
        <path d="M60 715 A25 25 0 0 1 85 740" />
        <path d="M1115 740 A25 25 0 0 1 1140 715" />
      </g>
      <g fill="#ffffff" fillOpacity="0.55">
        <circle cx="600" cy="400" r="9" />
        <circle cx="168" cy="400" r="7" />
        <circle cx="1032" cy="400" r="7" />
      </g>
      <rect width="1200" height="800" fill="url(#faro)" />
    </svg>
  );
}

function Pallone({ lato }: { lato: number }) {
  return (
    <svg width={lato} height={lato} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="29" fill="#ffffff" stroke="#1d1d1b" strokeWidth="3" />
      <polygon points="32,20 43,28 39,41 25,41 21,28" fill="#1d1d1b" />
      <g stroke="#1d1d1b" strokeWidth="2.5" strokeLinecap="round" fill="none">
        <path d="M32 20 V6" />
        <path d="M43 28 L56 23" />
        <path d="M39 41 L48 53" />
        <path d="M25 41 L16 53" />
        <path d="M21 28 L8 23" />
      </g>
    </svg>
  );
}

export default function SchermataAccesso({ onEntra, titoloPagina = "Area soci · Calcio" }: { onEntra: (password: string) => Promise<void>; titoloPagina?: string }) {
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  // La tastiera si apre subito sul campo: e' l'unica cosa da fare qui.
  useEffect(() => campo.current?.focus(), []);

  // La scheda del browser non deve dire cos'e' l'app.
  useEffect(() => {
    const prima = document.title;
    document.title = titoloPagina;
    return () => {
      document.title = prima;
    };
  }, [titoloPagina]);

  const invia = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || invio) return;
    setInvio(true);
    setErrore(null);
    try {
      await onEntra(password);
    } catch (err) {
      setErrore(messaggioErrore(err));
      setPassword("");
      setInvio(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#15501f] px-4 py-10">
      <Campo />
      <form onSubmit={(e) => void invia(e)} className="relative z-10 flex w-full max-w-[380px] flex-col gap-4 rounded-2xl bg-carta/95 px-6 py-7 shadow-2xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <Pallone lato={56} />
          <h1 className="m-0 font-titolo text-[26px] font-bold leading-tight">Area soci</h1>
          <p className="m-0 text-[15px] text-tenue">Pronostici, formazioni e classifica del gruppo.</p>
        </div>
        <div>
          <label htmlFor="password-accesso" className="etichetta">
            Password
          </label>
          <div className={errore ? "campo errore" : "campo"}>
            <input
              id="password-accesso"
              type="password"
              autoComplete="current-password"
              ref={campo}
              value={password}
              aria-invalid={errore ? true : undefined}
              aria-describedby={errore ? "password-accesso-e" : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {errore && (
            <p id="password-accesso-e" role="alert" className="m-0 mt-1.5 text-[14px] text-rosso">
              {errore}
            </p>
          )}
        </div>
        <button type="submit" className="btn primario justify-center" disabled={!password || invio}>
          {invio ? "Un momento…" : "Entra"}
        </button>
      </form>
    </main>
  );
}
