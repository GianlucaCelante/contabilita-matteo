package it.contabilita;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Base dei test di integrazione: SQLite in una cartella temporanea (nessun file nel repository),
 * profilo "test", tabelle svuotate prima di ogni test. La cartella e' creata a mano e non con
 * {@code @TempDir}: il file .db resta aperto finche' il contesto Spring (in cache fra le classi)
 * non viene chiuso, e su Windows la cancellazione automatica fallirebbe.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@org.springframework.context.annotation.Import(ConfigurazioneProva.class)
public abstract class ProvaBase {

    protected static final Path CARTELLA_DATI;

    static {
        try {
            CARTELLA_DATI = Files.createTempDirectory("contabilita-test-");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void proprieta(DynamicPropertyRegistry registry) {
        registry.add("contabilita.dati", CARTELLA_DATI::toString);
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected JdbcTemplate jdbc;

    @Autowired
    protected ConfigurazioneProva.OrologioDiProva orologio;

    @BeforeEach
    void svuotaTabelle() throws IOException {
        orologio.imposta("2026-01-01");
        Path allegati = CARTELLA_DATI.resolve("allegati");
        if (Files.isDirectory(allegati)) {
            try (var file = Files.list(allegati)) {
                for (Path p : file.toList()) {
                    Files.deleteIfExists(p);
                }
            }
            Files.deleteIfExists(allegati);
        }
        Path copie = CARTELLA_DATI.resolve("copie"); // cartella predefinita delle copie
        if (Files.isDirectory(copie)) {
            try (var tutti = Files.walk(copie)) {
                for (Path p : tutti.sorted(java.util.Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(p);
                }
            }
        }
        jdbc.update("DELETE FROM movimento");
        jdbc.update("DELETE FROM ricorrenza");
        jdbc.update("DELETE FROM categoria");
        jdbc.update("DELETE FROM fornitore");
        jdbc.update("DELETE FROM dipendente");
        jdbc.update("DELETE FROM impostazione");
    }

    // ---- scorciatoie ----

    protected ObjectNode movimento(String data, String tipo, String documento, long importoCent) {
        ObjectNode n = json.createObjectNode();
        n.put("data", data);
        n.put("tipo", tipo);
        n.put("documento", documento);
        n.put("importoCent", importoCent);
        return n;
    }

    protected JsonNode corpo(org.springframework.test.web.servlet.ResultActions r) throws Exception {
        String testo = r.andReturn().getResponse().getContentAsString();
        return testo.isEmpty() ? null : json.readTree(testo);
    }

    /** Esegue la richiesta con un corpo JSON, verifica lo stato e torna il JSON della risposta. */
    protected JsonNode invia(MockHttpServletRequestBuilder richiesta, Object corpoJson, int statoAtteso) throws Exception {
        if (corpoJson != null) {
            richiesta.contentType("application/json").content(corpoJson instanceof String s ? s : json.writeValueAsString(corpoJson));
        }
        var r = mockMvc.perform(richiesta);
        org.assertj.core.api.Assertions.assertThat(r.andReturn().getResponse().getStatus())
                .as(richiesta.toString() + " -> " + r.andReturn().getResponse().getContentAsString())
                .isEqualTo(statoAtteso);
        return corpo(r);
    }

    protected JsonNode crea(ObjectNode movimento) throws Exception {
        return invia(post("/api/movimenti"), movimento, 201);
    }

    protected JsonNode leggi(String url) throws Exception {
        return invia(get(url), null, 200);
    }

    protected JsonNode modifica(long id, String ambito, ObjectNode movimento) throws Exception {
        return invia(put("/api/movimenti/" + id + "?ambito=" + ambito), movimento, 200);
    }

    protected void elimina(long id, String ambito) throws Exception {
        invia(delete("/api/movimenti/" + id + "?ambito=" + ambito), null, 204);
    }

    protected JsonNode errore(MockHttpServletRequestBuilder richiesta, Object corpoJson, int stato) throws Exception {
        JsonNode r = invia(richiesta, corpoJson, stato);
        org.assertj.core.api.Assertions.assertThat(r.get("errore").asText()).isNotBlank();
        return r;
    }
}
