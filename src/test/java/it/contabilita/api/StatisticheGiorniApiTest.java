package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Pizze e ordini giorno per giorno (docs/api.md, "Statistiche"): salvataggio dei giorni, precedenza sui vecchi totali
 * settimanali, scontrino medio dei soli giorni con dati, sedi mancanti, serie per il grafico ed esportazione.
 * Le settimane usate: lunedi' 2026-03-02 (fino a domenica 8), 2026-03-09, 2026-03-16, 2026-03-23, 2026-03-30 (fino al 5 aprile).
 */
class StatisticheGiorniApiTest extends ProvaBase {

    /** Oggi a fine 2026: i giorni di marzo usati qui sono passati (i giorni futuri non si inseriscono). */
    @BeforeEach
    void oggiAFineAnno() {
        orologio.imposta("2026-12-31");
    }


    private ObjectNode giorno(long sedeId, String data, Object pizze, Object ordini) {
        ObjectNode v = json.createObjectNode().put("sedeId", sedeId).put("data", data);
        if (pizze != null) {
            v.set("pizze", json.valueToTree(pizze));
        }
        if (ordini != null) {
            v.set("ordini", json.valueToTree(ordini));
        }
        return v;
    }

    private ObjectNode corpoGiorni(ObjectNode... voci) {
        ObjectNode n = json.createObjectNode();
        ArrayNode a = n.putArray("voci");
        for (ObjectNode v : voci) {
            a.add(v);
        }
        return n;
    }

    private JsonNode salvaGiorni(ObjectNode... voci) throws Exception {
        return invia(put("/api/statistiche/giorni"), corpoGiorni(voci), 200);
    }

    private JsonNode salvaSettimana(String giorno, long sedeId, Integer pizze, Integer ordini) throws Exception {
        return invia(put("/api/statistiche/settimana"), corpoSettimana(giorno, sedeId, pizze, ordini), 200);
    }

    private ObjectNode corpoSettimana(String giorno, long sedeId, Integer pizze, Integer ordini) {
        ObjectNode n = json.createObjectNode().put("settimana", giorno);
        ObjectNode v = n.putArray("voci").addObject().put("sedeId", sedeId);
        v.set("pizze", json.valueToTree(pizze));
        v.set("ordini", json.valueToTree(ordini));
        return n;
    }

    private void ricavo(String data, long sedeId, long cent) throws Exception {
        crea(inSede(movimento(data, "RICAVO", "RICAVO_FATTURATO", cent), sedeId));
    }

    private void extra(String data, long sedeId, long cent) throws Exception {
        crea(inSede(movimento(data, "RICAVO", "RICAVO_EXTRA", cent), sedeId));
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

    private int righe(String tabella) {
        return jdbc.queryForObject("SELECT count(*) FROM " + tabella, Integer.class);
    }

    // ---------------------------------------------------------------- salvataggio dei giorni

    @Test
    void iGiorniSiSalvanoSiAggiornanoESiCancellanoELaSettimanaESomma() throws Exception {
        JsonNode r = salvaGiorni(giorno(1, "2026-03-02", 10, 4), giorno(1, "2026-03-04", 6, 2));
        assertThat(r.get("settimana").asText()).isEqualTo("2026-03-02");
        JsonNode s = sedeDi(r, 1);
        assertThat(s.get("pizze").asInt()).isEqualTo(16);
        assertThat(s.get("ordini").asInt()).isEqualTo(6);
        assertThat(s.get("completa").asBoolean()).isTrue();
        assertThat(s.get("fonte").asText()).isEqualTo("GIORNI");
        assertThat(s.get("giorniInseriti").asInt()).isEqualTo(2);
        assertThat(s.has("settimanale")).isFalse();
        JsonNode giorni = s.get("giorni");
        assertThat(giorni).hasSize(7);
        assertThat(giorni.get(0).get("data").asText()).isEqualTo("2026-03-02");
        assertThat(giorni.get(6).get("data").asText()).isEqualTo("2026-03-08");
        assertThat(giorni.get(0).get("pizze").asInt()).isEqualTo(10);
        assertThat(giorni.get(1).get("pizze").isNull()).isTrue(); // martedi' non inserito
        assertThat(giorni.get(1).get("ordini").isNull()).isTrue();
        assertThat(giorni.get(2).get("ordini").asInt()).isEqualTo(2);
        assertThat(righe("dati_giorno")).isEqualTo(2);

        // lo stesso giorno si aggiorna, non si duplica
        JsonNode agg = salvaGiorni(giorno(1, "2026-03-02", 12, 5));
        assertThat(sedeDi(agg, 1).get("pizze").asInt()).isEqualTo(18);
        assertThat(righe("dati_giorno")).isEqualTo(2);

        // pizze e ordini assenti cancellano il giorno (anche se non c'era: nessun errore)
        salvaGiorni(giorno(1, "2026-03-04", null, null), giorno(1, "2026-03-05", null, null));
        JsonNode dopo = leggi("/api/statistiche/settimana?data=2026-03-07");
        assertThat(sedeDi(dopo, 1).get("giorniInseriti").asInt()).isEqualTo(1);
        assertThat(sedeDi(dopo, 1).get("ordini").asInt()).isEqualTo(5);
        assertThat(righe("dati_giorno")).isEqualTo(1);

        // cancellato anche l'ultimo giorno: la settimana non ha piu' dati
        JsonNode vuota = salvaGiorni(giorno(1, "2026-03-02", null, null));
        JsonNode sv = sedeDi(vuota, 1);
        assertThat(sv.get("completa").asBoolean()).isFalse();
        assertThat(sv.get("fonte").isNull()).isTrue();
        assertThat(sv.get("pizze").isNull()).isTrue();
        assertThat(sv.get("giorniInseriti").asInt()).isZero();
        assertThat(righe("dati_giorno")).isZero();
    }

    @Test
    void leValidazioniDeiGiorniDanno400ENonSalvanoNiente() throws Exception {
        long mare = creaSede("Sede Mare");
        long vecchia = creaSede("Sede Vecchia");
        invia(put("/api/sedi/" + vecchia), json.createObjectNode().put("archiviata", true), 200);

        String url = "/api/statistiche/giorni";
        errore(put(url), corpoGiorni(), 400); // voci vuote
        errore(put(url), json.createObjectNode(), 400); // voci assenti
        errore(put(url), corpoGiorni(json.createObjectNode().put("data", "2026-03-02").put("pizze", 1).put("ordini", 1)), 400); // senza sede
        errore(put(url), corpoGiorni(json.createObjectNode().put("sedeId", 1).put("pizze", 1).put("ordini", 1)), 400); // senza data
        errore(put(url), corpoGiorni(giorno(1, "marzo", 1, 1)), 400);
        errore(put(url), corpoGiorni(giorno(1, "2026-02-30", 1, 1)), 400);
        errore(put(url), corpoGiorni(giorno(1, "2026-03-02", -1, 4)), 400);
        errore(put(url), corpoGiorni(giorno(1, "2026-03-02", 5, -4)), 400);
        errore(put(url), corpoGiorni(giorno(1, "2026-03-02", 2.5, 4)), 400);
        errore(put(url), corpoGiorni(giorno(1, "2026-03-02", 5, null)), 400);
        errore(put(url), corpoGiorni(giorno(1, "2026-03-02", null, 5)), 400);
        errore(put(url), corpoGiorni(giorno(1, "2026-03-02", 5000000, 5)), 400);
        errore(put(url), corpoGiorni(giorno(999, "2026-03-02", 5, 5)), 400);
        errore(put(url), corpoGiorni(giorno(vecchia, "2026-03-02", 5, 5)), 400);
        errore(put(url), corpoGiorni(giorno(1, "2026-03-02", 5, 5), giorno(1, "2026-03-02", 6, 6)), 400); // stesso giorno due volte
        // una voce sbagliata annulla anche quelle buone
        errore(put(url), corpoGiorni(giorno(1, "2026-03-02", 5, 5), giorno(mare, "2026-03-03", -1, 5)), 400);
        assertThat(righe("dati_giorno")).isZero();

        JsonNode zero = errore(put(url), corpoGiorni(giorno(1, "2026-03-02", 5, 0)), 400);
        assertThat(zero.get("errore").asText()).contains("0 ordini");
        JsonNode due = errore(put(url), corpoGiorni(giorno(1, "2026-03-08", 5, 5), giorno(1, "2026-03-09", 5, 5)), 400);
        assertThat(due.get("errore").asText()).contains("stessa settimana");

        // la stessa sede in giorni diversi, o due sedi lo stesso giorno, va bene; 0 e 0 e' ammesso (giorno senza vendite)
        JsonNode ok = salvaGiorni(giorno(1, "2026-03-02", 5, 5), giorno(1, "2026-03-03", 0, 0), giorno(mare, "2026-03-02", 3, 1));
        assertThat(sedeDi(ok, 1).get("giorniInseriti").asInt()).isEqualTo(2);
        assertThat(sedeDi(ok, 1).get("giorni").get(1).get("scontrinoMedioCent").isNull()).isTrue();
        assertThat(righe("dati_giorno")).isEqualTo(3);
    }

    // ---------------------------------------------------------------- scontrino medio e ricavi

    @Test
    void loScontrinoUsaSoloIRicaviDeiGiorniConDatiEOrdini() throws Exception {
        ricavo("2026-03-02", 1, 6000);  // lunedi': dati 4 ordini
        extra("2026-03-02", 1, 2000);
        ricavo("2026-03-03", 1, 4000);  // martedi': dati 0 / 0 (non entra nello scontrino)
        ricavo("2026-03-04", 1, 9000);  // mercoledi': nessun dato (non entra)
        extra("2026-03-08", 1, 1000);   // domenica: nessun dato
        crea(inSede(movimento("2026-03-02", "COSTO_VARIABILE", "SCONTRINO", 777), 1)); // un costo non e' un ricavo
        salvaGiorni(giorno(1, "2026-03-02", 9, 4), giorno(1, "2026-03-03", 0, 0));

        JsonNode s = sedeDi(leggi("/api/statistiche/settimana?data=2026-03-02"), 1);
        assertThat(s.get("ricaviCent").asLong()).isEqualTo(22000); // come prima: tutti i ricavi della settimana
        assertThat(s.get("ricaviTotaliCent").asLong()).isEqualTo(22000);
        assertThat(s.get("ricaviExtraCent").asLong()).isEqualTo(3000);
        assertThat(s.get("ricaviConDatiCent").asLong()).isEqualTo(8000); // solo il lunedi'
        assertThat(s.get("scontrinoMedioCent").asLong()).isEqualTo(2000); // 8000 / 4, non 22000 / 4
        assertThat(s.get("pizzePerOrdine").asDouble()).isEqualTo(2.25);
        JsonNode lun = s.get("giorni").get(0);
        assertThat(lun.get("ricaviTotaliCent").asLong()).isEqualTo(8000);
        assertThat(lun.get("ricaviExtraCent").asLong()).isEqualTo(2000);
        assertThat(lun.get("scontrinoMedioCent").asLong()).isEqualTo(2000);
        assertThat(lun.get("pizzePerOrdine").asDouble()).isEqualTo(2.25);
        JsonNode mer = s.get("giorni").get(2);
        assertThat(mer.get("ricaviTotaliCent").asLong()).isEqualTo(9000);
        assertThat(mer.get("scontrinoMedioCent").isNull()).isTrue();

        // il periodo: ricaviCent resta quello dello scontrino; i totali di tutti i ricavi sono a parte
        JsonNode p = leggi("/api/statistiche?da=2026-03-02&a=2026-03-08");
        JsonNode t = p.get("totale");
        assertThat(t.get("ordini").asLong()).isEqualTo(4);
        assertThat(t.get("ricaviCent").asLong()).isEqualTo(8000);
        assertThat(t.get("ricaviConDatiCent").asLong()).isEqualTo(8000);
        assertThat(t.get("ricaviTotaliCent").asLong()).isEqualTo(22000);
        assertThat(t.get("ricaviExtraCent").asLong()).isEqualTo(3000);
        assertThat(t.get("scontrinoMedioCent").asLong()).isEqualTo(2000);
        JsonNode w = p.get("settimane").get(0);
        assertThat(w.get("ricaviTotaliCent").asLong()).isEqualTo(22000);
        assertThat(w.get("ricaviConDatiCent").asLong()).isEqualTo(8000);
        JsonNode ps = p.get("perSede").get(0);
        assertThat(ps.get("ricaviTotaliCent").asLong()).isEqualTo(22000);
        assertThat(ps.get("ricaviExtraCent").asLong()).isEqualTo(3000);
        assertThat(ps.get("ricaviCent").asLong()).isEqualTo(8000);
    }

    // ---------------------------------------------------------------- un solo modo per sede e settimana

    @Test
    void perSedeESettimanaValeUnSoloModoESalvareLAltroCancellaIlPrimo() throws Exception {
        long mare = creaSede("Sede Mare");
        ricavo("2026-03-02", 1, 6000);
        ricavo("2026-03-05", 1, 4000);
        ricavo("2026-03-02", mare, 2000);
        ricavo("2026-03-06", mare, 3000);
        salvaSettimana("2026-03-02", 1, 100, 40); // totale settimanale della sede 1
        salvaSettimana("2026-03-02", mare, 10, 4); // totale settimanale di Mare
        salvaSettimana("2026-03-09", 1, 50, 20); // un'altra settimana della sede 1: non si tocca

        // i giorni della sede 1 cancellano il suo totale di quella settimana (stessa transazione), non quello di Mare
        JsonNode r = salvaGiorni(giorno(1, "2026-03-02", 7, 3));
        JsonNode s1 = sedeDi(r, 1);
        assertThat(s1.get("fonte").asText()).isEqualTo("GIORNI");
        assertThat(s1.get("pizze").asInt()).isEqualTo(7);
        assertThat(s1.get("ordini").asInt()).isEqualTo(3);
        assertThat(s1.get("ricaviConDatiCent").asLong()).isEqualTo(6000);
        assertThat(s1.get("scontrinoMedioCent").asLong()).isEqualTo(2000);
        assertThat(s1.has("settimanale")).isFalse();
        assertThat(conta("SELECT count(*) FROM dati_settimana WHERE sede_id = 1 AND settimana = '2026-03-02'")).isZero();
        assertThat(conta("SELECT count(*) FROM dati_settimana WHERE sede_id = 1 AND settimana = '2026-03-09'")).isEqualTo(1);
        JsonNode s2 = sedeDi(r, mare);
        assertThat(s2.get("fonte").asText()).isEqualTo("SETTIMANA");
        assertThat(s2.get("pizze").asInt()).isEqualTo(10);
        assertThat(s2.get("ricaviConDatiCent").asLong()).isEqualTo(5000); // il totale settimanale usa i ricavi di tutta la settimana
        assertThat(s2.get("scontrinoMedioCent").asLong()).isEqualTo(1250);
        assertThat(s2.get("giorniInseriti").asInt()).isZero();
        assertThat(s2.get("giorni").get(0).get("pizze").isNull()).isTrue();

        JsonNode t = leggi("/api/statistiche?da=2026-03-02&a=2026-03-08").get("totale");
        assertThat(t.get("pizze").asLong()).isEqualTo(17);
        assertThat(t.get("ordini").asLong()).isEqualTo(7);
        assertThat(t.get("ricaviCent").asLong()).isEqualTo(11000); // 6000 (lunedi' della sede 1) + 5000 (Mare)
        assertThat(t.get("scontrinoMedioCent").asLong()).isEqualTo(1571);
        assertThat(t.get("ricaviTotaliCent").asLong()).isEqualTo(15000);

        // cancellare i giorni non fa riapparire nessun totale nascosto
        JsonNode vuota = salvaGiorni(giorno(1, "2026-03-02", null, null));
        assertThat(sedeDi(vuota, 1).get("fonte").isNull()).isTrue();
        assertThat(sedeDi(vuota, 1).get("completa").asBoolean()).isFalse();

        // il totale settimanale cancella i giorni di quella sede e settimana (non quelli delle altre sedi o settimane)
        salvaGiorni(giorno(1, "2026-03-03", 5, 2), giorno(1, "2026-03-04", 6, 2), giorno(mare, "2026-03-03", 1, 1));
        salvaGiorni(giorno(1, "2026-03-10", 2, 1));
        JsonNode sett = salvaSettimana("2026-03-04", 1, 30, 12);
        assertThat(sedeDi(sett, 1).get("fonte").asText()).isEqualTo("SETTIMANA");
        assertThat(sedeDi(sett, 1).get("pizze").asInt()).isEqualTo(30);
        assertThat(sedeDi(sett, 1).get("giorniInseriti").asInt()).isZero();
        assertThat(sedeDi(sett, mare).get("fonte").asText()).isEqualTo("GIORNI"); // Mare: i suoi giorni hanno cancellato il suo totale
        assertThat(conta("SELECT count(*) FROM dati_giorno WHERE sede_id = 1 AND giorno <= '2026-03-08'")).isZero();
        assertThat(conta("SELECT count(*) FROM dati_giorno WHERE sede_id = 1 AND giorno = '2026-03-10'")).isEqualTo(1);
        assertThat(conta("SELECT count(*) FROM dati_settimana WHERE settimana = '2026-03-02'")).isEqualTo(1);

        // cancellare un giorno che non c'e' non tocca il totale; cancellare il totale (null / null) non tocca i giorni
        salvaGiorni(giorno(1, "2026-03-05", null, null));
        assertThat(sedeDi(leggi("/api/statistiche/settimana?data=2026-03-02"), 1).get("pizze").asInt()).isEqualTo(30);
        invia(put("/api/statistiche/settimana"), corpoSettimana("2026-03-11", 1, null, null), 200);
        assertThat(conta("SELECT count(*) FROM dati_giorno WHERE giorno = '2026-03-10'")).isEqualTo(1);

        // tutto o niente: se una voce e' sbagliata non si cancella niente
        errore(put("/api/statistiche/giorni"), corpoGiorni(giorno(1, "2026-03-02", 1, 1), giorno(1, "2026-03-03", 5, 0)), 400);
        errore(put("/api/statistiche/settimana"), json.createObjectNode().put("settimana", "2026-03-02")
                .set("voci", json.createArrayNode().add(json.createObjectNode().put("sedeId", mare).put("pizze", 1).put("ordini", 1))
                        .add(json.createObjectNode().put("sedeId", 1).put("pizze", 5).put("ordini", 0))), 400);
        assertThat(sedeDi(leggi("/api/statistiche/settimana?data=2026-03-02"), 1).get("fonte").asText()).isEqualTo("SETTIMANA");
        assertThat(sedeDi(leggi("/api/statistiche/settimana?data=2026-03-02"), mare).get("fonte").asText()).isEqualTo("GIORNI");
    }

    private int conta(String sql) {
        return jdbc.queryForObject(sql, Integer.class);
    }

    // ---------------------------------------------------------------- sedi mancanti

    @Test
    void unaSettimanaEMancanteSoloSenzaNessunGiornoNeTotale() throws Exception {
        long mare = creaSede("Sede Mare");
        long monti = creaSede("Sede Monti");
        // settimana del 2: la sede 1 inserisce solo due giorni (il resto e' chiuso), Mare il vecchio totale, Monti niente
        salvaGiorni(giorno(1, "2026-03-03", 5, 2), giorno(1, "2026-03-07", 0, 0));
        salvaSettimana("2026-03-02", mare, 10, 4);
        // settimana del 9: solo Monti, un giorno
        salvaGiorni(giorno(monti, "2026-03-15", 8, 3));

        JsonNode p = leggi("/api/statistiche?da=2026-03-02&a=2026-03-09");
        JsonNode w = p.get("settimane");
        assertThat(ids(w.get(0).get("sediMancanti"))).containsExactly(monti);
        assertThat(ids(w.get(1).get("sediMancanti"))).containsExactly(1L, mare);
        assertThat(p.get("totale").get("settimaneConDati").asInt()).isEqualTo(2);
        JsonNode s1 = p.get("perSede").get(0);
        assertThat(s1.get("settimaneConDati").asInt()).isEqualTo(1);
        assertThat(s1.get("pizze").asLong()).isEqualTo(5);

        JsonNode sett = leggi("/api/statistiche/settimana?data=2026-03-02");
        assertThat(sedeDi(sett, 1).get("completa").asBoolean()).isTrue();
        assertThat(sedeDi(sett, mare).get("completa").asBoolean()).isTrue();
        assertThat(sedeDi(sett, monti).get("completa").asBoolean()).isFalse();
    }

    /**
     * Una sede normale (non personale) senza dati risulta mancante in ogni settimana. Basta un giorno 0 / 0 nella settimana per
     * toglierla dalle mancanti. (Le sedi personali non sono mai mancanti: SedePersonaleApiTest.)
     */
    @Test
    void unaSedeNormaleSenzaDatiEMancanteOgniSettimana() throws Exception {
        long vuota = creaSede("Sede senza dati");
        salvaGiorni(giorno(1, "2026-03-02", 5, 2));
        salvaGiorni(giorno(1, "2026-03-09", 5, 2));
        JsonNode w = leggi("/api/statistiche?da=2026-03-02&a=2026-03-09").get("settimane");
        assertThat(ids(w.get(0).get("sediMancanti"))).containsExactly(vuota);
        assertThat(ids(w.get(1).get("sediMancanti"))).containsExactly(vuota);

        salvaGiorni(giorno(vuota, "2026-03-09", 0, 0));
        JsonNode dopo = leggi("/api/statistiche?da=2026-03-02&a=2026-03-09").get("settimane");
        assertThat(ids(dopo.get(1).get("sediMancanti"))).isEmpty();
    }

    // ---------------------------------------------------------------- serie per il grafico

    private void preparaSerie() throws Exception {
        long mare = creaSede("Sede Mare");
        ricavo("2026-03-02", 1, 6000);
        extra("2026-03-02", 1, 1000);
        ricavo("2026-03-03", 1, 4000); // giorno senza dati: conta nei ricavi totali, non nello scontrino
        ricavo("2026-03-10", 1, 9000);
        ricavo("2026-03-31", 1, 3000);
        ricavo("2026-04-02", 1, 5000);
        ricavo("2026-03-30", mare, 2000);
        ricavo("2026-04-01", mare, 2000);
        salvaGiorni(giorno(1, "2026-03-02", 8, 3));
        salvaGiorni(giorno(1, "2026-03-10", 10, 4));
        salvaGiorni(giorno(1, "2026-03-31", 4, 2), giorno(1, "2026-04-02", 6, 2));
        salvaSettimana("2026-04-01", mare, 9, 4); // vecchio totale di Mare: vale nel lunedi' 30 marzo, con i ricavi di tutta la settimana
    }

    @Test
    void laSerieGiornalieraHaUnIntervalloPerGiornoEIlVecchioTotaleNelLunedi() throws Exception {
        preparaSerie();
        JsonNode r = leggi("/api/statistiche/serie?da=2026-03-30&a=2026-04-02&passo=GIORNO");
        assertThat(r.get("passo").asText()).isEqualTo("GIORNO");
        JsonNode v = r.get("intervalli");
        assertThat(v).hasSize(4);
        JsonNode lun = v.get(0);
        assertThat(lun.get("inizio").asText()).isEqualTo("2026-03-30");
        assertThat(lun.get("fine").asText()).isEqualTo("2026-03-30");
        assertThat(lun.get("pizze").asLong()).isEqualTo(9); // il vecchio totale di Mare
        assertThat(lun.get("ordini").asLong()).isEqualTo(4);
        assertThat(lun.get("ricaviTotaliCent").asLong()).isEqualTo(2000);
        assertThat(lun.get("ricaviConDatiCent").asLong()).isEqualTo(4000); // i ricavi di Mare in tutta la settimana
        assertThat(lun.get("scontrinoMedioCent").asLong()).isEqualTo(1000);
        assertThat(lun.get("conDati").asBoolean()).isTrue();
        JsonNode mer = v.get(2); // 1 aprile: ricavi di Mare, nessun dato
        assertThat(mer.get("pizze").asLong()).isZero();
        assertThat(mer.get("ricaviTotaliCent").asLong()).isEqualTo(2000);
        assertThat(mer.get("scontrinoMedioCent").isNull()).isTrue();
        assertThat(mer.get("conDati").asBoolean()).isFalse();
        JsonNode t = r.get("totale");
        assertThat(t.get("pizze").asLong()).isEqualTo(19);
        assertThat(t.get("ordini").asLong()).isEqualTo(8);
        assertThat(t.get("ricaviTotaliCent").asLong()).isEqualTo(12000);
        assertThat(t.get("ricaviConDatiCent").asLong()).isEqualTo(12000); // 3000 + 5000 (sede 1) + 4000 (Mare)
        assertThat(t.get("scontrinoMedioCent").asLong()).isEqualTo(1500);
        assertThat(t.get("pizzePerOrdine").asDouble()).isEqualTo(2.38);
    }

    @Test
    void laSerieSettimanaleEMensileTaglianoGliIntervalliAlPeriodo() throws Exception {
        preparaSerie();
        // settimane: dal mercoledi' 4 marzo al giovedi' 2 aprile -> 5 intervalli, il primo e l'ultimo tagliati
        JsonNode s = leggi("/api/statistiche/serie?da=2026-03-04&a=2026-04-02&passo=SETTIMANA").get("intervalli");
        assertThat(s).hasSize(5);
        assertThat(s.get(0).get("inizio").asText()).isEqualTo("2026-03-04");
        assertThat(s.get(0).get("fine").asText()).isEqualTo("2026-03-08");
        assertThat(s.get(0).get("pizze").asLong()).isZero(); // il 2 marzo e' fuori dal periodo
        assertThat(s.get(0).get("conDati").asBoolean()).isFalse();
        assertThat(s.get(1).get("inizio").asText()).isEqualTo("2026-03-09");
        assertThat(s.get(1).get("fine").asText()).isEqualTo("2026-03-15");
        assertThat(s.get(1).get("pizze").asLong()).isEqualTo(10);
        assertThat(s.get(1).get("scontrinoMedioCent").asLong()).isEqualTo(2250);
        assertThat(s.get(4).get("inizio").asText()).isEqualTo("2026-03-30");
        assertThat(s.get(4).get("fine").asText()).isEqualTo("2026-04-02");
        assertThat(s.get(4).get("pizze").asLong()).isEqualTo(19);

        // mesi: marzo e aprile; il vecchio totale di Mare (lunedi' 30 marzo) va in marzo, con i ricavi di tutta la sua settimana
        JsonNode m = leggi("/api/statistiche/serie?da=2026-03-01&a=2026-04-30&passo=MESE");
        JsonNode mesi = m.get("intervalli");
        assertThat(mesi).hasSize(2);
        assertThat(mesi.get(0).get("inizio").asText()).isEqualTo("2026-03-01");
        assertThat(mesi.get(0).get("fine").asText()).isEqualTo("2026-03-31");
        assertThat(mesi.get(0).get("pizze").asLong()).isEqualTo(31); // 8 + 10 + 4 + 9
        assertThat(mesi.get(0).get("ordini").asLong()).isEqualTo(13);
        assertThat(mesi.get(0).get("ricaviTotaliCent").asLong()).isEqualTo(25000);
        assertThat(mesi.get(0).get("ricaviExtraCent").asLong()).isEqualTo(1000);
        assertThat(mesi.get(0).get("ricaviConDatiCent").asLong()).isEqualTo(23000); // 7000 + 9000 + 3000 + 4000
        assertThat(mesi.get(1).get("fine").asText()).isEqualTo("2026-04-30");
        assertThat(mesi.get(1).get("pizze").asLong()).isEqualTo(6);
        assertThat(mesi.get(1).get("ricaviTotaliCent").asLong()).isEqualTo(7000);
        assertThat(m.get("totale").get("pizze").asLong()).isEqualTo(37);
        assertThat(m.get("totale").get("ricaviTotaliCent").asLong()).isEqualTo(32000);

        // il filtro sedi
        JsonNode soloMare = leggi("/api/statistiche/serie?da=2026-03-01&a=2026-04-30&passo=MESE&sedi=2");
        assertThat(soloMare.get("totale").get("pizze").asLong()).isEqualTo(9);
        assertThat(soloMare.get("totale").get("ricaviTotaliCent").asLong()).isEqualTo(4000);

        // un anno diviso mese per mese
        JsonNode anno = leggi("/api/statistiche/serie?da=2026-01-01&a=2026-12-31&passo=MESE").get("intervalli");
        assertThat(anno).hasSize(12);
        assertThat(anno.get(1).get("fine").asText()).isEqualTo("2026-02-28");
    }

    @Test
    void laSerieHaUnLimiteDiIntervalliEParametriControllati() throws Exception {
        assertThat(leggi("/api/statistiche/serie?da=2026-01-01&a=2027-02-04&passo=GIORNO").get("intervalli")).hasSize(400);
        JsonNode troppi = errore(get("/api/statistiche/serie?da=2026-01-01&a=2027-02-05&passo=GIORNO"), null, 400);
        assertThat(troppi.get("errore").asText()).contains("400");
        errore(get("/api/statistiche/serie?da=2026-01-01&a=2026-02-01"), null, 400); // passo mancante
        errore(get("/api/statistiche/serie?da=2026-01-01&a=2026-02-01&passo=ANNO"), null, 400);
        errore(get("/api/statistiche/serie?a=2026-02-01&passo=MESE"), null, 400);
        errore(get("/api/statistiche/serie?da=2026-03-01&a=2026-02-01&passo=MESE"), null, 400);
        errore(get("/api/statistiche/serie?da=2026-01-01&a=2026-02-01&passo=MESE&sedi=uno"), null, 400);
        JsonNode vuota = leggi("/api/statistiche/serie?da=2026-01-01&a=2026-01-01&passo=MESE");
        assertThat(vuota.get("intervalli")).hasSize(1);
        assertThat(vuota.get("totale").get("scontrinoMedioCent").isNull()).isTrue();
        assertThat(vuota.get("totale").get("conDati").asBoolean()).isFalse();
    }

    // ---------------------------------------------------------------- esportazione

    @Test
    void lEsportazioneHaITotaliDeiGiorniEUnFoglioPerGiorno() throws Exception {
        ricavo("2026-03-02", 1, 6000);
        ricavo("2026-03-03", 1, 4000);
        extra("2026-03-02", 1, 2000);
        salvaGiorni(giorno(1, "2026-03-02", 9, 4), giorno(1, "2026-03-04", 3, 1));
        byte[] xlsx = scarica("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31");
        assertThat(nomiFogli(xlsx)).containsExactly("Movimenti", "Riepilogo", "Statistiche", "Pizze per giorno");
        String stat = testo(xlsx, "xl/worksheets/sheet3.xml");
        // la settimana: 12 pizze, 5 ordini, ricavi 120 (tutti), extra 20, ricavi dei giorni con dati 80, scontrino 16
        assertThat(stat).contains("Ricavi extra", "Ricavi dei giorni con dati", "Giorni inseriti",
                "<v>12</v>", "<v>5</v>", "<v>120.0</v>", "<v>20.0</v>", "<v>80.0</v>", "<v>16.0</v>");
        String perGiorno = testo(xlsx, "xl/worksheets/sheet4.xml");
        assertThat(perGiorno).contains("Data", "Sede principale", "<v>9</v>", "<v>4</v>", "<v>80.0</v>", "<v>20.0</v>");

        // con statistiche=false nessuno dei due fogli
        byte[] senza = scarica("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31&statistiche=false");
        assertThat(nomiFogli(senza)).containsExactly("Movimenti", "Riepilogo");
    }

    @Test
    void nelFoglioPerGiornoUnGiornoConOrdiniMaSenzaIncassiHaLoScontrinoVuoto() throws Exception {
        ricavo("2026-03-03", 1, 4000);
        salvaGiorni(giorno(1, "2026-03-02", 9, 4), giorno(1, "2026-03-03", 6, 2));
        String perGiorno = testo(scarica("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31"), "xl/worksheets/sheet4.xml");
        // riga 2 = il 2 marzo, 4 ordini e 0 incassi: niente scontrino (come «—» nell'interfaccia), non 0
        assertThat(perGiorno).doesNotContain("r=\"G2\"");
        // riga 3 = il 3 marzo: 40 euro / 2 ordini = 20
        assertThat(perGiorno).containsPattern("r=\"G3\"[^>]*><v>20.0</v>");
    }

    @Test
    void conSoliTotaliSettimanaliIlFoglioPerGiornoNonCe() throws Exception {
        salvaSettimana("2026-03-02", 1, 7, 3);
        byte[] xlsx = scarica("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31");
        assertThat(nomiFogli(xlsx)).containsExactly("Movimenti", "Riepilogo", "Statistiche");
        assertThat(testo(xlsx, "xl/worksheets/sheet3.xml")).contains("Totale settimanale");
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
