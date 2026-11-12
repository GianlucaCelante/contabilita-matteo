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
 * totale DOPO la decompressione (i due massimi: {@link ImportazioneService} li abbassa con la memoria). Oltre il numero
 * di file o il totale la lettura si ferma (non si decomprime il resto) e l'intero archivio e' rifiutato con un errore
 * chiaro. Una voce oltre il limite PER FILE invece si scarta da sola, con un errore che la nomina, e le altre si leggono:
 * l'archivio di un anno non deve saltare per una fattura con un PDF grande. Si ignorano cartelle, {@code __MACOSX}, {@code .DS_Store}
 * e ogni altro file che non sia {@code .xml} o {@code .xml.p7m} (gli zip annidati non si aprono).
 *
 * <p>Il totale vale per tutta una lettura, non per ogni zip: chi legge piu' file insieme passa a
 * {@link #leggi(String, byte[], long)} i byte gia' letti. E i 200 MB sono solo il massimo: {@link ImportazioneService}
 * costruisce il lettore con un totale piu' basso se la memoria del programma e' poca (vedi
 * {@link ImportazioneService#limiteLettura}), perche' tutto quello che si legge resta in memoria fino alla conferma.
 * Lo stesso per i 20 MB per file ({@link ImportazioneService#limiteFile}): un XML, aperto, occupa molte volte i suoi byte.
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
            if (contenuto.length > massimoDiUnFile()) {
                log.warn("Importazione, {}: file di {} byte oltre il massimo per file ({} byte)", PerLog.pulisci(nome), contenuto.length,
                        massimoDiUnFile());
                errori.add(new ErroreFile(nome, "Il file «" + nome + "» è troppo grande per essere letto (massimo " + formato(massimoDiUnFile()) + ")."));
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

    /** Il massimo di un file caricato da solo: il limite per file, o il totale di una lettura se e' piu' basso. */
    private long massimoDiUnFile() {
        return Math.min(maxByteFile, maxByteTotale);
    }

    /**
     * Quanti byte di un file caricato possono finire in memoria in un'anteprima, saputi solo il nome e la dimensione
     * dichiarata (prima di leggerlo): serve a {@link ImportazioneService#faiPostoPerLaLettura}. Zero per quello che
     * {@link #leggi(String, byte[], long)} rifiuta senza leggerlo (un tipo non supportato, un file oltre il massimo): per
     * un carico cosi' non si deve scartare niente. Uno zip conta per i suoi byte compressi: estratto pesa di solito di
     * piu', mai si sa prima quanto.
     */
    public long pesoAtteso(String nome, long dimensione) {
        if (nome == null || dimensione <= 0) {
            return 0;
        }
        String minuscolo = nome.toLowerCase(Locale.ROOT);
        if (minuscolo.endsWith(".zip")) {
            return dimensione;
        }
        return (eXml(minuscolo) || eP7m(minuscolo)) && dimensione <= massimoDiUnFile() ? dimensione : 0;
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

    /** Una voce dello zip oltre il limite per file: si scarta lei sola. {@code letti}: i byte decompressi prima di accorgersene. */
    private static class VoceTroppoGrande extends Exception {
        private final long letti;

        VoceTroppoGrande(long letti) {
            super(null, null, false, false);
            this.letti = letti;
        }
    }

    private String voceTroppoGrande(String percorso) {
        return "Il file «" + percorso + "» nello zip è troppo grande per essere letto (massimo " + formato(maxByteFile) + ").";
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
                    // La dimensione dichiarata nell'indice dello zip: se e' gia' oltre il limite per file la voce si
                    // scarta senza decomprimerne un byte (e senza pesare sul totale).
                    if (voce.getSize() > maxByteFile) {
                        log.warn("Importazione, {}: voce di {} byte dichiarati oltre il massimo per file ({} byte), scartata",
                                PerLog.pulisci(etichetta), voce.getSize(), maxByteFile);
                        avvisi.add(new ErroreFile(etichetta, voceTroppoGrande(percorso)));
                        continue;
                    }
                    Lettura letto;
                    try (InputStream in = zip.getInputStream(voce)) {
                        letto = leggiLimitato(in, nomeZip, giaLetti, totale);
                    } catch (VoceTroppoGrande e) {
                        // La dimensione dichiarata mancava o era falsa: ce ne si accorge decomprimendo. I byte decompressi
                        // per accorgersene contano nel totale: uno zip pieno di voci cosi' ("zip bomb") finisce rifiutato
                        // intero dal limite sul totale invece di far lavorare il programma senza fine.
                        totale += e.letti;
                        log.warn("Importazione, {}: voce oltre il massimo per file ({} byte) una volta estratta, scartata",
                                PerLog.pulisci(etichetta), maxByteFile);
                        avvisi.add(new ErroreFile(etichetta, voceTroppoGrande(percorso)));
                        continue;
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
     * ({@code totaleFinora}) e quelli degli altri file della stessa lettura ({@code giaLetti}). Oltre il limite per file
     * lancia {@link VoceTroppoGrande} (si scarta la voce), oltre il totale {@link LimiteSuperato} (si rifiuta lo zip).
     */
    private Lettura leggiLimitato(InputStream in, String nomeZip, long giaLetti, long totaleFinora)
            throws IOException, LimiteSuperato, VoceTroppoGrande {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long contati = 0;
        int n;
        while ((n = in.read(buffer)) > 0) {
            contati += n;
            if (totaleFinora + contati > maxByteTotale) {
                throw new LimiteSuperato("Il contenuto dello zip è troppo grande (massimo " + formato(maxByteTotale)
                        + " in totale): non è stato letto.");
            }
            if (giaLetti + totaleFinora + contati > maxByteTotale) {
                throw new LimiteSuperato(troppiInsieme(nomeZip));
            }
            if (contati > maxByteFile) {
                throw new VoceTroppoGrande(contati);
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
