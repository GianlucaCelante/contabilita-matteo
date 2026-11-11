package it.contabilita.importa;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockMultipartFile;

import java.util.List;

import static it.contabilita.importa.FattureProva.body;
import static it.contabilita.importa.FattureProva.byt;
import static it.contabilita.importa.FattureProva.denominazione;
import static it.contabilita.importa.FattureProva.fattura;
import static it.contabilita.importa.FattureProva.voci;
import static it.contabilita.importa.FattureProva.zip;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/**
 * s40: i nomi dei file (e gli altri valori che arrivano dal cliente) si scrivono nel log senza a capo e senza caratteri di
 * controllo, cosi' con un nome di file non si puo' scrivere una riga di log finta.
 */
class ImportaLogTest extends ProvaBase {

    private static final String FINTA = "\r\n2026-01-01T10:00:00 INFO  it.contabilita.accesso : accesso riuscito";

    private final Logger logger = (Logger) LoggerFactory.getLogger("it.contabilita.importa");
    private final ListAppender<ILoggingEvent> righe = new ListAppender<>();

    @BeforeEach
    void ascolta() {
        righe.start();
        logger.addAppender(righe);
    }

    @AfterEach
    void smetti() {
        logger.detachAppender(righe);
    }

    private void anteprima(String nome, byte[] contenuto) throws Exception {
        mockMvc.perform(multipart("/api/importa/anteprima").file(new MockMultipartFile("files", nome, "application/octet-stream", contenuto)));
    }

    private List<String> scritte() {
        return righe.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
    }

    @Test
    void ilNomeDelFileNonPuoAndareACapoNelLog() throws Exception {
        String tipoNonGestito = fattura(denominazione("Forno Rossi Srl", "01234567890"), body("TD26", "D-1", "2026-10-09", "10.00", "8.20", "1.80"));
        anteprima("rotto" + FINTA + ".xml", byt("non è una fattura"));                // ImportazioneService: file non leggibile
        anteprima("debito" + FINTA + ".xml", byt(tipoNonGestito));                    // ImportazioneService: fattura non importata
        anteprima("firmato" + FINTA + ".xml.p7m", byt("non è una busta firmata"));    // LettoreFile: p7m non leggibile
        anteprima("archivio" + FINTA + ".zip", byt("non è uno zip"));                 // LettoreFile: zip non leggibile
        anteprima("voci.zip", zip(voci("sotto/dentro\r\nFINTA RIGA.xml", "non è una fattura"))); // il nome di una voce dello zip

        List<String> scritte = scritte();
        assertThat(scritte).hasSizeGreaterThanOrEqualTo(5);
        assertThat(scritte).allSatisfy(riga -> assertThat(riga).doesNotContain("\r").doesNotContain("\n"));
        // il nome resta riconoscibile, su una riga sola
        assertThat(scritte).anySatisfy(riga -> assertThat(riga).startsWith("Importazione, rotto__2026-01-01T10:00:00 INFO"));
        assertThat(scritte).anySatisfy(riga -> assertThat(riga).contains("voci.zip › sotto/dentro__FINTA RIGA.xml"));
    }

    @Test
    void ancheIValoriLettiDallaFatturaSiPulisconoPrimaDelLog() throws Exception {
        // U+2028 (separatore di riga) non e' uno spazio per l'XML: resta nel numero della fattura cosi' com'e'
        String xml = fattura(denominazione("Forno Rossi Srl", "01234567890"), body("TD26", "D-1 FINTA RIGA", "2026-10-09", "10.00", "8.20", "1.80"));
        anteprima("debito.xml", byt(xml));
        String data = fattura(denominazione("Forno Rossi Srl", "01234567890"), body("TD01", "F-1", "ieri FINTA RIGA", "10.00", "8.20", "1.80"));
        anteprima("data.xml", byt(data));
        assertThat(scritte()).hasSize(2).allSatisfy(riga -> assertThat(riga).doesNotContain(" ").contains("_FINTA RIGA"));
    }
}
