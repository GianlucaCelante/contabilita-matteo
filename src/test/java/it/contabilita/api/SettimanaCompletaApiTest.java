package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * {@code PUT /api/statistiche/settimana-completa} (docs/api.md, "Salvare una settimana intera"): giorni e totali settimanali di
 * piu' sedi in un solo salvataggio, tutto o niente. Settimana: lunedi' 2026-03-02 (fino a domenica 8).
 */
class SettimanaCompletaApiTest extends ProvaBase {

    private static final String URL = "/api/statistiche/settimana-completa";

    long mare;
    long monti;

    @BeforeEach
    void sedi() throws Exception {
        orologio.imposta("2026-12-31"); // i giorni di marzo sono passati (i giorni futuri non si inseriscono)
        mare = creaSede("Mare");
        monti = creaSede("Monti");
    }

    private ObjectNode corpo(String settimana) {
        ObjectNode n = json.createObjectNode();
        if (settimana != null) {
            n.put("settimana", settimana);
        }
        n.putArray("giorni");
        n.putArray("totali");
        return n;
    }

    private static ObjectNode giorno(ObjectNode corpo, long sedeId, String data, Integer pizze, Integer ordini) {
        ObjectNode v = ((ArrayNode) corpo.get("giorni")).addObject().put("sedeId", sedeId).put("data", data);
        v.set("pizze", pizze == null ? null : v.numberNode(pizze));
        v.set("ordini", ordini == null ? null : v.numberNode(ordini));
        return corpo;
    }

    private static ObjectNode totale(ObjectNode corpo, long sedeId, Integer pizze, Integer ordini) {
        ObjectNode v = ((ArrayNode) corpo.get("totali")).addObject().put("sedeId", sedeId);
        v.set("pizze", pizze == null ? null : v.numberNode(pizze));
        v.set("ordini", ordini == null ? null : v.numberNode(ordini));
        return corpo;
    }

    private JsonNode sedeDi(JsonNode settimana, long sedeId) {
        for (JsonNode s : settimana.get("sedi")) {
            if (s.get("sede").get("id").asLong() == sedeId) {
                return s;
            }
        }
        throw new AssertionError("sede non trovata: " + sedeId);
    }

    private int righe(String tabella) {
        return jdbc.queryForObject("SELECT count(*) FROM " + tabella, Integer.class);
    }

    private String messaggio(ObjectNode corpo) throws Exception {
        return errore(put(URL), corpo, 400).get("errore").asText();
    }

    // ---------------------------------------------------------------- salvataggio

    @Test
    void salvaGiorniETotaliDiPiuSediInUnaVoltaERispondeConLaSettimana() throws Exception {
        ObjectNode c = corpo("2026-03-04");
        giorno(c, 1, "2026-03-02", 9, 4);
        giorno(c, 1, "2026-03-03", 0, 0);
        totale(c, mare, 70, 30);
        JsonNode r = invia(put(URL), c, 200);
        assertThat(r.get("settimana").asText()).isEqualTo("2026-03-02");
        JsonNode principale = sedeDi(r, 1);
        assertThat(principale.get("fonte").asText()).isEqualTo("GIORNI");
        assertThat(principale.get("giorniInseriti").asInt()).isEqualTo(2);
        assertThat(principale.get("pizze").asInt()).isEqualTo(9);
        JsonNode m = sedeDi(r, mare);
        assertThat(m.get("fonte").asText()).isEqualTo("SETTIMANA");
        assertThat(m.get("pizze").asInt()).isEqualTo(70);
        assertThat(sedeDi(r, monti).get("completa").asBoolean()).isFalse();
        assertThat(r).isEqualTo(leggi("/api/statistiche/settimana?data=2026-03-02"));
    }

    @Test
    void unModoPerSedeISalvataggiCancellanoLAltroModo() throws Exception {
        // prima: Sede principale con il totale, Mare con un giorno
        ObjectNode prima = corpo("2026-03-02");
        totale(prima, 1, 50, 20);
        giorno(prima, mare, "2026-03-05", 8, 3);
        invia(put(URL), prima, 200);

        // poi: Sede principale a giorni (cancella il suo totale), Mare col totale (cancella i suoi giorni)
        ObjectNode dopo = corpo("2026-03-02");
        giorno(dopo, 1, "2026-03-06", 11, 5);
        totale(dopo, mare, 40, 16);
        JsonNode r = invia(put(URL), dopo, 200);
        assertThat(sedeDi(r, 1).get("fonte").asText()).isEqualTo("GIORNI");
        assertThat(sedeDi(r, 1).get("pizze").asInt()).isEqualTo(11);
        assertThat(sedeDi(r, mare).get("fonte").asText()).isEqualTo("SETTIMANA");
        assertThat(righe("dati_settimana")).isEqualTo(1);
        assertThat(righe("dati_giorno")).isEqualTo(1);

        // numeri null = cancella; un totale null e i giorni con i numeri della stessa sede vanno bene insieme
        ObjectNode cancella = corpo("2026-03-02");
        totale(cancella, mare, null, null);
        giorno(cancella, mare, "2026-03-03", 4, 2);
        giorno(cancella, 1, "2026-03-06", null, null);
        JsonNode r2 = invia(put(URL), cancella, 200);
        assertThat(sedeDi(r2, mare).get("fonte").asText()).isEqualTo("GIORNI");
        assertThat(sedeDi(r2, 1).get("completa").asBoolean()).isFalse();
        assertThat(righe("dati_settimana")).isZero();
        assertThat(righe("dati_giorno")).isEqualTo(1);
    }

    // ---------------------------------------------------------------- tutto o niente

    @Test
    void seLaSecondaSedeNonEValidaNonSiSalvaNientePerNessuna() throws Exception {
        ObjectNode prima = corpo("2026-03-02");
        totale(prima, 1, 50, 20);
        giorno(prima, mare, "2026-03-05", 8, 3);
        invia(put(URL), prima, 200);

        invia(put("/api/sedi/" + monti), json.createObjectNode().put("archiviata", true), 200);
        ObjectNode c = corpo("2026-03-02");
        giorno(c, 1, "2026-03-03", 9, 4); // valido: cancellerebbe il totale della principale
        totale(c, mare, 70, 30);            // valido: cancellerebbe i giorni di Mare
        totale(c, monti, 10, 5);            // non valido: archiviata
        assertThat(messaggio(c)).isEqualTo("La sede «Monti» è archiviata.");

        assertThat(jdbc.queryForObject("SELECT pizze FROM dati_settimana WHERE sede_id = 1", Integer.class)).isEqualTo(50);
        assertThat(jdbc.queryForObject("SELECT pizze FROM dati_giorno WHERE sede_id = " + mare, Integer.class)).isEqualTo(8);
        assertThat(righe("dati_settimana")).isEqualTo(1);
        assertThat(righe("dati_giorno")).isEqualTo(1);

        // anche un numero sbagliato nell'ultima voce blocca tutto
        ObjectNode numeri = corpo("2026-03-02");
        totale(numeri, mare, 70, 30);
        giorno(numeri, 1, "2026-03-03", 5, 0);
        assertThat(messaggio(numeri)).isEqualTo("Sede «Sede principale», 03/03/2026: con 0 ordini le pizze devono essere 0.");
        assertThat(jdbc.queryForObject("SELECT pizze FROM dati_giorno WHERE sede_id = " + mare, Integer.class)).isEqualTo(8);
    }

    @Test
    void unaSedeConINumeriSiaNeiGiorniSiaNeiTotaliDa400() throws Exception {
        ObjectNode c = corpo("2026-03-02");
        giorno(c, mare, "2026-03-03", 9, 4);
        totale(c, mare, 70, 30);
        assertThat(messaggio(c)).isEqualTo("Sede «Mare»: scegli un solo modo per la settimana, giorno per giorno o totale della settimana.");
        assertThat(righe("dati_giorno") + righe("dati_settimana")).isZero();
    }

    // ---------------------------------------------------------------- errori come /giorni e /settimana

    @Test
    void erroriConGliStessiMessaggiDeiDueEndpoint() throws Exception {
        assertThat(messaggio(totale(corpo((String) null), 1, 1, 1))).isEqualTo("Indica la settimana (un giorno qualsiasi, yyyy-MM-dd).");
        assertThat(messaggio(totale(corpo("2026-13-01"), 1, 1, 1))).isEqualTo("La settimana non è una data valida (yyyy-MM-dd): 2026-13-01");
        assertThat(messaggio(corpo("2026-03-02"))).isEqualTo("Indica almeno una voce.");
        assertThat(messaggio(json.createObjectNode().put("settimana", "2026-03-02"))).isEqualTo("Indica almeno una voce.");
        // giorni
        assertThat(messaggio(giorno(corpo("2026-03-02"), 1, "2026-03-09", 1, 1)))
                .isEqualTo("Tutti i giorni devono essere della stessa settimana (da lunedì a domenica).");
        assertThat(messaggio(giorno(corpo("2026-03-02"), 1, "ieri", 1, 1))).isEqualTo("Il giorno non è una data valida (yyyy-MM-dd): ieri");
        assertThat(messaggio(giorno(giorno(corpo("2026-03-02"), 1, "2026-03-03", 1, 1), 1, "2026-03-03", 2, 2)))
                .isEqualTo("Sede «Sede principale», 03/03/2026: il giorno compare più volte.");
        assertThat(messaggio(giorno(corpo("2026-03-02"), 999, "2026-03-03", 1, 1))).isEqualTo("Sede non trovata.");
        // totali
        assertThat(messaggio(totale(totale(corpo("2026-03-02"), mare, 1, 1), mare, 2, 2))).isEqualTo("La sede " + mare + " compare più volte.");
        assertThat(messaggio(totale(corpo("2026-03-02"), mare, -1, 1))).isEqualTo("Sede «Mare»: pizze non può essere negativo.");
        assertThat(messaggio(totale(corpo("2026-03-02"), mare, 1, null)))
                .isEqualTo("Sede «Mare»: indica sia le pizze sia gli ordini (o nessuno dei due per cancellare il dato).");
        // sede personale
        long casa = invia(post("/api/sedi"), json.createObjectNode().put("nome", "Casa").put("personale", true), 201).get("id").asLong();
        assertThat(messaggio(totale(corpo("2026-03-02"), casa, 1, 1))).isEqualTo("La sede «Casa» è personale: non ha pizze e ordini.");
        assertThat(righe("dati_giorno") + righe("dati_settimana")).isZero();
    }
}
