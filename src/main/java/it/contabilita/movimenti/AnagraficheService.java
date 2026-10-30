package it.contabilita.movimenti;

import it.contabilita.api.Dto.CategoriaDto;
import it.contabilita.api.Dto.DipendenteDto;
import it.contabilita.api.Dto.FornitoreDto;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Categoria;
import it.contabilita.dati.CategoriaRepository;
import it.contabilita.dati.Dipendente;
import it.contabilita.dati.DipendenteRepository;
import it.contabilita.dati.Fornitore;
import it.contabilita.dati.FornitoreRepository;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Tipo;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Categorie, fornitori, dipendenti: elenco e "trova o crea" dal solo nome, senza distinguere
 * maiuscole (la chiave e' il nome in minuscolo, regole Unicode).
 */
@Service
public class AnagraficheService {

    /**
     * Il parametro {@code categorie=3,7}: gli id, oppure null se assente o vuoto (= nessun filtro).
     * Un valore che non e' un numero e' un 400, come per {@code sedi}.
     */
    public static Set<Long> idsCategorieDa(String parametro) {
        if (parametro == null || parametro.isBlank()) {
            return null;
        }
        Set<Long> ids = new LinkedHashSet<>();
        for (String voce : parametro.split(",")) {
            String v = voce.trim();
            if (v.isEmpty()) {
                continue;
            }
            try {
                ids.add(Long.parseLong(v));
            } catch (NumberFormatException e) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "categorie: valore non valido: " + v);
            }
        }
        return ids.isEmpty() ? null : ids;
    }


    static final int NOME_MASSIMO = 120;

    /** Il valore e se e' stato creato adesso (201) o esisteva gia' (200). */
    public record Esito<T>(T valore, boolean creato) {
    }

    private final CategoriaRepository categorie;
    private final FornitoreRepository fornitori;
    private final DipendenteRepository dipendenti;

    private final MovimentoRepository movimenti;

    public AnagraficheService(CategoriaRepository categorie, FornitoreRepository fornitori, DipendenteRepository dipendenti,
                              MovimentoRepository movimenti) {
        this.movimenti = movimenti;
        this.categorie = categorie;
        this.fornitori = fornitori;
        this.dipendenti = dipendenti;
    }

    /** Nome ripulito, oppure null se vuoto. */
    static String pulisci(String nome) {
        if (nome == null) {
            return null;
        }
        String n = nome.strip().replaceAll("\\s+", " ");
        return n.isEmpty() ? null : n;
    }

    static String chiave(String nome) {
        return nome.toLowerCase(Locale.ROOT);
    }

    private static String nomeObbligatorio(String nome, String cosa) {
        String n = pulisci(nome);
        if (n == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il nome " + cosa + " è obbligatorio.");
        }
        if (n.length() > NOME_MASSIMO) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il nome " + cosa + " è troppo lungo (massimo " + NOME_MASSIMO + " caratteri).");
        }
        return n;
    }

    // ---- elenchi ----

    @Transactional(readOnly = true)
    public List<CategoriaDto> elencoCategorie(Tipo tipo) {
        List<Categoria> righe = tipo == null ? categorie.findAllByOrderByNomeChiave() : categorie.findByTipoOrderByNomeChiave(tipo);
        return righe.stream().map(AnagraficheService::dto).toList();
    }

    /**
     * Con un testo: prima chi inizia col testo, poi chi lo contiene soltanto; dentro ogni gruppo i piu' usati
     * (per numero di movimenti), a parita' in ordine alfabetico. Senza testo: i piu' usati.
     */
    @Transactional(readOnly = true)
    public List<FornitoreDto> elencoFornitori(String q) {
        String filtro = pulisci(q) == null ? null : chiave(pulisci(q));
        java.util.Map<Long, Long> usi = new java.util.HashMap<>();
        for (Object[] riga : movimenti.contaPerFornitore()) {
            usi.put((Long) riga[0], (Long) riga[1]);
        }
        return fornitori.findAllByOrderByNomeChiave().stream() // gia' alfabetico: il sort e' stabile
                .filter(f -> filtro == null || f.getNomeChiave().contains(filtro))
                .sorted(java.util.Comparator
                        .comparing((Fornitore f) -> filtro != null && f.getNomeChiave().startsWith(filtro) ? 0 : 1)
                        .thenComparing(f -> -usi.getOrDefault(f.getId(), 0L)))
                .map(AnagraficheService::dto).toList();
    }

    @Transactional(readOnly = true)
    public List<DipendenteDto> elencoDipendenti(String q) {
        String filtro = pulisci(q) == null ? null : chiave(pulisci(q));
        return dipendenti.findAllByOrderByNomeChiave().stream()
                .filter(d -> filtro == null || d.getNomeChiave().contains(filtro))
                .map(AnagraficheService::dto).toList();
    }

    // ---- trova o crea ----

    @Transactional
    public Esito<Categoria> categoria(String nome, Tipo tipo) {
        if (tipo == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il tipo della categoria è obbligatorio.");
        }
        String n = nomeObbligatorio(nome, "della categoria");
        return categorie.findByNomeChiaveAndTipo(chiave(n), tipo)
                .map(c -> new Esito<>(c, false))
                .orElseGet(() -> new Esito<>(categorie.save(new Categoria(n, chiave(n), tipo, true)), true));
    }

    /** Rinomina una categoria personalizzata: 404 se non esiste, 409 se e' predefinita o il nome c'e' gia' per quel tipo. */
    @Transactional
    public Categoria rinominaCategoria(long id, String nome) {
        Categoria c = categorie.findById(id).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Categoria non trovata."));
        String n = nomeObbligatorio(nome, "della categoria");
        if (!c.isPersonalizzata()) {
            throw new ErroreApi(HttpStatus.CONFLICT, "Questa categoria è predefinita e non si rinomina.");
        }
        categorie.findByNomeChiaveAndTipo(chiave(n), c.getTipo()).ifPresent(altra -> {
            if (!altra.getId().equals(c.getId())) {
                throw new ErroreApi(HttpStatus.CONFLICT, "Esiste già una categoria con questo nome.");
            }
        });
        c.rinomina(n, chiave(n));
        return categorie.save(c);
    }

    @Transactional
    public Esito<Fornitore> fornitore(String nome, String partitaIva) {
        String n = nomeObbligatorio(nome, "del fornitore");
        String piva = pulisci(partitaIva);
        if (piva != null && piva.length() > 30) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La partita IVA è troppo lunga.");
        }
        return fornitori.findByNomeChiave(chiave(n))
                .map(f -> {
                    if (piva != null && f.getPartitaIva() == null) {
                        f.setPartitaIva(piva); // il fornitore esisteva senza partita IVA (fase 4): ora la riceve
                        fornitori.save(f);
                    }
                    return new Esito<>(f, false);
                })
                .orElseGet(() -> new Esito<>(fornitori.save(new Fornitore(n, chiave(n), piva)), true));
    }

    @Transactional
    public Esito<Dipendente> dipendente(String nome) {
        String n = nomeObbligatorio(nome, "del dipendente");
        return dipendenti.findByNomeChiave(chiave(n))
                .map(d -> new Esito<>(d, false))
                .orElseGet(() -> new Esito<>(dipendenti.save(new Dipendente(n, chiave(n))), true));
    }

    // ---- conversioni ----

    public static CategoriaDto dto(Categoria c) {
        return new CategoriaDto(c.getId(), c.getNome(), c.getTipo(), c.isPersonalizzata());
    }

    public static FornitoreDto dto(Fornitore f) {
        return new FornitoreDto(f.getId(), f.getNome(), f.getPartitaIva());
    }

    public static DipendenteDto dto(Dipendente d) {
        return new DipendenteDto(d.getId(), d.getNome());
    }
}
