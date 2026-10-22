import type { ReactNode } from "react";

// Icone lineari inline (stessi tracciati dei mockup approvati), scritte come
// JSX: niente librerie. Sono decorative (aria-hidden): chi le usa da sole su
// un pulsante mette l'aria-label sul pulsante.

export interface ProprietaIcona {
  larghezza?: number;
  spessoreTratto?: number;
  className?: string;
}

function IconaBase({ larghezza, spessoreTratto, className, children }: ProprietaIcona & { children: ReactNode }) {
  return (
    <svg
      width={larghezza ?? 24}
      height={larghezza ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={spessoreTratto ?? 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconaRiepilogo(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M4 20v-6M10 20V6M16 20v-9M21 20H3" />
    </IconaBase>
  );
}
export function IconaMovimenti(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </IconaBase>
  );
}
export function IconaEsporta(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M12 3v12M8 11l4 4 4-4M4 19h16" />
    </IconaBase>
  );
}
export function IconaImpostazioni(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </IconaBase>
  );
}
export function IconaMarchio(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M17 7a6 6 0 1 0 0 10" />
      <path d="M5 10h8M5 14h8" />
    </IconaBase>
  );
}
export function IconaPiu(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M12 5v14M5 12h14" />
    </IconaBase>
  );
}
export function IconaSinistra(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M15 6l-6 6 6 6" />
    </IconaBase>
  );
}
export function IconaDestra(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M9 6l6 6-6 6" />
    </IconaBase>
  );
}
export function IconaGiu(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M6 9l6 6 6-6" />
    </IconaBase>
  );
}
export function IconaVia(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </IconaBase>
  );
}
export function IconaCerca(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </IconaBase>
  );
}
export function IconaAllarme(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17h.01" />
    </IconaBase>
  );
}
export function IconaSpunta(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M5 12l5 5 9-10" />
    </IconaBase>
  );
}
export function IconaCestino(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </IconaBase>
  );
}
export function IconaCarica(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M12 16V4M8 8l4-4 4 4M4 20h16" />
    </IconaBase>
  );
}
export function IconaCercaDiNuovo(p: ProprietaIcona) {
  return (
    <IconaBase {...p}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
    </IconaBase>
  );
}
