package it.contabilita.api;

import it.contabilita.api.Dto.CategoriaDto;
import it.contabilita.api.Dto.DipendenteDto;
import it.contabilita.api.Dto.FornitoreDto;
import it.contabilita.api.Dto.NomeInput;
import it.contabilita.dati.Tipo;
import it.contabilita.movimenti.AnagraficheService;
import it.contabilita.movimenti.AnagraficheService.Esito;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Categorie, fornitori, dipendenti: elenco e creazione (201 se nuovo, 200 se esiste gia'). */
@RestController
@RequestMapping("/api")
public class AnagraficheController {

    private final AnagraficheService anagrafiche;

    public AnagraficheController(AnagraficheService anagrafiche) {
        this.anagrafiche = anagrafiche;
    }

    @GetMapping("/categorie")
    public List<CategoriaDto> categorie(@RequestParam(required = false) Tipo tipo) {
        return anagrafiche.elencoCategorie(tipo);
    }

    @GetMapping("/fornitori")
    public List<FornitoreDto> fornitori(@RequestParam(required = false) String q) {
        return anagrafiche.elencoFornitori(q);
    }

    @GetMapping("/dipendenti")
    public List<DipendenteDto> dipendenti(@RequestParam(required = false) String q) {
        return anagrafiche.elencoDipendenti(q);
    }

    @PostMapping("/categorie")
    public ResponseEntity<CategoriaDto> creaCategoria(@RequestBody NomeInput corpo) {
        Esito<?> e = anagrafiche.categoria(corpo.nome(), corpo.tipo());
        return risposta(e, AnagraficheService.dto((it.contabilita.dati.Categoria) e.valore()));
    }

    @PostMapping("/fornitori")
    public ResponseEntity<FornitoreDto> creaFornitore(@RequestBody NomeInput corpo) {
        Esito<?> e = anagrafiche.fornitore(corpo.nome(), corpo.partitaIva());
        return risposta(e, AnagraficheService.dto((it.contabilita.dati.Fornitore) e.valore()));
    }

    @PostMapping("/dipendenti")
    public ResponseEntity<DipendenteDto> creaDipendente(@RequestBody NomeInput corpo) {
        Esito<?> e = anagrafiche.dipendente(corpo.nome());
        return risposta(e, AnagraficheService.dto((it.contabilita.dati.Dipendente) e.valore()));
    }

    private static <T> ResponseEntity<T> risposta(Esito<?> esito, T corpo) {
        return ResponseEntity.status(esito.creato() ? HttpStatus.CREATED : HttpStatus.OK).body(corpo);
    }
}
