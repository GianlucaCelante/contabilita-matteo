package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** Rinomina, eliminazione e unione di categorie, fornitori e dipendenti, e il conteggio `usi`. */
class GestioneAnagraficheApiTest extends ProvaBase {

    private static final String[] TUTTE = {"categorie", "fornitori", "dipendenti"};

    private static String campo(String quale) {
        return switch (quale) {
            case "categorie" -> "categoria";
            case "fornitori" -> "fornitore";
            default -> "dipendente";
        };
    }

    private long nuova(String quale, String nome) throws Exception {
        return nuova(quale, nome, "COSTO_VARIABILE");
    }

    private long nuova(String quale, String nome, String tipo) throws Exception {
        var corpo = json.createObjectNode().put("nome", nome);
        if (quale.equals("categorie")) {
            corpo.put("tipo", tipo);
        }
        return invia(post("/api/" + quale), corpo, 201).get("id").asLong();
    }

    /** Un movimento (scontrino) che usa la voce, creata al volo se non c'e'. */
    private long mov(String quale, String nome, long importo) throws Exception {
        var m = movimento("2026-03-01", "COSTO_VARIABILE", "SCONTRINO", importo);
        m.put(campo(quale), nome);
        return crea(m).get("id").asLong();
    }

    private JsonNode voce(String quale, long id) throws Exception {
        for (JsonNode n : leggi("/api/" + quale)) {
            if (n.get("id").asLong() == id) {
                return n;
            }
        }
        return null;
    }

    private JsonNode movimentoPer(long id) throws Exception {
        return leggi("/api/movimenti/" + id);
    }

    // ---- usi ----

    @Test
    void ilGetElencaGliUsiOgniMovimentoConta() throws Exception {
        for (String q : TUTTE) {
            long a = nuova(q, "Alfa");
            long b = nuova(q, "Beta");
            mov(q, "Alfa", 100);
            mov(q, "alfa", 200);
            assertThat(voce(q, a).get("usi").asInt()).as(q).isEqualTo(2);
            assertThat(voce(q, b).get("usi").asInt()).as(q).isZero();
        }
    }

    @Test
    void lePostRispondonoConUsi() throws Exception {
        for (String q : TUTTE) {
            assertThat(nuovaConUsi(q)).as(q).isZero();
        }
    }

    private int nuovaConUsi(String quale) throws Exception {
        var corpo = json.createObjectNode().put("nome", "X");
        if (quale.equals("categorie")) {
            corpo.put("tipo", "RICAVO");
        }
        return invia(post("/api/" + quale), corpo, 201).get("usi").asInt();
    }

    // ---- PUT ----

    @Test
    void siRinominaCambiaIlNomeNeiMovimentiEErroriDelContratto() throws Exception {
        for (String q : TUTTE) {
            long id = nuova(q, "Vecchio");
            nuova(q, "Altro");
            long m = mov(q, "Vecchio", 500);
            JsonNode r = invia(put("/api/" + q + "/" + id), json.createObjectNode().put("nome", "  Nuovo  nome "), 200);
            assertThat(r.get("nome").asText()).as(q).isEqualTo("Nuovo nome");
            assertThat(r.get("usi").asInt()).isEqualTo(1);
            assertThat(movimentoPer(m).get(campo(q)).get("nome").asText()).isEqualTo("Nuovo nome");
            // solo la grafia della stessa voce
            assertThat(invia(put("/api/" + q + "/" + id), json.createObjectNode().put("nome", "NUOVO NOME"), 200).get("nome").asText())
                    .isEqualTo("NUOVO NOME");
            // duplicato
            JsonNode e = errore(put("/api/" + q + "/" + id), json.createObjectNode().put("nome", "altro"), 409);
            assertThat(e.get("errore").asText()).startsWith("Esiste già");
            errore(put("/api/" + q + "/" + id), json.createObjectNode().put("nome", "   "), 400);
            errore(put("/api/" + q + "/" + id), json.createObjectNode().put("nome", "x".repeat(121)), 400);
            errore(put("/api/" + q + "/99999"), json.createObjectNode().put("nome", "Z"), 404);
            assertThat(voce(q, id).get("nome").asText()).isEqualTo("NUOVO NOME");
        }
    }

    @Test
    void ilFornitoreSiRinominaEPuoCambiarePartitaIva() throws Exception {
        long id = invia(post("/api/fornitori"), json.createObjectNode().put("nome", "Rossi"), 201).get("id").asLong();
        JsonNode r = invia(put("/api/fornitori/" + id), json.createObjectNode().put("nome", "Rossi srl").put("partitaIva", "12345678901"), 200);
        assertThat(r.get("partitaIva").asText()).isEqualTo("12345678901");
        // senza partitaIva nel corpo resta com'e'
        r = invia(put("/api/fornitori/" + id), json.createObjectNode().put("nome", "Rossi spa"), 200);
        assertThat(r.get("partitaIva").asText()).isEqualTo("12345678901");
    }

    @Test
    void ilNomeDiUnaCategoriaPuoEssereQuelloDiUnAltroTipo() throws Exception {
        long id = invia(post("/api/categorie"), json.createObjectNode().put("nome", "Uno").put("tipo", "RICAVO"), 201).get("id").asLong();
        invia(post("/api/categorie"), json.createObjectNode().put("nome", "Due").put("tipo", "COSTO_VARIABILE"), 201);
        assertThat(invia(put("/api/categorie/" + id), json.createObjectNode().put("nome", "Due"), 200).get("nome").asText()).isEqualTo("Due");
    }

    // ---- DELETE ----

    @Test
    void senzaParametriLaVoceSparisceEIMovimentiRestanoSenza() throws Exception {
        for (String q : TUTTE) {
            long id = nuova(q, "Da togliere");
            long m = mov(q, "Da togliere", 700);
            invia(delete("/api/" + q + "/" + id), null, 204);
            assertThat(voce(q, id)).as(q).isNull();
            JsonNode dopo = movimentoPer(m);
            assertThat(dopo.get(campo(q)).isNull()).as(q).isTrue();
            assertThat(dopo.get("importoCent").asLong()).isEqualTo(700);
        }
    }

    @Test
    void leRipetizioniSeguonoLUnioneERestanoSenzaVoceConLEliminazione() throws Exception {
        for (String q : TUTTE) {
            long vecchia = nuova(q, "Vecchia", "COSTO_FISSO");
            long giusta = nuova(q, "Giusta", "COSTO_FISSO");
            var m = movimento("2026-03-05", "COSTO_FISSO", "NESSUNO", 900);
            m.put(campo(q), "Vecchia");
            m.set("ricorrenza", json.createObjectNode().put("giorno", 5));
            long idMov = crea(m).get("id").asLong();
            Long ric = jdbc.queryForObject("SELECT id FROM ricorrenza LIMIT 1", Long.class);
            invia(delete("/api/" + q + "/" + vecchia + "?sostituisciCon=" + giusta), null, 204);
            assertThat(jdbc.queryForObject("SELECT " + campo(q) + "_id FROM ricorrenza WHERE id = " + ric, Long.class)).as(q).isEqualTo(giusta);
            assertThat(movimentoPer(idMov).get(campo(q)).get("id").asLong()).isEqualTo(giusta);
            // e senza unione: la ripetizione resta senza voce
            invia(delete("/api/" + q + "/" + giusta), null, 204);
            assertThat(jdbc.queryForObject("SELECT " + campo(q) + "_id FROM ricorrenza WHERE id = " + ric, Long.class)).isNull();
            jdbc.update("DELETE FROM movimento");
            jdbc.update("DELETE FROM ricorrenza");
        }
    }

    @Test
    void sostituisciConUnisceELaVoceRestanteContaTutto() throws Exception {
        for (String q : TUTTE) {
            long a = nuova(q, "Pizzeria Rosi");
            long b = nuova(q, "Pizzeria Rossi");
            long m1 = mov(q, "Pizzeria Rosi", 100);
            long m2 = mov(q, "Pizzeria Rosi", 200);
            mov(q, "Pizzeria Rossi", 300);
            invia(delete("/api/" + q + "/" + a + "?sostituisciCon=" + b), null, 204);
            assertThat(voce(q, a)).isNull();
            assertThat(voce(q, b).get("usi").asInt()).as(q).isEqualTo(3);
            assertThat(movimentoPer(m1).get(campo(q)).get("id").asLong()).isEqualTo(b);
            assertThat(movimentoPer(m2).get(campo(q)).get("id").asLong()).isEqualTo(b);
        }
    }

    @Test
    void erroriDelDelete() throws Exception {
        for (String q : TUTTE) {
            long a = nuova(q, "A");
            long b = nuova(q, "B");
            mov(q, "A", 100);
            errore(delete("/api/" + q + "/99999"), null, 404);
            errore(delete("/api/" + q + "/99999?sostituisciCon=" + b), null, 404);
            errore(delete("/api/" + q + "/" + a + "?sostituisciCon=99999"), null, 404);
            errore(delete("/api/" + q + "/" + a + "?sostituisciCon=" + a), null, 400);
            // nulla e' cambiato (tutto o niente)
            assertThat(voce(q, a).get("usi").asInt()).as(q).isEqualTo(1);
            assertThat(voce(q, b).get("usi").asInt()).isZero();
        }
    }

    @Test
    void perLeCategorieLUnioneVuoleLoStessoTipo() throws Exception {
        long costo = nuova("categorie", "Costo");
        long ricavo = invia(post("/api/categorie"), json.createObjectNode().put("nome", "Ricavo").put("tipo", "RICAVO"), 201).get("id").asLong();
        long m = mov("categorie", "Costo", 100);
        errore(delete("/api/categorie/" + costo + "?sostituisciCon=" + ricavo), null, 400);
        assertThat(movimentoPer(m).get("categoria").get("id").asLong()).isEqualTo(costo);
        assertThat(voce("categorie", costo)).isNotNull();
    }

    @Test
    void eliminareUnaCategoriaNonCambiaITotaliDelRiepilogo() throws Exception {
        long id = nuova("categorie", "Bibite");
        mov("categorie", "Bibite", 1200);
        invia(delete("/api/categorie/" + id), null, 204);
        JsonNode r = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31");
        assertThat(r.get("costiVariabili").get("totaleCent").asLong()).isEqualTo(1200);
        JsonNode voci = r.get("costiVariabili").get("voci");
        assertThat(voci).hasSize(1);
        assertThat(voci.get(0).get("id").isNull()).isTrue();
        assertThat(voci.get(0).get("categoria").asText()).isEqualTo("Senza categoria");
    }
}
