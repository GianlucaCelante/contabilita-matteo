package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** Le categorie sono tutte dell'utente: creazione e rinomina. */
class CategorieApiTest extends ProvaBase {

    private JsonNode creaCategoria(String nome, String tipo, int stato) throws Exception {
        return invia(post("/api/categorie"), json.createObjectNode().put("nome", nome).put("tipo", tipo), stato);
    }

    private JsonNode rinomina(long id, String nome, int stato) throws Exception {
        return invia(put("/api/categorie/" + id), json.createObjectNode().put("nome", nome), stato);
    }

    @Test
    void nonEsistonoCategoriePredefiniteNeIlCampoPersonalizzata() throws Exception {
        assertThat(leggi("/api/categorie")).isEmpty();
        JsonNode c = creaCategoria("Affitto", "COSTO_FISSO", 201);
        assertThat(c.has("personalizzata")).isFalse();
        assertThat(c.get("usi").asInt()).isZero();
        // creata al volo dal movimento: l'elenco la espone, senza il campo
        var m = movimento("2026-03-01", "RICAVO", "RICAVO_EXTRA", 1000);
        m.put("categoria", "Catering");
        crea(m);
        JsonNode elenco = leggi("/api/categorie?tipo=RICAVO");
        assertThat(elenco).hasSize(1);
        assertThat(elenco.get(0).has("personalizzata")).isFalse();
        assertThat(elenco.get(0).get("usi").asInt()).isEqualTo(1);
    }

    @Test
    void siRinominaUnaCategoria() throws Exception {
        long id = creaCategoria("Delivry", "RICAVO", 201).get("id").asLong();
        var m = movimento("2026-03-01", "RICAVO", "RICAVO_EXTRA", 1000);
        m.put("categoria", "Delivry");
        crea(m);

        JsonNode r = rinomina(id, "  Delivery  ", 200);
        assertThat(r.get("id").asLong()).isEqualTo(id);
        assertThat(r.get("nome").asText()).isEqualTo("Delivery");
        assertThat(r.get("tipo").asText()).isEqualTo("RICAVO");
        assertThat(r.get("usi").asInt()).isEqualTo(1);
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
}
