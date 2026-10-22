package it.contabilita.api;

import it.contabilita.importa.ImportaDto.Anteprima;
import it.contabilita.importa.ImportaDto.Conferma;
import it.contabilita.importa.ImportaDto.EsitoConferma;
import it.contabilita.importa.ImportaDto.FileCaricato;
import it.contabilita.importa.ImportazioneService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/** Importazione di fatture elettroniche XML, XML firmati e ZIP (docs/api.md, fase 4). */
@RestController
@RequestMapping("/api/importa")
public class ImportaController {

    private final ImportazioneService importazione;

    public ImportaController(ImportazioneService importazione) {
        this.importazione = importazione;
    }

    @PostMapping(value = "/anteprima", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Anteprima anteprima(@RequestParam(name = "files", required = false) List<MultipartFile> files) {
        List<FileCaricato> caricati = new ArrayList<>();
        if (files != null) {
            for (MultipartFile f : files) {
                try {
                    caricati.add(new FileCaricato(f.getOriginalFilename(), f.getBytes()));
                } catch (IOException e) {
                    throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il file «" + f.getOriginalFilename() + "» non si può leggere.");
                }
            }
        }
        return importazione.anteprima(caricati);
    }

    @PostMapping("/conferma")
    public EsitoConferma conferma(@RequestBody Conferma corpo) {
        return importazione.conferma(corpo);
    }
}
