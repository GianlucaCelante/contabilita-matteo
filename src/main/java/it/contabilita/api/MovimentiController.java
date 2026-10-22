package it.contabilita.api;

import it.contabilita.api.Dto.ElencoMovimenti;
import it.contabilita.api.Dto.MovimentoDto;
import it.contabilita.api.Dto.MovimentoInput;
import it.contabilita.api.Dto.Riepilogo;
import it.contabilita.dati.Ambito;
import it.contabilita.dati.Tipo;
import it.contabilita.movimenti.MovimentiService;
import it.contabilita.movimenti.RiepilogoService;
import it.contabilita.ricorrenze.RicorrenzeService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** Movimenti, ricorrenze e riepilogo (docs/api.md). */
@RestController
@RequestMapping("/api")
public class MovimentiController {

    private final MovimentiService movimenti;
    private final RicorrenzeService ricorrenze;
    private final RiepilogoService riepilogo;

    public MovimentiController(MovimentiService movimenti, RicorrenzeService ricorrenze, RiepilogoService riepilogo) {
        this.movimenti = movimenti;
        this.ricorrenze = ricorrenze;
        this.riepilogo = riepilogo;
    }

    @GetMapping("/movimenti")
    public ElencoMovimenti elenca(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate da,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate a,
            @RequestParam(required = false) Tipo tipo,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long dipendente) {
        return movimenti.elenca(da, a, tipo, q, dipendente);
    }

    @GetMapping("/movimenti/{id}")
    public MovimentoDto leggi(@PathVariable Long id) {
        return movimenti.leggi(id);
    }

    @PostMapping("/movimenti")
    @ResponseStatus(HttpStatus.CREATED)
    public MovimentoDto crea(@RequestBody MovimentoInput corpo) {
        return movimenti.crea(corpo);
    }

    @PutMapping("/movimenti/{id}")
    public MovimentoDto modifica(@PathVariable Long id, @RequestParam(defaultValue = "SOLO_QUESTO") Ambito ambito,
                                 @RequestBody MovimentoInput corpo) {
        return movimenti.modifica(id, corpo, ambito);
    }

    @DeleteMapping("/movimenti/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void elimina(@PathVariable Long id, @RequestParam(defaultValue = "SOLO_QUESTO") Ambito ambito) {
        movimenti.elimina(id, ambito);
    }

    @PostMapping("/ricorrenze/{id}/ferma")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void ferma(@PathVariable Long id) {
        ricorrenze.ferma(id);
    }

    @GetMapping("/riepilogo")
    public Riepilogo riepilogo(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate da,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate a) {
        return riepilogo.calcola(da, a);
    }
}
