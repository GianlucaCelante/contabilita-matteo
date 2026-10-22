package it.contabilita;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Servizio "Contabilita": ricavi e costi di una pizzeria, interfaccia sulla rete locale
 * (docs/stack.md).
 *
 * La cartella dati (SQLite, log) deve esistere PRIMA che Spring configuri il DataSource e il
 * logging su file, quindi si crea qui, leggendo la stessa variabile d'ambiente
 * ({@code CONTABILITA_DATA_DIR}) che application.yml usa per {@code contabilita.dati}.
 */
@SpringBootApplication
@EnableScheduling
public class ContabilitaApplication {

    private static final Logger log = LoggerFactory.getLogger(ContabilitaApplication.class);

    public static void main(String[] args) {
        SorvegliaProcessoPadre.avviaSeRichiesta();
        String dataDir = System.getenv().getOrDefault("CONTABILITA_DATA_DIR", "./data");
        try {
            Files.createDirectories(Path.of(dataDir));
            Files.createDirectories(Path.of(dataDir, "log"));
        } catch (IOException e) {
            throw new IllegalStateException("Impossibile creare la cartella dati: " + dataDir, e);
        }
        log.info("Cartella dati: {}", Path.of(dataDir).toAbsolutePath());
        SpringApplication.run(ContabilitaApplication.class, args);
    }
}
