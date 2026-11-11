package it.contabilita.importa;

import it.contabilita.PerLog;
import it.contabilita.importa.ParserFatturaPa.ErroreLettura;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Dai file caricati ai file XML da leggere: {@code .xml}, {@code .xml.p7m} e {@code .zip} (anche con
 * sottocartelle). Lo zip si legge dal suo indice finale (come fanno Esplora risorse e gli altri programmi): la
 * lettura "a flusso" rifiuta gli zip di Fatture in Cloud, che hanno dimensioni a zero nei descrittori delle voci. Per
 * questo l'archivio intero (e solo lui) passa da un file temporaneo, cancellato subito dopo. Dallo zip non si scrive
 * MAI una voce su disco, quindi il nome di una voce ({@code ../x.xml}) non puo' far uscire un file dalla sua
 * cartella ("zip-slip"); le voci con nomi di quel tipo si scartano comunque, con un errore.
 *
 * <p>Difese da archivi malevoli ("zip bomb"): al massimo {@value #MAX_FILE} file, 20 MB per file e 200 MB in
 * totale DOPO la decompressione. La lettura si ferma appena un limite e' superato (non si decomprime il resto) e
 * l'intero archivio e' rifiutato con un errore chiaro. Si ignorano cartelle, {@code __MACOSX}, {@code .DS_Store}
 * e ogni altro file che non sia {@code .xml} o {@code .xml.p7m} (gli zip annidati non si aprono).
 *
 * <p>Il totale vale per tutta una lettura, non per ogni zip: chi legge piu' file insieme passa a
 * {@link #leggi(String, byte[], long)} i byte gia' letti. E i 200 MB sono solo il massimo: {@link ImportazioneService}
 * costruisce il lettore con un totale piu' basso se la memoria del programma e' poca (vedi
 * {@link ImportazioneService#limiteLettura}), perche' tutto quello che si legge resta in memoria fino alla conferma.
 */
public class LettoreFile {

    private static final Logger log = LoggerFactory.getLogger(LettoreFile.class);

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

    /** Un file caricato, da solo. */
    public Risultato leggi(String nome, byte[] contenuto) {
        return leggi(nome, contenuto, 0);
    }

    /**
     * Un file caricato; mai eccezioni: i problemi finiscono in {@link Risultato#errori()}. {@code giaLetti}: i byte dei
     * file gia' letti nella stessa anteprima, che contano nel totale insieme a questo.
     */
    public Risultato leggi(String nome, byte[] contenuto, long giaLetti) {
        List<FileXml> file = new ArrayList<>();
        List<ErroreFile> errori = new ArrayList<>();
        String minuscolo = nome.toLowerCase(Locale.ROOT);
        if (minuscolo.endsWith(".zip")) {
            leggiZip(nome, contenuto, giaLetti, file, errori);
        } else if (eXml(minuscolo) || eP7m(minuscolo)) {
            if (contenuto.length > Math.min(maxByteFile, maxByteTotale)) {
                errori.add(new ErroreFile(nome, "Il file è troppo grande (massimo " + formato(Math.min(maxByteFile, maxByteTotale)) + ")."));
            } else if (giaLetti + contenuto.length > maxByteTotale) {
                log.warn("Importazione, {}: oltre il totale di una lettura (già letti {} byte, file {} byte, massimo {})", PerLog.pulisci(nome),
                        giaLetti, contenuto.length, maxByteTotale);
                errori.add(new ErroreFile(nome, troppiInsieme(nome)));
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
            log.warn("Importazione, {}: {}", PerLog.pulisci(nomeFile), PerLog.pulisci(e.dettaglio()));
            errori.add(new ErroreFile(nomeFile, e.getMessage()));
        }
    }

    // ---- zip ----

    private static class LimiteSuperato extends Exception {
        LimiteSuperato(String messaggio) {
            super(messaggio);
        }
    }

    /** Il totale e' superato contando anche gli altri file della stessa lettura. */
    private String troppiInsieme(String nome) {
        return "I file scelti sono troppo grandi tutti insieme (massimo " + formato(maxByteTotale) + " per volta): «" + nome
                + "» non è stato letto. Leggi meno file per volta.";
    }

    private void leggiZip(String nomeZip, byte[] contenuto, long giaLetti, List<FileXml> file, List<ErroreFile> errori) {
        List<FileXml> trovati = new ArrayList<>();
        List<ErroreFile> avvisi = new ArrayList<>();
        long totale = 0;
        int voci = 0;
        int fileContati = 0;
        Path temporaneo = null;
        try {
            temporaneo = Files.createTempFile("contabilita-zip-", ".zip");
            Files.write(temporaneo, contenuto);
            try (ZipFile zip = new ZipFile(temporaneo.toFile(), StandardCharsets.UTF_8)) {
                for (Enumeration<? extends ZipEntry> elenco = zip.entries(); elenco.hasMoreElements(); ) {
                    ZipEntry voce = elenco.nextElement();
                    if (++voci > maxFile * 10L) {
                        throw new LimiteSuperato("Lo zip contiene troppi elementi: non è stato letto.");
                    }
                    if (voce.isDirectory()) {
                        continue;
                    }
                    String percorso = voce.getName();
                    String etichetta = nomeZip + " › " + percorso;
                    if (!nomeValido(percorso)) {
                        avvisi.add(new ErroreFile(etichetta, "Nome non valido nello zip: file saltato."));
                        continue;
                    }
                    if (++fileContati > maxFile) {
                        throw new LimiteSuperato("Lo zip contiene troppi file (massimo " + maxFile + "): non è stato letto.");
                    }
                    String base = percorso.substring(Math.max(percorso.lastIndexOf('/'), percorso.lastIndexOf('\\')) + 1);
                    String minuscolo = base.toLowerCase(Locale.ROOT);
                    boolean interessa = (eXml(minuscolo) || eP7m(minuscolo)) && !minuscolo.startsWith("._")
                            && !percorso.startsWith("__MACOSX/") && !percorso.contains("/__MACOSX/");
                    if (!interessa) {
                        continue; // altri file (elenchi in Excel, PDF…): non si decomprimono nemmeno
                    }
                    Lettura letto;
                    try (InputStream in = zip.getInputStream(voce)) {
                        letto = leggiLimitato(in, nomeZip, percorso, giaLetti, totale);
                    }
                    totale += letto.contati();
                    aggiungi(etichetta, base, letto.dati(), trovati, avvisi);
                }
            }
        } catch (LimiteSuperato e) {
            log.warn("Importazione, {}: {} (voci {}, file {}, byte letti {})", PerLog.pulisci(nomeZip), PerLog.pulisci(e.getMessage()), voci,
                    fileContati, totale);
            errori.add(new ErroreFile(nomeZip, e.getMessage()));
            return;
        } catch (IOException | IllegalArgumentException e) {
            log.warn("Importazione, {}: zip non leggibile: {}", PerLog.pulisci(nomeZip), PerLog.pulisci(e));
            errori.add(new ErroreFile(nomeZip, "Lo zip non si può leggere: è danneggiato o non è uno zip valido."));
            return;
        } finally {
            if (temporaneo != null) {
                try {
                    Files.deleteIfExists(temporaneo);
                } catch (IOException ignorata) {
                    // resta nella cartella temporanea del sistema, che si svuota da sola
                }
            }
        }
        file.addAll(trovati);
        errori.addAll(avvisi);
        if (trovati.isEmpty() && avvisi.isEmpty()) {
            errori.add(new ErroreFile(nomeZip, "Lo zip non contiene nessuna fattura (.xml o .xml.p7m)."));
        }
    }

    /** I byte della voce e quanti sono. */
    private record Lettura(byte[] dati, long contati) {
    }

    /**
     * Legge la voce corrente fermandosi al superamento dei limiti. Nel totale contano i byte gia' letti da questo zip
     * ({@code totaleFinora}) e quelli degli altri file della stessa lettura ({@code giaLetti}).
     */
    private Lettura leggiLimitato(InputStream in, String nomeZip, String nome, long giaLetti, long totaleFinora) throws IOException, LimiteSuperato {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long contati = 0;
        int n;
        while ((n = in.read(buffer)) > 0) {
            contati += n;
            if (contati > maxByteFile) {
                throw new LimiteSuperato("Il file «" + nome + "» nello zip è troppo grande (massimo "
                        + formato(maxByteFile) + " una volta estratto): lo zip non è stato letto.");
            }
            if (totaleFinora + contati > maxByteTotale) {
                throw new LimiteSuperato("Il contenuto dello zip è troppo grande (massimo " + formato(maxByteTotale)
                        + " in totale): non è stato letto.");
            }
            if (giaLetti + totaleFinora + contati > maxByteTotale) {
                throw new LimiteSuperato(troppiInsieme(nomeZip));
            }
            out.write(buffer, 0, n);
        }
        return new Lettura(out.toByteArray(), contati);
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
