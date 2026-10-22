package it.contabilita;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** Orologio dei test, modificabile: di default 2026-01-01, cosi' i test non dipendono dalla data vera. */
@TestConfiguration
public class ConfigurazioneProva {

    public static final class OrologioDiProva extends Clock {
        private volatile Instant istante = Instant.parse("2026-01-01T10:00:00Z");

        public void imposta(String data) {
            istante = Instant.parse(data + "T10:00:00Z");
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return istante;
        }
    }

    @Bean
    @Primary
    public OrologioDiProva orologioDiProva() {
        return new OrologioDiProva();
    }
}
