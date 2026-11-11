package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * La sede «personale» (docs/api.md, "Sedi"): le spese dei titolari. Niente pizze e ordini, fuori dai totali del locale
 * quando il filtro {@code sedi} manca, dentro quando la si sceglie esplicitamente.
 * Settimana usata: lunedi' 2026-03-02 (fino a domenica 8).
 */
class SedePersonaleApiTest extends ProvaBase {

    /** Oggi a fine 2026: i giorni di marzo usati qui sono passati (i giorni futuri non si inseriscono). */
    @BeforeEach
    void oggiAFineAnno() {
        orologio.imposta("2026-12-31");
    }


    private long creaPersonale(String nome) throws Exception {
        JsonNode s = invia(post("/api/sedi"), json.createObjectNode().put("nome", nome).put("personale", true), 201);
        assertThat(s.get("personale").asBoolean()).isTrue();
        return s.get("id").asLong();
    }

    private ObjectNode personale(boolean valore) {
        return json.createObjectNode().put("personale", valore);
    }

    private static List<Long> idsSedi(JsonNode elencoConSede) {
        List<Long> out = new ArrayList<>();
        elencoConSede.forEach(n -> out.add(n.get("sede").get("id").asLong()));
        return out;
    }

    private static List<Long> ids(JsonNode elencoRif) {
        List<Long> out = new ArrayList<>();
        elencoRif.forEach(n -> out.add(n.get("id").asLong()));
        return out;
    }

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

    private byte[] scarica(String url) throws Exception {
        var r = mockMvc.perform(get(url)).andReturn();
        if (r.getRequest().isAsyncStarted()) {
            r = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch(r)).andReturn();
        }
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return r.getResponse().getContentAsByteArray();
    }

    // ---------------------------------------------------------------- anagrafica

    @Test
    void leSediNonSonoPersonaliSeNonLoSiDice() throws Exception {
        assertThat(leggi("/api/sedi").get(0).get("personale").asBoolean()).isFalse();
        JsonNode mare = invia(post("/api/sedi"), json.createObjectNode().put("nome", "Mare"), 201);
        assertThat(mare.get("personale").asBoolean()).isFalse();
    }

    @Test
    void creaEModificaIlFlag() throws Exception {
        long casa = creaPersonale("Spese titolari");
        JsonNode elenco = leggi("/api/sedi");
        assertThat(elenco.get(1).get("id").asLong()).isEqualTo(casa);
        assertThat(elenco.get(1).get("personale").asBoolean()).isTrue();

        // torna normale e poi di nuovo personale; il nome e l'archiviazione non cambiano
        JsonNode r = invia(put("/api/sedi/" + casa), personale(false), 200);
        assertThat(r.get("personale").asBoolean()).isFalse();
        assertThat(r.get("nome").asText()).isEqualTo("Spese titolari");
        assertThat(invia(put("/api/sedi/" + casa), personale(true), 200).get("personale").asBoolean()).isTrue();
        // una modifica senza il campo lo lascia com'e'
        assertThat(invia(put("/api/sedi/" + casa), json.createObjectNode().put("nome", "Casa"), 200)
                .get("personale").asBoolean()).isTrue();
        // se la sede esiste gia', la creazione la restituisce com'e' (il flag del corpo non conta)
        JsonNode esistente = invia(post("/api/sedi"), json.createObjectNode().put("nome", "casa").put("personale", false), 200);
        assertThat(esistente.get("personale").asBoolean()).isTrue();
    }

    @Test
    void lUltimaSedeAttivaNonPersonaleNonDiventaPersonaleENonSiArchivia() throws Exception {
        errore(put("/api/sedi/1"), personale(true), 409);
        long casa = creaPersonale("Casa");
        errore(put("/api/sedi/1"), personale(true), 409);
        // archiviare la principale lascerebbe attiva solo la personale
        errore(put("/api/sedi/1"), json.createObjectNode().put("archiviata", true), 409);
        assertThat(leggi("/api/sedi").get(0).get("personale").asBoolean()).isFalse();
        // tutto o niente: con il 409 non cambia nemmeno il nome; un nome non valido viene prima
        errore(put("/api/sedi/1"), json.createObjectNode().put("nome", "Nuovo nome").put("personale", true), 409);
        assertThat(leggi("/api/sedi").get(0).get("nome").asText()).isEqualTo("Sede principale");
        errore(put("/api/sedi/1"), json.createObjectNode().put("nome", " ").put("personale", true), 400);

        // con un'altra sede vera si puo'
        long mare = creaSede("Mare");
        invia(put("/api/sedi/1"), personale(true), 200);
        errore(put("/api/sedi/" + mare), personale(true), 409);
        errore(put("/api/sedi/" + mare), json.createObjectNode().put("archiviata", true), 409);
        // la personale si archivia senza problemi
        invia(put("/api/sedi/" + casa), json.createObjectNode().put("archiviata", true), 200);
    }

    @Test
    void unaSedeArchiviataPuoDiventarePersonale() throws Exception {
        long mare = creaSede("Mare");
        invia(put("/api/sedi/" + mare), json.createObjectNode().put("archiviata", true), 200);
        assertThat(invia(put("/api/sedi/" + mare), personale(true), 200).get("personale").asBoolean()).isTrue();
    }

    // ---------------------------------------------------------------- pizze e ordini

    @Test
    void nienteInserimentoDiPizzeEOrdiniPerLaSedePersonale() throws Exception {
        long casa = creaPersonale("Casa");
        JsonNode e = errore(put("/api/statistiche/settimana"), corpoSettimana("2026-03-02", casa, 10, 5), 400);
        assertThat(e.get("errore").asText()).contains("Casa").contains("personale");
        errore(put("/api/statistiche/giorni"), corpoGiorno("2026-03-03", casa, 10, 5), 400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM dati_settimana", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM dati_giorno", Integer.class)).isZero();
    }

    @Test
    void laSedePersonaleNonCompareNellePizzeNeTraLeMancanti() throws Exception {
        long casa = creaPersonale("Casa");
        crea(inSede(movimento("2026-03-03", "RICAVO", "RICAVO_FATTURATO", 10000), 1));
        crea(inSede(movimento("2026-03-03", "RICAVO", "RICAVO_EXTRA", 7000), casa)); // un ricavo strano: non deve contare

        assertThat(idsSedi(leggi("/api/statistiche/settimana?data=2026-03-04").get("sedi"))).containsExactly(1L);

        JsonNode r = leggi("/api/statistiche?da=2026-03-02&a=2026-03-08");
        assertThat(idsSedi(r.get("perSede"))).containsExactly(1L);
        assertThat(ids(r.get("settimane").get(0).get("sediMancanti"))).containsExactly(1L);
        assertThat(r.get("totale").get("ricaviTotaliCent").asLong()).isEqualTo(10000);
        // anche scelta esplicitamente: non ha pizze e ordini, nelle statistiche non c'e'
        JsonNode sola = leggi("/api/statistiche?da=2026-03-02&a=2026-03-08&sedi=" + casa);
        assertThat(sola.get("perSede")).isEmpty();
        assertThat(sola.get("settimane").get(0).get("sediMancanti")).isEmpty();
        assertThat(sola.get("totale").get("ricaviTotaliCent").asLong()).isZero();

        JsonNode serie = leggi("/api/statistiche/serie?da=2026-03-02&a=2026-03-08&passo=SETTIMANA");
        assertThat(serie.get("totale").get("ricaviTotaliCent").asLong()).isEqualTo(10000);
        JsonNode serieCasa = leggi("/api/statistiche/serie?da=2026-03-02&a=2026-03-08&passo=SETTIMANA&sedi=1," + casa);
        assertThat(serieCasa.get("totale").get("ricaviTotaliCent").asLong()).isEqualTo(10000);
    }

    @Test
    void segnarePersonaleUnaSedeConPizzeLasciaIDatiMaNonContano() throws Exception {
        long mare = creaSede("Mare");
        invia(put("/api/statistiche/settimana"), corpoSettimana("2026-03-02", mare, 100, 40), 200);
        invia(put("/api/statistiche/giorni"), corpoGiorno("2026-03-10", mare, 20, 8), 200);
        invia(put("/api/sedi/" + mare), personale(true), 200);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM dati_settimana", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM dati_giorno", Integer.class)).isEqualTo(1);
        JsonNode r = leggi("/api/statistiche?da=2026-03-02&a=2026-03-15&sedi=1," + mare);
        assertThat(r.get("totale").get("pizze").asLong()).isZero();
        assertThat(idsSedi(r.get("perSede"))).containsExactly(1L);
        assertThat(leggi("/api/statistiche/serie?da=2026-03-02&a=2026-03-15&passo=GIORNO&sedi=" + mare)
                .get("totale").get("pizze").asLong()).isZero();
        assertThat(idsSedi(leggi("/api/statistiche/settimana?data=2026-03-02").get("sedi"))).containsExactly(1L);

        // tornata normale, i dati tornano a contare
        invia(put("/api/sedi/" + mare), personale(false), 200);
        assertThat(leggi("/api/statistiche?da=2026-03-02&a=2026-03-15").get("totale").get("pizze").asLong()).isEqualTo(120);
    }

    // ---------------------------------------------------------------- filtro sedi

    @Test
    void senzaFiltroLaSedePersonaleResteFuoriDaiTotaliConIlFiltroEntra() throws Exception {
        long casa = creaPersonale("Casa");
        long mare = creaSede("Mare");
        crea(inSede(movimento("2026-03-03", "RICAVO", "RICAVO_FATTURATO", 10000), 1));
        crea(inSede(movimento("2026-03-03", "COSTO_VARIABILE", "SCONTRINO", 2000).put("categoria", "Spesa"), mare));
        crea(inSede(movimento("2026-03-04", "COSTO_VARIABILE", "SCONTRINO", 5000).put("categoria", "Spesa")
                .put("descrizione", "Spesa dei titolari"), casa));

        // movimenti
        JsonNode tutti = leggi("/api/movimenti?da=2026-03-01&a=2026-03-31");
        assertThat(tutti.get("elementi")).hasSize(2);
        assertThat(tutti.get("totali").get("costiCent").asLong()).isEqualTo(2000);
        assertThat(leggi("/api/movimenti?da=2026-03-01&a=2026-03-31&sedi=" + casa).get("elementi")).hasSize(1);
        assertThat(leggi("/api/movimenti?da=2026-03-01&a=2026-03-31&sedi=1," + mare + "," + casa).get("elementi")).hasSize(3);

        // riepilogo
        JsonNode riep = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31");
        assertThat(riep.get("costiCent").asLong()).isEqualTo(2000);
        assertThat(idsSedi(riep.get("perSede"))).containsExactly(1L, mare);
        JsonNode riepCasa = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31&sedi=" + casa);
        assertThat(riepCasa.get("costiCent").asLong()).isEqualTo(5000);
        assertThat(idsSedi(riepCasa.get("perSede"))).containsExactly(casa);

        // statistiche per voce
        assertThat(leggi("/api/statistiche/voci?da=2026-03-01&a=2026-03-31&raggruppa=CATEGORIA&tipo=COSTO_VARIABILE")
                .get("totaleCent").asLong()).isEqualTo(2000);
        assertThat(leggi("/api/statistiche/voci?da=2026-03-01&a=2026-03-31&raggruppa=CATEGORIA&tipo=COSTO_VARIABILE&sedi=" + casa)
                .get("totaleCent").asLong()).isEqualTo(5000);

        // esportazione
        String csv = new String(scarica("/api/esporta?formato=csv&da=2026-03-01&a=2026-03-31"), StandardCharsets.UTF_8);
        assertThat(csv).doesNotContain("Spesa dei titolari");
        String csvCasa = new String(scarica("/api/esporta?formato=csv&da=2026-03-01&a=2026-03-31&sedi=" + casa), StandardCharsets.UTF_8);
        assertThat(csvCasa).contains("Spesa dei titolari");
        scarica("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31&colonnePerSede=true");
    }

    @Test
    void anchePersonaleEArchiviataResteFuoriSenzaFiltro() throws Exception {
        long casa = creaPersonale("Casa");
        crea(inSede(movimento("2026-03-04", "COSTO_VARIABILE", "SCONTRINO", 5000), casa));
        invia(put("/api/sedi/" + casa), json.createObjectNode().put("archiviata", true), 200);
        assertThat(leggi("/api/movimenti?da=2026-03-01&a=2026-03-31").get("elementi")).isEmpty();
        assertThat(leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31").get("costiCent").asLong()).isZero();
        assertThat(leggi("/api/movimenti?da=2026-03-01&a=2026-03-31&sedi=" + casa).get("elementi")).hasSize(1);
    }

    @Test
    void dividiSenzaSediEscludeLaPersonaleConLeSediEsplicitaLaInclude() throws Exception {
        long casa = creaPersonale("Casa");
        long mare = creaSede("Mare");
        JsonNode parti = invia(post("/api/movimenti/dividi"), movimento("2026-03-03", "COSTO_FISSO", "NESSUNO", 1000), 201);
        assertThat(parti).hasSize(2);
        List<Long> sedi = new ArrayList<>();
        parti.forEach(p -> sedi.add(p.get("sede").get("id").asLong()));
        assertThat(sedi).containsExactly(1L, mare);

        JsonNode conCasa = invia(post("/api/movimenti/dividi?sedi=1," + casa),
                movimento("2026-03-03", "COSTO_FISSO", "NESSUNO", 1000), 201);
        assertThat(conCasa).hasSize(2);
    }
}
