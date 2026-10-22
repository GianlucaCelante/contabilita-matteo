package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

class ImpostazioniApiTest extends ProvaBase {

    @Test
    void laMappaPartiaVuotaEUnaPutParzialeLaAggiorna() throws Exception {
        assertThat(leggi("/api/impostazioni")).isEmpty();
        JsonNode dopo = invia(put("/api/impostazioni"), "{\"vistaPredefinita\":\"mese\"}", 200);
        assertThat(dopo.get("vistaPredefinita").asText()).isEqualTo("mese");
        JsonNode ancora = invia(put("/api/impostazioni"), "{\"altra\":\"1\",\"vistaPredefinita\":\"anno\"}", 200);
        assertThat(ancora.get("vistaPredefinita").asText()).isEqualTo("anno");
        assertThat(ancora.get("altra").asText()).isEqualTo("1");
        assertThat(leggi("/api/impostazioni")).isEqualTo(ancora);
    }

    @Test
    void chiaviEValoriNonValidiDanno400() throws Exception {
        errore(put("/api/impostazioni"), "{\"backup.cartella\":\"C:/x\"}", 400);
        errore(put("/api/impostazioni"), "{\"x\":null}", 400);
        errore(put("/api/impostazioni"), "{\" \":\"a\"}", 400);
        errore(put("/api/impostazioni"), "[1,2]", 400);
        assertThat(leggi("/api/impostazioni")).isEmpty();
    }

    @Test
    void leChiaviInterneDelBackupNonSiVedono() throws Exception {
        jdbc.update("INSERT INTO impostazione (chiave, valore) VALUES ('backup.cartella', 'C:/x')");
        jdbc.update("INSERT INTO impostazione (chiave, valore) VALUES ('tema', 'chiaro')");
        JsonNode m = leggi("/api/impostazioni");
        assertThat(m.has("backup.cartella")).isFalse();
        assertThat(m.get("tema").asText()).isEqualTo("chiaro");
        // e una PUT che le rimanda indietro non rompe: le altre si salvano
        invia(put("/api/impostazioni"), "{\"tema\":\"scuro\"}", 200);
    }
}
