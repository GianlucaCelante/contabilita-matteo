package it.contabilita.importa;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static it.contabilita.importa.FattureProva.body;
import static it.contabilita.importa.FattureProva.byt;
import static it.contabilita.importa.FattureProva.denominazione;
import static it.contabilita.importa.FattureProva.fattura;
import static it.contabilita.importa.FattureProva.fatturaConPrefisso;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EstrattoreP7mTest {

    private final String xml = fattura(denominazione("Forno Rossi Srl", "01234567890"),
            body("TD01", "1", "2026-10-03", "122.00", "100.00", "22.00"));

    @Test
    void estraeIlContenutoDaUnaBustaDerStrutturata() throws Exception {
        byte[] p7m = FattureProva.p7mContiguo(byt(xml));
        assertThat(EstrattoreP7m.estraiXml(p7m)).isEqualTo(byt(xml));
    }

    @Test
    void ricomponeIlContenutoSpezzatoInBlocchiOctetString() throws Exception {
        byte[] p7m = FattureProva.p7mABlocchi(byt(xml), 100);
        assertThat(EstrattoreP7m.estraiXml(p7m)).isEqualTo(byt(xml));
    }

    @Test
    void conByteFittiziPrimaEDopoTrovaLXmlPerPosizione() throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(new byte[]{0x30, (byte) 0x82, 0x13, 0x37, 0x06, 0x09, 0x2A, 0x01, 0x02, (byte) 0xFF, 0x00});
        o.write(byt(xml));
        o.write(new byte[]{0x00, 0x00, (byte) 0xA0, (byte) 0x82, 0x03, 0x01, 'z', 'z', 0x00});
        byte[] estratto = EstrattoreP7m.estraiXml(o.toByteArray());
        assertThat(new String(estratto, StandardCharsets.UTF_8)).isEqualTo(xml);
    }

    @Test
    void trovaLXmlSenzaDichiarazioneEConPrefissoDiNamespace() throws Exception {
        String senzaDichiarazione = fatturaConPrefisso("p", denominazione("X", "1"),
                body("TD01", "1", "2026-10-03", "1.00", "0.82", "0.18")).replaceFirst("<\\?xml[^>]*\\?>\\s*", "");
        byte[] p7m = new byte[]{0x30, (byte) 0x80, 0x06, 0x01, 0x01};
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(p7m);
        o.write(byt(senzaDichiarazione));
        o.write(new byte[]{0x00, 0x00, 0x13});
        assertThat(new String(EstrattoreP7m.estraiXml(o.toByteArray()), StandardCharsets.UTF_8)).isEqualTo(senzaDichiarazione);
    }

    @Test
    void accettaAncheLaBustaInBase64() throws Exception {
        byte[] p7m = FattureProva.p7mContiguo(byt(xml));
        byte[] base64 = Base64.getMimeEncoder().encode(p7m);
        assertThat(EstrattoreP7m.estraiXml(base64)).isEqualTo(byt(xml));
    }

    @Test
    void senzaXmlDentroDaErroreChiaro() {
        assertThatThrownBy(() -> EstrattoreP7m.estraiXml(new byte[]{0x30, 0x03, 0x02, 0x01, 0x05}))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class).hasMessageContaining("firmato");
        assertThatThrownBy(() -> EstrattoreP7m.estraiXml(new byte[0])).isInstanceOf(ParserFatturaPa.ErroreLettura.class);
    }
}
