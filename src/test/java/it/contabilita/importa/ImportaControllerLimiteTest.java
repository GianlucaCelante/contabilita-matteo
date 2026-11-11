package it.contabilita.importa;

import it.contabilita.allegati.AllegatiService;
import it.contabilita.api.GestoreErrori;
import it.contabilita.api.ImportaController;
import it.contabilita.dati.FornitoreRepository;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.movimenti.AnagraficheService;
import it.contabilita.movimenti.SediService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.util.unit.DataSize;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static it.contabilita.importa.FattureProva.body;
import static it.contabilita.importa.FattureProva.denominazione;
import static it.contabilita.importa.FattureProva.fattura;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Review di s48: il limite di una lettura vale gia' sul caricamento, e a farlo valere e' {@code ImportaController} (chiama
 * {@code controllaCaricamento} prima di portare i file in memoria). Qui passa dal controller vero, senza Spring Boot: il
 * controller, il gestore degli errori e un servizio costruito a mano con un limite di 10.000 byte (come in
 * {@link ImportaMemoriaTest}); con il contesto dei test il limite sarebbe quello della memoria, irraggiungibile.
 */
class ImportaControllerLimiteTest {

    private final ImportazioneService servizio = new ImportazioneService(mock(MovimentoRepository.class), mock(FornitoreRepository.class),
            mock(AnagraficheService.class), mock(AllegatiService.class), mock(SediService.class), mock(PlatformTransactionManager.class),
            Clock.fixed(Instant.parse("2026-01-01T10:00:00Z"), ZoneOffset.UTC), DataSize.ofMegabytes(1), DataSize.ofBytes(10_000));
    private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new ImportaController(servizio)).setControllerAdvice(new GestoreErrori()).build();

    private static MockMultipartFile file(String nome, String numero, int byteTotali) {
        String xml = fattura(denominazione("Forno Rossi Srl", "01234567890"), body("TD01", numero, "2026-10-03", "122.00", "100.00", "22.00"));
        int mancano = byteTotali - xml.getBytes(StandardCharsets.UTF_8).length - "<!---->".length();
        assertThat(mancano).isPositive();
        byte[] b = (xml + "<!--" + "x".repeat(mancano) + "-->").getBytes(StandardCharsets.UTF_8);
        assertThat(b).hasSize(byteTotali);
        return new MockMultipartFile("files", nome, "application/octet-stream", b);
    }

    @Test
    void unCaricamentoOltreIlLimiteDiLetturaRisponde400SenzaLeggereNiente() throws Exception {
        mockMvc.perform(multipart("/api/importa/anteprima").file(file("uno.xml", "L-1", 6_000)).file(file("due.xml", "L-2", 4_001)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errore").value("I file scelti sono troppo grandi tutti insieme (massimo 10000 byte per volta): scegline meno e riprova."))
                .andExpect(jsonPath("$.fatture").doesNotExist());
    }

    @Test
    void unCaricamentoGiustoAlLimiteSiLegge() throws Exception {
        mockMvc.perform(multipart("/api/importa/anteprima").file(file("uno.xml", "L-1", 6_000)).file(file("due.xml", "L-2", 4_000)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fatture.length()").value(2))
                .andExpect(jsonPath("$.errori.length()").value(0));
    }
}
