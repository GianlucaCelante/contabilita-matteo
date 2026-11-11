package it.contabilita.api;

import it.contabilita.api.Dto.GiorniInput;
import it.contabilita.api.Dto.SerieStatistiche;
import it.contabilita.api.Dto.SettimanaCompletaInput;
import it.contabilita.api.Dto.SettimanaDto;
import it.contabilita.api.Dto.SettimanaInput;
import it.contabilita.api.Dto.Statistiche;
import it.contabilita.movimenti.SediService;
import it.contabilita.movimenti.StatisticheService;
import it.contabilita.movimenti.StatisticheVociService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** Statistiche di pizze e ordini per sede (giorno per giorno o vecchi totali settimanali), scontrino medio (docs/api.md, "Statistiche"). */
@RestController
@RequestMapping("/api/statistiche")
public class StatisticheController {

    private final StatisticheService statistiche;

    private final StatisticheVociService vociPerPeriodo;
    private final SediService sediService;

    public StatisticheController(StatisticheService statistiche, StatisticheVociService vociPerPeriodo, SediService sediService) {
        this.statistiche = statistiche;
        this.sediService = sediService;
        this.vociPerPeriodo = vociPerPeriodo;
    }

    @GetMapping("/settimana")
    public SettimanaDto settimana(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate data) {
        return statistiche.settimana(data);
    }

    @PutMapping("/settimana")
    public SettimanaDto salva(@RequestBody SettimanaInput corpo) {
        return statistiche.salva(corpo);
    }

    @PutMapping("/giorni")
    public SettimanaDto salvaGiorni(@RequestBody GiorniInput corpo) {
        return statistiche.salvaGiorni(corpo);
    }

    /** Giorni e totali settimanali di piu' sedi in un solo salvataggio, tutto o niente. */
    @PutMapping("/settimana-completa")
    public SettimanaDto salvaSettimanaCompleta(@RequestBody SettimanaCompletaInput corpo) {
        return statistiche.salvaSettimanaCompleta(corpo);
    }

    @GetMapping("/serie")
    public SerieStatistiche serie(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate da,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate a,
            @RequestParam(required = false) String passo,
            @RequestParam(required = false) String sedi) {
        return statistiche.serie(da, a, passo, sediService.filtro(sedi));
    }

    @GetMapping("/voci")
    public StatisticheVociService.StatisticheVoci voci(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate da,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate a,
            @RequestParam(required = false) String raggruppa,
            @RequestParam(required = false) String tipo,
            @RequestParam(required = false) String sedi) {
        return vociPerPeriodo.calcola(da, a, raggruppa, tipo, sediService.filtro(sedi));
    }

    @GetMapping
    public Statistiche periodo(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate da,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate a,
            @RequestParam(required = false) String sedi) {
        return statistiche.calcola(da, a, sediService.filtro(sedi));
    }
}
