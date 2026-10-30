package it.contabilita.movimenti;

import it.contabilita.api.Dto.Rif;
import it.contabilita.api.Dto.SettimanaDto;
import it.contabilita.api.Dto.SettimanaInput;
import it.contabilita.api.Dto.StatisticaPerSede;
import it.contabilita.api.Dto.StatisticaSede;
import it.contabilita.api.Dto.StatisticaSettimana;
import it.contabilita.api.Dto.Statistiche;
import it.contabilita.api.Dto.TotaleStatistiche;
import it.contabilita.api.Dto.VoceSettimanaInput;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.DatiSettimana;
import it.contabilita.dati.DatiSettimanaRepository;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Sede;
import it.contabilita.dati.Tipo;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Statistiche settimanali (docs/api.md, "Statistiche"): pizze e ordini caricati a mano per sede e settimana
 * (il lunedi' identifica la settimana), scontrino medio = ricavi / ordini e pizze per ordine.
 */
@Service
public class StatisticheService {

    /** Limite ragionevole per pizze e ordini di una settimana (evita overflow e refusi). */
    static final int MASSIMO = 1_000_000;

    private final DatiSettimanaRepository dati;
    private final MovimentoRepository movimenti;
    private final SediService sedi;
    private final Clock clock;

    public StatisticheService(DatiSettimanaRepository dati, MovimentoRepository movimenti, SediService sedi, Clock clock) {
        this.dati = dati;
        this.movimenti = movimenti;
        this.sedi = sedi;
        this.clock = clock;
    }

    /** Il lunedi' della settimana ISO che contiene il giorno. */
    public static LocalDate lunedi(LocalDate giorno) {
        return giorno.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    private record Chiave(long sedeId, LocalDate settimana) {
    }

    // ---------------------------------------------------------------- una settimana

    /** {@code data}: un giorno qualsiasi della settimana; assente = oggi. */
    @Transactional(readOnly = true)
    public SettimanaDto settimana(LocalDate data) {
        return costruisciSettimana(lunedi(data == null ? LocalDate.now(clock) : data));
    }

    private SettimanaDto costruisciSettimana(LocalDate lunedi) {
        LocalDate domenica = lunedi.plusDays(6);
        Map<Long, DatiSettimana> inseriti = new HashMap<>();
        for (DatiSettimana d : dati.findBySettimanaBetweenOrderBySettimanaAscIdAsc(lunedi, lunedi)) {
            inseriti.put(d.getSede().getId(), d);
        }
        Map<Chiave, Long> ricavi = ricaviPerSedeSettimana(lunedi, domenica, null);
        List<StatisticaSede> righe = new ArrayList<>();
        for (Sede s : sedi.tutte()) {
            DatiSettimana d = inseriti.get(s.getId());
            Long r = ricavi.get(new Chiave(s.getId(), lunedi));
            if (s.isArchiviata() && d == null && r == null) {
                continue;
            }
            long ricaviCent = r == null ? 0 : r;
            Rif rif = new Rif(s.getId(), s.getNome());
            if (d == null) {
                righe.add(new StatisticaSede(rif, null, null, ricaviCent, null, null, false));
            } else {
                righe.add(new StatisticaSede(rif, d.getPizze(), d.getOrdini(), ricaviCent,
                        scontrinoMedio(ricaviCent, d.getOrdini()), pizzePerOrdine(d.getPizze(), d.getOrdini()), true));
            }
        }
        return new SettimanaDto(lunedi, domenica, righe);
    }

    // ---------------------------------------------------------------- inserimento

    private record Voce(Sede sede, Integer pizze, Integer ordini) {
    }

    @Transactional
    public SettimanaDto salva(SettimanaInput in) {
        if (in == null || in.settimana() == null || in.settimana().isBlank()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Indica la settimana (un giorno qualsiasi, yyyy-MM-dd).");
        }
        LocalDate lunedi;
        try {
            lunedi = lunedi(LocalDate.parse(in.settimana().trim()));
        } catch (DateTimeParseException e) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La settimana non è una data valida (yyyy-MM-dd): " + in.settimana());
        }
        if (in.voci() == null || in.voci().isEmpty()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Indica almeno una voce.");
        }
        // prima si controlla tutto, poi si scrive: o passano tutte o nessuna
        List<Voce> voci = new ArrayList<>();
        Set<Long> viste = new HashSet<>();
        for (VoceSettimanaInput v : in.voci()) {
            if (v == null || v.sedeId() == null) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Ogni voce deve avere la sede.");
            }
            if (!viste.add(v.sedeId())) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "La sede " + v.sedeId() + " compare più volte.");
            }
            Sede sede = sedi.trova(v.sedeId());
            if (sede.isArchiviata()) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "La sede «" + sede.getNome() + "» è archiviata.");
            }
            Integer pizze = intero(v.pizze(), "pizze", sede);
            Integer ordini = intero(v.ordini(), "ordini", sede);
            if ((pizze == null) != (ordini == null)) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Sede «" + sede.getNome()
                        + "»: indica sia le pizze sia gli ordini (o nessuno dei due per cancellare il dato).");
            }
            if (ordini != null && ordini == 0 && pizze > 0) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST,
                        "Sede «" + sede.getNome() + "»: con 0 ordini le pizze devono essere 0.");
            }
            voci.add(new Voce(sede, pizze, ordini));
        }
        LocalDateTime adesso = LocalDateTime.now(clock).withNano(0);
        for (Voce v : voci) {
            var esistente = dati.findBySedeIdAndSettimana(v.sede().getId(), lunedi);
            if (v.pizze() == null) {
                esistente.ifPresent(dati::delete);
            } else if (esistente.isPresent()) {
                DatiSettimana d = esistente.get();
                d.setPizze(v.pizze());
                d.setOrdini(v.ordini());
                d.setModificatoIl(adesso);
                dati.save(d);
            } else {
                dati.save(new DatiSettimana(v.sede(), lunedi, v.pizze(), v.ordini(), adesso));
            }
        }
        dati.flush();
        return costruisciSettimana(lunedi);
    }

    private static Integer intero(BigDecimal valore, String campo, Sede sede) {
        if (valore == null) {
            return null;
        }
        BigDecimal n = valore.stripTrailingZeros();
        if (n.scale() > 0) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST,
                    "Sede «" + sede.getNome() + "»: " + campo + " deve essere un numero intero.");
        }
        if (n.signum() < 0) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST,
                    "Sede «" + sede.getNome() + "»: " + campo + " non può essere negativo.");
        }
        if (n.compareTo(BigDecimal.valueOf(MASSIMO)) > 0) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST,
                    "Sede «" + sede.getNome() + "»: " + campo + " è troppo grande (massimo " + MASSIMO + ").");
        }
        return n.intValueExact();
    }

    // ---------------------------------------------------------------- periodo

    @Transactional(readOnly = true)
    public Statistiche calcola(LocalDate da, LocalDate a, Set<Long> sediIds) {
        if (da == null || a == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Servono entrambe le date: da e a.");
        }
        if (da.isAfter(a)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La data iniziale non può essere dopo quella finale.");
        }
        // le settimane il cui lunedi' cade in [da, a]
        List<LocalDate> lunedi = new ArrayList<>();
        for (LocalDate l = da.with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY)); !l.isAfter(a); l = l.plusDays(7)) {
            lunedi.add(l);
        }
        List<Sede> scelte = sedi.tutte().stream().filter(s -> sediIds == null || sediIds.contains(s.getId())).toList();

        Map<Chiave, DatiSettimana> inseriti = new HashMap<>();
        Map<Chiave, Long> ricavi = new HashMap<>();
        if (!lunedi.isEmpty()) {
            LocalDate primo = lunedi.get(0), ultimo = lunedi.get(lunedi.size() - 1);
            for (DatiSettimana d : dati.findBySettimanaBetweenOrderBySettimanaAscIdAsc(primo, ultimo)) {
                if (sediIds == null || sediIds.contains(d.getSede().getId())) {
                    inseriti.put(new Chiave(d.getSede().getId(), d.getSettimana()), d);
                }
            }
            ricavi = ricaviPerSedeSettimana(primo, ultimo.plusDays(6), sediIds);
        }

        // per sede: {pizze, ordini, ricavi, settimane con dati}; nelle somme contano solo le coppie con dati e ordini > 0
        Map<Long, long[]> perSede = new HashMap<>();
        Set<Long> sediConAttivita = new HashSet<>();
        List<StatisticaSettimana> settimane = new ArrayList<>();
        long tPizze = 0, tOrdini = 0, tRicavi = 0;
        int settimaneConDati = 0;
        for (LocalDate l : lunedi) {
            long pizze = 0, ordini = 0, ric = 0;
            boolean conDati = false;
            List<Rif> mancanti = new ArrayList<>();
            for (Sede s : scelte) {
                Chiave k = new Chiave(s.getId(), l);
                DatiSettimana d = inseriti.get(k);
                if (ricavi.containsKey(k)) {
                    sediConAttivita.add(s.getId());
                }
                if (d == null) {
                    if (!s.isArchiviata()) {
                        mancanti.add(new Rif(s.getId(), s.getNome()));
                    }
                    continue;
                }
                conDati = true;
                sediConAttivita.add(s.getId());
                long[] v = perSede.computeIfAbsent(s.getId(), x -> new long[4]);
                v[3]++;
                if (d.getOrdini() > 0) {
                    long r = ricavi.getOrDefault(k, 0L);
                    v[0] += d.getPizze();
                    v[1] += d.getOrdini();
                    v[2] += r;
                    pizze += d.getPizze();
                    ordini += d.getOrdini();
                    ric += r;
                }
            }
            if (conDati) {
                settimaneConDati++;
            }
            tPizze += pizze;
            tOrdini += ordini;
            tRicavi += ric;
            settimane.add(new StatisticaSettimana(l, pizze, ordini, ric, scontrinoMedio(ric, ordini), mancanti));
        }

        List<StatisticaPerSede> righe = new ArrayList<>();
        for (Sede s : scelte) {
            long[] v = perSede.get(s.getId());
            if (s.isArchiviata() && !sediConAttivita.contains(s.getId())) {
                continue;
            }
            if (v == null) {
                v = new long[4];
            }
            righe.add(new StatisticaPerSede(new Rif(s.getId(), s.getNome()), v[0], v[1], v[2],
                    scontrinoMedio(v[2], v[1]), pizzePerOrdine(v[0], v[1]), (int) v[3]));
        }
        return new Statistiche(da, a,
                new TotaleStatistiche(tPizze, tOrdini, tRicavi, scontrinoMedio(tRicavi, tOrdini),
                        pizzePerOrdine(tPizze, tOrdini), settimaneConDati, lunedi.size()),
                righe, settimane);
    }

    // ---------------------------------------------------------------- esportazione

    /** Una riga del foglio «Statistiche»: i ricavi sono tutti quelli della sede nella settimana. */
    public record RigaStatistica(LocalDate settimana, String sede, int pizze, int ordini, long ricaviCent,
                                 Long scontrinoMedioCent) {
    }

    /** I dati inseriti per le settimane il cui lunedi' cade in [da, a], per settimana e poi per inserimento. */
    @Transactional(readOnly = true)
    public List<RigaStatistica> righePerEsportazione(LocalDate da, LocalDate a, Set<Long> sediIds) {
        LocalDate primo = da.with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
        if (primo.isAfter(a)) {
            return List.of();
        }
        LocalDate ultimo = lunedi(a);
        Map<Chiave, Long> ricavi = ricaviPerSedeSettimana(primo, ultimo.plusDays(6), sediIds);
        List<RigaStatistica> righe = new ArrayList<>();
        for (DatiSettimana d : dati.findBySettimanaBetweenOrderBySettimanaAscIdAsc(primo, ultimo)) {
            if (sediIds != null && !sediIds.contains(d.getSede().getId())) {
                continue;
            }
            long r = ricavi.getOrDefault(new Chiave(d.getSede().getId(), d.getSettimana()), 0L);
            righe.add(new RigaStatistica(d.getSettimana(), d.getSede().getNome(), d.getPizze(), d.getOrdini(), r,
                    scontrinoMedio(r, d.getOrdini())));
        }
        return righe;
    }

    // ---------------------------------------------------------------- calcoli

    /** Somma dei ricavi per (sede, lunedi' della settimana) fra due date; {@code sediIds} null = tutte. */
    private Map<Chiave, Long> ricaviPerSedeSettimana(LocalDate da, LocalDate a, Set<Long> sediIds) {
        Specification<Movimento> spec = (root, query, cb) -> {
            var base = cb.and(cb.equal(root.get("tipo"), Tipo.RICAVO),
                    cb.greaterThanOrEqualTo(root.get("data"), da), cb.lessThanOrEqualTo(root.get("data"), a));
            return sediIds == null ? base : cb.and(base, root.get("sede").get("id").in(sediIds));
        };
        Map<Chiave, Long> ricavi = new HashMap<>();
        for (Movimento m : movimenti.findAll(spec, Sort.by("id"))) {
            ricavi.merge(new Chiave(m.getSede().getId(), lunedi(m.getData())), m.getImportoCent(), Long::sum);
        }
        return ricavi;
    }

    /** Ricavi / ordini, arrotondato al centesimo (half-up); null se non ci sono ordini. */
    static Long scontrinoMedio(long ricaviCent, long ordini) {
        if (ordini <= 0) {
            return null;
        }
        return BigDecimal.valueOf(ricaviCent).divide(BigDecimal.valueOf(ordini), 0, RoundingMode.HALF_UP).longValueExact();
    }

    /** Pizze / ordini a 2 decimali (half-up); null se non ci sono ordini. */
    static Double pizzePerOrdine(long pizze, long ordini) {
        if (ordini <= 0) {
            return null;
        }
        return BigDecimal.valueOf(pizze).divide(BigDecimal.valueOf(ordini), 2, RoundingMode.HALF_UP).doubleValue();
    }
}
