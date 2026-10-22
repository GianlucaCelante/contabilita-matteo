// Preparazione degli allegati scelti a mano (foto o PDF) prima dell'invio.
// Le foto grandi si ridimensionano (lato lungo max 2000 px, JPEG qualita' 0,85):
// una foto di fotocamera puo' pesare diversi MB e la galleria del telefono puo'
// dare WebP o HEIC. Se la conversione fallisce si tiene il file originale. I PDF
// non si toccano. Il servizio ricontrolla comunque il tipo sui byte.
export const LATO_MASSIMO_PX = 2000;
export const QUALITA_JPEG = 0.85;
export const DIMENSIONE_MASSIMA = 8 * 1024 * 1024;
export const TIPI_AMMESSI = ["image/jpeg", "image/png", "application/pdf"] as const;

const DA_ESTENSIONE: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };

// Il tipo del file: quello dichiarato dal browser, o dedotto dall'estensione se manca.
export function tipoDi(file: File): string {
  if (file.type) return file.type;
  const estensione = file.name.split(".").pop()?.toLowerCase() ?? "";
  return DA_ESTENSIONE[estensione] ?? "";
}

// null se il file va bene, altrimenti il messaggio da mostrare.
export function controllaAllegato(file: File): string | null {
  if (!(TIPI_AMMESSI as readonly string[]).includes(tipoDi(file))) {
    return "Si possono allegare solo foto JPEG o PNG e file PDF.";
  }
  if (file.size === 0) return "Il file è vuoto.";
  if (file.size > DIMENSIONE_MASSIMA) return "Il file è troppo grande: il massimo è 8 MB.";
  return null;
}

// Safari prima del 17 non conosce "from-image": si riprova senza opzioni.
async function decodifica(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (errore) {
    if (errore instanceof TypeError) return createImageBitmap(file);
    throw errore;
  }
}

// Ridimensiona e ricomprime in JPEG; in caso di qualunque problema restituisce il file originale.
export async function convertiInJpeg(file: File): Promise<File> {
  try {
    const bitmap = await decodifica(file);
    try {
      const scala = Math.min(1, LATO_MASSIMO_PX / Math.max(bitmap.width, bitmap.height));
      const larghezza = Math.round(bitmap.width * scala);
      const altezza = Math.round(bitmap.height * scala);
      const tela = document.createElement("canvas");
      tela.width = larghezza;
      tela.height = altezza;
      const contesto = tela.getContext("2d");
      if (!contesto) return file;
      contesto.fillStyle = "#fff"; // un PNG trasparente non deve diventare nero
      contesto.fillRect(0, 0, larghezza, altezza);
      contesto.drawImage(bitmap, 0, 0, larghezza, altezza);
      const blob = await new Promise<Blob | null>((risolvi) => tela.toBlob(risolvi, "image/jpeg", QUALITA_JPEG));
      if (!blob) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

// Le immagini si convertono se sono grandi (lato > 2000 px o oltre 8 MB) o di un formato
// che il servizio non accetta (WebP, HEIC...); il resto passa com'e'. I PDF mai.
export async function preparaAllegato(file: File): Promise<File> {
  const tipo = tipoDi(file);
  if (!tipo.startsWith("image/")) return file;
  const ammesso = tipo === "image/jpeg" || tipo === "image/png";
  if (ammesso && file.size <= DIMENSIONE_MASSIMA) {
    try {
      const bitmap = await createImageBitmap(file);
      const grande = Math.max(bitmap.width, bitmap.height) > LATO_MASSIMO_PX;
      bitmap.close();
      if (!grande) return file;
    } catch {
      return file;
    }
  }
  return convertiInJpeg(file);
}
