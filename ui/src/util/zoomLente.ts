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

// Ctrl + rotella: deltaY negativo (rotella in avanti) ingrandisce.
export function zoomConRotella(z: number, deltaY: number): number {
  return limitaZoom(z * Math.exp(-deltaY / 500));
}
