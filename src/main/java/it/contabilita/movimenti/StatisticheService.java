package it.contabilita.movimenti;

import it.contabilita.api.Dto.GiorniInput;
import it.contabilita.api.Dto.IntervalloSerie;
import it.contabilita.api.Dto.Rif;
import it.contabilita.api.Dto.SedeSerie;
import it.contabilita.api.Dto.SerieStatistiche;
import it.contabilita.api.Dto.SettimanaDto;
import it.contabilita.api.Dto.SettimanaCompletaInput;
import it.contabilita.api.Dto.SettimanaInput;
import it.contabilita.api.Dto.StatisticaGiorno;
import it.contabilita.api.Dto.StatisticaPerSede;
import it.contabilita.api.Dto.StatisticaSede;
import it.contabilita.api.Dto.StatisticaSettimana;
import it.contabilita.api.Dto.Statistiche;
import it.contabilita.api.Dto.TotaleStatistiche;
import it.contabilita.api.Dto.VoceGiornoInput;
import it.contabilita.api.Dto.VoceSettimanaInput;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.DatiGiorno;
import it.contabilita.dati.DatiGiornoRepository;
import it.contabilita.dati.DatiSettimana;
import it.contabilita.dati.DatiSettimanaRepository;
import it.contabilita.dati.Documento;
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
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Statistiche di pizze e ordini (docs/api.md, "Statistiche"). Pizze e ordini si caricano a mano per sede in due modi: giorno
 * per giorno o con il totale della settimana (il lunedi' identifica la settimana). Per una (sede, settimana) vale un solo modo:
 * salvare i giorni cancella il totale settimanale e viceversa; in lettura, se ci fossero entrambi, valgono i giorni.
 * Scontrino medio = ricavi dei giorni (o della settimana del totale) con dati e ordini / ordini.
 */
@Service
public class StatisticheService {

    /** Limite ragionevole per pizze e ordini di un giorno o di una settimana (evita overflow e refusi). */
    static final int MASSIMO = 1_000_000;

    /** Al massimo tanti intervalli in una serie del grafico. */
    static final int MASSIMO_INTERVALLI = 400;

    /** Da dove vengono i numeri di una sede in una settimana. */
    public static final String FONTE_GIORNI = "GIORNI";
    public static final String FONTE_SETTIMANA = "SETTIMANA";

    private static final DateTimeFormatter GIORNO_BREVE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final DatiSettimanaRepository dati;
    private final DatiGiornoRepository giorni;
    private final MovimentoRepository movimenti;
    private final SediService sedi;
    private final Clock clock;

    public StatisticheService(DatiSettimanaRepository dati, DatiGiornoRepository giorni, MovimentoRepository movimenti,
                              SediService sedi, Clock clock) {
        this.dati = dati;
        this.giorni = giorni;
        this.movimenti = movimenti;
        this.sedi = sedi;
        this.clock = clock;
    }

    /** Il lunedi' della settimana ISO che contiene il giorno. */
    public static LocalDate lunedi(LocalDate giorno) {
        return giorno.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    /** (sede, giorno); per i vecchi totali settimanali il giorno e' il lunedi'. */
    private record Chiave(long sedeId, LocalDate giorno) {
    }

    /**
     * Quanto pesa un dato inserito: un giorno nel suo giorno (con i ricavi di quel giorno), un totale settimanale
     * nel suo lunedi' (con i ricavi di tutta la settimana). {@code ricaviConDati} e' 0 se gli ordini sono 0;
     * {@code settimanale} = viene da un totale settimanale.
     */
    private record Contributo(int pizze, int ordini, long ricaviConDati, boolean settimanale) {
    }

    /** I dati inseriti e i ricavi (per sede e giorno) di un insieme di settimane intere, gia' filtrati per sede. */
    private static final class Archivio {
        final Map<Chiave, DatiGiorno> giorni = new HashMap<>();
        /** Chiave: (sede, lunedi'). */
        final Map<Chiave, DatiSettimana> settimanali = new HashMap<>();
        /** Le (sede, lunedi') con almeno un giorno inserito: li' il totale settimanale non conta. */
        final Set<Chiave> settimaneConGiorni = new HashSet<>();
        /** (sede, giorno) -> {tutti i ricavi, ricavi extra}. */
        final Map<Chiave, long[]> ricavi = new HashMap<>();
        final Map<Chiave, Contributo> contributi = new HashMap<>();

        /** {tutti i ricavi, ricavi extra} della sede fra due date comprese. */
        long[] ricavi(long sedeId, LocalDate da, LocalDate a) {
            long[] t = new long[2];
            for (LocalDate g = da; !g.isAfter(a); g = g.plusDays(1)) {
                long[] r = ricavi.get(new Chiave(sedeId, g));
                if (r != null) {
                    t[0] += r[0];
                    t[1] += r[1];
                }
            }
            return t;
        }
    }

    /**
     * Carica le settimane intere (lunedi'-domenica) che toccano [da, a]; {@code sediIds} null = tutte. Le sedi personali
     * non hanno pizze e ordini: restano sempre fuori (anche i loro ricavi e i dati inseriti prima che lo diventassero).
     */
    private Archivio carica(LocalDate da, LocalDate a, Set<Long> sediIds) {
        LocalDate primo = lunedi(da);
        LocalDate ultimo = lunedi(a).plusDays(6);
        Archivio ar = new Archivio();
        for (DatiGiorno g : giorni.findByGiornoBetweenOrderByGiornoAscIdAsc(primo, ultimo)) {
            long id = g.getSede().getId();
            if (!g.getSede().isPersonale() && (sediIds == null || sediIds.contains(id))) {
                ar.giorni.put(new Chiave(id, g.getGiorno()), g);
                ar.settimaneConGiorni.add(new Chiave(id, lunedi(g.getGiorno())));
            }
        }
        for (DatiSettimana d : dati.findBySettimanaBetweenOrderBySettimanaAscIdAsc(primo, lunedi(a))) {
            long id = d.getSede().getId();
            if (!d.getSede().isPersonale() && (sediIds == null || sediIds.contains(id))) {
                ar.settimanali.put(new Chiave(id, d.getSettimana()), d);
            }
        }
        Specification<Movimento> spec = (root, query, cb) -> {
            var base = cb.and(cb.equal(root.get("tipo"), Tipo.RICAVO), cb.isFalse(root.get("sede").get("personale")),
                    cb.greaterThanOrEqualTo(root.get("data"), primo), cb.lessThanOrEqualTo(root.get("data"), ultimo));
            return sediIds == null ? base : cb.and(base, root.get("sede").get("id").in(sediIds));
        };
        for (Movimento m : movimenti.findAll(spec, Sort.by("id"))) {
            long[] r = ar.ricavi.computeIfAbsent(new Chiave(m.getSede().getId(), m.getData()), k -> new long[2]);
            r[0] += m.getImportoCent();
            if (m.getDocumento() == Documento.RICAVO_EXTRA) {
                r[1] += m.getImportoCent();
            }
        }
        for (var e : ar.giorni.entrySet()) {
            DatiGiorno g = e.getValue();
            long[] r = ar.ricavi.get(e.getKey());
            ar.contributi.put(e.getKey(), new Contributo(g.getPizze(), g.getOrdini(), g.getOrdini() > 0 && r != null ? r[0] : 0, false));
        }
        for (var e : ar.settimanali.entrySet()) {
            if (ar.settimaneConGiorni.contains(e.getKey())) {
                continue; // la settimana ha i giorni: il totale settimanale non conta
            }
            DatiSettimana d = e.getValue();
            long r = d.getOrdini() > 0 ? ar.ricavi(e.getKey().sedeId(), d.getSettimana(), d.getSettimana().plusDays(6))[0] : 0;
            ar.contributi.put(e.getKey(), new Contributo(d.getPizze(), d.getOrdini(), r, true));
        }
        return ar;
    }

    /** I numeri di una sede in una settimana; {@code fonte} null = nessun dato (la settimana e' «mancante»). */
    private record SedeSettimana(String fonte, long pizze, long ordini, long ricaviConDati, int giorniInseriti) {
        boolean conDati() {
            return fonte != null;
        }
    }

    private static SedeSettimana riassunto(Archivio ar, long sedeId, LocalDate lunedi) {
        Chiave settimana = new Chiave(sedeId, lunedi);
        if (ar.settimaneConGiorni.contains(settimana)) {
            long pizze = 0, ordini = 0, ricavi = 0;
            int inseriti = 0;
            for (int i = 0; i < 7; i++) {
                Contributo c = ar.contributi.get(new Chiave(sedeId, lunedi.plusDays(i)));
                if (c != null) {
                    inseriti++;
                    pizze += c.pizze();
                    ordini += c.ordini();
                    ricavi += c.ricaviConDati();
                }
            }
            return new SedeSettimana(FONTE_GIORNI, pizze, ordini, ricavi, inseriti);
        }
        Contributo c = ar.contributi.get(settimana);
        if (c != null) {
            return new SedeSettimana(FONTE_SETTIMANA, c.pizze(), c.ordini(), c.ricaviConDati(), 0);
        }
        return new SedeSettimana(null, 0, 0, 0, 0);
    }

    // ---------------------------------------------------------------- una settimana

    /** {@code data}: un giorno qualsiasi della settimana; assente = oggi. */
    @Transactional(readOnly = true)
    public SettimanaDto settimana(LocalDate data) {
        return costruisciSettimana(lunedi(data == null ? LocalDate.now(clock) : data));
    }

    private SettimanaDto costruisciSettimana(LocalDate lunedi) {
        LocalDate domenica = lunedi.plusDays(6);
        Archivio ar = carica(lunedi, lunedi, null);
        List<StatisticaSede> righe = new ArrayList<>();
        for (Sede s : sediConPizze()) {
            long id = s.getId();
            SedeSettimana r = riassunto(ar, id, lunedi);
            DatiSettimana vecchio = ar.settimanali.get(new Chiave(id, lunedi));
            long[] ric = ar.ricavi(id, lunedi, domenica);
            if (s.isArchiviata() && !r.conDati() && vecchio == null && ric[0] == 0) {
                continue;
            }
            List<StatisticaGiorno> perGiorno = new ArrayList<>();
            for (int i = 0; i < 7; i++) {
                LocalDate g = lunedi.plusDays(i);
                DatiGiorno d = ar.giorni.get(new Chiave(id, g));
                long[] rg = ar.ricavi(id, g, g);
                perGiorno.add(d == null
                        ? new StatisticaGiorno(g, null, null, rg[0], rg[1], null, null)
                        : new StatisticaGiorno(g, d.getPizze(), d.getOrdini(), rg[0], rg[1],
                        scontrinoMedio(rg[0], d.getOrdini()), pizzePerOrdine(d.getPizze(), d.getOrdini())));
            }
            Rif rif = new Rif(id, s.getNome());
            if (!r.conDati()) {
                righe.add(new StatisticaSede(rif, null, null, ric[0], null, null, false,
                        ric[0], ric[1], 0, null, 0, perGiorno));
            } else {
                righe.add(new StatisticaSede(rif, (int) r.pizze(), (int) r.ordini(), ric[0],
                        scontrinoMedio(r.ricaviConDati(), r.ordini()), pizzePerOrdine(r.pizze(), r.ordini()), true,
                        ric[0], ric[1], r.ricaviConDati(), r.fonte(), r.giorniInseriti(), perGiorno));
            }
        }
        return new SettimanaDto(lunedi, domenica, righe);
    }

    // ---------------------------------------------------------------- inserimento

    private record Voce(Sede sede, Integer pizze, Integer ordini) {
    }

    private record VoceGiorno(Voce voce, LocalDate giorno) {
    }

    /**
     * Il totale della settimana per sede. Con i numeri cancella i giorni di quella sede in quella settimana (un solo modo per
     * (sede, settimana)); senza numeri cancella il totale. Tutto o niente.
     */
    @Transactional
    public SettimanaDto salva(SettimanaInput in) {
        LocalDate lunedi = settimanaDa(in == null ? null : in.settimana());
        if (in.voci() == null || in.voci().isEmpty()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Indica almeno una voce.");
        }
        // prima si controlla tutto, poi si scrive: o passano tutte o nessuna
        List<Voce> voci = validaTotali(in.voci());
        scriviTotali(voci, lunedi, LocalDateTime.now(clock).withNano(0));
        giorni.flush();
        dati.flush();
        return costruisciSettimana(lunedi);
    }

    /**
     * Pizze e ordini giorno per giorno: tutti i giorni della stessa settimana, tutto o niente. Un giorno con i numeri cancella il
     * totale settimanale della sua sede in quella settimana (un solo modo per (sede, settimana)). Risponde con la settimana.
     */
    @Transactional
    public SettimanaDto salvaGiorni(GiorniInput in) {
        if (in == null || in.voci() == null || in.voci().isEmpty()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Indica almeno una voce.");
        }
        List<VoceGiorno> voci = validaGiorni(in.voci(), null);
        LocalDate lunedi = lunedi(voci.get(0).giorno());
        scriviGiorni(voci, lunedi, LocalDateTime.now(clock).withNano(0));
        giorni.flush();
        dati.flush();
        return costruisciSettimana(lunedi);
    }

    /**
     * Una settimana intera in un solo salvataggio (docs/api.md, "Salvare una settimana intera"): giorni di alcune sedi e totali
     * settimanali di altre, con le stesse regole e gli stessi messaggi di {@link #salvaGiorni} e {@link #salva}. Una sede non
     * puo' avere i numeri sia nei giorni sia nei totali. Tutto o niente, in una sola transazione; risponde con la settimana.
     */
    @Transactional
    public SettimanaDto salvaSettimanaCompleta(SettimanaCompletaInput in) {
        LocalDate lunedi = settimanaDa(in == null ? null : in.settimana());
        List<VoceGiornoInput> giorniIn = in.giorni() == null ? List.of() : in.giorni();
        List<VoceSettimanaInput> totaliIn = in.totali() == null ? List.of() : in.totali();
        if (giorniIn.isEmpty() && totaliIn.isEmpty()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Indica almeno una voce.");
        }
        List<VoceGiorno> voceGiorni = giorniIn.isEmpty() ? List.of() : validaGiorni(giorniIn, lunedi);
        List<Voce> voceTotali = totaliIn.isEmpty() ? List.of() : validaTotali(totaliIn);
        Set<Long> conGiorni = new HashSet<>();
        for (VoceGiorno vg : voceGiorni) {
            if (vg.voce().pizze() != null) {
                conGiorni.add(vg.voce().sede().getId());
            }
        }
        for (Voce v : voceTotali) {
            if (v.pizze() != null && conGiorni.contains(v.sede().getId())) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Sede «" + v.sede().getNome()
                        + "»: scegli un solo modo per la settimana, giorno per giorno o totale della settimana.");
            }
        }
        LocalDateTime adesso = LocalDateTime.now(clock).withNano(0);
        scriviTotali(voceTotali, lunedi, adesso);
        scriviGiorni(voceGiorni, lunedi, adesso);
        giorni.flush();
        dati.flush();
        return costruisciSettimana(lunedi);
    }

    /** Il lunedi' della settimana indicata (un giorno qualsiasi, yyyy-MM-dd); 400 se manca o non e' valida. */
    private static LocalDate settimanaDa(String settimana) {
        if (settimana == null || settimana.isBlank()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Indica la settimana (un giorno qualsiasi, yyyy-MM-dd).");
        }
        try {
            return lunedi(LocalDate.parse(settimana.trim()));
        } catch (DateTimeParseException e) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La settimana non è una data valida (yyyy-MM-dd): " + settimana);
        }
    }

    /** Le voci dei totali settimanali, controllate tutte (sede presente, una volta sola, scrivibile; numeri). */
    private List<Voce> validaTotali(List<VoceSettimanaInput> in) {
        List<Voce> voci = new ArrayList<>();
        Set<Long> viste = new HashSet<>();
        for (VoceSettimanaInput v : in) {
            if (v == null || v.sedeId() == null) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Ogni voce deve avere la sede.");
            }
            if (!viste.add(v.sedeId())) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "La sede " + v.sedeId() + " compare più volte.");
            }
            Sede sede = sediScrivibile(v.sedeId());
            voci.add(voce(sede, v.pizze(), v.ordini(), "Sede «" + sede.getNome() + "»"));
        }
        return voci;
    }

    /**
     * Le voci dei giorni, controllate tutte; tutti i giorni nella stessa settimana: quella di {@code lunedi} se indicato,
     * altrimenti quella del primo giorno.
     */
    private List<VoceGiorno> validaGiorni(List<VoceGiornoInput> in, LocalDate lunedi) {
        List<VoceGiorno> voci = new ArrayList<>();
        Set<Chiave> viste = new HashSet<>();
        for (VoceGiornoInput v : in) {
            if (v == null || v.sedeId() == null) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Ogni voce deve avere la sede.");
            }
            if (v.data() == null || v.data().isBlank()) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Ogni voce deve avere il giorno (yyyy-MM-dd).");
            }
            LocalDate giorno;
            try {
                giorno = LocalDate.parse(v.data().trim());
            } catch (DateTimeParseException e) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il giorno non è una data valida (yyyy-MM-dd): " + v.data());
            }
            if (lunedi == null) {
                lunedi = lunedi(giorno);
            } else if (!lunedi.equals(lunedi(giorno))) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Tutti i giorni devono essere della stessa settimana (da lunedì a domenica).");
            }
            Sede sede = sediScrivibile(v.sedeId());
            String chi = "Sede «" + sede.getNome() + "», " + giorno.format(GIORNO_BREVE);
            if (!viste.add(new Chiave(sede.getId(), giorno))) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, chi + ": il giorno compare più volte.");
            }
            Voce voce = voce(sede, v.pizze(), v.ordini(), chi);
            // i numeri di un giorno futuro no (cancellarlo si': serve a pulire); il totale settimanale non ha questo limite
            if (voce.pizze() != null && giorno.isAfter(LocalDate.now(clock))) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Non si possono inserire pizze e ordini per un giorno futuro.");
            }
            voci.add(new VoceGiorno(voce, giorno));
        }
        return voci;
    }

    /** Upsert (o cancellazione, senza numeri) dei totali; un totale con i numeri cancella i giorni della sua sede nella settimana. */
    private void scriviTotali(List<Voce> voci, LocalDate lunedi, LocalDateTime adesso) {
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
            if (v.pizze() != null) { // il totale sostituisce i giorni della sede in quella settimana
                giorni.deleteAll(giorni.findBySedeIdAndGiornoBetween(v.sede().getId(), lunedi, lunedi.plusDays(6)));
            }
        }
    }

    /** Upsert (o cancellazione, senza numeri) dei giorni; un giorno con i numeri cancella il totale settimanale della sua sede. */
    private void scriviGiorni(List<VoceGiorno> voci, LocalDate lunedi, LocalDateTime adesso) {
        for (VoceGiorno vg : voci) {
            Voce v = vg.voce();
            var esistente = giorni.findBySedeIdAndGiorno(v.sede().getId(), vg.giorno());
            if (v.pizze() == null) {
                esistente.ifPresent(giorni::delete);
            } else if (esistente.isPresent()) {
                DatiGiorno d = esistente.get();
                d.setPizze(v.pizze());
                d.setOrdini(v.ordini());
                d.setModificatoIl(adesso);
                giorni.save(d);
            } else {
                giorni.save(new DatiGiorno(v.sede(), vg.giorno(), v.pizze(), v.ordini(), adesso));
            }
            if (v.pizze() != null) { // i giorni sostituiscono il totale settimanale della sede
                dati.findBySedeIdAndSettimana(v.sede().getId(), lunedi).ifPresent(dati::delete);
            }
        }
    }

    /**
     * Sede esistente (altrimenti l'errore di {@code SediService.trova}, come prima: «Sede non trovata.»), non archiviata e
     * non personale.
     */
    private Sede sediScrivibile(Long id) {
        Sede sede = sedi.trova(id);
        if (sede.isArchiviata()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La sede «" + sede.getNome() + "» è archiviata.");
        }
        if (sede.isPersonale()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST,
                    "La sede «" + sede.getNome() + "» è personale: non ha pizze e ordini.");
        }
        return sede;
    }

    /** Le sedi che hanno pizze e ordini (tutte tranne le personali, archiviate comprese), nell'ordine degli elenchi. */
    private List<Sede> sediConPizze() {
        return sedi.tutte().stream().filter(s -> !s.isPersonale()).toList();
    }

    /** Le regole dei numeri, uguali per giorno e settimana: interi 0..MASSIMO, entrambi o nessuno, con 0 ordini 0 pizze. */
    private static Voce voce(Sede sede, BigDecimal pizzeGrezze, BigDecimal ordiniGrezzi, String chi) {
        Integer pizze = intero(pizzeGrezze, "pizze", chi);
        Integer ordini = intero(ordiniGrezzi, "ordini", chi);
        if ((pizze == null) != (ordini == null)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, chi
                    + ": indica sia le pizze sia gli ordini (o nessuno dei due per cancellare il dato).");
        }
        if (ordini != null && ordini == 0 && pizze > 0) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, chi + ": con 0 ordini le pizze devono essere 0.");
        }
        return new Voce(sede, pizze, ordini);
    }

    private static Integer intero(BigDecimal valore, String campo, String chi) {
        if (valore == null) {
            return null;
        }
        BigDecimal n = valore.stripTrailingZeros();
        if (n.scale() > 0) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, chi + ": " + campo + " deve essere un numero intero.");
        }
        if (n.signum() < 0) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, chi + ": " + campo + " non può essere negativo.");
        }
        if (n.compareTo(BigDecimal.valueOf(MASSIMO)) > 0) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, chi + ": " + campo + " è troppo grande (massimo " + MASSIMO + ").");
        }
        return n.intValueExact();
    }

    // ---------------------------------------------------------------- periodo

    private static void controllaPeriodo(LocalDate da, LocalDate a) {
        if (da == null || a == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Servono entrambe le date: da e a.");
        }
        if (da.isAfter(a)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La data iniziale non può essere dopo quella finale.");
        }
    }

    @Transactional(readOnly = true)
    public Statistiche calcola(LocalDate da, LocalDate a, Set<Long> sediIds) {
        controllaPeriodo(da, a);
        // le settimane il cui lunedi' cade in [da, a]
        List<LocalDate> lunedi = new ArrayList<>();
        for (LocalDate l = da.with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY)); !l.isAfter(a); l = l.plusDays(7)) {
            lunedi.add(l);
        }
        List<Sede> scelte = sediConPizze().stream().filter(s -> sediIds == null || sediIds.contains(s.getId())).toList();
        Archivio ar = lunedi.isEmpty() ? new Archivio() : carica(lunedi.get(0), lunedi.get(lunedi.size() - 1), sediIds);

        // per sede: {pizze, ordini, ricavi con dati, settimane con dati, ricavi totali, ricavi extra};
        // nelle somme di pizze, ordini e ricavi con dati contano solo le coppie con dati e ordini > 0
        Map<Long, long[]> perSede = new HashMap<>();
        Set<Long> sediConAttivita = new HashSet<>();
        List<StatisticaSettimana> settimane = new ArrayList<>();
        long tPizze = 0, tOrdini = 0, tRicavi = 0, tTotali = 0, tExtra = 0;
        int settimaneConDati = 0;
        for (LocalDate l : lunedi) {
            long pizze = 0, ordini = 0, ric = 0, totali = 0, extra = 0;
            boolean conDati = false;
            List<Rif> mancanti = new ArrayList<>();
            for (Sede s : scelte) {
                long id = s.getId();
                SedeSettimana r = riassunto(ar, id, l);
                long[] ricSett = ar.ricavi(id, l, l.plusDays(6));
                long[] v = perSede.computeIfAbsent(id, x -> new long[6]);
                v[4] += ricSett[0];
                v[5] += ricSett[1];
                totali += ricSett[0];
                extra += ricSett[1];
                if (ricSett[0] != 0) {
                    sediConAttivita.add(id);
                }
                if (!r.conDati()) {
                    if (!s.isArchiviata()) {
                        mancanti.add(new Rif(id, s.getNome()));
                    }
                    continue;
                }
                conDati = true;
                sediConAttivita.add(id);
                v[3]++;
                if (r.ordini() > 0) {
                    v[0] += r.pizze();
                    v[1] += r.ordini();
                    v[2] += r.ricaviConDati();
                    pizze += r.pizze();
                    ordini += r.ordini();
                    ric += r.ricaviConDati();
                }
            }
            if (conDati) {
                settimaneConDati++;
            }
            tPizze += pizze;
            tOrdini += ordini;
            tRicavi += ric;
            tTotali += totali;
            tExtra += extra;
            settimane.add(new StatisticaSettimana(l, pizze, ordini, ric, scontrinoMedio(ric, ordini), mancanti, ric, totali, extra));
        }

        List<StatisticaPerSede> righe = new ArrayList<>();
        for (Sede s : scelte) {
            long[] v = perSede.get(s.getId());
            if (s.isArchiviata() && !sediConAttivita.contains(s.getId())) {
                continue;
            }
            if (v == null) {
                v = new long[6];
            }
            righe.add(new StatisticaPerSede(new Rif(s.getId(), s.getNome()), v[0], v[1], v[2],
                    scontrinoMedio(v[2], v[1]), pizzePerOrdine(v[0], v[1]), (int) v[3], v[2], v[4], v[5]));
        }
        return new Statistiche(da, a,
                new TotaleStatistiche(tPizze, tOrdini, tRicavi, scontrinoMedio(tRicavi, tOrdini),
                        pizzePerOrdine(tPizze, tOrdini), settimaneConDati, lunedi.size(), tRicavi, tTotali, tExtra),
                righe, settimane);
    }

    // ---------------------------------------------------------------- serie per il grafico

    private enum Passo { GIORNO, SETTIMANA, MESE }

    @Transactional(readOnly = true)
    public SerieStatistiche serie(LocalDate da, LocalDate a, String passoTesto, Set<Long> sediIds) {
        controllaPeriodo(da, a);
        if (passoTesto == null || passoTesto.isBlank()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Indica il passo: GIORNO, SETTIMANA o MESE.");
        }
        Passo passo;
        try {
            passo = Passo.valueOf(passoTesto.trim());
        } catch (IllegalArgumentException e) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "passo: valore non valido: " + passoTesto + " (GIORNO, SETTIMANA o MESE).");
        }
        long quanti = switch (passo) {
            case GIORNO -> ChronoUnit.DAYS.between(da, a) + 1;
            case SETTIMANA -> ChronoUnit.WEEKS.between(lunedi(da), lunedi(a)) + 1;
            case MESE -> ChronoUnit.MONTHS.between(YearMonth.from(da), YearMonth.from(a)) + 1;
        };
        if (quanti > MASSIMO_INTERVALLI) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Troppi intervalli (" + quanti + "): al massimo " + MASSIMO_INTERVALLI
                    + ". Scegli un passo più lungo o un periodo più breve.");
        }
        Archivio ar = carica(da, a, sediIds);
        Map<LocalDate, long[]> perGiorno = perGiorno(ar, null);
        List<IntervalloSerie> intervalli = new ArrayList<>();
        LocalDate inizio = da;
        while (!inizio.isAfter(a)) {
            LocalDate fine = switch (passo) {
                case GIORNO -> inizio;
                case SETTIMANA -> lunedi(inizio).plusDays(6);
                case MESE -> YearMonth.from(inizio).atEndOfMonth();
            };
            if (fine.isAfter(a)) {
                fine = a;
            }
            intervalli.add(intervallo(perGiorno, inizio, fine));
            inizio = fine.plusDays(1);
        }
        // per sede, sulle date esatte: le sedi del filtro nell'ordine di GET /api/sedi; un'archiviata solo se ha attivita'
        List<SedeSerie> perSede = new ArrayList<>();
        for (Sede s : sediConPizze()) {
            if (sediIds != null && !sediIds.contains(s.getId())) {
                continue;
            }
            IntervalloSerie v = intervallo(perGiorno(ar, s.getId()), da, a);
            if (s.isArchiviata() && !v.conDati() && v.ricaviTotaliCent() == 0) {
                continue;
            }
            perSede.add(new SedeSerie(s.getId(), s.getNome(), s.isArchiviata(), da, a, v.pizze(), v.ordini(),
                    v.ricaviTotaliCent(), v.ricaviExtraCent(), v.ricaviConDatiCent(), v.scontrinoMedioCent(),
                    v.pizzePerOrdine(), v.conDati(), v.daTotaleSettimanale()));
        }
        return new SerieStatistiche(da, a, passo.name(), intervallo(perGiorno, da, a), intervalli, perSede);
    }

    /**
     * Per giorno, le sedi dell'archivio insieme ({@code sedeId} null) o una sola: {pizze, ordini, ricavi con dati,
     * dati inseriti, ricavi totali, extra, totali settimanali}.
     */
    private static Map<LocalDate, long[]> perGiorno(Archivio ar, Long sedeId) {
        Map<LocalDate, long[]> perGiorno = new HashMap<>();
        for (var e : ar.contributi.entrySet()) {
            if (sedeId != null && e.getKey().sedeId() != sedeId) {
                continue;
            }
            long[] t = perGiorno.computeIfAbsent(e.getKey().giorno(), g -> new long[7]);
            t[0] += e.getValue().pizze();
            t[1] += e.getValue().ordini();
            t[2] += e.getValue().ricaviConDati();
            t[3]++;
            if (e.getValue().settimanale()) {
                t[6]++;
            }
        }
        for (var e : ar.ricavi.entrySet()) {
            if (sedeId != null && e.getKey().sedeId() != sedeId) {
                continue;
            }
            long[] t = perGiorno.computeIfAbsent(e.getKey().giorno(), g -> new long[7]);
            t[4] += e.getValue()[0];
            t[5] += e.getValue()[1];
        }
        return perGiorno;
    }

    private static IntervalloSerie intervallo(Map<LocalDate, long[]> perGiorno, LocalDate inizio, LocalDate fine) {
        long[] t = new long[7];
        for (LocalDate g = inizio; !g.isAfter(fine); g = g.plusDays(1)) {
            long[] d = perGiorno.get(g);
            if (d != null) {
                for (int i = 0; i < 7; i++) {
                    t[i] += d[i];
                }
            }
        }
        return new IntervalloSerie(inizio, fine, t[0], t[1], t[4], t[5], t[2], scontrinoMedio(t[2], t[1]),
                pizzePerOrdine(t[0], t[1]), t[3] > 0, t[6] > 0);
    }

    // ---------------------------------------------------------------- esportazione

    /**
     * Una riga del foglio «Statistiche» (sede e settimana con dati): {@code ricaviCent} sono tutti i ricavi della sede nella
     * settimana, lo scontrino si calcola sui ricavi dei giorni con dati; {@code giorniInseriti} null = totale settimanale.
     */
    public record RigaStatistica(LocalDate settimana, String sede, int pizze, int ordini, long ricaviCent,
                                 Long scontrinoMedioCent, long ricaviExtraCent, long ricaviConDatiCent,
                                 Integer giorniInseriti) {
    }

    /**
     * Una riga del foglio «Pizze per giorno»: i ricavi sono quelli della sede in quel giorno; lo scontrino e' null (cella
     * vuota, come «—» nell'interfaccia) se gli ordini sono 0 o se nel giorno non ci sono incassi ({@link #scontrinoMedio}).
     */
    public record RigaGiorno(LocalDate data, String sede, int pizze, int ordini, long ricaviCent, long ricaviExtraCent,
                             Long scontrinoMedioCent) {
    }

    public record StatisticheEsportate(List<RigaStatistica> settimane, List<RigaGiorno> giorni) {
        public boolean vuote() {
            return settimane.isEmpty();
        }
    }

    /**
     * Le settimane il cui lunedi' cade in [da, a]: una riga per sede e settimana con dati (per settimana, poi nell'ordine
     * delle sedi) e i giorni inseriti di quelle settimane (per giorno, poi nell'ordine delle sedi).
     */
    @Transactional(readOnly = true)
    public StatisticheEsportate righePerEsportazione(LocalDate da, LocalDate a, Set<Long> sediIds) {
        LocalDate primo = da.with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
        if (primo.isAfter(a)) {
            return new StatisticheEsportate(List.of(), List.of());
        }
        LocalDate ultimo = lunedi(a);
        Archivio ar = carica(primo, ultimo, sediIds);
        List<Sede> scelte = sediConPizze().stream().filter(s -> sediIds == null || sediIds.contains(s.getId())).toList();
        List<RigaStatistica> settimane = new ArrayList<>();
        List<RigaGiorno> perGiorno = new ArrayList<>();
        for (LocalDate l = primo; !l.isAfter(ultimo); l = l.plusDays(7)) {
            for (Sede s : scelte) {
                SedeSettimana r = riassunto(ar, s.getId(), l);
                if (!r.conDati()) {
                    continue;
                }
                long[] ric = ar.ricavi(s.getId(), l, l.plusDays(6));
                settimane.add(new RigaStatistica(l, s.getNome(), (int) r.pizze(), (int) r.ordini(), ric[0],
                        scontrinoMedio(r.ricaviConDati(), r.ordini()), ric[1], r.ricaviConDati(),
                        FONTE_GIORNI.equals(r.fonte()) ? r.giorniInseriti() : null));
            }
            for (int i = 0; i < 7; i++) {
                LocalDate g = l.plusDays(i);
                for (Sede s : scelte) {
                    DatiGiorno d = ar.giorni.get(new Chiave(s.getId(), g));
                    if (d != null) {
                        long[] rg = ar.ricavi(s.getId(), g, g);
                        perGiorno.add(new RigaGiorno(g, s.getNome(), d.getPizze(), d.getOrdini(), rg[0], rg[1],
                                scontrinoMedio(rg[0], d.getOrdini())));
                    }
                }
            }
        }
        return new StatisticheEsportate(settimane, perGiorno);
    }

    // ---------------------------------------------------------------- calcoli

    /**
     * Ricavi / ordini, arrotondato al centesimo (half-up); null se non ci sono ordini o se i ricavi usati per lo scontrino
     * sono 0 (nell'interfaccia «—», nei fogli Excel una cella vuota: non uno scontrino da 0 euro).
     */
    static Long scontrinoMedio(long ricaviCent, long ordini) {
        if (ordini <= 0 || ricaviCent == 0) {
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
