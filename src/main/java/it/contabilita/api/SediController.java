package it.contabilita.api;

import it.contabilita.api.Dto.SedeDto;
import it.contabilita.api.Dto.SedeInput;
import it.contabilita.movimenti.SediService;
import it.contabilita.movimenti.SediService.Esito;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Sedi: elenco, creazione (201 se nuova, 200 se esiste gia'), rinomina e archiviazione (docs/api.md, "Sedi"). */
@RestController
@RequestMapping("/api/sedi")
public class SediController {

    private final SediService sedi;

    public SediController(SediService sedi) {
        this.sedi = sedi;
    }

    @GetMapping
    public List<SedeDto> elenco() {
        return sedi.elenco();
    }

    @PostMapping
    public ResponseEntity<SedeDto> crea(@RequestBody SedeInput corpo) {
        Esito e = sedi.crea(corpo == null ? null : corpo.nome());
        return ResponseEntity.status(e.creata() ? HttpStatus.CREATED : HttpStatus.OK).body(e.sede());
    }

    @PutMapping("/{id}")
    public SedeDto aggiorna(@PathVariable Long id, @RequestBody SedeInput corpo) {
        return sedi.aggiorna(id, corpo);
    }
}
