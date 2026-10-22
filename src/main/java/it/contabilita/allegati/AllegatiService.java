package it.contabilita.allegati;

import it.contabilita.api.Dto.MovimentoDto;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.movimenti.MovimentiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * File allegati ai movimenti (docs/api.md, "Allegati"): stanno in {@code <cartella dati>/allegati/}, mai nel
 * database. Il file sul disco ha un nome interno {@code UUID.estensione} generato qui, mai ricavato dall'input;
 * il nome originale vive solo nei metadati ({@code allegato_nome}) e si ripulisce da separatori e caratteri di
 * controllo prima di finire in un header {@code Content-Disposition}.
 *
 * <p>L'upload manuale accetta solo JPEG, PNG e PDF (max 8 MB), riconosciuti dai byte iniziali e non
 * dall'estensione o dal Content-Type dichiarato. L'importazione delle fatture allega invece l'XML originale
 * (o il {@code .p7m}) con {@link #salvaPerImportazione}, che non applica quei filtri.
 */
@Service
public class AllegatiService {

    private static final Logger log = LoggerFactory.getLogger(AllegatiService.class);

    public static final long MAX_BYTE = 8L * 1024 * 1024;
    private static final int NOME_MASSIMO = 120;
    private static final Pattern NOME_INTERNO = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|pdf|xml|p7m)");

    /** Il file da servire, con il nome originale e il tipo ricavato dall'estensione interna. */
    public record Allegato(Path file, String nomeOriginale, String contentType) {
    }

    private final MovimentoRepository movimenti;
    private final Path cartella;

    public AllegatiService(MovimentoRepository movimenti, @Value("${contabilita.dati}") String cartellaDati) {
        this.movimenti = movimenti;
        this.cartella = Path.of(cartellaDati).toAbsolutePath().resolve("allegati");
    }

    // ---- API ----

    @Transactional(readOnly = true)
    public Allegato apri(long id) {
        Movimento m = trova(id);
        if (m.getAllegatoFile() == null || !NOME_INTERNO.matcher(m.getAllegatoFile()).matches()) {
            throw new ErroreApi(HttpStatus.NOT_FOUND, "Questo movimento non ha un allegato.");
        }
        Path file = cartella.resolve(m.getAllegatoFile());
        if (!Files.isRegularFile(file)) {
            throw new ErroreApi(HttpStatus.NOT_FOUND, "Il file dell'allegato non c'è più sul disco.");
        }
        return new Allegato(file, m.getAllegatoNome() == null ? "allegato" : m.getAllegatoNome(), tipoDa(m.getAllegatoFile()));
    }

    @Transactional
    public MovimentoDto carica(long id, String nomeOriginale, byte[] contenuto) {
        Movimento m = trova(id);
        if (contenuto == null || contenuto.length == 0) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il file è vuoto.");
        }
        if (contenuto.length > MAX_BYTE) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il file è troppo grande (massimo 8 MB).");
        }
        String estensione = estensioneDaByte(contenuto);
        if (estensione == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Sono ammessi solo foto JPEG o PNG e file PDF.");
        }
        String nuovo = scrivi(contenuto, estensione);
        String vecchio = m.getAllegatoFile();
        try {
            m.setAllegatoFile(nuovo);
            m.setAllegatoNome(pulisciNome(nomeOriginale));
            MovimentoDto dto = MovimentiService.dto(movimenti.save(m));
            if (vecchio != null) {
                eliminaFileDopoCommit(vecchio);
            }
            return dto;
        } catch (RuntimeException e) {
            eliminaFile(nuovo);
            throw e;
        }
    }

    @Transactional
    public void elimina(long id) {
        Movimento m = trova(id);
        String vecchio = m.getAllegatoFile();
        m.setAllegatoFile(null);
        m.setAllegatoNome(null);
        movimenti.save(m);
        eliminaFileDopoCommit(vecchio);
    }

    /**
     * Per l'importazione: scrive il file (XML o p7m) e lo collega al movimento, senza filtri sul tipo.
     * Torna il nome interno, cosi' chi chiama puo' toglierlo se poi la sua transazione fallisce.
     */
    public String salvaPerImportazione(Movimento m, String nomeOriginale, byte[] contenuto, boolean p7m) {
        String interno = scrivi(contenuto, p7m ? "p7m" : "xml");
        m.setAllegatoFile(interno);
        m.setAllegatoNome(pulisciNome(nomeOriginale));
        return interno;
    }

    // ---- file ----

    /** Scrive in un file temporaneo e lo sposta con il nome definitivo: mai un file a meta'. */
    private String scrivi(byte[] contenuto, String estensione) {
        String nome = UUID.randomUUID() + "." + estensione;
        Path temporaneo = null;
        try {
            Files.createDirectories(cartella);
            temporaneo = Files.createTempFile(cartella, "scrittura-", ".tmp");
            Files.write(temporaneo, contenuto);
            try {
                Files.move(temporaneo, cartella.resolve(nome), StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temporaneo, cartella.resolve(nome));
            }
            return nome;
        } catch (IOException e) {
            log.error("Impossibile scrivere l'allegato: {}", e.toString(), e);
            if (temporaneo != null) {
                try {
                    Files.deleteIfExists(temporaneo);
                } catch (IOException ignorato) {
                    // pulizia best effort
                }
            }
            throw new ErroreApi(HttpStatus.INTERNAL_SERVER_ERROR, "Impossibile salvare l'allegato: controlla lo spazio libero e i permessi.");
        }
    }

    /** Toglie il file dal disco (solo se il nome ha la forma interna); mai eccezioni. */
    public void eliminaFile(String nomeInterno) {
        if (nomeInterno == null || !NOME_INTERNO.matcher(nomeInterno).matches()) {
            return;
        }
        try {
            Files.deleteIfExists(cartella.resolve(nomeInterno));
        } catch (IOException e) {
            log.warn("Impossibile eliminare l'allegato {}: {}", nomeInterno, e.toString());
        }
    }

    /** Come {@link #eliminaFile} ma, dentro una transazione, solo dopo il commit (se annulla, il file resta). */
    public void eliminaFileDopoCommit(String nomeInterno) {
        if (nomeInterno == null) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    eliminaFile(nomeInterno);
                }
            });
        } else {
            eliminaFile(nomeInterno);
        }
    }

    private Movimento trova(long id) {
        return movimenti.findWithRelazioniById(id)
                .orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Movimento non trovato."));
    }

    // ---- tipo e nome ----

    /** jpg / png / pdf dai byte iniziali, oppure null. */
    static String estensioneDaByte(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return "jpg";
        }
        if (b.length >= 4 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return "png";
        }
        if (b.length >= 4 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F') {
            return "pdf";
        }
        return null;
    }

    static String tipoDa(String nomeInterno) {
        String estensione = nomeInterno.substring(nomeInterno.lastIndexOf('.') + 1);
        return switch (estensione) {
            case "jpg" -> "image/jpeg";
            case "png" -> "image/png";
            case "pdf" -> "application/pdf";
            case "xml" -> "application/xml";
            case "p7m" -> "application/pkcs7-mime";
            default -> "application/octet-stream";
        };
    }

    /**
     * Nome originale ripulito: niente percorso (si tiene l'ultimo pezzo dopo / o \), niente caratteri di
     * controllo, virgolette, due punti, asterischi, minore/maggiore, barre verticali, niente "..", al massimo 120
     * caratteri. Mai vuoto.
     */
    static String pulisciNome(String grezzo) {
        if (grezzo == null) {
            return "allegato";
        }
        String n = grezzo.substring(Math.max(grezzo.lastIndexOf('/'), grezzo.lastIndexOf('\\')) + 1);
        StringBuilder sb = new StringBuilder();
        n.codePoints().forEach(c -> {
            if (!Character.isISOControl(c) && "\"\\/:*?<>|;%".indexOf(c) < 0) {
                sb.appendCodePoint(c);
            }
        });
        n = sb.toString().replaceAll("\\s+", " ").strip();
        while (n.contains("..")) {
            n = n.replace("..", ".");
        }
        n = n.replaceAll("^[. ]+", "");
        if (n.length() > NOME_MASSIMO) {
            int punto = n.lastIndexOf('.');
            String estensione = punto > 0 && n.length() - punto <= 10 ? n.substring(punto) : "";
            n = n.substring(0, NOME_MASSIMO - estensione.length()) + estensione;
        }
        return n.isEmpty() ? "allegato" : n;
    }
}
