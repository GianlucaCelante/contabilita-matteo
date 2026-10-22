import type { ReactNode } from "react";

// Icone lineari usate solo da Nuovo movimento e dal dettaglio (stessi tracciati dei mockup).
function Base({ larghezza = 20, children }: { larghezza?: number; children: ReactNode }) {
  return (
    <svg width={larghezza} height={larghezza} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconaGraffetta() {
  return (
    <Base>
      <path d="M21 12l-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 8" />
    </Base>
  );
}
export function IconaFotocamera() {
  return (
    <Base>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </Base>
  );
}
export function IconaDocumento() {
  return (
    <Base larghezza={22}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 13h6M9 17h6" />
    </Base>
  );
}
