package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Statistiche settimanali (docs/api.md, "Statistiche"). Le settimane usate: lunedi' 2026-03-02, 2026-03-09 e 2026-03-16
 * (il 2 marzo 2026 e' un lunedi').
 */
class StatisticheApiTest extends ProvaBase {

    private ObjectNode voce(long sedeId, Object pizze, Object ordini) {
        ObjectNode v = json.createObjectNode().put("sedeId", sedeId);
        if (pizze != null) {
            v.set("pizze", json.valueToTree(pizze));
        }
        if (ordini != null) {
            v.set("ordini", json.valueToTree(ordini));
        }
        return v;
    }

    private ObjectNode settimana(String giorno, ObjectNode... voci) {
        ObjectNode n = json.createObjectNode().put("settimana", giorno);
        ArrayNode a = n.putArray("voci");
        for (ObjectNode v : voci) {
            a.add(v);
        }
        return n;
    }

    private JsonNode salva(String giorno, ObjectNode... voci) throws Exception {
        return invia(put("/api/statistiche/settimana"), settimana(giorno, voci), 200);
    }

    private void ricavo(String data, long sedeId, long cent) throws Exception {
        crea(inSede(movimento(data, "RICAVO", "RICAVO_FATTURATO", cent), sedeId));
    }

    private JsonNode sedeDi(JsonNode settimana, long sedeId) {
        for (JsonNode s : settimana.get("sedi")) {
            if (s.get("sede").get("id").asLong() == sedeId) {
                return s;
            }
        }
        return null;
    }

    private List<Long> ids(JsonNode elencoRif) {
        List<Long> out = new ArrayList<>();
        elencoRif.forEach(n -> out.add(n.get("id").asLong()));
        return out;
    }

    // ---------------------------------------------------------------- inserimento

    @Test
    void ilSalvataggioNormalizzaAlLunediEAggiornaLaStessaRiga() throws Exception {
        JsonNode r = salva("2026-03-04", voce(1, 10, 4)); // un mercoledi'
        assertThat(r.get("settimana").asText()).isEqualTo("2026-03-02");
        assertThat(r.get("fine").asText()).isEqualTo("2026-03-08");
        JsonNode s = sedeDi(r, 1);
        assertThat(s.get("pizze").asInt()).isEqualTo(10);
        assertThat(s.get("ordini").asInt()).isEqualTo(4);
        assertThat(s.get("completa").asBoolean()).isTrue();
        assertThat(s.get("pizzePerOrdine").asDouble()).isEqualTo(2.5);

        // la domenica stessa settimana: aggiorna, non duplica
        JsonNode agg = salva("2026-03-08", voce(1, 12, 5));
        assertThat(sedeDi(agg, 1).get("pizze").asInt()).isEqualTo(12);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM dati_settimana", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT settimana FROM dati_settimana", String.class)).isEqualTo("2026-03-02");

        // il lunedi' dopo e' un'altra settimana
        salva("2026-03-09", voce(1, 1, 1));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM dati_settimana", Integer.class)).isEqualTo(2);

        // lo stesso valore si legge con GET da qualunque giorno della settimana
        JsonNode lett = leggi("/api/statistiche/settimana?data=2026-03-06");
        assertThat(lett.get("settimana").asText()).isEqualTo("2026-03-02");
        assertThat(sedeDi(lett, 1).get("ordini").asInt()).isEqualTo(5);
    }

    @Test
    void leValidazioniDanno400ENonSalvanoNiente() throws Exception {
        long mare = creaSede("Sede Mare");
        long vecchia = creaSede("Sede Vecchia");
        invia(put("/api/sedi/" + vecchia), json.createObjectNode().put("archiviata", true), 200);

        errore(put("/api/statistiche/settimana"), settimana("2026-03-02"), 400); // voci vuote
        errore(put("/api/statistiche/settimana"), json.createObjectNode().put("settimana", "2026-03-02"), 400); // voci assenti
        errore(put("/api/statistiche/settimana"), json.createObjectNode().set("voci", json.createArrayNode().add(voce(1, 1, 1))), 400); // settimana assente
        errore(put("/api/statistiche/settimana"), settimana("marzo", voce(1, 1, 1)), 400);
        errore(put("/api/statistiche/settimana"), settimana("2026-02-30", voce(1, 1, 1)), 400);
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(1, -1, 4)), 400);
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(1, 5, -4)), 400);
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(1, 2.5, 4)), 400);
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(1, 5, 0)), 400); // 0 ordini ma pizze
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(1, 5, null)), 400); // ne manca uno
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(1, null, 5)), 400);
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(999, 5, 5)), 400); // sede inesistente
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(vecchia, 5, 5)), 400); // archiviata
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(1, 5, 5), voce(1, 6, 6)), 400); // sede doppia
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(1, 5000000, 5)), 400); // troppo grande
        errore(put("/api/statistiche/settimana"), json.createObjectNode().put("settimana", "2026-03-02")
                .set("voci", json.createArrayNode().add(json.createObjectNode().put("pizze", 1).put("ordini", 1))), 400); // senza sede
        // una voce sbagliata annulla anche quelle buone
        errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(1, 5, 5), voce(mare, -1, 5)), 400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM dati_settimana", Integer.class)).isZero();

        JsonNode e = errore(put("/api/statistiche/settimana"), settimana("2026-03-02", voce(1, 5, 0)), 400);
        assertThat(e.get("errore").asText()).contains("0 ordini");

        // 0 pizze e 0 ordini va bene (settimana chiusa o senza vendite): completa, ma senza medie
        JsonNode zero = salva("2026-03-02", voce(1, 0, 0));
        JsonNode s = sedeDi(zero, 1);
        assertThat(s.get("completa").asBoolean()).isTrue();
        assertThat(s.get("scontrinoMedioCent").isNull()).isTrue();
        assertThat(s.get("pizzePerOrdine").isNull()).isTrue();

        errore(get("/api/statistiche/settimana?data=ieri"), null, 400);
    }

    @Test
    void unaVoceSenzaNumeriCancellaIlDatoDiQuellaSedeESettimana() throws Exception {
        long mare = creaSede("Sede Mare");
        salva("2026-03-02", voce(1, 10, 4), voce(mare, 20, 8));
        salva("2026-03-09", voce(1, 7, 3));

        JsonNode r = salva("2026-03-03", voce(1, null, null)); // cancella solo la sede 1 di quella settimana
        assertThat(sedeDi(r, 1).get("completa").asBoolean()).isFalse();
        assertThat(sedeDi(r, 1).get("pizze").isNull()).isTrue();
        assertThat(sedeDi(r, 1).get("ordini").isNull()).isTrue();
        assertThat(sedeDi(r, mare).get("completa").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM dati_settimana", Integer.class)).isEqualTo(2);
        // cancellare un dato che non c'e' non e' un errore
        salva("2026-03-03", voce(1, null, null));
        // l'altra settimana e' intatta
        assertThat(sedeDi(leggi("/api/statistiche/settimana?data=2026-03-09"), 1).get("pizze").asInt()).isEqualTo(7);
    }

    // ---------------------------------------------------------------- GET settimana

    @Test
    void laSettimanaMostraRicaviDellaSedeLunediDomenicaESedeSenzaDati() throws Exception {
        long mare = creaSede("Sede Mare");
        ricavo("2026-03-01", 1, 99900); // domenica prima: fuori
        ricavo("2026-03-02", 1, 6000);  // lunedi'
        ricavo("2026-03-08", 1, 4000);  // domenica
        ricavo("2026-03-09", 1, 55500); // lunedi' dopo: fuori
        crea(inSede(movimento("2026-03-03", "COSTO_VARIABILE", "SCONTRINO", 777), 1)); // un costo non e' un ricavo
        ricavo("2026-03-04", mare, 1234);
        salva("2026-03-02", voce(1, 7, 3));

        JsonNode r = leggi("/api/statistiche/settimana?data=2026-03-05");
        assertThat(r.get("sedi")).hasSize(2);
        JsonNode s1 = sedeDi(r, 1);
        assertThat(s1.get("sede").get("nome").asText()).isEqualTo("Sede principale");
        assertThat(s1.get("ricaviCent").asLong()).isEqualTo(10000);
        assertThat(s1.get("scontrinoMedioCent").asLong()).isEqualTo(3333); // 10000 / 3 = 3333,33
        assertThat(s1.get("pizzePerOrdine").asDouble()).isEqualTo(2.33);
        assertThat(s1.get("completa").asBoolean()).isTrue();
        JsonNode s2 = sedeDi(r, mare);
        assertThat(s2.get("ricaviCent").asLong()).isEqualTo(1234);
        assertThat(s2.get("completa").asBoolean()).isFalse();
        assertThat(s2.get("pizze").isNull()).isTrue();
        assertThat(s2.get("scontrinoMedioCent").isNull()).isTrue();
    }

    @Test
    void settimanaSenzaRicaviHaRicaviZeroEScontrinoZero() throws Exception {
        salva("2026-03-16", voce(1, 5, 2));
        JsonNode s = sedeDi(leggi("/api/statistiche/settimana?data=2026-03-16"), 1);
        assertThat(s.get("ricaviCent").asLong()).isZero();
        assertThat(s.get("scontrinoMedioCent").asLong()).isZero();
        assertThat(s.get("pizzePerOrdine").asDouble()).isEqualTo(2.5);
    }

    @Test
    void unaSedeArchiviataComparesoloSeHaDatiORicavi() throws Exception {
        long vecchia = creaSede("Sede Vecchia");
        salva("2026-03-02", voce(vecchia, 4, 2));
        invia(put("/api/sedi/" + vecchia), json.createObjectNode().put("archiviata", true), 200);
        assertThat(sedeDi(leggi("/api/statistiche/settimana?data=2026-03-02"), vecchia)).isNotNull();
        assertThat(sedeDi(leggi("/api/statistiche/settimana?data=2026-03-09"), vecchia)).isNull();
    }

    // ---------------------------------------------------------------- GET statistiche

    /** Tre sedi, tre settimane; la sede 3 non ha mai dati, la sede 1 ha 0 ordini nella seconda settimana. */
    private long preparaPeriodo() throws Exception {
        long mare = creaSede("Sede Mare");
        long monti = creaSede("Sede Monti");
        ricavo("2026-03-02", 1, 6000);
        ricavo("2026-03-06", 1, 4000);
        ricavo("2026-03-02", mare, 2000);
        ricavo("2026-03-08", mare, 3000); // la domenica e' ancora la settimana del 2
        ricavo("2026-03-04", monti, 9000);
        ricavo("2026-03-09", 1, 2000);
        crea(inSede(movimento("2026-03-03", "COSTO_VARIABILE", "SCONTRINO", 777), 1));
        salva("2026-03-02", voce(1, 7, 3), voce(mare, 10, 4));
        salva("2026-03-09", voce(1, 0, 0));
        return mare;
    }

    @Test
    void scontrinoPerSedeEGlobaleEscludeLeSediSenzaDatiEMostraleMancanti() throws Exception {
        long mare = preparaPeriodo();
        long monti = mare + 1;
        JsonNode r = leggi("/api/statistiche?da=2026-03-02&a=2026-03-16");

        JsonNode t = r.get("totale");
        assertThat(t.get("pizze").asLong()).isEqualTo(17);
        assertThat(t.get("ordini").asLong()).isEqualTo(7);
        assertThat(t.get("ricaviCent").asLong()).isEqualTo(15000); // 10000 + 5000: i 9000 di Monti e i 2000 senza ordini sono esclusi
        assertThat(t.get("scontrinoMedioCent").asLong()).isEqualTo(2143); // 15000 / 7 = 2142,86
        assertThat(t.get("pizzePerOrdine").asDouble()).isEqualTo(2.43); // 17 / 7
        assertThat(t.get("settimaneConDati").asInt()).isEqualTo(2);
        assertThat(t.get("settimaneTotali").asInt()).isEqualTo(3);

        JsonNode ps = r.get("perSede");
        assertThat(ps).hasSize(3);
        JsonNode s1 = ps.get(0);
        assertThat(s1.get("sede").get("id").asLong()).isEqualTo(1);
        assertThat(s1.get("pizze").asLong()).isEqualTo(7);
        assertThat(s1.get("ordini").asLong()).isEqualTo(3);
        assertThat(s1.get("ricaviCent").asLong()).isEqualTo(10000);
        assertThat(s1.get("scontrinoMedioCent").asLong()).isEqualTo(3333); // arrotondamento: 10000 / 3
        assertThat(s1.get("pizzePerOrdine").asDouble()).isEqualTo(2.33);
        assertThat(s1.get("settimaneConDati").asInt()).isEqualTo(2);
        JsonNode s2 = ps.get(1);
        assertThat(s2.get("ricaviCent").asLong()).isEqualTo(5000);
        assertThat(s2.get("scontrinoMedioCent").asLong()).isEqualTo(1250);
        assertThat(s2.get("pizzePerOrdine").asDouble()).isEqualTo(2.5);
        assertThat(s2.get("settimaneConDati").asInt()).isEqualTo(1);
        JsonNode s3 = ps.get(2);
        assertThat(s3.get("sede").get("id").asLong()).isEqualTo(monti);
        assertThat(s3.get("ordini").asLong()).isZero();
        assertThat(s3.get("ricaviCent").asLong()).isZero();
        assertThat(s3.get("scontrinoMedioCent").isNull()).isTrue();
        assertThat(s3.get("pizzePerOrdine").isNull()).isTrue();
        assertThat(s3.get("settimaneConDati").asInt()).isZero();

        JsonNode w = r.get("settimane");
        assertThat(w).hasSize(3);
        assertThat(w.get(0).get("settimana").asText()).isEqualTo("2026-03-02");
        assertThat(w.get(1).get("settimana").asText()).isEqualTo("2026-03-09");
        assertThat(w.get(2).get("settimana").asText()).isEqualTo("2026-03-16");
        assertThat(w.get(0).get("pizze").asLong()).isEqualTo(17);
        assertThat(w.get(0).get("ordini").asLong()).isEqualTo(7);
        assertThat(w.get(0).get("ricaviCent").asLong()).isEqualTo(15000);
        assertThat(w.get(0).get("scontrinoMedioCent").asLong()).isEqualTo(2143);
        assertThat(ids(w.get(0).get("sediMancanti"))).containsExactly(monti);
        // seconda settimana: solo la sede 1, con 0 ordini => nessuno scontrino; mancano Mare e Monti
        assertThat(w.get(1).get("ordini").asLong()).isZero();
        assertThat(w.get(1).get("scontrinoMedioCent").isNull()).isTrue();
        assertThat(ids(w.get(1).get("sediMancanti"))).containsExactly(mare, monti);
        // terza settimana: nessun dato, mancano tutte
        assertThat(ids(w.get(2).get("sediMancanti"))).containsExactly(1L, mare, monti);
        assertThat(w.get(2).get("scontrinoMedioCent").isNull()).isTrue();
    }

    @Test
    void ilFiltroSediRestringeTuttoEUnPeriodoSenzaLunediEVuoto() throws Exception {
        long mare = preparaPeriodo();
        JsonNode r = leggi("/api/statistiche?da=2026-03-02&a=2026-03-16&sedi=" + mare);
        assertThat(r.get("perSede")).hasSize(1);
        assertThat(r.get("totale").get("ordini").asLong()).isEqualTo(4);
        assertThat(r.get("totale").get("ricaviCent").asLong()).isEqualTo(5000);
        assertThat(r.get("totale").get("scontrinoMedioCent").asLong()).isEqualTo(1250);
        assertThat(r.get("totale").get("settimaneConDati").asInt()).isEqualTo(1);
        assertThat(ids(r.get("settimane").get(1).get("sediMancanti"))).containsExactly(mare);

        JsonNode due = leggi("/api/statistiche?da=2026-03-02&a=2026-03-16&sedi=1," + mare);
        assertThat(due.get("totale").get("ordini").asLong()).isEqualTo(7);
        assertThat(due.get("perSede")).hasSize(2);

        // sede inesistente: nessuna riga, ma il periodo c'e'
        JsonNode nessuna = leggi("/api/statistiche?da=2026-03-02&a=2026-03-16&sedi=999");
        assertThat(nessuna.get("perSede")).isEmpty();
        assertThat(nessuna.get("totale").get("scontrinoMedioCent").isNull()).isTrue();
        assertThat(nessuna.get("totale").get("settimaneTotali").asInt()).isEqualTo(3);

        // dal martedi' al domenica: nessun lunedi' nel periodo
        JsonNode vuoto = leggi("/api/statistiche?da=2026-03-03&a=2026-03-08");
        assertThat(vuoto.get("settimane")).isEmpty();
        assertThat(vuoto.get("totale").get("settimaneTotali").asInt()).isZero();
        assertThat(vuoto.get("totale").get("scontrinoMedioCent").isNull()).isTrue();

        // il lunedi' deve cadere in [da, a]: da il 3 marzo la prima settimana e' quella del 9
        JsonNode dal3 = leggi("/api/statistiche?da=2026-03-03&a=2026-03-16");
        assertThat(dal3.get("settimane")).hasSize(2);
        assertThat(dal3.get("settimane").get(0).get("settimana").asText()).isEqualTo("2026-03-09");
    }

    @Test
    void ilPeriodoSenzaDatiTornaMedieNulleEParametriSbagliatiDanno400() throws Exception {
        JsonNode r = leggi("/api/statistiche?da=2026-03-02&a=2026-03-09");
        assertThat(r.get("totale").get("settimaneConDati").asInt()).isZero();
        assertThat(r.get("totale").get("pizzePerOrdine").isNull()).isTrue();
        assertThat(ids(r.get("settimane").get(0).get("sediMancanti"))).containsExactly(1L);
        errore(get("/api/statistiche?a=2026-03-09"), null, 400);
        errore(get("/api/statistiche?da=2026-03-09"), null, 400);
        errore(get("/api/statistiche?da=2026-03-09&a=2026-03-02"), null, 400);
        errore(get("/api/statistiche?da=2026-03-02&a=2026-03-09&sedi=uno"), null, 400);
    }

    @Test
    void lasedeArchiviataCompareNelPeriodoSoloConDatiNonTraLeMancanti() throws Exception {
        long vecchia = creaSede("Sede Vecchia");
        salva("2026-03-02", voce(1, 2, 1), voce(vecchia, 4, 2));
        invia(put("/api/sedi/" + vecchia), json.createObjectNode().put("archiviata", true), 200);
        JsonNode r = leggi("/api/statistiche?da=2026-03-02&a=2026-03-09");
        assertThat(r.get("perSede")).hasSize(2);
        assertThat(r.get("totale").get("ordini").asLong()).isEqualTo(3);
        // la seconda settimana: la sede archiviata non e' «mancante»
        assertThat(ids(r.get("settimane").get(1).get("sediMancanti"))).containsExactly(1L);
        JsonNode dopo = leggi("/api/statistiche?da=2026-03-09&a=2026-03-16");
        assertThat(dopo.get("perSede")).hasSize(1);
    }

    // ---------------------------------------------------------------- esportazione

    @Test
    void lEsportazioneXlsxHaIlFoglioStatisticheSoloSeCiSonoDati() throws Exception {
        ricavo("2026-03-02", 1, 10000);
        byte[] senza = scarica("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31");
        assertThat(nomiFogli(senza)).containsExactly("Movimenti", "Riepilogo");

        salva("2026-03-02", voce(1, 7, 3));
        salva("2026-03-09", voce(1, 0, 0));
        byte[] con = scarica("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31");
        assertThat(nomiFogli(con)).containsExactly("Movimenti", "Riepilogo", "Statistiche");
        String foglio = testo(con, "xl/worksheets/sheet3.xml");
        assertThat(foglio).contains("Settimana", "Scontrino medio", "Sede principale", "<v>7</v>", "<v>3</v>", "<v>100.0</v>", "<v>33.33</v>");
        // il CSV resta solo movimenti
        String csv = new String(scarica("/api/esporta?formato=csv&da=2026-03-01&a=2026-03-31"), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(csv).doesNotContain("Scontrino medio");
    }

    /** Il corpo della risposta (con il redispatch asincrono dello streaming). */
    private byte[] scarica(String url) throws Exception {
        var r = mockMvc.perform(get(url)).andReturn();
        if (r.getRequest().isAsyncStarted()) {
            r = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch(r)).andReturn();
        }
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return r.getResponse().getContentAsByteArray();
    }

    private List<String> nomiFogli(byte[] xlsx) throws Exception {
        String wb = testo(xlsx, "xl/workbook.xml");
        List<String> nomi = new ArrayList<>();
        var m = java.util.regex.Pattern.compile("<sheet [^>]*name=\"([^\"]+)\"").matcher(wb);
        while (m.find()) {
            nomi.add(m.group(1));
        }
        return nomi;
    }

    private String testo(byte[] xlsx, String voce) throws Exception {
        java.nio.file.Path file = java.nio.file.Files.createTempFile(CARTELLA_DATI, "stat-", ".xlsx");
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
