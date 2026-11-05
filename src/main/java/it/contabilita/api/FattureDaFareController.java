package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.movimenti.FattureDaFareService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** «Fatture da fare» (docs/api.md): caselle, stati mensili, griglia e promemoria. */
@RestController
@RequestMapping("/api/fatture")
public class FattureDaFareController {

    private final FattureDaFareService fatture;

    public FattureDaFareController(FattureDaFareService fatture) {
        this.fatture = fatture;
    }

    @GetMapping("/caselle")
    public List<Map<String, Object>> caselle() {
        return fatture.elenco();
    }

    @PostMapping("/caselle")
    public ResponseEntity<Map<String, Object>> crea(@RequestBody JsonNode corpo) {
        FattureDaFareService.Esito e = fatture.crea(corpo);
        return ResponseEntity.status(e.creata() ? HttpStatus.CREATED : HttpStatus.OK).body(e.casella());
    }

    @PutMapping("/caselle/{id}")
    public Map<String, Object> aggiorna(@PathVariable long id, @RequestBody JsonNode corpo) {
        return fatture.aggiorna(id, corpo);
    }

    @DeleteMapping("/caselle/{id}")
    public ResponseEntity<Void> elimina(@PathVariable long id) {
        fatture.elimina(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/caselle/{id}/mesi/{mese}")
    public Map<String, Object> impostaMese(@PathVariable long id, @PathVariable String mese, @RequestBody JsonNode corpo) {
        return fatture.impostaMese(id, mese, corpo);
    }

    @GetMapping
    public Map<String, Object> griglia(@RequestParam(required = false) String da, @RequestParam(required = false) String a) {
        return fatture.griglia(da, a);
    }

    @GetMapping("/promemoria")
    public Map<String, Object> promemoria() {
        return fatture.promemoria();
    }
}
