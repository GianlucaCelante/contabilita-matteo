// Passi e limiti dello zoom della lente delle foto (componenti/LenteImmagine.tsx).
// 1 = «Adatta»: la foto sta intera nella finestra. Sul telefono si ingrandisce
// col pizzico (lo fa il browser); su PC con «+», «−», «Adatta» o Ctrl + rotella.

export const ZOOM_ADATTA = 1;
export const ZOOM_MINIMO = 1;
export const ZOOM_MASSIMO = 5;
export const PASSI_ZOOM = [1, 1.5, 2, 3, 4, 5] as const;

export function limitaZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_ADATTA;
  return Math.min(ZOOM_MASSIMO, Math.max(ZOOM_MINIMO, z));
}

// Il primo scatto sopra il valore dato (o il massimo).
export function passoPiu(z: number): number {
  return PASSI_ZOOM.find((p) => p > z + 1e-9) ?? ZOOM_MASSIMO;
}

// Il primo scatto sotto il valore dato (o il minimo).
export function passoMeno(z: number): number {
  return [...PASSI_ZOOM].reverse().find((p) => p < z - 1e-9) ?? ZOOM_MINIMO;
}

export interface IngressoDimensioni {
  // Spazio disponibile (area utile del contenitore) e misura naturale della foto.
  areaL: number;
  areaA: number;
  fotoL: number;
  fotoA: number;
  zoom: number;
}

// La misura a cui disegnare la foto: a zoom 1 sta intera nell'area (senza
// ingrandirla oltre la sua misura naturale), poi si moltiplica per lo zoom.
export function dimensioniAdatte({ areaL, areaA, fotoL, fotoA, zoom }: IngressoDimensioni): { larghezza: number; altezza: number } {
  if (fotoL <= 0 || fotoA <= 0 || areaL <= 0 || areaA <= 0) return { larghezza: 0, altezza: 0 };
  const adatta = Math.min(1, areaL / fotoL, areaA / fotoA);
  return { larghezza: Math.round(fotoL * adatta * zoom), altezza: Math.round(fotoA * adatta * zoom) };
}

// Ctrl + rotella: deltaY negativo (rotella in avanti) ingrandisce.
export function zoomConRotella(z: number, deltaY: number): number {
  return limitaZoom(z * Math.exp(-deltaY / 500));
}
