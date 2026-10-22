package it.contabilita.importa;

import it.contabilita.importa.ParserFatturaPa.ErroreLettura;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Estrae l'XML incorporato in una fattura firmata ({@code .xml.p7m}, busta CMS/PKCS#7), senza librerie e
 * SENZA verificare la firma (la fattura si legge, non si certifica).
 *
 * <p>Due strategie, nell'ordine:
 * <ol>
 *   <li><b>Struttura BER/DER</b>: ContentInfo, SignedData, EncapsulatedContentInfo, contenuto OCTET STRING. Gestisce
 *       la lunghezza indefinita e il contenuto spezzato in blocchi OCTET STRING (forma costruita, tipica dei
 *       firmatari che scrivono a flusso): i blocchi si concatenano.</li>
 *   <li><b>Per posizione</b> (se la struttura non si legge): dal primo {@code <?xml} (o dal tag radice
 *       {@code FatturaElettronica}) all'ultima chiusura del tag radice. Va bene se il contenuto e' contiguo.</li>
 * </ol>
 * Si accetta anche la busta in Base64 (con o senza intestazione PEM).
 *
 * <p>Limiti noti: la ricerca per posizione guarda i byte come testo a 8 bit, quindi non trova un XML in UTF-16
 * (le fatture dello SdI sono UTF-8); un contenuto spezzato in blocchi si ricompone solo se la struttura e'
 * leggibile (tag con numero &lt; 31, che e' il caso di ogni busta CMS reale); se la busta e' cifrata o l'XML non
 * e' incorporato (firma "detached") si risponde con un errore chiaro.
 */
final class EstrattoreP7m {

    private static final Pattern APERTURA = Pattern.compile("<(?:[A-Za-z0-9_.-]+:)?FatturaElettronica[\\s>]");
    private static final Pattern CHIUSURA = Pattern.compile("</(?:[A-Za-z0-9_.-]+:)?FatturaElettronica\\s*>");
    private static final int PROFONDITA_MASSIMA = 12;

    private EstrattoreP7m() {
    }

    static byte[] estraiXml(byte[] busta) throws ErroreLettura {
        byte[] dati = daBase64SeServe(busta);
        byte[] strutturato = dallaStruttura(dati);
        if (strutturato != null && sembraXml(strutturato)) {
            return strutturato;
        }
        byte[] perPosizione = perPosizione(dati);
        if (perPosizione != null) {
            return perPosizione;
        }
        throw new ErroreLettura("Nel file firmato (.p7m) non ho trovato una fattura XML. "
                + "Chiedi al fornitore l'XML non firmato, oppure aprilo con il programma di firma e salvane l'XML.");
    }

    // ---- Base64 ----

    private static byte[] daBase64SeServe(byte[] dati) {
        if (dati.length == 0 || (dati[0] & 0xFF) == 0x30) {
            return dati;
        }
        String testo = new String(dati, StandardCharsets.ISO_8859_1)
                .replaceAll("-----(BEGIN|END)[^-]*-----", "").replaceAll("\\s+", "");
        if (testo.isEmpty() || !testo.matches("[A-Za-z0-9+/]+={0,2}")) {
            return dati;
        }
        try {
            byte[] decodificato = Base64.getDecoder().decode(testo);
            return decodificato.length > 0 && (decodificato[0] & 0xFF) == 0x30 ? decodificato : dati;
        } catch (IllegalArgumentException e) {
            return dati;
        }
    }

    // ---- per posizione ----

    private static byte[] perPosizione(byte[] dati) {
        String testo = new String(dati, StandardCharsets.ISO_8859_1); // 1 byte = 1 carattere: gli indici coincidono
        Matcher apertura = APERTURA.matcher(testo);
        if (!apertura.find()) {
            return null;
        }
        int inizio = apertura.start();
        int dichiarazione = testo.lastIndexOf("<?xml", inizio);
        // la dichiarazione <?xml ...?> fa parte del documento se subito prima del tag radice (niente altro in mezzo)
        if (dichiarazione >= 0 && testo.indexOf('<', dichiarazione + 1) == inizio) {
            inizio = dichiarazione;
        }
        int fine = -1;
        Matcher chiusura = CHIUSURA.matcher(testo);
        while (chiusura.find()) {
            fine = chiusura.end();
        }
        if (fine < 0 || fine <= inizio) {
            return null;
        }
        return Arrays.copyOfRange(dati, inizio, fine);
    }

    private static boolean sembraXml(byte[] dati) {
        int i = 0;
        if (dati.length >= 3 && (dati[0] & 0xFF) == 0xEF && (dati[1] & 0xFF) == 0xBB && (dati[2] & 0xFF) == 0xBF) {
            i = 3;
        }
        while (i < dati.length && (dati[i] == ' ' || dati[i] == '\n' || dati[i] == '\r' || dati[i] == '\t')) {
            i++;
        }
        return i < dati.length && dati[i] == '<';
    }

    // ---- struttura BER ----

    /** Un elemento TLV: {@code inizioValore}..{@code fineValore} (esclusa) e {@code fine} = primo byte dopo l'elemento. */
    private record Tlv(int tag, int inizioValore, int fineValore, int fine, boolean indefinita) {
        boolean costruito() {
            return (tag & 0x20) != 0;
        }
    }

    private static byte[] dallaStruttura(byte[] b) {
        try {
            Tlv contentInfo = leggi(b, 0, b.length);
            if (contentInfo.tag != 0x30) {
                return null;
            }
            List<Tlv> ci = figli(b, contentInfo);
            if (ci.size() < 2 || ci.get(1).tag != 0xA0) {
                return null;
            }
            List<Tlv> avvolto = figli(b, ci.get(1));
            if (avvolto.isEmpty() || avvolto.get(0).tag != 0x30) {
                return null;
            }
            // SignedData: INTEGER, SET, SEQUENCE(EncapsulatedContentInfo), ...
            Tlv incapsulato = null;
            for (Tlv t : figli(b, avvolto.get(0))) {
                if (t.tag == 0x30) {
                    incapsulato = t;
                    break;
                }
            }
            if (incapsulato == null) {
                return null;
            }
            List<Tlv> parti = figli(b, incapsulato);
            if (parti.size() < 2 || parti.get(1).tag != 0xA0) {
                return null;
            }
            List<Tlv> contenuto = figli(b, parti.get(1));
            if (contenuto.isEmpty()) {
                return null;
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            raccogli(b, contenuto.get(0), out, 0);
            return out.toByteArray();
        } catch (RuntimeException e) {
            return null; // struttura non leggibile: si prova per posizione
        }
    }

    /** OCTET STRING semplice (0x04) oppure costruita (0x24) con blocchi 0x04 (anche annidati): concatena. */
    private static void raccogli(byte[] b, Tlv t, ByteArrayOutputStream out, int profondita) {
        if (profondita > PROFONDITA_MASSIMA) {
            throw new IllegalStateException("troppo annidato");
        }
        if (t.tag == 0x04) {
            out.write(b, t.inizioValore, t.fineValore - t.inizioValore);
        } else if (t.tag == 0x24) {
            for (Tlv figlio : figli(b, t)) {
                raccogli(b, figlio, out, profondita + 1);
            }
        } else {
            throw new IllegalStateException("non e' un OCTET STRING");
        }
    }

    private static List<Tlv> figli(byte[] b, Tlv padre) {
        List<Tlv> r = new ArrayList<>();
        int p = padre.inizioValore;
        while (p < padre.fineValore) {
            Tlv figlio = leggi(b, p, padre.fineValore);
            r.add(figlio);
            p = figlio.fine;
        }
        return r;
    }

    /** Legge un TLV in {@code b[pos..limite)}. Lancia {@link IllegalStateException} se e' incoerente. */
    private static Tlv leggi(byte[] b, int pos, int limite) {
        if (pos + 2 > limite) {
            throw new IllegalStateException("fine dei dati");
        }
        int tag = b[pos] & 0xFF;
        if ((tag & 0x1F) == 0x1F) {
            throw new IllegalStateException("tag a piu' byte non gestito");
        }
        int l = b[pos + 1] & 0xFF;
        int inizio = pos + 2;
        if (l == 0x80) { // lunghezza indefinita: finisce con 00 00 dopo i figli
            if ((tag & 0x20) == 0) {
                throw new IllegalStateException("lunghezza indefinita su elemento semplice");
            }
            int p = inizio;
            while (true) {
                if (p + 2 > limite) {
                    throw new IllegalStateException("fine contenuto mancante");
                }
                if (b[p] == 0 && b[p + 1] == 0) {
                    return new Tlv(tag, inizio, p, p + 2, true);
                }
                p = leggi(b, p, limite).fine;
            }
        }
        long lunghezza;
        if (l < 0x80) {
            lunghezza = l;
        } else {
            int n = l & 0x7F;
            if (n == 0 || n > 4 || inizio + n > limite) {
                throw new IllegalStateException("lunghezza non valida");
            }
            lunghezza = 0;
            for (int i = 0; i < n; i++) {
                lunghezza = (lunghezza << 8) | (b[inizio + i] & 0xFF);
            }
            inizio += n;
        }
        long fine = inizio + lunghezza;
        if (fine > limite) {
            throw new IllegalStateException("elemento oltre i dati");
        }
        return new Tlv(tag, inizio, (int) fine, (int) fine, false);
    }
}
