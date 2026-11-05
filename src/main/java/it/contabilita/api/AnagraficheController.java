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
        Esito<?> e = anagrafiche.categoria(corpo.nome(), corpo.tipo(), corpo.retribuzione());
        return risposta(e, anagrafiche.vista((it.contabilita.dati.Categoria) e.valore()));
    }

    @PutMapping("/categorie/{id}")
    public CategoriaDto modificaCategoria(@PathVariable long id, @RequestBody NomeInput corpo) {
        return anagrafiche.vista(anagrafiche.modificaCategoria(id, corpo.nome(), corpo.retribuzione()));
    }

    @PutMapping("/fornitori/{id}")
    public FornitoreDto modificaFornitore(@PathVariable long id, @RequestBody NomeInput corpo) {
        return anagrafiche.vista(anagrafiche.modificaFornitore(id, corpo.nome(), corpo.partitaIva()));
    }

    @PutMapping("/dipendenti/{id}")
    public DipendenteDto modificaDipendente(@PathVariable long id, @RequestBody NomeInput corpo) {
        return anagrafiche.vista(anagrafiche.modificaDipendente(id, corpo.nome()));
    }

    @DeleteMapping("/categorie/{id}")
    public ResponseEntity<Void> eliminaCategoria(@PathVariable long id, @RequestParam(required = false) Long sostituisciCon) {
        anagrafiche.eliminaCategoria(id, sostituisciCon);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/fornitori/{id}")
    public ResponseEntity<Void> eliminaFornitore(@PathVariable long id, @RequestParam(required = false) Long sostituisciCon) {
        anagrafiche.eliminaFornitore(id, sostituisciCon);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/dipendenti/{id}")
    public ResponseEntity<Void> eliminaDipendente(@PathVariable long id, @RequestParam(required = false) Long sostituisciCon) {
        anagrafiche.eliminaDipendente(id, sostituisciCon);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/fornitori")
    public ResponseEntity<FornitoreDto> creaFornitore(@RequestBody NomeInput corpo) {
        Esito<?> e = anagrafiche.fornitore(corpo.nome(), corpo.partitaIva());
        return risposta(e, anagrafiche.vista((it.contabilita.dati.Fornitore) e.valore()));
    }

    @PostMapping("/dipendenti")
    public ResponseEntity<DipendenteDto> creaDipendente(@RequestBody NomeInput corpo) {
        Esito<?> e = anagrafiche.dipendente(corpo.nome());
        return risposta(e, anagrafiche.vista((it.contabilita.dati.Dipendente) e.valore()));
    }

    private static <T> ResponseEntity<T> risposta(Esito<?> esito, T corpo) {
        return ResponseEntity.status(esito.creato() ? HttpStatus.CREATED : HttpStatus.OK).body(corpo);
    }
}
