package it.contabilita.allegati;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/** Allegati dei movimenti (docs/api.md, fase 4). */
class AllegatiApiTest extends ProvaBase {

    private static final byte[] JPEG = bytes(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0}, 500);
    private static final byte[] PNG = bytes(new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, 500);
    private static final byte[] PDF = bytes("%PDF-1.7\n".getBytes(), 500);

    private static byte[] bytes(byte[] inizio, int totale) {
        byte[] b = new byte[totale];
        System.arraycopy(inizio, 0, b, 0, inizio.length);
        return b;
    }

    private Path cartellaAllegati() {
        return CARTELLA_DATI.resolve("allegati");
    }

    private List<String> fileSuDisco() throws IOException {
        if (!Files.isDirectory(cartellaAllegati())) {
            return List.of();
        }
        try (Stream<Path> s = Files.list(cartellaAllegati())) {
            return s.map(p -> p.getFileName().toString()).toList();
        }
    }

    private long nuovoMovimento() throws Exception {
        return crea(movimento("2026-05-05", "COSTO_VARIABILE", "SCONTRINO", 1500)).get("id").asLong();
    }

    private MockMultipartHttpServletRequestBuilder carica(long id, String nome, String tipo, byte[] contenuto) {
        return multipart("/api/movimenti/" + id + "/allegato").file(new MockMultipartFile("file", nome, tipo, contenuto));
    }

    @Test
    void caricaLeggeEPassaIlNomeOriginaleNelMovimento() throws Exception {
        long id = nuovoMovimento();
        JsonNode m = invia(carica(id, "scontrino cena.jpg", "image/jpeg", JPEG), null, 200);
        assertThat(m.get("allegatoNome").asText()).isEqualTo("scontrino cena.jpg");
        assertThat(leggi("/api/movimenti/" + id).get("allegatoNome").asText()).isEqualTo("scontrino cena.jpg");

        var r = mockMvc.perform(get("/api/movimenti/" + id + "/allegato")).andReturn().getResponse();
        assertThat(r.getStatus()).isEqualTo(200);
        assertThat(r.getContentType()).isEqualTo("image/jpeg");
        assertThat(r.getHeader("Content-Disposition")).startsWith("inline").contains("scontrino cena.jpg");
        assertThat(r.getContentAsByteArray()).isEqualTo(JPEG);

        // il file sul disco ha un nome interno univoco, non quello dell'input
        assertThat(fileSuDisco()).singleElement().satisfies(n -> {
            assertThat(n).matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg");
        });
    }

    @Test
    void accettaPngEPdfEDaIlTipoGiusto() throws Exception {
        long a = nuovoMovimento();
        invia(carica(a, "foto.png", "image/png", PNG), null, 200);
        assertThat(mockMvc.perform(get("/api/movimenti/" + a + "/allegato")).andReturn().getResponse().getContentType()).isEqualTo("image/png");
        long b = nuovoMovimento();
        invia(carica(b, "fattura.pdf", "application/pdf", PDF), null, 200);
        assertThat(mockMvc.perform(get("/api/movimenti/" + b + "/allegato")).andReturn().getResponse().getContentType()).isEqualTo("application/pdf");
    }

    @Test
    void ilTipoSiVerificaSuiByteNonSuEstensioneNeContentType() throws Exception {
        long id = nuovoMovimento();
        // testo spacciato per jpeg
        errore(carica(id, "finta.jpg", "image/jpeg", "ciao, non sono un'immagine".getBytes()), null, 400);
        // eseguibile (MZ) spacciato per pdf
        errore(carica(id, "virus.pdf", "application/pdf", bytes(new byte[]{'M', 'Z'}, 100)), null, 400);
        // un XML non e' ammesso nell'upload manuale (solo jpeg, png, pdf)
        errore(carica(id, "f.xml", "application/xml", "<?xml version=\"1.0\"?><a/>".getBytes()), null, 400);
        // file vuoto
        errore(carica(id, "vuoto.png", "image/png", new byte[0]), null, 400);
        assertThat(fileSuDisco()).isEmpty();
        assertThat(leggi("/api/movimenti/" + id).get("allegatoNome").isNull()).isTrue();
    }

    @Test
    void unFileOltreOttoMegabyteERifiutato() throws Exception {
        long id = nuovoMovimento();
        byte[] enorme = bytes(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}, 8 * 1024 * 1024 + 1);
        errore(carica(id, "grande.jpg", "image/jpeg", enorme), null, 400);
        // proprio 8 MB va bene
        byte[] limite = bytes(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}, 8 * 1024 * 1024);
        invia(carica(id, "limite.jpg", "image/jpeg", limite), null, 200);
    }

    @Test
    void ilNomeOriginaleNonDiventaMaiUnPercorso() throws Exception {
        long id = nuovoMovimento();
        JsonNode m = invia(carica(id, "../../../fuori/evil\\..\\x\".jpg", "image/jpeg", JPEG), null, 200);
        String nome = m.get("allegatoNome").asText();
        assertThat(nome).doesNotContain("/").doesNotContain("\\").doesNotContain("..").doesNotContain("\"");
        assertThat(nome).isNotBlank();
        assertThat(fileSuDisco()).hasSize(1).allSatisfy(n -> assertThat(n).doesNotContain("evil"));
        assertThat(CARTELLA_DATI.getParent().resolve("fuori")).doesNotExist();

        var r = mockMvc.perform(get("/api/movimenti/" + id + "/allegato")).andReturn().getResponse();
        String header = r.getHeader("Content-Disposition");
        assertThat(header).doesNotContain("\r").doesNotContain("\n").doesNotContain("..");
    }

    @Test
    void nomiConAccentiEACapoNonRomponoLHeader() throws Exception {
        long id = nuovoMovimento();
        invia(carica(id, "caffè\r\nX-Evil: 1.png", "image/png", PNG), null, 200);
        var r = mockMvc.perform(get("/api/movimenti/" + id + "/allegato")).andReturn().getResponse();
        assertThat(r.getHeader("Content-Disposition")).doesNotContain("\r").doesNotContain("\n");
        assertThat(r.getHeader("X-Evil")).isNull();
    }

    @Test
    void caricareDiNuovoSostituisceIlFilePrecedente() throws Exception {
        long id = nuovoMovimento();
        invia(carica(id, "uno.jpg", "image/jpeg", JPEG), null, 200);
        String primo = fileSuDisco().get(0);
        JsonNode m = invia(carica(id, "due.pdf", "application/pdf", PDF), null, 200);
        assertThat(m.get("allegatoNome").asText()).isEqualTo("due.pdf");
        assertThat(fileSuDisco()).hasSize(1).doesNotContain(primo);
        var r = mockMvc.perform(get("/api/movimenti/" + id + "/allegato")).andReturn().getResponse();
        assertThat(r.getContentAsByteArray()).isEqualTo(PDF);
    }

    @Test
    void cancellareLAllegatoToglieFileENome() throws Exception {
        long id = nuovoMovimento();
        invia(carica(id, "uno.jpg", "image/jpeg", JPEG), null, 200);
        invia(delete("/api/movimenti/" + id + "/allegato"), null, 204);
        assertThat(fileSuDisco()).isEmpty();
        assertThat(leggi("/api/movimenti/" + id).get("allegatoNome").isNull()).isTrue();
        invia(get("/api/movimenti/" + id + "/allegato"), null, 404);
        invia(delete("/api/movimenti/" + id + "/allegato"), null, 204); // idempotente
    }

    @Test
    void movimentoOAllegatoInesistenti404() throws Exception {
        invia(get("/api/movimenti/99999/allegato"), null, 404);
        invia(delete("/api/movimenti/99999/allegato"), null, 404);
        errore(carica(99999, "a.jpg", "image/jpeg", JPEG), null, 404);
        long id = nuovoMovimento();
        invia(get("/api/movimenti/" + id + "/allegato"), null, 404);
    }

    @Test
    void eliminandoIlMovimentoSiEliminaIlFile() throws Exception {
        long id = nuovoMovimento();
        invia(carica(id, "uno.jpg", "image/jpeg", JPEG), null, 200);
        assertThat(fileSuDisco()).hasSize(1);
        elimina(id, "SOLO_QUESTO");
        assertThat(fileSuDisco()).isEmpty();
    }

    @Test
    void seIlFileNonCEPiuLAllegatoDa404SenzaErrore500() throws Exception {
        long id = nuovoMovimento();
        invia(carica(id, "uno.jpg", "image/jpeg", JPEG), null, 200);
        try (Stream<Path> s = Files.list(cartellaAllegati())) {
            for (Path p : s.toList()) {
                Files.delete(p);
            }
        }
        invia(get("/api/movimenti/" + id + "/allegato"), null, 404);
        elimina(id, "SOLO_QUESTO"); // e l'eliminazione funziona lo stesso
    }
}
