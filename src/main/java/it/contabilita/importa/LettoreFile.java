package it.contabilita.importa;

import it.contabilita.importa.ParserFatturaPa.ErroreLettura;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Dai file caricati ai file XML da leggere: {@code .xml}, {@code .xml.p7m} e {@code .zip} (anche con
 * sottocartelle). Tutto in memoria: dallo zip non si scrive MAI su disco, quindi il nome di una voce
 * ({@code ../x.xml}) non puo' far uscire un file dalla sua cartella ("zip-slip"); le voci con nomi di quel tipo
 * si scartano comunque, con un errore.
 *
 * <p>Difese da archivi malevoli ("zip bomb"): al massimo {@value #MAX_FILE} file, 20 MB per file e 200 MB in
 * totale DOPO la decompressione. La lettura si ferma appena un limite e' superato (non si decomprime il resto) e
 * l'intero archivio e' rifiutato con un errore chiaro. Si ignorano cartelle, {@code __MACOSX}, {@code .DS_Store}
 * e ogni altro file che non sia {@code .xml} o {@code .xml.p7m} (gli zip annidati non si aprono).
 */
public class LettoreFile {

    public static final int MAX_FILE = 2000;
    public static final long MAX_BYTE_FILE = 20L * 1024 * 1024;
    public static final long MAX_BYTE_TOTALE = 200L * 1024 * 1024;

    /** {@code nomeFile} per l'utente («fatture.zip › sotto/a.xml»), {@code originale} = byte da allegare. */
    public record FileXml(String nomeFile, String nomeAllegato, byte[] xml, byte[] originale) {
    }

    public record ErroreFile(String nomeFile, String messaggio) {
    }

    public record Risultato(List<FileXml> file, List<ErroreFile> errori) {
    }

    private final int maxFile;
    private final long maxByteFile;
    private final long maxByteTotale;

    public LettoreFile() {
        this(MAX_FILE, MAX_BYTE_FILE, MAX_BYTE_TOTALE);
    }

    LettoreFile(int maxFile, long maxByteFile, long maxByteTotale) {
        this.maxFile = maxFile;
        this.maxByteFile = maxByteFile;
        this.maxByteTotale = maxByteTotale;
    }

    /** Un file caricato; mai eccezioni: i problemi finiscono in {@link Risultato#errori()}. */
    public Risultato leggi(String nome, byte[] contenuto) {
        List<FileXml> file = new ArrayList<>();
        List<ErroreFile> errori = new ArrayList<>();
        String minuscolo = nome.toLowerCase(Locale.ROOT);
        if (minuscolo.endsWith(".zip")) {
            leggiZip(nome, contenuto, file, errori);
        } else if (eXml(minuscolo) || eP7m(minuscolo)) {
            if (contenuto.length > maxByteFile) {
                errori.add(new ErroreFile(nome, "Il file è troppo grande (massimo " + formato(maxByteFile) + ")."));
            } else {
                aggiungi(nome, nome, contenuto, file, errori);
            }
        } else {
            errori.add(new ErroreFile(nome, "Tipo di file non supportato: servono file .xml, .xml.p7m o uno .zip."));
        }
        return new Risultato(file, errori);
    }

    private static boolean eXml(String minuscolo) {
        return minuscolo.endsWith(".xml");
    }

    private static boolean eP7m(String minuscolo) {
        return minuscolo.endsWith(".p7m");
    }

    private void aggiungi(String nomeFile, String nomeAllegato, byte[] originale, List<FileXml> file, List<ErroreFile> errori) {
        try {
            byte[] xml = eP7m(nomeAllegato.toLowerCase(Locale.ROOT)) ? EstrattoreP7m.estraiXml(originale) : originale;
            file.add(new FileXml(nomeFile, nomeAllegato, xml, originale));
        } catch (ErroreLettura e) {
            errori.add(new ErroreFile(nomeFile, e.getMessage()));
        }
    }

    // ---- zip ----

    private static class LimiteSuperato extends Exception {
        LimiteSuperato(String messaggio) {
            super(messaggio);
        }
    }

    private void leggiZip(String nomeZip, byte[] contenuto, List<FileXml> file, List<ErroreFile> errori) {
        List<FileXml> trovati = new ArrayList<>();
        List<ErroreFile> avvisi = new ArrayList<>();
        long totale = 0;
        int voci = 0;
        int fileContati = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(contenuto), StandardCharsets.UTF_8)) {
            for (ZipEntry voce = zip.getNextEntry(); voce != null; voce = zip.getNextEntry()) {
                if (++voci > maxFile * 10L) {
                    throw new LimiteSuperato("Lo zip ha troppe voci: archivio rifiutato.");
                }
                if (voce.isDirectory()) {
                    continue;
                }
                String percorso = voce.getName();
                String etichetta = nomeZip + " › " + percorso;
                if (!nomeValido(percorso)) {
                    avvisi.add(new ErroreFile(etichetta, "Nome non valido nello zip: voce ignorata."));
                    continue;
                }
                if (++fileContati > maxFile) {
                    throw new LimiteSuperato("Lo zip contiene troppi file (massimo " + maxFile + "): archivio rifiutato.");
                }
                String base = percorso.substring(Math.max(percorso.lastIndexOf('/'), percorso.lastIndexOf('\\')) + 1);
                String minuscolo = base.toLowerCase(Locale.ROOT);
                boolean interessa = (eXml(minuscolo) || eP7m(minuscolo)) && !minuscolo.startsWith("._")
                        && !percorso.startsWith("__MACOSX/") && !percorso.contains("/__MACOSX/");
                Lettura letto = leggiLimitato(zip, percorso, interessa, totale);
                totale += letto.contati();
                if (letto.dati() != null) {
                    aggiungi(etichetta, base, letto.dati(), trovati, avvisi);
                }
            }
        } catch (LimiteSuperato e) {
            errori.add(new ErroreFile(nomeZip, e.getMessage()));
            return;
        } catch (IOException | IllegalArgumentException e) {
            errori.add(new ErroreFile(nomeZip, "Lo zip non si può leggere: è danneggiato o non è uno zip valido."));
            return;
        }
        file.addAll(trovati);
        errori.addAll(avvisi);
        if (trovati.isEmpty() && avvisi.isEmpty()) {
            errori.add(new ErroreFile(nomeZip, "Lo zip non contiene nessuna fattura (.xml o .xml.p7m)."));
        }
    }

    /** {@code dati} e' null per una voce scartata; {@code contati} conta comunque i byte decompressi. */
    private record Lettura(byte[] dati, long contati) {
    }

    /** Legge la voce corrente fermandosi al superamento dei limiti; se {@code conserva} e' falso i byte si contano e si scartano. */
    private Lettura leggiLimitato(InputStream in, String nome, boolean conserva, long totaleFinora) throws IOException, LimiteSuperato {
        ByteArrayOutputStream out = conserva ? new ByteArrayOutputStream() : null;
        byte[] buffer = new byte[8192];
        long contati = 0;
        int n;
        while ((n = in.read(buffer)) > 0) {
            contati += n;
            if (contati > maxByteFile) {
                throw new LimiteSuperato("Il file «" + nome + "» nello zip è troppo grande (massimo "
                        + formato(maxByteFile) + " decompresso): archivio rifiutato.");
            }
            if (totaleFinora + contati > maxByteTotale) {
                throw new LimiteSuperato("Il contenuto decompresso dello zip supera il totale consentito ("
                        + formato(maxByteTotale) + "): archivio rifiutato.");
            }
            if (out != null) {
                out.write(buffer, 0, n);
            }
        }
        return new Lettura(out == null ? null : out.toByteArray(), contati);
    }

    /** Falso per percorsi assoluti, con unita' disco o con segmenti "..": il tipico "zip-slip". */
    static boolean nomeValido(String nome) {
        if (nome == null || nome.isEmpty() || nome.startsWith("/") || nome.startsWith("\\") || nome.indexOf(':') >= 0
                || nome.indexOf('\0') >= 0) {
            return false;
        }
        for (String segmento : nome.split("[/\\\\]")) {
            if (segmento.equals("..")) {
                return false;
            }
        }
        return true;
    }

    static String formato(long byteTotali) {
        return byteTotali >= 1024 * 1024 ? (byteTotali / (1024 * 1024)) + " MB" : byteTotali + " byte";
    }
}
