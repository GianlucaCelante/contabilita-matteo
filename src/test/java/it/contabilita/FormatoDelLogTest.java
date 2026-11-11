package it.contabilita;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.LoggingEvent;
import ch.qos.logback.core.Appender;
import ch.qos.logback.core.OutputStreamAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * s44, difesa in piu': il formato delle righe di log ({@code logging.pattern.*} in application.yml) non lascia che un
 * messaggio cominci una riga nuova: ogni a capo dentro il messaggio diventa il testo {@code \n}, quindi un evento sta su una
 * riga sola (piu' quelle dello stack, se c'e'). Si prova il formato davvero montato sugli appender {@code CONSOLE} e
 * {@code FILE} del servizio, prendendo l'encoder dall'appender.
 */
class FormatoDelLogTest extends ProvaBase {

    private static final List<String> APPENDER = List.of("CONSOLE", "FILE");

    private static String scrivi(String appender, String messaggio, Throwable eccezione, Object... argomenti) {
        LoggerContext contesto = (LoggerContext) LoggerFactory.getILoggerFactory();
        Appender<ILoggingEvent> montato = contesto.getLogger(Logger.ROOT_LOGGER_NAME).getAppender(appender);
        assertThat(montato).as("appender " + appender).isInstanceOf(OutputStreamAppender.class);
        LoggingEvent evento = new LoggingEvent(Logger.class.getName(), contesto.getLogger("it.contabilita.prova"), Level.INFO,
                messaggio, eccezione, argomenti);
        return new String(((OutputStreamAppender<ILoggingEvent>) montato).getEncoder().encode(evento), StandardCharsets.UTF_8);
    }

    /** Le righe scritte, senza l'a capo finale di ognuna. */
    private static String[] righe(String scritto) {
        assertThat(scritto).endsWith(System.lineSeparator());
        return scritto.substring(0, scritto.length() - System.lineSeparator().length()).split(System.lineSeparator(), -1);
    }

    @Test
    void unMessaggioConUnACapoRestaSuUnaRigaSola() {
        for (String appender : APPENDER) {
            String scritto = scrivi(appender, "file {} letto", null,
                    "a.xml\r\n2026-01-01T10:00:00 INFO FINTA RIGA\nseconda\rterza\u2028quarta\u0085quinta\u000Bsesta\fsettima\u2029ottava");
            String[] righe = righe(scritto);
            assertThat(righe).as(appender).hasSize(1);
            assertThat(righe[0]).as(appender).endsWith(
                    "file a.xml\\n2026-01-01T10:00:00 INFO FINTA RIGA\\nseconda\\nterza\\nquarta\\nquinta\\nsesta\\nsettima\\nottava letto");
            assertThat(righe[0]).as(appender).doesNotContain("\r").doesNotContain("\n").doesNotContain("\u2028").doesNotContain("\u2029")
                    .doesNotContain("\u0085").doesNotContain("\u000B").doesNotContain("\f");
        }
    }

    @Test
    void conUnEccezioneIlMessaggioRestaSuUnaRigaELoStackSegueSulleSue() {
        Throwable guasto = PerLog.conStack(new IllegalStateException("percorso D:\\Copie\r\n2026-01-01 INFO FINTA RIGA",
                new java.io.IOException("causa\ncon a capo")));
        for (String appender : APPENDER) {
            String[] righe = righe(scrivi(appender, "Copia fallita: {}", guasto, "x\ny"));
            assertThat(righe.length).as(appender).isGreaterThan(3);
            assertThat(righe[0]).as(appender).endsWith("Copia fallita: x\\ny");
            // le righe dell'eccezione non passano dal formato: le tiene pulite PerLog.conStack
            assertThat(righe[1]).as(appender)
                    .isEqualTo("java.lang.IllegalStateException: percorso D:\\Copie__2026-01-01 INFO FINTA RIGA");
            assertThat(righe[2]).as(appender).startsWith("\tat ");
            assertThat(righe).as(appender)
                    .anySatisfy(r -> assertThat(r).isEqualTo("Caused by: java.io.IOException: causa_con a capo"));
            // nessuna riga comincia come una riga di log finta
            assertThat(righe).as(appender).noneSatisfy(r -> assertThat(r).startsWith("2026-01-01 INFO FINTA RIGA"));
            assertThat(String.join("", righe)).as(appender).doesNotContain("\r").doesNotContain("\n");
        }
    }

    @Test
    void unMessaggioNormaleRestaComE() {
        String filo = Thread.currentThread().getName();
        assertThat(scrivi("CONSOLE", "Copia di sicurezza riuscita in {}", null, "D:\\Copie\\2026-01-01_030000"))
                .endsWith(" INFO  [" + filo + "] it.contabilita.prova - Copia di sicurezza riuscita in D:\\Copie\\2026-01-01_030000" + System.lineSeparator());
        assertThat(scrivi("FILE", "Caffè «Però» {}", null, 42))
                .endsWith(" INFO --- [" + filo + "] it.contabilita.prova                     : Caffè «Però» 42" + System.lineSeparator());
    }
}
