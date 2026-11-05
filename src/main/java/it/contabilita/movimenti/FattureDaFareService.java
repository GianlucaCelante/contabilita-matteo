package it.contabilita.movimenti;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.api.ErroreApi;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * «Fatture da fare» (docs/api.md): caselle e stato mensile di ciascuna. Non e' collegato ai movimenti.
 * Le risposte sono mappe/liste JSON gia' nella forma del contratto.
 */
@Service
public class FattureDaFareService {

    private static final int GIORNI_PROMEMORIA = 3;
    private static final int MESI_MASSIMI = 24;

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public FattureDaFareService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    private record Casella(long id, String nome, YearMonth dalMese, Integer giorno) {
    }

    private record Stato(String stato, Long importoCent, String nota) {
    }

    // ---- caselle ----

    @Transactional(readOnly = true)
    public List<Map<String, Object>> elenco() {
        return caselle().stream().map(FattureDaFareService::dto).toList();
    }

    public record Esito(Map<String, Object> casella, boolean creata) {
    }

    @Transactional
    public Esito crea(JsonNode corpo) {
        String nome = nomeValido(corpo == null ? null : corpo.get("nome"));
        Integer giorno = giornoValido(corpo.get("giornoScadenza"));
        YearMonth dal = corpo.hasNonNull("dalMese") ? meseValido(corpo.get("dalMese")) : YearMonth.now(clock);
        Casella esistente = perChiave(chiave(nome));
        if (esistente != null) {
            return new Esito(dto(esistente), false);
        }
        jdbc.update("INSERT INTO fattura_casella (nome, nome_chiave, dal_mese, giorno_scadenza) VALUES (?, ?, ?, ?)",
                nome, chiave(nome), dal.toString(), giorno);
        return new Esito(dto(perChiave(chiave(nome))), true);
    }

    @Transactional
    public Map<String, Object> aggiorna(long id, JsonNode corpo) {
        Casella c = trova(id);
        boolean haNome = corpo != null && corpo.has("nome");
        boolean haGiorno = corpo != null && corpo.has("giornoScadenza");
        boolean haDal = corpo != null && corpo.has("dalMese");
        if (!haNome && !haGiorno && !haDal) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Indica almeno un campo da modificare.");
        }
        String nome = haNome ? nomeValido(corpo.get("nome")) : c.nome();
        Integer giorno = haGiorno ? giornoValido(corpo.get("giornoScadenza")) : c.giorno();
        YearMonth dal = haDal ? meseValido(corpo.get("dalMese")) : c.dalMese();
        Casella altra = perChiave(chiave(nome));
        if (altra != null && altra.id() != id) {
            throw new ErroreApi(HttpStatus.CONFLICT, "Esiste già una casella con questo nome.");
        }
        jdbc.update("UPDATE fattura_casella SET nome = ?, nome_chiave = ?, dal_mese = ?, giorno_scadenza = ? WHERE id = ?",
                nome, chiave(nome), dal.toString(), giorno, id);
        return dto(trova(id));
    }

    @Transactional
    public void elimina(long id) {
        trova(id);
        jdbc.update("DELETE FROM fattura_mese WHERE casella_id = ?", id);
        jdbc.update("DELETE FROM fattura_casella WHERE id = ?", id);
    }

    // ---- stati mensili ----

    @Transactional
    public Map<String, Object> impostaMese(long id, String meseTesto, JsonNode corpo) {
        trova(id);
        YearMonth mese = parseMese(meseTesto);
        if (corpo == null || !corpo.hasNonNull("stato") || !corpo.get("stato").isTextual()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Manca lo stato.");
        }
        String stato = corpo.get("stato").asText();
        if (!List.of("DA_FARE", "EMESSA", "PAGATA").contains(stato)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Stato non valido: " + stato);
        }
        Long importo = null;
        if (corpo.hasNonNull("importoCent")) {
            JsonNode i = corpo.get("importoCent");
            if (!i.isIntegralNumber() || i.asLong() < 0) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "L'importo non può essere negativo.");
            }
            importo = i.asLong();
        }
        String nota = null;
        if (corpo.hasNonNull("nota")) {
            if (!corpo.get("nota").isTextual()) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "La nota non è valida.");
            }
            nota = corpo.get("nota").asText().trim();
            if (nota.length() > 200) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "La nota può avere al massimo 200 caratteri.");
            }
            if (nota.isEmpty()) {
                nota = null;
            }
        }
        if (stato.equals("DA_FARE") && importo == null && nota == null) {
            jdbc.update("DELETE FROM fattura_mese WHERE casella_id = ? AND mese = ?", id, mese.toString());
        } else {
            jdbc.update("INSERT OR REPLACE INTO fattura_mese (casella_id, mese, stato, importo_cent, nota) VALUES (?, ?, ?, ?, ?)",
                    id, mese.toString(), stato, importo, nota);
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("mese", mese.toString());
        r.put("stato", stato);
        r.put("importoCent", importo);
        r.put("nota", nota);
        return r;
    }

    // ---- griglia e promemoria ----

    @Transactional(readOnly = true)
    public Map<String, Object> griglia(String daTesto, String aTesto) {
        if (daTesto == null || aTesto == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Indica il periodo con «da» e «a» (yyyy-MM).");
        }
        YearMonth da = parseMese(daTesto);
        YearMonth a = parseMese(aTesto);
        if (da.isAfter(a)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "«da» non può essere dopo «a».");
        }
        if (ChronoUnit.MONTHS.between(da, a) + 1 > MESI_MASSIMI) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il periodo può essere al massimo di " + MESI_MASSIMI + " mesi.");
        }
        List<YearMonth> mesi = new ArrayList<>();
        for (YearMonth m = da; !m.isAfter(a); m = m.plusMonths(1)) {
            mesi.add(m);
        }
        Map<String, Stato> salvati = statiSalvati(da, a);
        int daFare = 0;
        List<Map<String, Object>> righe = new ArrayList<>();
        for (Casella c : caselle()) {
            List<Map<String, Object>> elementi = new ArrayList<>();
            for (YearMonth m : mesi) {
                Stato s = salvati.get(c.id() + "|" + m);
                boolean attiva = s != null || !m.isBefore(c.dalMese());
                String stato = s == null ? "DA_FARE" : s.stato();
                if (attiva && stato.equals("DA_FARE")) {
                    daFare++;
                }
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("mese", m.toString());
                e.put("attiva", attiva);
                e.put("stato", stato);
                e.put("importoCent", s == null ? null : s.importoCent());
                e.put("nota", s == null ? null : s.nota());
                LocalDate sc = scadenza(c, m);
                e.put("scadenza", sc == null ? null : sc.toString());
                elementi.add(e);
            }
            Map<String, Object> riga = dto(c);
            riga.put("mesi", elementi);
            righe.add(riga);
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("mesi", mesi.stream().map(YearMonth::toString).toList());
        r.put("caselle", righe);
        r.put("daFare", daFare);
        return r;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> promemoria() {
        LocalDate oggi = LocalDate.now(clock);
        YearMonth mese = YearMonth.from(oggi);
        Map<String, Stato> salvati = statiSalvati(mese, mese);
        int daFare = 0;
        List<Map<String, Object>> inScadenza = new ArrayList<>();
        for (Casella c : caselle()) {
            Stato s = salvati.get(c.id() + "|" + mese);
            boolean attiva = s != null || !mese.isBefore(c.dalMese());
            if (!attiva || (s != null && !s.stato().equals("DA_FARE"))) {
                continue;
            }
            daFare++;
            LocalDate sc = scadenza(c, mese);
            if (sc == null) {
                continue;
            }
            long giorni = ChronoUnit.DAYS.between(oggi, sc);
            if (giorni <= GIORNI_PROMEMORIA) {
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("casellaId", c.id());
                e.put("nome", c.nome());
                e.put("mese", mese.toString());
                e.put("scadenza", sc.toString());
                e.put("giorniMancanti", giorni);
                inScadenza.add(e);
            }
        }
        inScadenza.sort(Comparator.comparingLong(e -> (Long) e.get("giorniMancanti")));
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("daFare", daFare);
        r.put("inScadenza", inScadenza);
        return r;
    }

    // ---- interni ----

    private static LocalDate scadenza(Casella c, YearMonth m) {
        return c.giorno() == null ? null : m.atDay(Math.min(c.giorno(), m.lengthOfMonth()));
    }

    private Map<String, Stato> statiSalvati(YearMonth da, YearMonth a) {
        Map<String, Stato> m = new HashMap<>();
        jdbc.query("SELECT casella_id, mese, stato, importo_cent, nota FROM fattura_mese WHERE mese >= ? AND mese <= ?",
                rs -> {
                    long imp = rs.getLong("importo_cent");
                    m.put(rs.getLong("casella_id") + "|" + rs.getString("mese"),
                            new Stato(rs.getString("stato"), rs.wasNull() ? null : imp, rs.getString("nota")));
                }, da.toString(), a.toString());
        return m;
    }

    private List<Casella> caselle() {
        return jdbc.query("SELECT id, nome, dal_mese, giorno_scadenza FROM fattura_casella ORDER BY id", FattureDaFareService::riga);
    }

    private Casella perChiave(String chiave) {
        return jdbc.query("SELECT id, nome, dal_mese, giorno_scadenza FROM fattura_casella WHERE nome_chiave = ?",
                FattureDaFareService::riga, chiave).stream().findFirst().orElse(null);
    }

    private Casella trova(long id) {
        return jdbc.query("SELECT id, nome, dal_mese, giorno_scadenza FROM fattura_casella WHERE id = ?",
                FattureDaFareService::riga, id).stream().findFirst()
                .orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Casella non trovata."));
    }

    private static Casella riga(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        long id = rs.getLong("id");
        String nome = rs.getString("nome");
        YearMonth dal = YearMonth.parse(rs.getString("dal_mese"));
        int g = rs.getInt("giorno_scadenza");
        return new Casella(id, nome, dal, rs.wasNull() ? null : g);
    }

    private static Map<String, Object> dto(Casella c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.id());
        m.put("nome", c.nome());
        m.put("dalMese", c.dalMese().toString());
        m.put("giornoScadenza", c.giorno());
        return m;
    }

    private static String chiave(String nome) {
        return nome.toLowerCase(Locale.ROOT);
    }

    private static String nomeValido(JsonNode n) {
        if (n == null || !n.isTextual() || n.asText().isBlank()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il nome è obbligatorio.");
        }
        String nome = n.asText().trim();
        if (nome.length() > 120) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il nome può avere al massimo 120 caratteri.");
        }
        return nome;
    }

    private static Integer giornoValido(JsonNode g) {
        if (g == null || g.isNull()) {
            return null;
        }
        if (!g.isIntegralNumber() || g.asInt() < 1 || g.asInt() > 31) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il giorno di scadenza deve essere tra 1 e 31.");
        }
        return g.asInt();
    }

    private static YearMonth meseValido(JsonNode m) {
        if (m == null || !m.isTextual()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il mese deve essere nel formato yyyy-MM.");
        }
        return parseMese(m.asText());
    }

    private static YearMonth parseMese(String testo) {
        try {
            if (testo == null || !testo.matches("\\d{4}-\\d{2}")) {
                throw new DateTimeParseException("formato", String.valueOf(testo), 0);
            }
            return YearMonth.parse(testo);
        } catch (DateTimeParseException e) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il mese deve essere nel formato yyyy-MM.");
        }
    }
}
