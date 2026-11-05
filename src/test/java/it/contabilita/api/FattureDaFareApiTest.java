package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** «Fatture da fare» (docs/api.md): caselle, stati mensili, griglia e promemoria. Data fissa: 2026-11-05. */
class FattureDaFareApiTest extends ProvaBase {

    @BeforeEach
    void data() {
        orologio.imposta("2026-11-05");
    }

    private JsonNode casella(String nome, Integer giorno, String dalMese) throws Exception {
        var n = json.createObjectNode().put("nome", nome);
        if (giorno != null) n.put("giornoScadenza", giorno);
        if (dalMese != null) n.put("dalMese", dalMese);
        return invia(post("/api/fatture/caselle"), n, 201);
    }

    private JsonNode stato(long id, String mese, String stato) throws Exception {
        return invia(put("/api/fatture/caselle/" + id + "/mesi/" + mese), "{\"stato\":\"" + stato + "\"}", 200);
    }

    private int righeStati() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM fattura_mese", Integer.class);
    }

    // ---- caselle ----

    @Test
    void creaCasellaConPredefiniti() throws Exception {
        JsonNode c = casella("Euro Service", null, null);
        assertThat(c.get("id").asLong()).isPositive();
        assertThat(c.get("nome").asText()).isEqualTo("Euro Service");
        assertThat(c.get("dalMese").asText()).isEqualTo("2026-11");
        assertThat(c.get("giornoScadenza").isNull()).isTrue();
    }

    @Test
    void creaCasellaConDalMeseEScadenza() throws Exception {
        JsonNode c = casella("Rossi", 28, "2026-10");
        assertThat(c.get("dalMese").asText()).isEqualTo("2026-10");
        assertThat(c.get("giornoScadenza").asInt()).isEqualTo(28);
    }

    @Test
    void casellaGiaEsistenteSenzaMaiuscoleTornaQuellaConStato200() throws Exception {
        JsonNode a = casella("Rossi", 10, null);
        JsonNode b = invia(post("/api/fatture/caselle"), "{\"nome\":\"  ROSSI \",\"giornoScadenza\":20}", 200);
        assertThat(b.get("id").asLong()).isEqualTo(a.get("id").asLong());
        assertThat(b.get("giornoScadenza").asInt()).isEqualTo(10);
        assertThat(leggi("/api/fatture/caselle")).hasSize(1);
    }

    @Test
    void creazioneNonValida400() throws Exception {
        errore(post("/api/fatture/caselle"), "{\"nome\":\"\"}", 400);
        errore(post("/api/fatture/caselle"), "{\"nome\":\"   \"}", 400);
        errore(post("/api/fatture/caselle"), "{}", 400);
        errore(post("/api/fatture/caselle"), "{\"nome\":\"" + "x".repeat(121) + "\"}", 400);
        errore(post("/api/fatture/caselle"), "{\"nome\":\"A\",\"giornoScadenza\":0}", 400);
        errore(post("/api/fatture/caselle"), "{\"nome\":\"A\",\"giornoScadenza\":32}", 400);
        errore(post("/api/fatture/caselle"), "{\"nome\":\"A\",\"dalMese\":\"2026-13\"}", 400);
        errore(post("/api/fatture/caselle"), "{\"nome\":\"A\",\"dalMese\":\"2026-1\"}", 400);
        errore(post("/api/fatture/caselle"), "{\"nome\":\"A\",\"dalMese\":\"2026-10-01\"}", 400);
        assertThat(leggi("/api/fatture/caselle")).isEmpty();
    }

    @Test
    void nomeDi120CaratteriVaBene() throws Exception {
        casella("x".repeat(120), null, null);
    }

    @Test
    void elencoNellOrdineDiCreazione() throws Exception {
        casella("Zeta", null, null);
        casella("Alfa", 5, "2026-09");
        JsonNode e = leggi("/api/fatture/caselle");
        assertThat(e).hasSize(2);
        assertThat(e.get(0).get("nome").asText()).isEqualTo("Zeta");
        assertThat(e.get(1).get("nome").asText()).isEqualTo("Alfa");
        assertThat(e.get(1).get("dalMese").asText()).isEqualTo("2026-09");
        assertThat(e.get(1).get("giornoScadenza").asInt()).isEqualTo(5);
    }

    @Test
    void modificaCasella() throws Exception {
        long id = casella("Rossi", 10, null).get("id").asLong();
        JsonNode r = invia(put("/api/fatture/caselle/" + id), "{\"nome\":\"Rossi SRL\",\"dalMese\":\"2026-08\",\"giornoScadenza\":15}", 200);
        assertThat(r.get("nome").asText()).isEqualTo("Rossi SRL");
        assertThat(r.get("dalMese").asText()).isEqualTo("2026-08");
        assertThat(r.get("giornoScadenza").asInt()).isEqualTo(15);
        // un campo solo: gli altri restano
        r = invia(put("/api/fatture/caselle/" + id), "{\"nome\":\"Bianchi\"}", 200);
        assertThat(r.get("giornoScadenza").asInt()).isEqualTo(15);
        assertThat(r.get("dalMese").asText()).isEqualTo("2026-08");
    }

    @Test
    void giornoScadenzaNullTogliLaScadenza() throws Exception {
        long id = casella("Rossi", 10, null).get("id").asLong();
        JsonNode r = invia(put("/api/fatture/caselle/" + id), "{\"giornoScadenza\":null}", 200);
        assertThat(r.get("giornoScadenza").isNull()).isTrue();
        assertThat(leggi("/api/fatture/caselle").get(0).get("giornoScadenza").isNull()).isTrue();
    }

    @Test
    void rinominareConLoStessoNomeEDiverseMaiuscoleNonEConflitto() throws Exception {
        long id = casella("Rossi", null, null).get("id").asLong();
        JsonNode r = invia(put("/api/fatture/caselle/" + id), "{\"nome\":\"ROSSI\"}", 200);
        assertThat(r.get("nome").asText()).isEqualTo("ROSSI");
    }

    @Test
    void modificaNonValida() throws Exception {
        long id = casella("Rossi", 10, null).get("id").asLong();
        errore(put("/api/fatture/caselle/" + id), "{}", 400); // almeno un campo
        errore(put("/api/fatture/caselle/" + id), "{\"nome\":\"\"}", 400);
        errore(put("/api/fatture/caselle/" + id), "{\"nome\":null}", 400);
        errore(put("/api/fatture/caselle/" + id), "{\"nome\":\"" + "x".repeat(121) + "\"}", 400);
        errore(put("/api/fatture/caselle/" + id), "{\"giornoScadenza\":40}", 400);
        errore(put("/api/fatture/caselle/" + id), "{\"dalMese\":\"ieri\"}", 400);
        errore(put("/api/fatture/caselle/" + id), "{\"dalMese\":null}", 400);
    }

    @Test
    void modificaConNomeDiUnAltraCasella409() throws Exception {
        casella("Rossi", null, null);
        long id = casella("Bianchi", null, null).get("id").asLong();
        JsonNode e = errore(put("/api/fatture/caselle/" + id), "{\"nome\":\"rossi\"}", 409);
        assertThat(e.get("errore").asText()).isEqualTo("Esiste già una casella con questo nome.");
    }

    @Test
    void modificaCasellaInesistente404() throws Exception {
        errore(put("/api/fatture/caselle/999"), "{\"nome\":\"A\"}", 404);
    }

    @Test
    void eliminaCasellaConISuoiStati() throws Exception {
        long id = casella("Rossi", null, null).get("id").asLong();
        long altra = casella("Altra", null, null).get("id").asLong();
        stato(id, "2026-11", "EMESSA");
        stato(altra, "2026-11", "EMESSA");
        invia(delete("/api/fatture/caselle/" + id), null, 204);
        assertThat(righeStati()).isEqualTo(1);
        assertThat(leggi("/api/fatture/caselle")).hasSize(1);
        errore(delete("/api/fatture/caselle/" + id), null, 404);
    }

    // ---- stati mensili ----

    @Test
    void transizioniDaFareEmessaPagata() throws Exception {
        long id = casella("Rossi", 28, "2026-10").get("id").asLong();
        JsonNode r = invia(put("/api/fatture/caselle/" + id + "/mesi/2026-11"),
                "{\"stato\":\"EMESSA\",\"importoCent\":125000,\"nota\":\"N. 45\"}", 200);
        assertThat(r.get("mese").asText()).isEqualTo("2026-11");
        assertThat(r.get("stato").asText()).isEqualTo("EMESSA");
        assertThat(r.get("importoCent").asLong()).isEqualTo(125000);
        assertThat(r.get("nota").asText()).isEqualTo("N. 45");

        // il PUT sostituisce lo stato del mese: importo e nota non indicati si azzerano
        r = stato(id, "2026-11", "PAGATA");
        assertThat(r.get("stato").asText()).isEqualTo("PAGATA");
        assertThat(r.get("importoCent").isNull()).isTrue();
        JsonNode g = leggi("/api/fatture?da=2026-11&a=2026-11").get("caselle").get(0).get("mesi").get(0);
        assertThat(g.get("stato").asText()).isEqualTo("PAGATA");

        // si puo' tornare indietro
        r = stato(id, "2026-11", "EMESSA");
        assertThat(r.get("stato").asText()).isEqualTo("EMESSA");
    }

    @Test
    void daFareSenzaImportoNeNotaCancellaLoStato() throws Exception {
        long id = casella("Rossi", null, null).get("id").asLong();
        stato(id, "2026-11", "EMESSA");
        assertThat(righeStati()).isEqualTo(1);
        JsonNode r = stato(id, "2026-11", "DA_FARE");
        assertThat(r.get("stato").asText()).isEqualTo("DA_FARE");
        assertThat(r.get("importoCent").isNull()).isTrue();
        assertThat(r.get("nota").isNull()).isTrue();
        assertThat(righeStati()).isZero();
        stato(id, "2026-11", "DA_FARE"); // anche se non c'era nulla da cancellare
    }

    @Test
    void daFareConNotaOImportoRestaSalvato() throws Exception {
        long id = casella("Rossi", null, null).get("id").asLong();
        invia(put("/api/fatture/caselle/" + id + "/mesi/2026-11"), "{\"stato\":\"DA_FARE\",\"nota\":\"aspetto i dati\"}", 200);
        invia(put("/api/fatture/caselle/" + id + "/mesi/2026-12"), "{\"stato\":\"DA_FARE\",\"importoCent\":0}", 200);
        assertThat(righeStati()).isEqualTo(2);
        JsonNode m = leggi("/api/fatture?da=2026-11&a=2026-11").get("caselle").get(0).get("mesi").get(0);
        assertThat(m.get("nota").asText()).isEqualTo("aspetto i dati");
    }

    @Test
    void statoMensileNonValido400() throws Exception {
        long id = casella("Rossi", null, null).get("id").asLong();
        String u = "/api/fatture/caselle/" + id + "/mesi/";
        errore(put(u + "2026-11"), "{\"stato\":\"BOH\"}", 400);
        errore(put(u + "2026-11"), "{}", 400);
        errore(put(u + "2026-11"), "{\"stato\":null}", 400);
        errore(put(u + "2026-11"), "{\"stato\":\"EMESSA\",\"importoCent\":-1}", 400);
        errore(put(u + "2026-11"), "{\"stato\":\"EMESSA\",\"nota\":\"" + "n".repeat(201) + "\"}", 400);
        errore(put(u + "novembre"), "{\"stato\":\"EMESSA\"}", 400);
        errore(put(u + "2026-13"), "{\"stato\":\"EMESSA\"}", 400);
        assertThat(righeStati()).isZero();
        invia(put(u + "2026-11"), "{\"stato\":\"EMESSA\",\"nota\":\"" + "n".repeat(200) + "\"}", 200);
    }

    @Test
    void statoMensileCasellaInesistente404() throws Exception {
        errore(put("/api/fatture/caselle/999/mesi/2026-11"), "{\"stato\":\"EMESSA\"}", 404);
    }

    // ---- griglia ----

    @Test
    void grigliaConScadenzeStatiEDaFare() throws Exception {
        long id = casella("Fatture Euro Service", 28, "2026-10").get("id").asLong();
        invia(put("/api/fatture/caselle/" + id + "/mesi/2026-10"),
                "{\"stato\":\"PAGATA\",\"importoCent\":125000,\"nota\":\"N. 45\"}", 200);
        JsonNode g = leggi("/api/fatture?da=2026-10&a=2026-11");
        assertThat(g.get("mesi")).extracting(JsonNode::asText).containsExactly("2026-10", "2026-11");
        assertThat(g.get("daFare").asInt()).isEqualTo(1);
        JsonNode c = g.get("caselle").get(0);
        assertThat(c.get("nome").asText()).isEqualTo("Fatture Euro Service");
        assertThat(c.get("dalMese").asText()).isEqualTo("2026-10");
        assertThat(c.get("giornoScadenza").asInt()).isEqualTo(28);
        JsonNode m0 = c.get("mesi").get(0);
        assertThat(m0.get("mese").asText()).isEqualTo("2026-10");
        assertThat(m0.get("attiva").asBoolean()).isTrue();
        assertThat(m0.get("stato").asText()).isEqualTo("PAGATA");
        assertThat(m0.get("importoCent").asLong()).isEqualTo(125000);
        assertThat(m0.get("nota").asText()).isEqualTo("N. 45");
        assertThat(m0.get("scadenza").asText()).isEqualTo("2026-10-28");
        JsonNode m1 = c.get("mesi").get(1);
        assertThat(m1.get("stato").asText()).isEqualTo("DA_FARE");
        assertThat(m1.get("importoCent").isNull()).isTrue();
        assertThat(m1.get("nota").isNull()).isTrue();
        assertThat(m1.get("scadenza").asText()).isEqualTo("2026-11-28");
    }

    @Test
    void nessunArretratoPrimaDiDalMese() throws Exception {
        casella("Rossi", 10, "2026-11");
        JsonNode g = leggi("/api/fatture?da=2026-09&a=2026-12");
        JsonNode mesi = g.get("caselle").get(0).get("mesi");
        assertThat(mesi).hasSize(4);
        assertThat(mesi.get(0).get("attiva").asBoolean()).isFalse();
        assertThat(mesi.get(1).get("attiva").asBoolean()).isFalse();
        assertThat(mesi.get(0).get("stato").asText()).isEqualTo("DA_FARE");
        assertThat(mesi.get(2).get("attiva").asBoolean()).isTrue();
        assertThat(mesi.get(3).get("attiva").asBoolean()).isTrue();
        assertThat(g.get("daFare").asInt()).isEqualTo(2); // novembre e dicembre; settembre e ottobre non contano
    }

    @Test
    void unMeseConStatoSalvatoPrimaDiDalMeseEAttivo() throws Exception {
        long id = casella("Rossi", null, "2026-11").get("id").asLong();
        stato(id, "2026-09", "EMESSA");
        JsonNode g = leggi("/api/fatture?da=2026-09&a=2026-10");
        assertThat(g.get("caselle").get(0).get("mesi").get(0).get("attiva").asBoolean()).isTrue();
        assertThat(g.get("caselle").get(0).get("mesi").get(1).get("attiva").asBoolean()).isFalse();
        assertThat(g.get("daFare").asInt()).isZero(); // settembre e' EMESSA, ottobre non e' attivo
    }

    @Test
    void modificareDalMeseCambiaGliArretrati() throws Exception {
        long id = casella("Rossi", null, "2026-11").get("id").asLong();
        assertThat(leggi("/api/fatture?da=2026-09&a=2026-11").get("daFare").asInt()).isEqualTo(1);
        invia(put("/api/fatture/caselle/" + id), "{\"dalMese\":\"2026-09\"}", 200);
        assertThat(leggi("/api/fatture?da=2026-09&a=2026-11").get("daFare").asInt()).isEqualTo(3);
    }

    @Test
    void scadenzaNelMesePiuCortoValeUltimoGiorno() throws Exception {
        casella("Fine mese", 31, "2026-01");
        casella("Senza", null, "2026-01");
        JsonNode g = leggi("/api/fatture?da=2026-02&a=2026-04");
        JsonNode mesi = g.get("caselle").get(0).get("mesi");
        assertThat(mesi.get(0).get("scadenza").asText()).isEqualTo("2026-02-28");
        assertThat(mesi.get(1).get("scadenza").asText()).isEqualTo("2026-03-31");
        assertThat(mesi.get(2).get("scadenza").asText()).isEqualTo("2026-04-30");
        assertThat(g.get("caselle").get(1).get("mesi").get(0).get("scadenza").isNull()).isTrue();
        JsonNode bisestile = leggi("/api/fatture?da=2028-02&a=2028-02").get("caselle").get(0).get("mesi").get(0);
        assertThat(bisestile.get("scadenza").asText()).isEqualTo("2028-02-29");
    }

    @Test
    void grigliaSenzaCaselle() throws Exception {
        JsonNode g = leggi("/api/fatture?da=2026-11&a=2026-11");
        assertThat(g.get("mesi")).hasSize(1);
        assertThat(g.get("caselle")).isEmpty();
        assertThat(g.get("daFare").asInt()).isZero();
    }

    @Test
    void intervalloDi24MesiVaBene25No() throws Exception {
        casella("Rossi", null, null);
        assertThat(leggi("/api/fatture?da=2025-01&a=2026-12").get("mesi")).hasSize(24);
        errore(get("/api/fatture?da=2025-01&a=2027-01"), null, 400);
    }

    @Test
    void intervalloNonValido400() throws Exception {
        errore(get("/api/fatture?da=2026-11&a=2026-10"), null, 400);
        errore(get("/api/fatture?da=2026-11&a=2026-13"), null, 400);
        errore(get("/api/fatture?da=boh&a=2026-11"), null, 400);
        errore(get("/api/fatture?da=2026-11"), null, 400);
        errore(get("/api/fatture"), null, 400);
        assertThat(leggi("/api/fatture?da=2026-11&a=2026-11").get("mesi")).hasSize(1); // da = a ammesso
    }

    // ---- promemoria ----

    private long conScadenza(String nome, Integer giorno) throws Exception {
        return casella(nome, giorno, "2026-11").get("id").asLong();
    }

    private JsonNode promemoria() throws Exception {
        return leggi("/api/fatture/promemoria");
    }

    @Test
    void promemoriaVuoto() throws Exception {
        JsonNode p = promemoria();
        assertThat(p.get("daFare").asInt()).isZero();
        assertThat(p.get("inScadenza")).isEmpty();
    }

    @Test
    void promemoriaBordiDeiTreGiorni() throws Exception {
        // oggi: 5 novembre 2026
        long quattro = conScadenza("giorni-4", 9);   // 4 giorni: fuori
        long tre = conScadenza("giorni-3", 8);       // 3 giorni: dentro
        long zero = conScadenza("oggi", 5);          // 0
        long scaduta = conScadenza("ieri", 4);       // -1: scaduta, dentro
        long lontana = conScadenza("lontana", 30);
        JsonNode p = promemoria();
        assertThat(p.get("daFare").asInt()).isEqualTo(5);
        JsonNode s = p.get("inScadenza");
        assertThat(s).hasSize(3);
        assertThat(s.get(0).get("casellaId").asLong()).isEqualTo(scaduta);
        assertThat(s.get(0).get("giorniMancanti").asInt()).isEqualTo(-1);
        assertThat(s.get(1).get("casellaId").asLong()).isEqualTo(zero);
        assertThat(s.get(1).get("giorniMancanti").asInt()).isZero();
        assertThat(s.get(2).get("casellaId").asLong()).isEqualTo(tre);
        assertThat(s.get(2).get("giorniMancanti").asInt()).isEqualTo(3);
        assertThat(s.get(2).get("nome").asText()).isEqualTo("giorni-3");
        assertThat(s.get(2).get("mese").asText()).isEqualTo("2026-11");
        assertThat(s.get(2).get("scadenza").asText()).isEqualTo("2026-11-08");
        assertThat(s).extracting(n -> n.get("casellaId").asLong()).doesNotContain(lontana, quattro);
    }

    @Test
    void promemoriaOrdinatoPerGiorniMancanti() throws Exception {
        long a = conScadenza("A", 8);
        long b = conScadenza("B", 6);
        long c = conScadenza("C", 3);
        JsonNode s = promemoria().get("inScadenza");
        assertThat(s).extracting(n -> n.get("casellaId").asLong()).containsExactly(c, b, a);
    }

    @Test
    void promemoriaEscludeEmessaPagataSenzaScadenzaEFutureMaContaIlResto() throws Exception {
        long emessa = conScadenza("emessa", 6);
        long pagata = conScadenza("pagata", 6);
        conScadenza("senza scadenza", null);
        casella("futura", 6, "2026-12"); // attiva da dicembre: a novembre non conta
        long daFare = conScadenza("da fare", 7);
        stato(emessa, "2026-11", "EMESSA");
        stato(pagata, "2026-11", "PAGATA");
        JsonNode p = promemoria();
        assertThat(p.get("daFare").asInt()).isEqualTo(2); // «da fare» e «senza scadenza»
        assertThat(p.get("inScadenza")).hasSize(1);
        assertThat(p.get("inScadenza").get(0).get("casellaId").asLong()).isEqualTo(daFare);
    }

    @Test
    void promemoriaGuardaSoloIlMeseCorrente() throws Exception {
        long id = casella("Rossi", 6, "2026-08").get("id").asLong(); // agosto-ottobre ancora da fare: non contano
        JsonNode p = promemoria();
        assertThat(p.get("daFare").asInt()).isEqualTo(1);
        assertThat(p.get("inScadenza")).hasSize(1);
        assertThat(p.get("inScadenza").get(0).get("mese").asText()).isEqualTo("2026-11");
        stato(id, "2026-11", "EMESSA");
        assertThat(promemoria().get("daFare").asInt()).isZero();
    }

    @Test
    void promemoriaSegueLOrologio() throws Exception {
        conScadenza("Rossi", 8);
        orologio.imposta("2026-11-04"); // 4 giorni
        assertThat(promemoria().get("inScadenza")).isEmpty();
        orologio.imposta("2026-11-05"); // 3 giorni
        assertThat(promemoria().get("inScadenza")).hasSize(1);
        orologio.imposta("2026-12-01"); // nuovo mese: dicembre da fare, scadenza 8 dicembre = 7 giorni
        JsonNode p = promemoria();
        assertThat(p.get("daFare").asInt()).isEqualTo(1);
        assertThat(p.get("inScadenza")).isEmpty();
        orologio.imposta("2026-12-05");
        assertThat(promemoria().get("inScadenza").get(0).get("mese").asText()).isEqualTo("2026-12");
    }

    @Test
    void promemoriaConScadenzaNelMesePiuCorto() throws Exception {
        casella("Fine mese", 31, "2026-02");
        orologio.imposta("2026-02-25"); // scadenza 28 febbraio = 3 giorni
        JsonNode s = promemoria().get("inScadenza");
        assertThat(s).hasSize(1);
        assertThat(s.get(0).get("scadenza").asText()).isEqualTo("2026-02-28");
        assertThat(s.get(0).get("giorniMancanti").asInt()).isEqualTo(3);
    }
}
