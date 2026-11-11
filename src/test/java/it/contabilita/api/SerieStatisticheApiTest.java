package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * {@code GET /api/statistiche/serie} (docs/api.md, "Serie per il grafico"): il segnale dei totali settimanali messi sul lunedi'
 * ({@code daTotaleSettimanale}) e le righe per sede ({@code perSede}) sulle date esatte del periodo.
 * Settimane: lunedi' 2026-03-02 (fino a domenica 8) e 2026-03-09 (fino al 15).
 */
class SerieStatisticheApiTest extends ProvaBase {

    private static final String[] CAMPI_SOMMABILI = {"pizze", "ordini", "ricaviTotaliCent", "ricaviExtraCent", "ricaviConDatiCent"};

    long mare;
    long monti;

    private ObjectNode corpoSettimana(String giorno, long sedeId, int pizze, int ordini) {
        ObjectNode n = json.createObjectNode().put("settimana", giorno);
        n.putArray("voci").addObject().put("sedeId", sedeId).put("pizze", pizze).put("ordini", ordini);
        return n;
    }

    private ObjectNode corpoGiorno(String data, long sedeId, int pizze, int ordini) {
        ObjectNode n = json.createObjectNode();
        n.putArray("voci").addObject().put("sedeId", sedeId).put("data", data).put("pizze", pizze).put("ordini", ordini);
        return n;
    }

    private JsonNode serie(String query) throws Exception {
        return leggi("/api/statistiche/serie?" + query);
    }

    private static List<Long> idsSedi(JsonNode perSede) {
        List<Long> out = new ArrayList<>();
        perSede.forEach(n -> out.add(n.get("sedeId").asLong()));
        return out;
    }

    private static JsonNode riga(JsonNode perSede, long sedeId) {
        for (JsonNode n : perSede) {
            if (n.get("sedeId").asLong() == sedeId) {
                return n;
            }
        }
        throw new AssertionError("sede non trovata: " + sedeId);
    }

    /** La somma delle righe per sede e' il totale, campo per campo. */
    private static void sommaUgualeAlTotale(JsonNode r) {
        for (String campo : CAMPI_SOMMABILI) {
            long somma = 0;
            for (JsonNode n : r.get("perSede")) {
                somma += n.get(campo).asLong();
            }
            assertThat(somma).as(campo).isEqualTo(r.get("totale").get(campo).asLong());
        }
    }

    @BeforeEach
    void dati() throws Exception {
        orologio.imposta("2026-12-31"); // i giorni di marzo sono passati (i giorni futuri non si inseriscono)
        mare = creaSede("Mare");
        monti = creaSede("Monti");
        // Mare: totale della settimana del 2 marzo (conta sul lunedi'); Sede principale: giorni
        invia(put("/api/statistiche/settimana"), corpoSettimana("2026-03-04", mare, 100, 40), 200);
        invia(put("/api/statistiche/giorni"), corpoGiorno("2026-03-03", 1, 10, 4), 200);
        invia(put("/api/statistiche/giorni"), corpoGiorno("2026-03-10", 1, 20, 8), 200);
        crea(inSede(movimento("2026-03-03", "RICAVO", "RICAVO_FATTURATO", 10000), 1));
        crea(inSede(movimento("2026-03-04", "RICAVO", "RICAVO_FATTURATO", 5000), mare));
        crea(inSede(movimento("2026-03-05", "RICAVO", "RICAVO_EXTRA", 1000), mare));
        crea(inSede(movimento("2026-03-11", "RICAVO", "RICAVO_FATTURATO", 3000), 1));
    }

    // ---------------------------------------------------------------- daTotaleSettimanale (s22)

    @Test
    void ogniIntervalloDiceSeContieneUnTotaleSettimanale() throws Exception {
        JsonNode r = serie("da=2026-03-02&a=2026-03-15&passo=GIORNO");
        JsonNode v = r.get("intervalli");
        assertThat(v).hasSize(14);
        assertThat(v.get(0).get("inizio").asText()).isEqualTo("2026-03-02");
        assertThat(v.get(0).get("daTotaleSettimanale").asBoolean()).isTrue(); // il lunedi' con il totale di Mare
        assertThat(v.get(0).get("pizze").asLong()).isEqualTo(100);
        assertThat(v.get(1).get("daTotaleSettimanale").asBoolean()).isFalse(); // un giorno inserito giorno per giorno
        assertThat(v.get(7).get("daTotaleSettimanale").asBoolean()).isFalse(); // lunedi' 9: nessun totale
        assertThat(r.get("totale").get("daTotaleSettimanale").asBoolean()).isTrue();

        JsonNode settimane = serie("da=2026-03-02&a=2026-03-15&passo=SETTIMANA").get("intervalli");
        assertThat(settimane.get(0).get("daTotaleSettimanale").asBoolean()).isTrue();
        assertThat(settimane.get(1).get("daTotaleSettimanale").asBoolean()).isFalse();

        // il lunedi' fuori dal periodo: il totale non conta e non c'e' il segnale
        JsonNode dal3 = serie("da=2026-03-03&a=2026-03-08&passo=GIORNO");
        assertThat(dal3.get("totale").get("daTotaleSettimanale").asBoolean()).isFalse();
        assertThat(dal3.get("totale").get("pizze").asLong()).isEqualTo(10);

        // solo la sede con i giorni: nessun totale settimanale
        assertThat(serie("da=2026-03-02&a=2026-03-15&passo=GIORNO&sedi=1").get("totale").get("daTotaleSettimanale").asBoolean()).isFalse();
    }

    // ---------------------------------------------------------------- perSede (s23)

    @Test
    void perSedeSulleDateEsatteConSommaUgualeAlTotale() throws Exception {
        JsonNode r = serie("da=2026-03-02&a=2026-03-15&passo=SETTIMANA");
        // ordine di GET /api/sedi; Monti senza dati compare a zero
        assertThat(idsSedi(r.get("perSede"))).containsExactly(1L, mare, monti);
        JsonNode principale = riga(r.get("perSede"), 1);
        assertThat(principale.get("nome").asText()).isEqualTo("Sede principale");
        assertThat(principale.get("archiviata").asBoolean()).isFalse();
        assertThat(principale.get("inizio").asText()).isEqualTo("2026-03-02");
        assertThat(principale.get("fine").asText()).isEqualTo("2026-03-15");
        assertThat(principale.get("pizze").asLong()).isEqualTo(30);
        assertThat(principale.get("ordini").asLong()).isEqualTo(12);
        assertThat(principale.get("ricaviTotaliCent").asLong()).isEqualTo(13000);
        assertThat(principale.get("ricaviConDatiCent").asLong()).isEqualTo(10000); // l'11 non ha dati
        assertThat(principale.get("scontrinoMedioCent").asLong()).isEqualTo(833); // 10000 / 12
        assertThat(principale.get("conDati").asBoolean()).isTrue();
        assertThat(principale.get("daTotaleSettimanale").asBoolean()).isFalse();
        JsonNode m = riga(r.get("perSede"), mare);
        assertThat(m.get("pizze").asLong()).isEqualTo(100);
        assertThat(m.get("ricaviTotaliCent").asLong()).isEqualTo(6000);
        assertThat(m.get("ricaviExtraCent").asLong()).isEqualTo(1000);
        assertThat(m.get("ricaviConDatiCent").asLong()).isEqualTo(6000); // il totale settimanale usa i ricavi di tutta la settimana
        assertThat(m.get("daTotaleSettimanale").asBoolean()).isTrue();
        JsonNode zero = riga(r.get("perSede"), monti);
        assertThat(zero.get("pizze").asLong()).isZero();
        assertThat(zero.get("ricaviTotaliCent").asLong()).isZero();
        assertThat(zero.get("conDati").asBoolean()).isFalse();
        assertThat(zero.get("scontrinoMedioCent").isNull()).isTrue();
        sommaUgualeAlTotale(r);

        // le date esatte: dal 3 marzo il totale di Mare (sul lunedi' 2) resta fuori, i suoi ricavi no
        JsonNode dal3 = serie("da=2026-03-03&a=2026-03-15&passo=GIORNO");
        JsonNode mareDal3 = riga(dal3.get("perSede"), mare);
        assertThat(mareDal3.get("pizze").asLong()).isZero();
        assertThat(mareDal3.get("ricaviTotaliCent").asLong()).isEqualTo(6000);
        assertThat(mareDal3.get("conDati").asBoolean()).isFalse();
        sommaUgualeAlTotale(dal3);
        sommaUgualeAlTotale(serie("da=2026-03-01&a=2026-03-31&passo=MESE"));
    }

    @Test
    void perSedeRispettaIlFiltroLeArchiviateELaSedePersonale() throws Exception {
        JsonNode soloMare = serie("da=2026-03-02&a=2026-03-15&passo=GIORNO&sedi=" + mare);
        assertThat(idsSedi(soloMare.get("perSede"))).containsExactly(mare);
        sommaUgualeAlTotale(soloMare);

        // archiviata: compare solo se nel periodo ha attivita' (ricavi o dati), in fondo come in GET /api/sedi
        invia(put("/api/sedi/" + monti), json.createObjectNode().put("archiviata", true), 200);
        assertThat(idsSedi(serie("da=2026-03-02&a=2026-03-15&passo=GIORNO").get("perSede"))).containsExactly(1L, mare);
        invia(put("/api/sedi/" + mare), json.createObjectNode().put("archiviata", true), 200);
        JsonNode r = serie("da=2026-03-02&a=2026-03-15&passo=GIORNO");
        assertThat(idsSedi(r.get("perSede"))).containsExactly(1L, mare);
        assertThat(riga(r.get("perSede"), mare).get("archiviata").asBoolean()).isTrue();
        assertThat(idsSedi(serie("da=2026-04-01&a=2026-04-30&passo=GIORNO").get("perSede"))).containsExactly(1L);

        // la sede personale non c'e' mai, nemmeno scelta esplicitamente
        long casa = invia(post("/api/sedi"), json.createObjectNode().put("nome", "Casa").put("personale", true), 201).get("id").asLong();
        crea(inSede(movimento("2026-03-04", "RICAVO", "RICAVO_EXTRA", 7000), casa));
        assertThat(idsSedi(serie("da=2026-03-02&a=2026-03-15&passo=GIORNO").get("perSede"))).doesNotContain(casa);
        JsonNode conCasa = serie("da=2026-03-02&a=2026-03-15&passo=GIORNO&sedi=1," + casa);
        assertThat(idsSedi(conCasa.get("perSede"))).containsExactly(1L);
        sommaUgualeAlTotale(conCasa);
    }
}
