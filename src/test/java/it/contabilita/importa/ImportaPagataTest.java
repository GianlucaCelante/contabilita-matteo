package it.contabilita.importa;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static it.contabilita.importa.FattureProva.body;
import static it.contabilita.importa.FattureProva.byt;
import static it.contabilita.importa.FattureProva.denominazione;
import static it.contabilita.importa.FattureProva.fattura;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Le fatture importate da XML sono lo storico: nascono gia' pagate (docs/api.md, «Fatture ricevute»). */
class ImportaPagataTest extends ProvaBase {

    @Test
    void unaFatturaImportataENataPagata() throws Exception {
        String xml = fattura(denominazione("Forno Rossi Srl", "01234567890"),
                body("TD01", "FT-1", "2026-10-03", "122.00", "100.00", "22.00"));
        var r = mockMvc.perform(multipart("/api/importa/anteprima").file(new MockMultipartFile("files", "f.xml", "application/xml", byt(xml))));
        JsonNode anteprima = corpo(r);
        String id = anteprima.get("importazioneId").asText();
        invia(post("/api/importa/conferma"),
                "{\"importazioneId\":\"" + id + "\",\"righe\":[{\"indice\":0,\"categoria\":\"Farine\"}]}", 200);
        JsonNode m = leggi("/api/movimenti").get("elementi").get(0);
        assertThat(m.get("documento").asText()).isEqualTo("FATTURA");
        assertThat(m.get("origine").asText()).isEqualTo("XML");
        assertThat(m.get("pagata").asBoolean()).isTrue();
        assertThat(leggi("/api/movimenti?pagata=true").get("elementi")).hasSize(1);
        assertThat(leggi("/api/movimenti?pagata=false").get("elementi")).isEmpty();
    }

    @Test
    void unaNotaDiCreditoImportataNonHaStato() throws Exception {
        String xml = fattura(denominazione("Forno Rossi Srl", "01234567890"),
                body("TD04", "NC-1", "2026-10-05", "24.40", "20.00", "4.40"));
        var r = mockMvc.perform(multipart("/api/importa/anteprima").file(new MockMultipartFile("files", "n.xml", "application/xml", byt(xml))));
        String id = corpo(r).get("importazioneId").asText();
        invia(post("/api/importa/conferma"),
                "{\"importazioneId\":\"" + id + "\",\"righe\":[{\"indice\":0,\"categoria\":\"Farine\"}]}", 200);
        JsonNode m = leggi("/api/movimenti").get("elementi").get(0);
        assertThat(m.get("documento").asText()).isEqualTo("NOTA_DI_CREDITO");
        assertThat(m.get("pagata").asBoolean()).isFalse();
        assertThat(leggi("/api/movimenti?pagata=true").get("elementi")).isEmpty();
    }
}
