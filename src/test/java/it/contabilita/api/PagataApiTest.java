package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** Il campo «pagata» delle fatture ricevute (docs/api.md, «Fatture ricevute»). */
class PagataApiTest extends ProvaBase {

    private ObjectNode fattura(long importo) {
        return movimento("2026-10-10", "COSTO_VARIABILE", "FATTURA", importo).put("fornitore", "Bel Fungo");
    }

    private JsonNode segna(long id, Object corpo, int stato) throws Exception {
        return invia(put("/api/movimenti/" + id + "/pagata"), corpo, stato);
    }

    @Test
    void laFatturaNascePerDefaultDaPagare() throws Exception {
        JsonNode m = crea(fattura(1000));
        assertThat(m.get("pagata").asBoolean()).isFalse();
        assertThat(leggi("/api/movimenti/" + m.get("id").asLong()).get("pagata").asBoolean()).isFalse();
    }

    @Test
    void laFatturaPuoNascerePagata() throws Exception {
        JsonNode m = crea(fattura(1000).put("pagata", true));
        assertThat(m.get("pagata").asBoolean()).isTrue();
    }

    @Test
    void perGliAltriDocumentiPagataSiIgnoraEESempreFalse() throws Exception {
        assertThat(crea(movimento("2026-10-10", "COSTO_VARIABILE", "SCONTRINO", 500).put("pagata", true)).get("pagata").asBoolean()).isFalse();
        assertThat(crea(movimento("2026-10-10", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 500).put("pagata", true)).get("pagata").asBoolean()).isFalse();
        assertThat(crea(movimento("2026-10-10", "RICAVO", "RICAVO_EXTRA", 500).put("pagata", true)).get("pagata").asBoolean()).isFalse();
        assertThat(crea(movimento("2026-10-10", "COSTO_FISSO", "NESSUNO", 500).put("pagata", true)).get("pagata").asBoolean()).isFalse();
    }

    @Test
    void segnaESmarcaLaFatturaSenzaToccareIlResto() throws Exception {
        JsonNode m = crea(fattura(1000));
        long id = m.get("id").asLong();
        JsonNode pagata = segna(id, json.createObjectNode().put("pagata", true), 200);
        assertThat(pagata.get("pagata").asBoolean()).isTrue();
        assertThat(pagata.get("importoCent").asLong()).isEqualTo(1000);
        assertThat(pagata.get("fornitore").get("nome").asText()).isEqualTo("Bel Fungo");
        assertThat(pagata.get("modificatoIl").isNull()).isTrue(); // cambia solo questo campo
        assertThat(leggi("/api/movimenti/" + id).get("pagata").asBoolean()).isTrue();

        JsonNode daPagare = segna(id, json.createObjectNode().put("pagata", false), 200);
        assertThat(daPagare.get("pagata").asBoolean()).isFalse();
    }

    @Test
    void soloUnaFatturaSiSegnaComePagata() throws Exception {
        for (String[] dt : new String[][]{{"COSTO_VARIABILE", "SCONTRINO"}, {"COSTO_VARIABILE", "NOTA_DI_CREDITO"},
                {"RICAVO", "RICAVO_FATTURATO"}, {"COSTO_FISSO", "NESSUNO"}}) {
            long id = crea(movimento("2026-10-10", dt[0], dt[1], 700)).get("id").asLong();
            JsonNode e = segna(id, json.createObjectNode().put("pagata", true), 400);
            assertThat(e.get("errore").asText()).isEqualTo("Solo una fattura si segna come pagata.");
            assertThat(leggi("/api/movimenti/" + id).get("pagata").asBoolean()).isFalse();
        }
    }

    @Test
    void movimentoInesistenteDa404() throws Exception {
        errore(put("/api/movimenti/9999/pagata"), json.createObjectNode().put("pagata", true), 404);
    }

    @Test
    void pagataMancanteONonBooleanaDa400() throws Exception {
        long id = crea(fattura(1000)).get("id").asLong();
        errore(put("/api/movimenti/" + id + "/pagata"), json.createObjectNode(), 400);
        errore(put("/api/movimenti/" + id + "/pagata"), json.createObjectNode().putNull("pagata"), 400);
        errore(put("/api/movimenti/" + id + "/pagata"), "{\"pagata\":\"forse\"}", 400);
        errore(put("/api/movimenti/" + id + "/pagata"), "{\"pagata\":[true]}", 400);
        assertThat(leggi("/api/movimenti/" + id).get("pagata").asBoolean()).isFalse();
    }

    @Test
    void laModificaSenzaPagataLaLasciaCom() throws Exception {
        long id = crea(fattura(1000).put("pagata", true)).get("id").asLong();
        JsonNode m = modifica(id, "SOLO_QUESTO", fattura(2000));
        assertThat(m.get("importoCent").asLong()).isEqualTo(2000);
        assertThat(m.get("pagata").asBoolean()).isTrue();
        assertThat(modifica(id, "SOLO_QUESTO", fattura(2000).put("pagata", false)).get("pagata").asBoolean()).isFalse();
        assertThat(modifica(id, "SOLO_QUESTO", fattura(2000).put("pagata", true)).get("pagata").asBoolean()).isTrue();
    }

    @Test
    void sePerdeIlDocumentoFatturaNonEPiuPagata() throws Exception {
        long id = crea(fattura(1000).put("pagata", true)).get("id").asLong();
        JsonNode m = modifica(id, "SOLO_QUESTO", movimento("2026-10-10", "COSTO_VARIABILE", "SCONTRINO", 1000).put("pagata", true));
        assertThat(m.get("pagata").asBoolean()).isFalse();
    }

    @Test
    void dividiPassaPagataATutteLeParti() throws Exception {
        creaSede("Seconda");
        JsonNode parti = invia(post("/api/movimenti/dividi"), fattura(1001).put("pagata", true), 201);
        assertThat(parti).hasSize(2);
        parti.forEach(p -> assertThat(p.get("pagata").asBoolean()).isTrue());
    }

    @Test
    void ilFiltroPagataTieneSoloLeFatture() throws Exception {
        long pagata = crea(fattura(1000).put("pagata", true)).get("id").asLong();
        long daPagare = crea(fattura(2000)).get("id").asLong();
        crea(movimento("2026-10-10", "COSTO_VARIABILE", "SCONTRINO", 300));
        crea(movimento("2026-10-10", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 400));
        crea(movimento("2026-10-10", "RICAVO", "RICAVO_EXTRA", 500));

        JsonNode si = leggi("/api/movimenti?pagata=true");
        assertThat(si.get("elementi")).singleElement().satisfies(m -> assertThat(m.get("id").asLong()).isEqualTo(pagata));
        assertThat(si.get("totali").get("costiCent").asLong()).isEqualTo(1000);
        assertThat(si.get("totali").get("ricaviCent").asLong()).isZero();

        JsonNode no = leggi("/api/movimenti?pagata=false");
        assertThat(no.get("elementi")).singleElement().satisfies(m -> assertThat(m.get("id").asLong()).isEqualTo(daPagare));

        assertThat(leggi("/api/movimenti").get("elementi")).hasSize(5);
    }

    @Test
    void ilFiltroPagataSiCombinaConGliAltri() throws Exception {
        crea(fattura(1000).put("pagata", true));
        crea(movimento("2026-10-11", "COSTO_VARIABILE", "FATTURA", 2000).put("fornitore", "Altro").put("pagata", true));
        crea(movimento("2026-11-11", "COSTO_VARIABILE", "FATTURA", 3000).put("fornitore", "Bel Fungo").put("pagata", true));
        long fornitore = jdbc.queryForObject("SELECT id FROM fornitore WHERE nome = 'Bel Fungo'", Long.class);
        JsonNode r = leggi("/api/movimenti?pagata=true&fornitore=" + fornitore + "&da=2026-10-01&a=2026-10-31");
        assertThat(r.get("elementi")).singleElement().satisfies(m -> assertThat(m.get("importoCent").asLong()).isEqualTo(1000));
    }

    @Test
    void pagataNonValidaNelFiltroDa400() throws Exception {
        errore(get("/api/movimenti?pagata=forse"), null, 400);
    }
}
