package it.contabilita.api;

import it.contabilita.esporta.EsportazioneService;
import it.contabilita.esporta.EsportazioneService.Esportazione;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.time.LocalDate;

/** Esportazione Excel/CSV (docs/api.md, "Esportazione (fase 3)"). */
@RestController
@RequestMapping("/api")
public class EsportaController {

    private final EsportazioneService esportazione;

    public EsportaController(EsportazioneService esportazione) {
        this.esportazione = esportazione;
    }

    @GetMapping("/esporta")
    public ResponseEntity<StreamingResponseBody> esporta(
            @RequestParam(required = false) String formato,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate da,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate a,
            @RequestParam(required = false) String includi) {
        Esportazione file = esportazione.prepara(formato, da, a, includi);
        return ResponseEntity.ok()
                .contentType(file.tipoContenuto())
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.nomeFile() + "\"")
                .body(file.corpo());
    }
}
