package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** Categorie predefinite e personalizzate, e la rinomina di queste ultime. */
class CategorieApiTest extends ProvaBase {

    private JsonNode creaCategoria(String nome, String tipo, int stato) throws Exception {
        return invia(post("/api/categorie"), json.createObjectNode().put("nome", nome).put("tipo", tipo), stato);
    }

    private JsonNode rinomina(long id, String nome, int stato) throws Exception {
        return invia(put("/api/categorie/" + id), json.createObjectNode().put("nome", nome), stato);
    }

    @Test
    void leCategorieCreateOraSonoPersonalizzateLePreesistentiPredefinite() throws Exception {
        // una categoria «di prima» (predefinita): la scrive la migrazione, qui la simuliamo a mano
        jdbc.update("INSERT INTO categoria (nome, nome_chiave, tipo, personalizzata) VALUES ('Farine', 'farine', 'COSTO_VARIABILE', 0)");
        // trovata per nome, resta predefinita
        assertThat(creaCategoria("farine", "COSTO_VARIABILE", 200).get("personalizzata").asBoolean()).isFalse();
        // quelle nuove, qualunque nome e tipo (anche «Affitto»), sono personalizzate
        assertThat(creaCategoria("Affitto", "COSTO_FISSO", 201).get("personalizzata").asBoolean()).isTrue();
        assertThat(creaCategoria("Delivery", "RICAVO", 201).get("personalizzata").asBoolean()).isTrue();
        assertThat(creaCategoria("Imballaggi", "COSTO_VARIABILE", 201).get("personalizzata").asBoolean()).isTrue();

        // creata al volo dal movimento: stessa regola, e l'elenco la espone
        var m = movimento("2026-03-01", "RICAVO", "RICAVO_EXTRA", 1000);
        m.put("categoria", "Catering");
        crea(m);
        assertThat(leggi("/api/categorie?tipo=RICAVO")).extracting(c -> c.get("nome").asText() + ":" + c.get("personalizzata").asBoolean())
                .containsExactly("Catering:true", "Delivery:true");
        assertThat(leggi("/api/categorie?tipo=COSTO_VARIABILE")).extracting(c -> c.get("nome").asText() + ":" + c.get("personalizzata").asBoolean())
                .containsExactly("Farine:false", "Imballaggi:true");
    }

    @Test
    void siRinominaUnaCategoriaPersonalizzata() throws Exception {
        long id = creaCategoria("Delivry", "RICAVO", 201).get("id").asLong();
        var m = movimento("2026-03-01", "RICAVO", "RICAVO_EXTRA", 1000);
        m.put("categoria", "Delivry");
        crea(m);

        JsonNode r = rinomina(id, "  Delivery  ", 200);
        assertThat(r.get("id").asLong()).isEqualTo(id);
        assertThat(r.get("nome").asText()).isEqualTo("Delivery");
        assertThat(r.get("tipo").asText()).isEqualTo("RICAVO");
        assertThat(r.get("personalizzata").asBoolean()).isTrue();
        // il movimento segue il nuovo nome, e la ricerca per nome (senza maiuscole) trova la stessa categoria
        assertThat(leggi("/api/movimenti").get("elementi").get(0).get("categoria").get("nome").asText()).isEqualTo("Delivery");
        assertThat(creaCategoria("DELIVERY", "RICAVO", 200).get("id").asLong()).isEqualTo(id);
        // cambiare solo le maiuscole del proprio nome e' permesso
        assertThat(rinomina(id, "DELIVERY", 200).get("nome").asText()).isEqualTo("DELIVERY");
        // e lo stesso nome di un altro tipo non da' conflitto
        creaCategoria("Asporto", "COSTO_VARIABILE", 201);
        assertThat(rinomina(id, "Asporto", 200).get("nome").asText()).isEqualTo("Asporto");
    }

    @Test
    void unaCategoriaPredefinitaNonSiRinomina() throws Exception {
        jdbc.update("INSERT INTO categoria (nome, nome_chiave, tipo, personalizzata) VALUES ('Affitto', 'affitto', 'COSTO_FISSO', 0)");
        long id = leggi("/api/categorie").get(0).get("id").asLong();
        JsonNode e = errore(put("/api/categorie/" + id), json.createObjectNode().put("nome", "Canone"), 409);
        assertThat(e.get("errore").asText()).isEqualTo("Questa categoria è predefinita e non si rinomina.");
        assertThat(leggi("/api/categorie").get(0).get("nome").asText()).isEqualTo("Affitto");
    }

    @Test
    void ilNomeDoppioPerLoStessoTipoDa409IlNomeVuotoDa400() throws Exception {
        creaCategoria("Delivery", "RICAVO", 201);
        long id = creaCategoria("Catering", "RICAVO", 201).get("id").asLong();
        errore(put("/api/categorie/" + id), json.createObjectNode().put("nome", "delivery"), 409);
        errore(put("/api/categorie/" + id), json.createObjectNode().put("nome", "   "), 400);
        errore(put("/api/categorie/" + id), json.createObjectNode(), 400);
        errore(put("/api/categorie/" + id), json.createObjectNode().put("nome", "x".repeat(121)), 400);
        errore(put("/api/categorie/99999"), json.createObjectNode().put("nome", "Altro"), 404);
        assertThat(leggi("/api/categorie?tipo=RICAVO")).extracting(c -> c.get("nome").asText()).containsExactly("Catering", "Delivery");
    }

    @Test
    void nonEsisteIlDelete() throws Exception {
        long id = creaCategoria("Delivery", "RICAVO", 201).get("id").asLong();
        int stato = mockMvc.perform(delete("/api/categorie/" + id)).andReturn().getResponse().getStatus();
        assertThat(stato).isGreaterThanOrEqualTo(400);
        assertThat(leggi("/api/categorie")).hasSize(1);
    }
}
