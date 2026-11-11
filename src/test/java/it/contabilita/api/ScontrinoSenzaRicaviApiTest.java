package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Regola 3 delle statistiche (docs/api.md): con ordini > 0 ma ricavi usati per lo scontrino = 0 lo scontrino medio e' null
 * (non 0) in tutte le risposte e vuoto nei fogli Excel. Settimana: lunedi' 2026-03-02 (fino a domenica 8), nessun ricavo.
 */
class ScontrinoSenzaRicaviApiTest extends ProvaBase {

    /** Oggi a fine 2026: i giorni di marzo usati qui sono passati (i giorni futuri non si inseriscono). */
    @BeforeEach
    void oggiAFineAnno() {
        orologio.imposta("2026-12-31");
    }


    private void giorno(String data, long sedeId, int pizze, int ordini) throws Exception {
        ObjectNode n = json.createObjectNode();
        n.putArray("voci").addObject().put("sedeId", sedeId).put("data", data).put("pizze", pizze).put("ordini", ordini);
        invia(put("/api/statistiche/giorni"), n, 200);
    }

    private static void senzaScontrino(JsonNode n) {
        assertThat(n.get("scontrinoMedioCent").isNull()).as(n.toString()).isTrue();
    }

    @Test
    void conOrdiniMaSenzaRicaviLoScontrinoENullOvunque() throws Exception {
        long mare = creaSede("Mare");
        giorno("2026-03-03", 1, 9, 4);
        ObjectNode tot = json.createObjectNode().put("settimana", "2026-03-02");
        tot.putArray("voci").addObject().put("sedeId", mare).put("pizze", 20).put("ordini", 8);
        invia(put("/api/statistiche/settimana"), tot, 200);

        JsonNode sett = leggi("/api/statistiche/settimana?data=2026-03-02");
        for (JsonNode s : sett.get("sedi")) {
            assertThat(s.get("ordini").asInt()).isPositive();
            senzaScontrino(s);
        }
        JsonNode principale = sett.get("sedi").get(0);
        senzaScontrino(principale.get("giorni").get(1)); // il 3 marzo: 4 ordini, 0 ricavi

        JsonNode periodo = leggi("/api/statistiche?da=2026-03-02&a=2026-03-08");
        senzaScontrino(periodo.get("totale"));
        periodo.get("perSede").forEach(ScontrinoSenzaRicaviApiTest::senzaScontrino);
        senzaScontrino(periodo.get("settimane").get(0));

        JsonNode serie = leggi("/api/statistiche/serie?da=2026-03-02&a=2026-03-08&passo=GIORNO");
        senzaScontrino(serie.get("totale"));
        serie.get("intervalli").forEach(ScontrinoSenzaRicaviApiTest::senzaScontrino);
        serie.get("perSede").forEach(ScontrinoSenzaRicaviApiTest::senzaScontrino);

        // Excel, foglio «Statistiche»: colonna F (Scontrino medio) vuota per entrambe le righe
        byte[] xlsx = scarica("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31");
        String stat = testo(xlsx, "xl/worksheets/sheet3.xml");
        assertThat(stat).contains("r=\"A2\"", "r=\"A3\"").doesNotContain("r=\"F2\"", "r=\"F3\"");
        // foglio «Pizze per giorno»: il 3 marzo (4 ordini, 0 incassi) senza la cella G (Scontrino medio)
        String perGiorno = testo(xlsx, "xl/worksheets/sheet4.xml");
        assertThat(perGiorno).contains("r=\"A2\"", "r=\"D2\"").doesNotContain("r=\"A3\"", "r=\"G2\"");
    }

    @Test
    void conRicaviLoScontrinoCeComePrima() throws Exception {
        giorno("2026-03-03", 1, 9, 4);
        crea(inSede(movimento("2026-03-03", "RICAVO", "RICAVO_FATTURATO", 8000), 1));
        JsonNode periodo = leggi("/api/statistiche?da=2026-03-02&a=2026-03-08");
        assertThat(periodo.get("totale").get("scontrinoMedioCent").asLong()).isEqualTo(2000);
        // con 0 ordini resta null come prima
        giorno("2026-03-03", 1, 0, 0);
        senzaScontrino(leggi("/api/statistiche?da=2026-03-02&a=2026-03-08").get("totale"));
    }

    private byte[] scarica(String url) throws Exception {
        var r = mockMvc.perform(get(url)).andReturn();
        if (r.getRequest().isAsyncStarted()) {
            r = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch(r)).andReturn();
        }
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return r.getResponse().getContentAsByteArray();
    }

    private String testo(byte[] xlsx, String voce) throws Exception {
        java.nio.file.Path file = java.nio.file.Files.createTempFile(CARTELLA_DATI, "scontrino-", ".xlsx");
        try {
            java.nio.file.Files.write(file, xlsx);
            try (java.util.zip.ZipFile zip = new java.util.zip.ZipFile(file.toFile());
                 var in = zip.getInputStream(zip.getEntry(voce))) {
                return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            }
        } finally {
            java.nio.file.Files.deleteIfExists(file);
        }
    }
}
