package it.contabilita.allegati;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ConfigurazioneProva;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** La copia di sicurezza include gli allegati e la richiesta di ripristino lo segnala al riavvio. */
class AllegatiBackupTest extends ProvaBase {

    @Autowired
    private ConfigurazioneProva.UscitaDiProva uscita;

    @BeforeEach
    @AfterEach
    void pulisci() throws Exception {
        Files.deleteIfExists(CARTELLA_DATI.resolve("ripristino-in-attesa.json"));
        uscita.chiamate().clear();
    }

    private Path cartellaCopie() throws Exception {
        Path cartella = Files.createTempDirectory(CARTELLA_DATI.getParent(), "contabilita-backup-allegati-");
        invia(put("/api/programma/backup"),
                json.writeValueAsString(json.createObjectNode().put("cartella", cartella.toString())), 200);
        return cartella;
    }

    private void allega(long id, byte[] contenuto) throws Exception {
        invia(multipart("/api/movimenti/" + id + "/allegato").file(new MockMultipartFile("file", "s.png", "image/png", contenuto)), null, 200);
    }

    private static byte[] png(int n) {
        byte[] b = new byte[n];
        b[0] = (byte) 0x89;
        b[1] = 'P';
        b[2] = 'N';
        b[3] = 'G';
        return b;
    }

    @Test
    void laCopiaDatataContieneLaCartellaAllegati() throws Exception {
        cartellaCopie();
        long id = crea(movimento("2026-05-05", "COSTO_VARIABILE", "SCONTRINO", 1500)).get("id").asLong();
        allega(id, png(300));
        Path copia = Path.of(invia(post("/api/programma/backup"), null, 200).get("cartella").asText());
        assertThat(copia.resolve("contabilita.db")).exists();
        try (Stream<Path> originali = Files.list(CARTELLA_DATI.resolve("allegati"));
             Stream<Path> copiati = Files.list(copia.resolve("allegati"))) {
            List<String> a = originali.map(p -> p.getFileName().toString()).toList();
            assertThat(a).hasSize(1);
            assertThat(copiati.map(p -> p.getFileName().toString()).toList()).isEqualTo(a);
            assertThat(Files.readAllBytes(copia.resolve("allegati").resolve(a.get(0)))).isEqualTo(png(300));
        }
    }

    @Test
    void senzaAllegatiLaCopiaNonHaLaCartella() throws Exception {
        cartellaCopie();
        Path copia = Path.of(invia(post("/api/programma/backup"), null, 200).get("cartella").asText());
        assertThat(copia.resolve("contabilita.db")).exists();
        assertThat(copia.resolve("allegati")).doesNotExist();
    }

    @Test
    void ilMarcatoreDelRipristinoIndicaGliAllegatiSoloSeLaCopiaLiHa() throws Exception {
        cartellaCopie();
        long id = crea(movimento("2026-05-05", "COSTO_VARIABILE", "SCONTRINO", 1500)).get("id").asLong();
        allega(id, png(300));
        String conAllegati = Path.of(invia(post("/api/programma/backup"), null, 200).get("cartella").asText()).getFileName().toString();
        jdbc.update("DELETE FROM movimento");
        deleteAllegati();
        orologio.imposta("2026-01-02");
        String senzaAllegati = Path.of(invia(post("/api/programma/backup"), null, 200).get("cartella").asText()).getFileName().toString();

        invia(post("/api/programma/ripristina"), "{\"copia\":\"" + conAllegati + "\"}", 202);
        JsonNode marcatore = json.readTree(CARTELLA_DATI.resolve("ripristino-in-attesa.json").toFile());
        assertThat(Path.of(marcatore.get("allegati").asText())).isDirectory().hasFileName("allegati");
        Files.delete(CARTELLA_DATI.resolve("ripristino-in-attesa.json"));

        invia(post("/api/programma/ripristina"), "{\"copia\":\"" + senzaAllegati + "\"}", 202);
        marcatore = json.readTree(CARTELLA_DATI.resolve("ripristino-in-attesa.json").toFile());
        assertThat(marcatore.has("allegati")).isFalse();
    }

    private void deleteAllegati() throws Exception {
        Path dir = CARTELLA_DATI.resolve("allegati");
        if (Files.isDirectory(dir)) {
            try (Stream<Path> s = Files.list(dir)) {
                for (Path p : s.toList()) {
                    Files.delete(p);
                }
            }
            Files.delete(dir);
        }
    }
}
