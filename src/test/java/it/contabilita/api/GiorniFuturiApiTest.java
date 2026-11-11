package it.contabilita.api;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Pizze e ordini non si inseriscono per un giorno futuro (docs/api.md, "Statistiche", regola 5): 400 in /giorni e in
 * /settimana-completa; il totale settimanale della settimana in corso resta permesso. Oggi: mercoledi' 2026-03-04.
 */
class GiorniFuturiApiTest extends ProvaBase {

    private static final String MESSAGGIO = "Non si possono inserire pizze e ordini per un giorno futuro.";

    @BeforeEach
    void oggi() {
        orologio.imposta("2026-03-04");
    }

    private ObjectNode giorni(Object[]... voci) {
        ObjectNode n = json.createObjectNode();
        ArrayNode a = n.putArray("voci");
        for (Object[] v : voci) {
            ObjectNode o = a.addObject().put("sedeId", 1).put("data", (String) v[0]);
            o.set("pizze", v[1] == null ? null : o.numberNode((Integer) v[1]));
            o.set("ordini", v[2] == null ? null : o.numberNode((Integer) v[2]));
        }
        return n;
    }

    private int righe(String tabella) {
        return jdbc.queryForObject("SELECT count(*) FROM " + tabella, Integer.class);
    }

    @Test
    void giorniFuturiRifiutatiOggiEPassatiNo() throws Exception {
        assertThat(errore(put("/api/statistiche/giorni"), giorni(new Object[]{"2026-03-05", 5, 2}), 400).get("errore").asText())
                .isEqualTo(MESSAGGIO);
        // tutto o niente: oggi e ieri validi, domani no
        errore(put("/api/statistiche/giorni"),
                giorni(new Object[]{"2026-03-03", 5, 2}, new Object[]{"2026-03-04", 6, 3}, new Object[]{"2026-03-08", 1, 1}), 400);
        assertThat(righe("dati_giorno")).isZero();
        invia(put("/api/statistiche/giorni"), giorni(new Object[]{"2026-03-03", 5, 2}, new Object[]{"2026-03-04", 6, 3}), 200);
        assertThat(righe("dati_giorno")).isEqualTo(2);
        // cancellare un giorno futuro (numeri null) si puo': serve a pulire dati inseriti prima della regola
        jdbc.update("INSERT INTO dati_giorno (sede_id, giorno, pizze, ordini, modificato_il) VALUES (1, '2026-03-06', 4, 2, '2026-03-01T10:00:00')");
        invia(put("/api/statistiche/giorni"), giorni(new Object[]{"2026-03-06", null, null}), 200);
        assertThat(righe("dati_giorno")).isEqualTo(2);
    }

    @Test
    void ancheNellaSettimanaCompletaMaIlTotaleDellaSettimanaInCorsoVaBene() throws Exception {
        long mare = creaSede("Mare");
        ObjectNode c = json.createObjectNode().put("settimana", "2026-03-02");
        c.putArray("giorni").addObject().put("sedeId", 1).put("data", "2026-03-07").put("pizze", 3).put("ordini", 1);
        c.putArray("totali").addObject().put("sedeId", mare).put("pizze", 40).put("ordini", 15);
        assertThat(errore(put("/api/statistiche/settimana-completa"), c, 400).get("errore").asText()).isEqualTo(MESSAGGIO);
        assertThat(righe("dati_giorno") + righe("dati_settimana")).isZero();

        // senza il giorno futuro: il totale della settimana in corso si salva
        ((ArrayNode) c.get("giorni")).removeAll();
        ((ArrayNode) c.get("giorni")).addObject().put("sedeId", 1).put("data", "2026-03-04").put("pizze", 3).put("ordini", 1);
        invia(put("/api/statistiche/settimana-completa"), c, 200);
        assertThat(righe("dati_settimana")).isEqualTo(1);

        // anche con PUT /settimana: il totale della settimana in corso (e di una futura) resta permesso come prima
        ObjectNode tot = json.createObjectNode().put("settimana", "2026-03-04");
        tot.putArray("voci").addObject().put("sedeId", mare).put("pizze", 50).put("ordini", 20);
        invia(put("/api/statistiche/settimana"), tot, 200);
    }
}
