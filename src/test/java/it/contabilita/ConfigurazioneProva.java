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

    /** Al posto dell'uscita vera: registra i codici richiesti, non ferma mai la JVM dei test. */
    public static final class UscitaDiProva implements it.contabilita.programma.Uscita {
        private final java.util.List<Integer> chiamate = new java.util.concurrent.CopyOnWriteArrayList<>();

        @Override
        public void esci(int codice) {
            chiamate.add(codice);
        }

        public java.util.List<Integer> chiamate() {
            return chiamate;
        }
    }

    @Bean
    @Primary
    public UscitaDiProva uscitaDiProva() {
        return new UscitaDiProva();
    }

    @Bean
    @Primary
    public OrologioDiProva orologioDiProva() {
        return new OrologioDiProva();
    }
}
