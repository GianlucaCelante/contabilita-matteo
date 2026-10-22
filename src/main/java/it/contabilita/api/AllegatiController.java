package it.contabilita.api;

import it.contabilita.allegati.AllegatiService;
import it.contabilita.allegati.AllegatiService.Allegato;
import it.contabilita.api.Dto.MovimentoDto;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** Allegati dei movimenti (docs/api.md, fase 4). */
@RestController
@RequestMapping("/api/movimenti/{id}/allegato")
public class AllegatiController {

    private final AllegatiService allegati;

    public AllegatiController(AllegatiService allegati) {
        this.allegati = allegati;
    }

    @GetMapping
    public ResponseEntity<Resource> apri(@PathVariable long id) {
        Allegato a = allegati.apri(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(a.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, intestazione(a.nomeOriginale()))
                .header("X-Content-Type-Options", "nosniff")
                .body(new FileSystemResource(a.file()));
    }

    @PostMapping
    public MovimentoDto carica(@PathVariable long id, @RequestParam(name = "file", required = false) MultipartFile file) {
        if (file == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Manca il file (campo «file»).");
        }
        try {
            return allegati.carica(id, file.getOriginalFilename(), file.getBytes());
        } catch (IOException e) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il file non si può leggere.");
        }
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void elimina(@PathVariable long id) {
        allegati.elimina(id);
    }

    /**
     * {@code inline; filename="nome"} con il nome gia' ripulito da {@code AllegatiService} (niente virgolette, barre
     * o a capo); se ha caratteri non ASCII si aggiunge {@code filename*} (RFC 5987) e il nome semplice
     * sostituisce quei caratteri con "_".
     */
    static String intestazione(String nome) {
        String ascii = nome.replaceAll("[^\\x20-\\x7E]", "_");
        String valore = "inline; filename=\"" + ascii + "\"";
        if (!ascii.equals(nome)) {
            valore += "; filename*=UTF-8''" + URLEncoder.encode(nome, StandardCharsets.UTF_8).replace("+", "%20");
        }
        return valore;
    }
}
