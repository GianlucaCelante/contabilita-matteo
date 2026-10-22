package it.contabilita.importa;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import static it.contabilita.importa.FattureProva.body;
import static it.contabilita.importa.FattureProva.byt;
import static it.contabilita.importa.FattureProva.denominazione;
import static it.contabilita.importa.FattureProva.fattura;
import static it.contabilita.importa.FattureProva.persona;
import static it.contabilita.importa.FattureProva.voci;
import static it.contabilita.importa.FattureProva.zip;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Anteprima e conferma dell'importazione (docs/api.md, fase 4). */
class ImportaApiTest extends ProvaBase {

    private final String forno = fattura(denominazione("Forno Rossi Srl", "01234567890"),
            body("TD01", "FT-1", "2026-10-03", "122.00", "100.00", "22.00"));
    private final String mario = fattura(persona("Mario", "Bianchi", "09876543210"),
            body("TD01", "7", "2026-10-05", "50.00", "40.98", "9.02"));
    private final String lotto = fattura(denominazione("Grossista Neri", "22222222222"),
            body("TD01", "1", "2026-10-06", "122.00", "100.00", "22.00"),
            body("TD01", "2", "2026-10-07", "61.00", "50.00", "11.00"));

    private JsonNode anteprima(MockMultipartFileSpec... file) throws Exception {
        var req = multipart("/api/importa/anteprima");
        for (MockMultipartFileSpec f : file) {
            req.file(new MockMultipartFile("files", f.nome, "application/octet-stream", f.byt));
        }
        var r = mockMvc.perform(req);
        assertThat(r.andReturn().getResponse().getStatus()).as(r.andReturn().getResponse().getContentAsString()).isEqualTo(200);
        return corpo(r);
    }

    private record MockMultipartFileSpec(String nome, byte[] byt) {
    }

    private static MockMultipartFileSpec f(String nome, String contenuto) {
        return new MockMultipartFileSpec(nome, byt(contenuto));
    }

    private ObjectNode conferma(String id, Object... indiceCategoria) {
        ObjectNode c = json.createObjectNode();
        c.put("importazioneId", id);
        ArrayNode righe = c.putArray("righe");
        for (int i = 0; i < indiceCategoria.length; i += 2) {
            ObjectNode r = righe.addObject();
            r.put("indice", (Integer) indiceCategoria[i]);
            if (indiceCategoria[i + 1] == null) {
                r.putNull("categoria");
            } else {
                r.put("categoria", (String) indiceCategoria[i + 1]);
            }
        }
        return c;
    }

    @Test
    void anteprimaLeggeXmlZipELottoSenzaSalvareMovimenti() throws Exception {
        byte[] z = zip(voci("a/forno.xml", forno, "mario.xml", mario));
        JsonNode a = anteprima(new MockMultipartFileSpec("tutte.zip", z), f("lotto.xml", lotto));
        assertThat(a.get("importazioneId").asText()).isNotBlank();
        assertThat(a.get("errori")).isEmpty();
        JsonNode fatture = a.get("fatture");
        assertThat(fatture).hasSize(4);
        JsonNode prima = fatture.get(0);
        assertThat(prima.get("indice").asInt()).isEqualTo(0);
        assertThat(prima.get("nomeFile").asText()).isEqualTo("tutte.zip › a/forno.xml");
        assertThat(prima.get("fornitore").get("nome").asText()).isEqualTo("Forno Rossi Srl");
        assertThat(prima.get("fornitore").get("partitaIva").asText()).isEqualTo("01234567890");
        assertThat(prima.get("numero").asText()).isEqualTo("FT-1");
        assertThat(prima.get("data").asText()).isEqualTo("2026-10-03");
        assertThat(prima.get("imponibileCent").asLong()).isEqualTo(10000);
        assertThat(prima.get("ivaCent").asLong()).isEqualTo(2200);
        assertThat(prima.get("totaleCent").asLong()).isEqualTo(12200);
        assertThat(prima.get("categoriaSuggerita").isNull()).isTrue();
        assertThat(prima.get("duplicata").asBoolean()).isFalse();
        assertThat(prima.get("motivo").isNull()).isTrue();
        assertThat(fatture.get(1).get("fornitore").get("nome").asText()).isEqualTo("Mario Bianchi");
        assertThat(fatture.get(2).get("numero").asText()).isEqualTo("1");
        assertThat(fatture.get(3).get("numero").asText()).isEqualTo("2");
        assertThat(leggi("/api/movimenti").get("elementi")).isEmpty();
    }

    @Test
    void erroriPerFileNonLettiNoteDiCreditoETipiNonAmmessi() throws Exception {
        String nc = fattura(denominazione("Forno Rossi Srl", "01234567890"), body("TD04", "NC-1", "2026-10-09", "10.00", "8.20", "1.80"));
        String autofattura = fattura(denominazione("Forno Rossi Srl", "01234567890"), body("TD17", "AF-1", "2026-10-09", "10.00", "8.20", "1.80"));
        String xxe = "<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><x>&e;</x>";
        JsonNode a = anteprima(f("ok.xml", forno), f("nc.xml", nc), f("af.xml", autofattura), f("rotto.xml", "non xml"),
                f("xxe.xml", xxe), f("immagine.png", "x"));
        assertThat(a.get("fatture")).hasSize(1);
        assertThat(a.get("errori")).hasSize(5);
        java.util.Map<String, String> perFile = new java.util.HashMap<>();
        a.get("errori").forEach(e -> perFile.put(e.get("nomeFile").asText(), e.get("messaggio").asText()));
        assertThat(perFile.get("nc.xml")).isEqualTo("Nota di credito: non importata");
        assertThat(perFile.get("af.xml")).contains("TD17").contains("non importata");
        assertThat(perFile.keySet()).containsExactlyInAnyOrder("nc.xml", "af.xml", "rotto.xml", "xxe.xml", "immagine.png");
    }

    @Test
    void anteprimaSenzaFile400() throws Exception {
        errore(multipart("/api/importa/anteprima"), null, 400);
    }

    @Test
    void laConfermaCreaMovimentiConFornitoreCategoriaEAllegatoXml() throws Exception {
        JsonNode a = anteprima(f("forno.xml", forno), f("mario.xml", mario));
        String id = a.get("importazioneId").asText();
        JsonNode esito = invia(post("/api/importa/conferma"), conferma(id, 0, "Pane e farine", 1, null), 200);
        assertThat(esito.get("importati").asInt()).isEqualTo(2);
        assertThat(esito.get("ignorate")).isEmpty();

        JsonNode el = leggi("/api/movimenti").get("elementi");
        assertThat(el).hasSize(2);
        JsonNode m = Stream.of(el.get(0), el.get(1)).filter(x -> x.get("numeroDocumento").asText().equals("FT-1")).findFirst().orElseThrow();
        assertThat(m.get("tipo").asText()).isEqualTo("COSTO_VARIABILE");
        assertThat(m.get("documento").asText()).isEqualTo("FATTURA");
        assertThat(m.get("origine").asText()).isEqualTo("XML");
        assertThat(m.get("importoCent").asLong()).isEqualTo(12200);
        assertThat(m.get("data").asText()).isEqualTo("2026-10-03");
        assertThat(m.get("fornitore").get("nome").asText()).isEqualTo("Forno Rossi Srl");
        assertThat(m.get("categoria").get("nome").asText()).isEqualTo("Pane e farine");
        assertThat(m.get("allegatoNome").asText()).isEqualTo("forno.xml");

        // il fornitore ha salvato la partita IVA
        JsonNode fornitori = leggi("/api/fornitori?q=forno");
        assertThat(fornitori.get(0).get("partitaIva").asText()).isEqualTo("01234567890");
        // l'allegato e' l'XML originale
        var risposta = mockMvc.perform(get("/api/movimenti/" + m.get("id").asLong() + "/allegato")).andReturn().getResponse();
        assertThat(risposta.getStatus()).isEqualTo(200);
        assertThat(risposta.getContentType()).startsWith("application/xml");
        assertThat(risposta.getContentAsByteArray()).isEqualTo(byt(forno));
        // la categoria e' di tipo costo variabile
        assertThat(leggi("/api/categorie?tipo=COSTO_VARIABILE").toString()).contains("Pane e farine");
    }

    @Test
    void ilFornitoreEsistenteSenzaPartitaIvaLaRiceve() throws Exception {
        invia(post("/api/fornitori"), "{\"nome\":\"forno rossi srl\"}", 201);
        JsonNode a = anteprima(f("forno.xml", forno));
        invia(post("/api/importa/conferma"), conferma(a.get("importazioneId").asText(), 0, null), 200);
        JsonNode fornitori = leggi("/api/fornitori");
        assertThat(fornitori).hasSize(1);
        assertThat(fornitori.get(0).get("partitaIva").asText()).isEqualTo("01234567890");
    }

    @Test
    void ilFornitoreCheEsisteConLaStessaPartitaIvaNonVieneDuplicato() throws Exception {
        invia(post("/api/fornitori"), "{\"nome\":\"Rossi Forno\",\"partitaIva\":\"01234567890\"}", 201);
        JsonNode a = anteprima(f("forno.xml", forno));
        invia(post("/api/importa/conferma"), conferma(a.get("importazioneId").asText(), 0, null), 200);
        assertThat(leggi("/api/fornitori")).hasSize(1);
        assertThat(leggi("/api/movimenti").get("elementi").get(0).get("fornitore").get("nome").asText()).isEqualTo("Rossi Forno");
    }

    @Test
    void ilSecondoGiroMostraLeDuplicateEIlConfermaLeIgnoraComunque() throws Exception {
        JsonNode a = anteprima(f("forno.xml", forno));
        invia(post("/api/importa/conferma"), conferma(a.get("importazioneId").asText(), 0, "Pane"), 200);

        JsonNode b = anteprima(f("forno.xml", forno), f("mario.xml", mario));
        JsonNode primo = b.get("fatture").get(0);
        assertThat(primo.get("duplicata").asBoolean()).isTrue();
        assertThat(primo.get("motivo").asText()).startsWith("Già registrata il ").matches(".*\\d{2}/\\d{2}");
        assertThat(primo.get("categoriaSuggerita").asText()).isEqualTo("Pane");
        assertThat(b.get("fatture").get(1).get("duplicata").asBoolean()).isFalse();

        // anche se selezionata, la duplicata si ignora; l'altra passa
        JsonNode esito = invia(post("/api/importa/conferma"), conferma(b.get("importazioneId").asText(), 0, "Pane", 1, null), 200);
        assertThat(esito.get("importati").asInt()).isEqualTo(1);
        assertThat(esito.get("ignorate")).hasSize(1);
        assertThat(esito.get("ignorate").get(0).get("indice").asInt()).isEqualTo(0);
        assertThat(esito.get("ignorate").get(0).get("motivo").asText()).isNotBlank();
        assertThat(leggi("/api/movimenti").get("elementi")).hasSize(2);
    }

    @Test
    void duplicatiAncheTraLeRigheDelloStessoLotto() throws Exception {
        JsonNode a = anteprima(f("uno.xml", forno), f("due.xml", forno));
        assertThat(a.get("fatture").get(0).get("duplicata").asBoolean()).isFalse();
        assertThat(a.get("fatture").get(1).get("duplicata").asBoolean()).isTrue();
        JsonNode esito = invia(post("/api/importa/conferma"), conferma(a.get("importazioneId").asText(), 0, null, 1, null), 200);
        assertThat(esito.get("importati").asInt()).isEqualTo(1);
        assertThat(esito.get("ignorate")).hasSize(1);
    }

    @Test
    void ilDuplicatoSiRiconosceAncheConStessoNomeSenzaPartitaIva() throws Exception {
        crea(movimento("2026-10-03", "COSTO_VARIABILE", "FATTURA", 12200).put("fornitore", "FORNO ROSSI SRL").put("numeroDocumento", "FT-1"));
        JsonNode a = anteprima(f("forno.xml", forno));
        assertThat(a.get("fatture").get(0).get("duplicata").asBoolean()).isTrue();
        // stessa fattura ma numero diverso: non e' duplicata
        JsonNode b = anteprima(f("altra.xml", forno.replace("<Numero>FT-1<", "<Numero>FT-2<")));
        assertThat(b.get("fatture").get(0).get("duplicata").asBoolean()).isFalse();
    }

    @Test
    void laCategoriaSuggeritaEL_UltimaUsataPerQuelFornitore() throws Exception {
        crea(movimento("2026-09-01", "COSTO_VARIABILE", "FATTURA", 1000).put("fornitore", "Forno Rossi Srl").put("categoria", "Vecchia"));
        crea(movimento("2026-09-20", "COSTO_VARIABILE", "FATTURA", 1000).put("fornitore", "Forno Rossi Srl").put("categoria", "Recente"));
        crea(movimento("2026-09-25", "COSTO_VARIABILE", "SCONTRINO", 1000).put("fornitore", "Altro").put("categoria", "Altra"));
        JsonNode a = anteprima(f("forno.xml", forno), f("mario.xml", mario));
        assertThat(a.get("fatture").get(0).get("categoriaSuggerita").asText()).isEqualTo("Recente");
        assertThat(a.get("fatture").get(1).get("categoriaSuggerita").isNull()).isTrue();
    }

    @Test
    void ilLottoCreaUnMovimentoPerBodyConLoStessoXmlAllegato() throws Exception {
        JsonNode a = anteprima(f("lotto.xml", lotto));
        invia(post("/api/importa/conferma"), conferma(a.get("importazioneId").asText(), 0, null, 1, null), 200);
        JsonNode el = leggi("/api/movimenti").get("elementi");
        assertThat(el).hasSize(2);
        for (JsonNode m : el) {
            var r = mockMvc.perform(get("/api/movimenti/" + m.get("id").asLong() + "/allegato")).andReturn().getResponse();
            assertThat(r.getContentAsByteArray()).isEqualTo(byt(lotto));
        }
    }

    @Test
    void ilP7mSiAllegaComeFileOriginale() throws Exception {
        byte[] p7m = FattureProva.p7mContiguo(byt(forno));
        JsonNode a = anteprima(new MockMultipartFileSpec("forno.xml.p7m", p7m));
        assertThat(a.get("fatture")).hasSize(1);
        invia(post("/api/importa/conferma"), conferma(a.get("importazioneId").asText(), 0, null), 200);
        JsonNode m = leggi("/api/movimenti").get("elementi").get(0);
        assertThat(m.get("allegatoNome").asText()).isEqualTo("forno.xml.p7m");
        var r = mockMvc.perform(get("/api/movimenti/" + m.get("id").asLong() + "/allegato")).andReturn().getResponse();
        assertThat(r.getContentAsByteArray()).isEqualTo(p7m);
    }

    @Test
    void importazioneScadutaOSconosciuta404() throws Exception {
        JsonNode a = anteprima(f("forno.xml", forno));
        String id = a.get("importazioneId").asText();
        orologio.imposta("2026-01-01"); // 10:00
        orologio.avanza(29 * 60);
        // ancora valida a 29 minuti
        invia(post("/api/importa/conferma"), conferma(id, 0, null), 200);

        JsonNode b = anteprima(f("mario.xml", mario));
        orologio.avanza(31 * 60);
        JsonNode e = invia(post("/api/importa/conferma"), conferma(b.get("importazioneId").asText(), 0, null), 404);
        assertThat(e.get("errore").asText()).isEqualTo("L'importazione è scaduta: rileggi i file.");
        invia(post("/api/importa/conferma"), conferma("non-esiste", 0, null), 404);
    }

    @Test
    void unaRigaCheFallisceNonBloccaLeAltre() throws Exception {
        JsonNode a = anteprima(f("forno.xml", forno), f("mario.xml", mario));
        String id = a.get("importazioneId").asText();
        String nomeTroppoLungo = "x".repeat(200);
        JsonNode esito = invia(post("/api/importa/conferma"), conferma(id, 0, nomeTroppoLungo, 1, "Ok", 7, null, 1, "Ok"), 200);
        assertThat(esito.get("importati").asInt()).isEqualTo(1);
        assertThat(esito.get("ignorate")).hasSize(3); // categoria troppo lunga, indice 7 inesistente, indice 1 ripetuto
        assertThat(leggi("/api/movimenti").get("elementi")).hasSize(1);
        assertThat(leggi("/api/fornitori")).hasSize(1); // la riga fallita non ha lasciato il fornitore a meta'
        try (Stream<Path> s = Files.list(CARTELLA_DATI.resolve("allegati"))) {
            assertThat(s.count()).isEqualTo(1); // ne' file orfani
        }
    }

    @Test
    void corpoDellaConfermaNonValido400() throws Exception {
        errore(post("/api/importa/conferma"), "{\"righe\":[]}", 400);
    }
}
