package it.contabilita;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/** L'orologio del servizio, iniettato dove serve "adesso" (sostituibile nei test). */
@Configuration
public class ConfigurazioneOrologio {

    @Bean
    public Clock orologio() {
        return Clock.systemDefaultZone();
    }
}
