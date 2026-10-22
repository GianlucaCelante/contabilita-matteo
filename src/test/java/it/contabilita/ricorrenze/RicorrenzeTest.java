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
        // anche se l'indicatore di avanzamento va perso, il vincolo (ricorrenza, mese) evita i doppioni
        jdbc.update("UPDATE ricorrenza SET ultimo_mese = '2026-01'");
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
}
