package it.contabilita.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** {@code GET /api/versione}. */
@RestController
public class VersioneController {

    /** Fuori da un jar (IDE, test) il manifest non ha Implementation-Version. */
    private static final String VERSIONE_DI_RIPIEGO = "0.1.0";

    public static String versione() {
        String v = VersioneController.class.getPackage().getImplementationVersion();
        return v != null ? v : VERSIONE_DI_RIPIEGO;
    }

    @GetMapping("/api/versione")
    public Map<String, String> leggi() {
        return Map.of("versione", versione());
    }
}
