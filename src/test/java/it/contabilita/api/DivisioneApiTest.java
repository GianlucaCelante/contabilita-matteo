package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import it.contabilita.ricorrenze.RicorrenzeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * L'identificativo comune dei movimenti divisi fra sedi ({@code divisione}; docs/api.md, «Movimenti») e i conteggi delle
 * statistiche per voce, dove le parti di una divisione valgono un movimento solo.
 */
class DivisioneApiTest extends ProvaBase {

    @Autowired
    private RicorrenzeService ricorrenze;

    private ObjectNode fattura(String data, long importoCent, String numero) {
        ObjectNode corpo = movimento(data, "COSTO_VARIABILE", "FATTURA", importoCent);
        corpo.put("fornitore", "Forno Prova");
        if (numero != null) {
            corpo.put("numeroDocumento", numero);
        }
        return corpo;
    }

    private static String divisione(JsonNode movimento) {
        assertThat(movimento.has("divisione")).as("il campo divisione c'è sempre").isTrue();
        return movimento.get("divisione").isNull() ? null : movimento.get("divisione").asText();
    }

    @Test
    void dividiAssegnaLoStessoIdATutteLePartiEUnMovimentoNormaleNonLoHa() throws Exception {
        creaSede("Sede Mare");
        creaSede("Sede Monti");
        JsonNode parti = invia(post("/api/movimenti/dividi"), fattura("2026-03-10", 1000, "F/1"), 201);
        assertThat(parti).hasSize(3);
        String id = divisione(parti.get(0));
        assertThat(id).isNotBlank();
        assertThat(parti).allSatisfy(p -> assertThat(divisione(p)).isEqualTo(id));

        // un'altra divisione ha un altro id; un movimento normale non ne ha
        JsonNode altre = invia(post("/api/movimenti/dividi"), fattura("2026-03-10", 1000, "F/1"), 201);
        assertThat(divisione(altre.get(0))).isNotBlank().isNotEqualTo(id);
        JsonNode normale = invia(post("/api/movimenti"), inSede(fattura("2026-03-11", 500, "F/2"), 1), 201);
        assertThat(divisione(normale)).isNull();

        // si rilegge dall'elenco e dal singolo movimento
        long primo = parti.get(0).get("id").asLong();
        assertThat(divisione(leggi("/api/movimenti/" + primo))).isEqualTo(id);
        int conId = 0;
        for (JsonNode m : leggi("/api/movimenti").get("elementi")) {
            if (id.equals(divisione(m))) {
                conId++;
            }
        }
        assertThat(conId).isEqualTo(3);
    }

    @Test
    void conUnaSolaParteNonCEDivisione() throws Exception {
        JsonNode sola = invia(post("/api/movimenti/dividi"), fattura("2026-03-10", 1000, "F/1"), 201);
        assertThat(sola).hasSize(1);
        assertThat(divisione(sola.get(0))).isNull();
        // un centesimo fra due sedi: una parte sola, quindi nessuna divisione
        creaSede("Sede Mare");
        JsonNode unCent = invia(post("/api/movimenti/dividi"), fattura("2026-03-10", 1, "F/2"), 201);
        assertThat(unCent).hasSize(1);
        assertThat(divisione(unCent.get(0))).isNull();
    }

    @Test
    void modificareOEliminareUnaParteNonCambiaLIdDelleAltre() throws Exception {
        long mare = creaSede("Sede Mare");
        creaSede("Sede Monti");
        JsonNode parti = invia(post("/api/movimenti/dividi"), fattura("2026-03-10", 900, "F/1"), 201);
        String id = divisione(parti.get(0));
        long prima = parti.get(0).get("id").asLong();
        long seconda = parti.get(1).get("id").asLong();
        long terza = parti.get(2).get("id").asLong();

        // modifica (importo, data, sede): l'id resta, anche se il corpo prova a cambiarlo
        ObjectNode corpo = inSede(fattura("2026-03-12", 450, "F/1"), mare);
        corpo.put("divisione", "altro");
        JsonNode modificata = invia(put("/api/movimenti/" + prima), corpo, 200);
        assertThat(divisione(modificata)).isEqualTo(id);
        assertThat(modificata.get("sede").get("id").asLong()).isEqualTo(mare);
        // «pagata» cambia solo quel campo
        assertThat(divisione(invia(put("/api/movimenti/" + seconda + "/pagata"), json.createObjectNode().put("pagata", true), 200))).isEqualTo(id);

        mockMvc.perform(delete("/api/movimenti/" + terza)).andExpect(status().isNoContent());
        assertThat(divisione(leggi("/api/movimenti/" + prima))).isEqualTo(id);
        assertThat(divisione(leggi("/api/movimenti/" + seconda))).isEqualTo(id);
    }

    @Test
    void laRipetizioneDivisaDaUnIdComunePerOgniScadenza() throws Exception {
        long mare = creaSede("Sede Mare");
        ObjectNode affitto = movimento("2026-01-10", "COSTO_FISSO", "NESSUNO", 100001);
        affitto.put("categoria", "Affitto");
        affitto.putObject("ricorrenza").put("giorno", 10);
        JsonNode creati = invia(post("/api/movimenti/dividi?sedi=1," + mare), affitto, 201);
        assertThat(creati).hasSize(2);
        String primoId = divisione(creati.get(0));
        assertThat(primoId).isNotBlank();
        assertThat(divisione(creati.get(1))).isEqualTo(primoId);

        orologio.imposta("2026-03-15");
        assertThat(ricorrenze.generaOccorrenzeMancanti(LocalDate.of(2026, 3, 15))).isEqualTo(4); // febbraio e marzo, due sedi

        // per ogni data: due parti (una per sede) con lo stesso id; ogni data ha il suo
        Map<String, Set<String>> idPerData = new HashMap<>();
        Map<String, Integer> partiPerData = new HashMap<>();
        for (JsonNode m : leggi("/api/movimenti").get("elementi")) {
            String data = m.get("data").asText();
            assertThat(divisione(m)).as("divisione del " + data).isNotBlank();
            idPerData.computeIfAbsent(data, k -> new HashSet<>()).add(divisione(m));
            partiPerData.merge(data, 1, Integer::sum);
        }
        assertThat(partiPerData).containsOnlyKeys("2026-01-10", "2026-02-10", "2026-03-10");
        assertThat(partiPerData.values()).containsOnly(2);
        assertThat(idPerData.values()).allSatisfy(ids -> assertThat(ids).hasSize(1));
        Set<String> tutti = new HashSet<>();
        idPerData.values().forEach(tutti::addAll);
        assertThat(tutti).hasSize(3).contains(primoId);
    }

    @Test
    void unaRipetizioneNonDivisaNonHaDivisione() throws Exception {
        ObjectNode affitto = inSede(movimento("2026-01-10", "COSTO_FISSO", "NESSUNO", 1000), 1);
        affitto.putObject("ricorrenza").put("giorno", 10);
        invia(post("/api/movimenti"), affitto, 201);
        ricorrenze.generaOccorrenzeMancanti(LocalDate.of(2026, 3, 15));
        JsonNode elenco = leggi("/api/movimenti").get("elementi");
        assertThat(elenco).hasSize(3);
        assertThat(elenco).allSatisfy(m -> assertThat(divisione(m)).isNull());
    }

    // ---------------------------------------------------------------- statistiche per voce: una divisione vale 1

    private JsonNode voce(JsonNode risposta, String nome) {
        for (JsonNode v : risposta.get("voci")) {
            if (v.get("nome").asText().equals(nome)) {
                return v;
            }
        }
        throw new AssertionError("voce non trovata: " + nome);
    }

    @Test
    void nelleStatistichePerVoceUnaFatturaDivisaContaUnaVoltaEGliImportiRestanoPerSede() throws Exception {
        long mare = creaSede("Sede Mare");
        long monti = creaSede("Sede Monti");
        invia(post("/api/movimenti/dividi"), fattura("2026-03-10", 1000, "F/1"), 201);   // 334 + 333 + 333
        invia(post("/api/movimenti"), inSede(fattura("2026-03-20", 500, "F/2"), 1), 201);
        invia(post("/api/movimenti"), inSede(fattura("2026-04-02", 700, "F/3"), mare), 201);

        JsonNode tutte = leggi("/api/statistiche/voci?da=2026-03-01&a=2026-04-30&raggruppa=FORNITORE");
        JsonNode forno = voce(tutte, "Forno Prova");
        assertThat(forno.get("totaleCent").asLong()).isEqualTo(2200);
        assertThat(forno.get("movimenti").asInt()).isEqualTo(3); // la divisa, F/2, F/3
        assertThat(forno.get("movimentiPerMese")).extracting(JsonNode::asInt).containsExactly(2, 1);
        assertThat(forno.get("perMese")).extracting(JsonNode::asLong).containsExactly(1500L, 700L);
        assertThat(tutte.get("movimenti").asInt()).isEqualTo(3);

        // il filtro di sede ne prende una parte sola: conta 1, con il solo importo di quella sede
        JsonNode soloMonti = leggi("/api/statistiche/voci?da=2026-03-01&a=2026-04-30&raggruppa=FORNITORE&sedi=" + monti);
        assertThat(voce(soloMonti, "Forno Prova").get("movimenti").asInt()).isEqualTo(1);
        assertThat(voce(soloMonti, "Forno Prova").get("totaleCent").asLong()).isEqualTo(333);
        assertThat(soloMonti.get("movimenti").asInt()).isEqualTo(1);

        // due sedi su tre: la divisa conta sempre 1, con la somma delle due parti
        JsonNode due = leggi("/api/statistiche/voci?da=2026-03-01&a=2026-03-31&raggruppa=FORNITORE&sedi=1," + mare);
        assertThat(voce(due, "Forno Prova").get("movimenti").asInt()).isEqualTo(2);
        assertThat(voce(due, "Forno Prova").get("totaleCent").asLong()).isEqualTo(334 + 333 + 500);

        // per categoria (qui «Senza categoria») vale lo stesso
        JsonNode categorie = leggi("/api/statistiche/voci?da=2026-03-01&a=2026-04-30&raggruppa=CATEGORIA&tipo=COSTI");
        assertThat(categorie.get("voci").get(0).get("movimenti").asInt()).isEqualTo(3);
    }

    @Test
    void lePartiFiniteInVociDiverseContanoUnaVoltaPerVoce() throws Exception {
        creaSede("Sede Mare");
        JsonNode parti = invia(post("/api/movimenti/dividi"), fattura("2026-03-10", 1000, "F/1"), 201);
        // una parte cambia fornitore: la divisione ora tocca due voci, e conta una volta in ciascuna
        ObjectNode corpo = fattura("2026-03-10", 500, "F/1");
        corpo.put("fornitore", "Altro Forno");
        invia(put("/api/movimenti/" + parti.get(1).get("id").asLong()), corpo, 200);
        JsonNode r = leggi("/api/statistiche/voci?da=2026-03-01&a=2026-03-31&raggruppa=FORNITORE");
        assertThat(voce(r, "Forno Prova").get("movimenti").asInt()).isEqualTo(1);
        assertThat(voce(r, "Altro Forno").get("movimenti").asInt()).isEqualTo(1);
        assertThat(r.get("movimenti").asInt()).isEqualTo(2);
    }
}
