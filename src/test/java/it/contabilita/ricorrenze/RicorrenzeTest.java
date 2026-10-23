package it.contabilita.ricorrenze;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Generazione delle occorrenze: recupero dei mesi saltati, giorni oltre la fine del mese, idempotenza, ferma, ambito. */
class RicorrenzeTest extends ProvaBase {

    @Autowired
    private RicorrenzeService servizio;

    private JsonNode primaOccorrenza(String data, int giorno, long importo) throws Exception {
        ObjectNode in = movimento(data, "COSTO_FISSO", "NESSUNO", importo);
        in.put("categoria", "Affitto").put("descrizione", "Canone").putObject("ricorrenza").put("giorno", giorno);
        return crea(in);
    }

    private List<String> date() throws Exception {
        // ordine crescente
        List<String> r = new ArrayList<>();
        for (JsonNode m : leggi("/api/movimenti").get("elementi")) {
            r.add(m.get("data").asText());
        }
        java.util.Collections.sort(r);
        return r;
    }

    @Test
    void recuperaIMesiSaltatiFinoAOggiConGiorno31NeiMesiCorti() throws Exception {
        primaOccorrenza("2026-01-31", 31, 50000);
        int creati = servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 5, 15));
        assertThat(creati).isEqualTo(3);
        // febbraio 28, marzo 31, aprile 30; maggio (31) non e' ancora arrivato
        assertThat(date()).containsExactly("2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30");

        JsonNode elenco = leggi("/api/movimenti").get("elementi");
        JsonNode ultima = elenco.get(0);
        assertThat(ultima.get("origine").asText()).isEqualTo("RICORRENZA");
        assertThat(ultima.get("importoCent").asLong()).isEqualTo(50000);
        assertThat(ultima.get("categoria").get("nome").asText()).isEqualTo("Affitto");
        assertThat(ultima.get("descrizione").asText()).isEqualTo("Canone");
        assertThat(ultima.get("ricorrenza").get("giorno").asInt()).isEqualTo(31);
        assertThat(elenco.get(3).get("origine").asText()).isEqualTo("MANO");
    }

    @Test
    void ilGiorno31InFebbraioBisestileDiventa29() throws Exception {
        primaOccorrenza("2028-01-31", 31, 100);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2028, 3, 1));
        assertThat(date()).containsExactly("2028-01-31", "2028-02-29");
    }

    @Test
    void ilGiornoDiOggiConta() throws Exception {
        primaOccorrenza("2026-01-10", 10, 100);
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 9))).isZero();
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 10))).isEqualTo(1);
    }

    @Test
    void generareDueVolteNonDuplica() throws Exception {
        primaOccorrenza("2026-01-05", 5, 100);
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 4, 30))).isEqualTo(3);
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 4, 30))).isZero();
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 4, 20))).isZero();
        assertThat(date()).hasSize(4);
        // anche se l'indicatore di avanzamento va perso, il controllo (ricorrenza, data) evita i doppioni
        jdbc.update("UPDATE ricorrenza SET prossima_data = '2026-02-05'");
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 4, 30))).isZero();
        assertThat(date()).hasSize(4);
    }

    @Test
    void unaOccorrenzaEliminataANonVieneRicreata() throws Exception {
        JsonNode prima = primaOccorrenza("2026-01-05", 5, 100);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 3, 10));
        JsonNode feb = leggi("/api/movimenti?da=2026-02-01&a=2026-02-28").get("elementi").get(0);
        elimina(feb.get("id").asLong(), "SOLO_QUESTO");
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 3, 10));
        assertThat(date()).containsExactly("2026-01-05", "2026-03-05");
        assertThat(prima.get("ricorrenza").get("attiva").asBoolean()).isTrue();
    }

    @Test
    void fermaLaRicorrenzaLasciaLeOccorrenzeGiaRegistrate() throws Exception {
        JsonNode prima = primaOccorrenza("2026-01-05", 5, 100);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 10));
        long idRic = prima.get("ricorrenza").get("id").asLong();
        invia(post("/api/ricorrenze/" + idRic + "/ferma"), null, 204);
        invia(post("/api/ricorrenze/" + idRic + "/ferma"), null, 204); // idempotente
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 12, 31))).isZero();
        assertThat(date()).containsExactly("2026-01-05", "2026-02-05");
        JsonNode m = leggi("/api/movimenti").get("elementi").get(0);
        assertThat(m.get("ricorrenza").get("attiva").asBoolean()).isFalse();
        errore(post("/api/ricorrenze/99999/ferma"), null, 404);
    }

    @Test
    void modificaQuestoEProssimiCambiaImportoEGiornoDelleOccorrenzeFuture() throws Exception {
        JsonNode prima = primaOccorrenza("2026-01-05", 5, 50000);
        long id = prima.get("id").asLong();
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 10));

        ObjectNode mod = movimento("2026-01-05", "COSTO_FISSO", "NESSUNO", 60000);
        mod.put("categoria", "Affitto").put("descrizione", "Canone").putObject("ricorrenza").put("giorno", 15);
        modifica(id, "QUESTO_E_PROSSIMI", mod);

        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 4, 30));
        JsonNode marzo = leggi("/api/movimenti?da=2026-03-01&a=2026-03-31").get("elementi").get(0);
        assertThat(marzo.get("data").asText()).isEqualTo("2026-03-15");
        assertThat(marzo.get("importoCent").asLong()).isEqualTo(60000);
        // le occorrenze gia' registrate non cambiano
        JsonNode febbraio = leggi("/api/movimenti?da=2026-02-01&a=2026-02-28").get("elementi").get(0);
        assertThat(febbraio.get("importoCent").asLong()).isEqualTo(50000);
        assertThat(febbraio.get("data").asText()).isEqualTo("2026-02-05");
    }

    @Test
    void modificaSoloQuestoNonCambiaLeOccorrenzeFuture() throws Exception {
        JsonNode prima = primaOccorrenza("2026-01-05", 5, 50000);
        ObjectNode mod = movimento("2026-01-05", "COSTO_FISSO", "NESSUNO", 70000);
        mod.put("categoria", "Affitto");
        modifica(prima.get("id").asLong(), "SOLO_QUESTO", mod);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 28));
        JsonNode feb = leggi("/api/movimenti?da=2026-02-01&a=2026-02-28").get("elementi").get(0);
        assertThat(feb.get("importoCent").asLong()).isEqualTo(50000);
        assertThat(feb.get("descrizione").asText()).isEqualTo("Canone");
    }

    @Test
    void eliminaQuestoEProssimiFermaLaRicorrenza() throws Exception {
        JsonNode prima = primaOccorrenza("2026-01-05", 5, 100);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 10));
        JsonNode feb = leggi("/api/movimenti?da=2026-02-01&a=2026-02-28").get("elementi").get(0);
        elimina(feb.get("id").asLong(), "QUESTO_E_PROSSIMI");
        assertThat(date()).containsExactly("2026-01-05");
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 12, 31))).isZero();
        assertThat(jdbc.queryForObject("SELECT attiva FROM ricorrenza WHERE id=?", Integer.class,
                prima.get("ricorrenza").get("id").asLong())).isZero();
        assertThat(leggi("/api/movimenti").get("elementi").get(0).get("ricorrenza").get("attiva").asBoolean()).isFalse();
    }

    @Test
    void unaOccorrenzaPuoEssereModificataECorretta() throws Exception {
        primaOccorrenza("2026-01-05", 5, 100);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 10));
        JsonNode feb = leggi("/api/movimenti?da=2026-02-01&a=2026-02-28").get("elementi").get(0);
        ObjectNode mod = movimento("2026-02-06", "COSTO_FISSO", "NESSUNO", 120);
        mod.put("categoria", "Affitto");
        JsonNode r = modifica(feb.get("id").asLong(), "SOLO_QUESTO", mod);
        assertThat(r.get("origine").asText()).isEqualTo("RICORRENZA");
        assertThat(r.get("importoCent").asLong()).isEqualTo(120);
        // la correzione non ne fa nascere un'altra
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 28))).isZero();
    }

    @Test
    void unMovimentoSingoloNonGeneraNiente() throws Exception {
        crea(movimento("2026-01-05", "RICAVO", "RICAVO_EXTRA", 100));
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 12, 31))).isZero();
        assertThat(date()).hasSize(1);
    }

    @Test
    void piuRicorrenzeIndipendenti() throws Exception {
        primaOccorrenza("2026-01-05", 5, 100);
        ObjectNode luce = movimento("2026-02-20", "COSTO_FISSO", "NESSUNO", 300);
        luce.put("categoria", "Luce").putObject("ricorrenza").put("giorno", 20);
        crea(luce);
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 3, 31))).isEqualTo(3); // 2 affitto + 1 luce
        assertThat(date()).hasSize(5);
    }

    @Test
    void conUnaDataNelPassatoLeOccorrenzeDeiMesiSuccessiviCompaionoSubitoSenzaDuplicatiAlRiavvio() throws Exception {
        orologio.imposta("2026-05-15");
        ObjectNode in = movimento("2026-02-10", "COSTO_FISSO", "NESSUNO", 700);
        in.put("categoria", "Affitto").putObject("ricorrenza").put("giorno", 10);
        crea(in);
        // gia' presenti dopo il POST: marzo, aprile, maggio non ancora (10 < 15: si, maggio 10 e' passato)
        assertThat(date()).containsExactly("2026-02-10", "2026-03-10", "2026-04-10", "2026-05-10");
        // "riavvio": il generatore non duplica
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 5, 15))).isZero();
        assertThat(date()).hasSize(4);

        // un PUT che rende ricorrente un movimento singolo recupera anche lui i mesi dovuti
        JsonNode singolo = crea(movimento("2026-03-20", "COSTO_FISSO", "NESSUNO", 100));
        ObjectNode mod = movimento("2026-03-20", "COSTO_FISSO", "NESSUNO", 100);
        mod.putObject("ricorrenza").put("giorno", 20);
        modifica(singolo.get("id").asLong(), "SOLO_QUESTO", mod);
        assertThat(leggi("/api/movimenti?da=2026-04-20&a=2026-04-20").get("elementi")).hasSize(1);
        assertThat(leggi("/api/movimenti?da=2026-05-20&a=2026-05-20").get("elementi")).isEmpty();
    }

    // ------------------------------------------------------------ frequenza personalizzata

    private JsonNode primaCon(String data, String unita, int intervallo, Integer giorno) throws Exception {
        ObjectNode in = movimento(data, "COSTO_FISSO", "NESSUNO", 1000);
        in.put("categoria", "Pulizie");
        ObjectNode ric = in.putObject("ricorrenza");
        ric.put("unita", unita).put("intervallo", intervallo);
        if (giorno != null) {
            ric.put("giorno", giorno);
        }
        return crea(in);
    }

    @Test
    void ognuSettimanaGeneraUnaOccorrenzaAlLunedi() throws Exception {
        primaCon("2026-01-05", "SETTIMANE", 1, null);
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 1, 28))).isEqualTo(3);
        assertThat(date()).containsExactly("2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26");
    }

    @Test
    void ogniDueSettimaneEOgniDieciGiorni() throws Exception {
        primaCon("2026-01-05", "SETTIMANE", 2, null);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 10));
        assertThat(date()).containsExactly("2026-01-05", "2026-01-19", "2026-02-02");
    }

    @Test
    void ogniDieciGiorni() throws Exception {
        primaCon("2026-01-28", "GIORNI", 10, null);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 20));
        assertThat(date()).containsExactly("2026-01-28", "2026-02-07", "2026-02-17");
    }

    @Test
    void ogniTreMesiConIlGiorno31SiAccorciaNeiMesiCorti() throws Exception {
        primaCon("2026-01-31", "MESI", 3, 31);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 8, 1));
        assertThat(date()).containsExactly("2026-01-31", "2026-04-30", "2026-07-31");
    }

    @Test
    void ogniAnnoIl29FebbraioDiventa28NeiNonBisestili() throws Exception {
        primaCon("2028-02-29", "ANNI", 1, 29);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2029, 12, 31));
        assertThat(date()).containsExactly("2028-02-29", "2029-02-28");
    }

    @Test
    void senzaFrequenzaVaOgniMeseECosiLaRispostaLoDice() throws Exception {
        JsonNode ric = primaOccorrenza("2026-01-05", 5, 100).get("ricorrenza");
        assertThat(ric.get("unita").asText()).isEqualTo("MESI");
        assertThat(ric.get("intervallo").asInt()).isEqualTo(1);
        assertThat(ric.get("giorno").asInt()).isEqualTo(5);
        JsonNode sett = primaCon("2026-01-05", "SETTIMANE", 2, null).get("ricorrenza");
        assertThat(sett.get("unita").asText()).isEqualTo("SETTIMANE");
        assertThat(sett.get("intervallo").asInt()).isEqualTo(2);
    }

    @Test
    void unaFrequenzaNonValidaDa400() throws Exception {
        for (Object[] caso : new Object[][]{{"GIORNI", 0, null}, {"GIORNI", 366, null}, {"SETTIMANE", 105, null}, {"MESI", 61, 5}, {"ANNI", 11, 5}, {"MESI", 1, null}, {"MESI", 1, 32}}) {
            ObjectNode in = movimento("2026-01-05", "COSTO_FISSO", "NESSUNO", 100);
            ObjectNode ric = in.putObject("ricorrenza").put("unita", (String) caso[0]).put("intervallo", (Integer) caso[1]);
            if (caso[2] != null) {
                ric.put("giorno", (Integer) caso[2]);
            }
            errore(post("/api/movimenti"), in, 400);
        }
        ObjectNode sconosciuta = movimento("2026-01-05", "COSTO_FISSO", "NESSUNO", 100);
        sconosciuta.putObject("ricorrenza").put("unita", "QUINDICINE").put("intervallo", 1);
        errore(post("/api/movimenti"), sconosciuta, 400);
        assertThat(date()).isEmpty();
    }

    @Test
    void unaOccorrenzaSettimanaleEliminataNonVieneRicreataENonCiSonoDoppioni() throws Exception {
        primaCon("2026-01-05", "SETTIMANE", 1, null);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 1, 20));
        JsonNode seconda = leggi("/api/movimenti?da=2026-01-12&a=2026-01-12").get("elementi").get(0);
        elimina(seconda.get("id").asLong(), "SOLO_QUESTO");
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 1, 26))).isEqualTo(1);
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 1, 26))).isZero();
        assertThat(date()).containsExactly("2026-01-05", "2026-01-19", "2026-01-26");
    }

    @Test
    void cambiareLaFrequenzaConQuestoEProssimiParteDallaProssimaScadenza() throws Exception {
        JsonNode prima = primaOccorrenza("2026-01-05", 5, 50000);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 10)); // gennaio e febbraio fatti, la prossima era il 5 marzo
        ObjectNode mod = movimento("2026-01-05", "COSTO_FISSO", "NESSUNO", 50000);
        mod.put("categoria", "Affitto").put("descrizione", "Canone");
        mod.putObject("ricorrenza").put("unita", "SETTIMANE").put("intervallo", 2);
        JsonNode r = modifica(prima.get("id").asLong(), "QUESTO_E_PROSSIMI", mod);
        assertThat(r.get("ricorrenza").get("unita").asText()).isEqualTo("SETTIMANE");
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 4, 10));
        assertThat(date()).containsExactly("2026-01-05", "2026-02-05", "2026-03-05", "2026-03-19", "2026-04-02");
    }

    @Test
    void cambiareSoloIlGiornoDiUnaRipetizioneMensileTieneIlMeseDellaProssimaScadenza() throws Exception {
        JsonNode prima = primaOccorrenza("2026-01-05", 5, 100);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 10));
        ObjectNode mod = movimento("2026-01-05", "COSTO_FISSO", "NESSUNO", 100);
        mod.put("categoria", "Affitto").put("descrizione", "Canone");
        mod.putObject("ricorrenza").put("giorno", 3); // un giorno PRIMA del 5: marzo si fa il 3, non salta
        modifica(prima.get("id").asLong(), "QUESTO_E_PROSSIMI", mod);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 3, 31));
        assertThat(date()).containsExactly("2026-01-05", "2026-02-05", "2026-03-03");
    }

    // ------------------------------------------------------------ riattivare

    @Test
    void unaRipetizioneFermaSiRiattivaSenzaRecuperareIMesiInCuiEraFerma() throws Exception {
        orologio.imposta("2026-02-10");
        JsonNode prima = primaOccorrenza("2026-01-05", 5, 100);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 10));
        long idRic = prima.get("ricorrenza").get("id").asLong();
        invia(post("/api/ricorrenze/" + idRic + "/ferma"), null, 204);
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 6, 15))).isZero();

        orologio.imposta("2026-06-15");
        invia(post("/api/ricorrenze/" + idRic + "/riattiva"), null, 204);
        invia(post("/api/ricorrenze/" + idRic + "/riattiva"), null, 204); // idempotente
        assertThat(leggi("/api/movimenti").get("elementi").get(0).get("ricorrenza").get("attiva").asBoolean()).isTrue();

        // marzo, aprile e maggio (e il 5 giugno, gia' passato) non si recuperano: si riparte dal 5 luglio
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 6, 15))).isZero();
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 7, 5))).isEqualTo(1);
        assertThat(date()).containsExactly("2026-01-05", "2026-02-05", "2026-07-05");
        errore(post("/api/ricorrenze/99999/riattiva"), null, 404);
    }

    @Test
    void riattivareUnaRipetizioneGiaAttivaNonSpostaNiente() throws Exception {
        JsonNode prima = primaOccorrenza("2026-01-05", 5, 100);
        long idRic = prima.get("ricorrenza").get("id").asLong();
        invia(post("/api/ricorrenze/" + idRic + "/riattiva"), null, 204);
        assertThat(servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 3, 10))).isEqualTo(2); // febbraio e marzo, come prima
    }

    @Test
    void unaRipetizioneSettimanaleFermaERiattivataRiparteDalLunediSuccessivo() throws Exception {
        orologio.imposta("2026-01-20");
        JsonNode prima = primaCon("2026-01-05", "SETTIMANE", 1, null);
        long idRic = prima.get("ricorrenza").get("id").asLong();
        invia(post("/api/ricorrenze/" + idRic + "/ferma"), null, 204);
        orologio.imposta("2026-02-11"); // mercoledi'
        invia(post("/api/ricorrenze/" + idRic + "/riattiva"), null, 204);
        servizio.generaOccorrenzeMancanti(LocalDate.of(2026, 2, 24));
        assertThat(date()).contains("2026-02-16", "2026-02-23").doesNotContain("2026-02-02", "2026-02-09");
    }
}
