package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** Retribuzione e categoria: il flag delle categorie e la regola che lega il documento RETRIBUZIONE_* al flag. */
class RetribuzioneApiTest extends ProvaBase {

    private JsonNode creaCategoria(String nome, String tipo, Boolean retribuzione, int stato) throws Exception {
        ObjectNode in = json.createObjectNode().put("nome", nome).put("tipo", tipo);
        if (retribuzione != null) {
            in.put("retribuzione", retribuzione);
        }
        return invia(post("/api/categorie"), in, stato);
    }

    private long categoriaRetribuzione(String nome) throws Exception {
        return creaCategoria(nome, "COSTO_FISSO", true, 201).get("id").asLong();
    }

    private ObjectNode retribuzione(String documento, String categoria) {
        ObjectNode m = movimento("2026-03-10", "COSTO_FISSO", documento, 150000);
        if (categoria != null) {
            m.put("categoria", categoria);
        }
        return m;
    }

    private JsonNode modificaCategoria(long id, ObjectNode corpo, int stato) throws Exception {
        return invia(put("/api/categorie/" + id), corpo, stato);
    }

    private void messaggio(JsonNode errore, String atteso) {
        assertThat(errore.get("errore").asText()).isEqualTo(atteso);
    }

    // ---- POST /api/categorie ----

    @Test
    void laCategoriaHaIlFlagRetribuzioneFalsoDiDefaultEVeroSeRichiestoPerUnCostoFisso() throws Exception {
        assertThat(creaCategoria("Affitto", "COSTO_FISSO", null, 201).get("retribuzione").asBoolean()).isFalse();
        JsonNode r = creaCategoria("Stipendi", "COSTO_FISSO", true, 201);
        assertThat(r.get("retribuzione").asBoolean()).isTrue();
        assertThat(r.has("personalizzata")).isFalse(); // non esiste piu'
        assertThat(leggi("/api/categorie?tipo=COSTO_FISSO")).extracting(c -> c.get("nome").asText() + ":" + c.get("retribuzione").asBoolean())
                .containsExactly("Affitto:false", "Stipendi:true");
    }

    @Test
    void ilFlagSoloConCostoFissoAltrimentiBadRequest() throws Exception {
        errore(post("/api/categorie"), json.createObjectNode().put("nome", "X").put("tipo", "RICAVO").put("retribuzione", true), 400);
        errore(post("/api/categorie"), json.createObjectNode().put("nome", "X").put("tipo", "COSTO_VARIABILE").put("retribuzione", true), 400);
        assertThat(creaCategoria("Y", "RICAVO", false, 201).get("retribuzione").asBoolean()).isFalse();
        assertThat(leggi("/api/categorie").size()).isEqualTo(1);
    }

    @Test
    void seLaCategoriaEsisteGiaIlFlagNonCambia() throws Exception {
        creaCategoria("Affitto", "COSTO_FISSO", false, 201);
        assertThat(creaCategoria("affitto", "COSTO_FISSO", true, 200).get("retribuzione").asBoolean()).isFalse();
        creaCategoria("Stipendi", "COSTO_FISSO", true, 201);
        assertThat(creaCategoria("STIPENDI", "COSTO_FISSO", false, 200).get("retribuzione").asBoolean()).isTrue();
        assertThat(creaCategoria("stipendi", "COSTO_FISSO", null, 200).get("retribuzione").asBoolean()).isTrue();
    }

    // ---- PUT /api/categorie/{id} ----

    @Test
    void siCambiaIlSoloFlagSenzaNome() throws Exception {
        long id = creaCategoria("Stipendi", "COSTO_FISSO", null, 201).get("id").asLong();
        JsonNode r = modificaCategoria(id, json.createObjectNode().put("retribuzione", true), 200);
        assertThat(r.get("nome").asText()).isEqualTo("Stipendi");
        assertThat(r.get("retribuzione").asBoolean()).isTrue();
        r = modificaCategoria(id, json.createObjectNode().put("retribuzione", false), 200);
        assertThat(r.get("retribuzione").asBoolean()).isFalse();
        // nome e flag insieme
        r = modificaCategoria(id, json.createObjectNode().put("nome", "Paghe").put("retribuzione", true), 200);
        assertThat(r.get("nome").asText()).isEqualTo("Paghe");
        assertThat(r.get("retribuzione").asBoolean()).isTrue();
        // il solo nome non tocca il flag
        r = modificaCategoria(id, json.createObjectNode().put("nome", "Stipendi"), 200);
        assertThat(r.get("retribuzione").asBoolean()).isTrue();
    }

    @Test
    void ilFlagEIlNomeSiCambianoInsiemeSuQualunqueCategoria() throws Exception {
        long id = creaCategoria("Affitto", "COSTO_FISSO", null, 201).get("id").asLong();
        JsonNode r = modificaCategoria(id, json.createObjectNode().put("nome", "Canone").put("retribuzione", true), 200);
        assertThat(r.get("nome").asText()).isEqualTo("Canone");
        assertThat(r.get("retribuzione").asBoolean()).isTrue();
        assertThat(r.has("personalizzata")).isFalse();
        JsonNode dopo = leggi("/api/categorie").get(0);
        assertThat(dopo.get("nome").asText()).isEqualTo("Canone");
        assertThat(dopo.get("retribuzione").asBoolean()).isTrue();
    }

    @Test
    void ilPutSenzaNeNomeNeFlagEBadRequest() throws Exception {
        long id = creaCategoria("Stipendi", "COSTO_FISSO", null, 201).get("id").asLong();
        errore(put("/api/categorie/" + id), json.createObjectNode(), 400);
        errore(put("/api/categorie/" + id), json.createObjectNode().put("nome", "   "), 400);
        errore(put("/api/categorie/99999"), json.createObjectNode().put("retribuzione", true), 404);
    }

    @Test
    void ilFlagVeroSoloSuUnCostoFisso() throws Exception {
        long ricavo = creaCategoria("Delivery", "RICAVO", null, 201).get("id").asLong();
        long variabile = creaCategoria("Farine", "COSTO_VARIABILE", null, 201).get("id").asLong();
        errore(put("/api/categorie/" + ricavo), json.createObjectNode().put("retribuzione", true), 400);
        errore(put("/api/categorie/" + variabile), json.createObjectNode().put("nome", "Farine 2").put("retribuzione", true), 400);
        // falso e' sempre ammesso, e il tentativo fallito non ha rinominato niente
        assertThat(modificaCategoria(variabile, json.createObjectNode().put("retribuzione", false), 200).get("nome").asText()).isEqualTo("Farine");
    }

    @Test
    void ilFlagFalsoNonSiTogliSeCiSonoRetribuzioni() throws Exception {
        long id = categoriaRetribuzione("Stipendi");
        crea(retribuzione("RETRIBUZIONE_REGOLARE", "Stipendi"));
        messaggio(errore(put("/api/categorie/" + id), json.createObjectNode().put("retribuzione", false), 409),
                "Questa categoria ha già delle retribuzioni.");
        assertThat(leggi("/api/categorie").get(0).get("retribuzione").asBoolean()).isTrue();
    }

    @Test
    void ilFlagFalsoSiTogliSeNonCiSonoRetribuzioniAncheConAltriMovimenti() throws Exception {
        long id = categoriaRetribuzione("Stipendi");
        // un movimento NESSUNO con questa categoria non puo' nascere (regola), ma uno storico si': lo scriviamo a mano
        jdbc.update("INSERT INTO movimento (data, tipo, documento, importo_cent, categoria_id, origine, creato_il, modificato_il, sede_id) "
                + "VALUES ('2026-03-01', 'COSTO_FISSO', 'NESSUNO', 1000, ?, 'MANO', '2026-03-01T10:00:00', '2026-03-01T10:00:00', 1)", id);
        assertThat(modificaCategoria(id, json.createObjectNode().put("retribuzione", false), 200).get("retribuzione").asBoolean()).isFalse();
    }

    // ---- validazione dei movimenti ----

    @Test
    void laRetribuzioneSenzaCategoriaEBadRequest() throws Exception {
        for (String documento : new String[]{"RETRIBUZIONE_REGOLARE", "RETRIBUZIONE_EXTRA"}) {
            messaggio(errore(post("/api/movimenti"), retribuzione(documento, null), 400),
                    "Una retribuzione ha bisogno di una categoria di tipo retribuzione.");
            messaggio(errore(post("/api/movimenti"), retribuzione(documento, "   "), 400),
                    "Una retribuzione ha bisogno di una categoria di tipo retribuzione.");
        }
        assertThat(leggi("/api/movimenti").get("elementi")).isEmpty();
    }

    @Test
    void laRetribuzioneConUnaCategoriaSenzaFlagEBadRequestAncheSeCreataAlVolo() throws Exception {
        creaCategoria("Affitto", "COSTO_FISSO", null, 201);
        messaggio(errore(post("/api/movimenti"), retribuzione("RETRIBUZIONE_REGOLARE", "affitto"), 400),
                "La categoria «Affitto» non è una retribuzione.");
        // nuova, dal solo nome: nasce con il flag falso, quindi errore e niente categoria creata
        messaggio(errore(post("/api/movimenti"), retribuzione("RETRIBUZIONE_EXTRA", "Paghe"), 400),
                "La categoria «Paghe» non è una retribuzione.");
        assertThat(leggi("/api/categorie")).extracting(c -> c.get("nome").asText()).containsExactly("Affitto");
    }

    @Test
    void laRetribuzioneConLaCategoriaConFlagVaBeneAncheSeIlNomeCambiaLeMaiuscole() throws Exception {
        long id = categoriaRetribuzione("Stipendi");
        JsonNode r = crea(retribuzione("RETRIBUZIONE_REGOLARE", "STIPENDI"));
        assertThat(r.get("categoria").get("id").asLong()).isEqualTo(id);
        // il nome non conta: se si rinomina la categoria, vale il flag
        modificaCategoria(id, json.createObjectNode().put("nome", "Paghe"), 200);
        assertThat(crea(retribuzione("RETRIBUZIONE_EXTRA", "paghe")).get("categoria").get("nome").asText()).isEqualTo("Paghe");
    }

    @Test
    void ilDocumentoNessunoConUnaCategoriaConFlagEBadRequest() throws Exception {
        categoriaRetribuzione("Stipendi");
        messaggio(errore(post("/api/movimenti"), retribuzione("NESSUNO", "Stipendi"), 400),
                "La categoria «Stipendi» è una retribuzione: scegli Regolare o Extra.");
        // senza categoria o con un'altra categoria il NESSUNO resta valido
        crea(retribuzione("NESSUNO", null));
        creaCategoria("Affitto", "COSTO_FISSO", null, 201);
        crea(retribuzione("NESSUNO", "Affitto"));
    }

    @Test
    void laModificaRispettaLaStessaRegola() throws Exception {
        categoriaRetribuzione("Stipendi");
        creaCategoria("Affitto", "COSTO_FISSO", null, 201);
        long id = crea(retribuzione("RETRIBUZIONE_REGOLARE", "Stipendi")).get("id").asLong();
        long altro = crea(retribuzione("NESSUNO", "Affitto")).get("id").asLong();

        messaggio(errore(put("/api/movimenti/" + id + "?ambito=SOLO_QUESTO"), retribuzione("RETRIBUZIONE_REGOLARE", null), 400),
                "Una retribuzione ha bisogno di una categoria di tipo retribuzione.");
        messaggio(errore(put("/api/movimenti/" + id + "?ambito=SOLO_QUESTO"), retribuzione("RETRIBUZIONE_REGOLARE", "Affitto"), 400),
                "La categoria «Affitto» non è una retribuzione.");
        messaggio(errore(put("/api/movimenti/" + id + "?ambito=SOLO_QUESTO"), retribuzione("NESSUNO", "Stipendi"), 400),
                "La categoria «Stipendi» è una retribuzione: scegli Regolare o Extra.");
        messaggio(errore(put("/api/movimenti/" + altro + "?ambito=SOLO_QUESTO"), retribuzione("RETRIBUZIONE_EXTRA", "Affitto"), 400),
                "La categoria «Affitto» non è una retribuzione.");
        // il movimento non e' cambiato
        assertThat(leggi("/api/movimenti/" + id).get("documento").asText()).isEqualTo("RETRIBUZIONE_REGOLARE");
        // modifiche valide
        assertThat(modifica(id, "SOLO_QUESTO", retribuzione("RETRIBUZIONE_EXTRA", "Stipendi")).get("documento").asText()).isEqualTo("RETRIBUZIONE_EXTRA");
        assertThat(modifica(altro, "SOLO_QUESTO", retribuzione("RETRIBUZIONE_REGOLARE", "Stipendi")).get("documento").asText()).isEqualTo("RETRIBUZIONE_REGOLARE");
    }

    @Test
    void laModificaConAmbitoQuestoEProssimiRispettaLaRegolaENonCambiaLaRipetizione() throws Exception {
        categoriaRetribuzione("Stipendi");
        creaCategoria("Affitto", "COSTO_FISSO", null, 201);
        orologio.imposta("2026-03-20");
        ObjectNode in = retribuzione("RETRIBUZIONE_REGOLARE", "Stipendi");
        in.putObject("ricorrenza").put("giorno", 10);
        long id = crea(in).get("id").asLong();

        ObjectNode sbagliata = retribuzione("RETRIBUZIONE_REGOLARE", "Affitto");
        sbagliata.putObject("ricorrenza").put("giorno", 10);
        messaggio(errore(put("/api/movimenti/" + id + "?ambito=QUESTO_E_PROSSIMI"), sbagliata, 400),
                "La categoria «Affitto» non è una retribuzione.");
        messaggio(errore(put("/api/movimenti/" + id + "?ambito=QUESTO_E_PROSSIMI"), retribuzione("NESSUNO", "Stipendi"), 400),
                "La categoria «Stipendi» è una retribuzione: scegli Regolare o Extra.");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ricorrenza r JOIN categoria c ON c.id = r.categoria_id "
                + "WHERE r.documento = 'RETRIBUZIONE_REGOLARE' AND c.retribuzione = 1", Integer.class)).isEqualTo(1);

        // valida: i mesi dopo escono con la stessa categoria e documento
        ObjectNode valida = retribuzione("RETRIBUZIONE_REGOLARE", "Stipendi");
        valida.put("importoCent", 160000);
        modifica(id, "QUESTO_E_PROSSIMI", valida);
        assertThat(jdbc.queryForObject("SELECT importo_cent FROM ricorrenza", Integer.class)).isEqualTo(160000);
    }

    @Test
    void unaRipetizioneDiRetribuzioneRichiedeLaCategoriaConFlag() throws Exception {
        ObjectNode in = retribuzione("RETRIBUZIONE_REGOLARE", "Stipendi");
        in.putObject("ricorrenza").put("giorno", 10);
        messaggio(errore(post("/api/movimenti"), in, 400), "La categoria «Stipendi» non è una retribuzione.");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ricorrenza", Integer.class)).isZero();

        categoriaRetribuzione("Stipendi");
        orologio.imposta("2026-03-20");
        ObjectNode ok = retribuzione("RETRIBUZIONE_REGOLARE", "Stipendi");
        ok.put("data", "2026-02-10").putObject("ricorrenza").put("giorno", 10);
        crea(ok);
        // le occorrenze generate hanno documento RETRIBUZIONE_REGOLARE e la categoria con flag
        assertThat(jdbc.queryForObject("SELECT count(*) FROM movimento m JOIN categoria c ON c.id = m.categoria_id "
                + "WHERE m.documento = 'RETRIBUZIONE_REGOLARE' AND c.retribuzione = 1", Integer.class)).isGreaterThanOrEqualTo(2);
    }

    @Test
    void dividereUnaRetribuzioneFraLeSediRichiedeLaCategoriaConFlag() throws Exception {
        creaSede("Mare");
        ObjectNode sbagliata = retribuzione("RETRIBUZIONE_REGOLARE", "Stipendi");
        messaggio(errore(post("/api/movimenti/dividi"), sbagliata, 400), "La categoria «Stipendi» non è una retribuzione.");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM movimento", Integer.class)).isZero();
    }

    @Test
    void iDatiGiaPresentiNonSiRivalidano() throws Exception {
        // movimento storico: retribuzione senza categoria (come prima della migrazione)
        jdbc.update("INSERT INTO movimento (data, tipo, documento, importo_cent, origine, creato_il, modificato_il, sede_id) "
                + "VALUES ('2026-03-01', 'COSTO_FISSO', 'RETRIBUZIONE_REGOLARE', 1000, 'MANO', '2026-03-01T10:00:00', '2026-03-01T10:00:00', 1)");
        // si leggono come sempre
        assertThat(leggi("/api/movimenti").get("elementi")).hasSize(1);
    }
}
