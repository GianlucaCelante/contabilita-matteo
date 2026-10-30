package it.contabilita.api;

import it.contabilita.api.Dto.SettimanaDto;
import it.contabilita.api.Dto.SettimanaInput;
import it.contabilita.api.Dto.Statistiche;
import it.contabilita.movimenti.SediService;
import it.contabilita.movimenti.StatisticheService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** Statistiche settimanali: pizze e ordini per sede, scontrino medio (docs/api.md, "Statistiche"). */
@RestController
@RequestMapping("/api/statistiche")
public class StatisticheController {

    private final StatisticheService statistiche;

    public StatisticheController(StatisticheService statistiche) {
        this.statistiche = statistiche;
    }

    @GetMapping("/settimana")
    public SettimanaDto settimana(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate data) {
        return statistiche.settimana(data);
    }

    @PutMapping("/settimana")
    public SettimanaDto salva(@RequestBody SettimanaInput corpo) {
        return statistiche.salva(corpo);
    }

    @GetMapping
    public Statistiche periodo(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate da,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate a,
            @RequestParam(required = false) String sedi) {
        return statistiche.calcola(da, a, SediService.idsDa(sedi));
    }
}
