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
import it.contabilita.dati.Tipo;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

/**
 * Categorie, fornitori, dipendenti: elenco e "trova o crea" dal solo nome, senza distinguere
 * maiuscole (la chiave e' il nome in minuscolo, regole Unicode).
 */
@Service
public class AnagraficheService {

    static final int NOME_MASSIMO = 120;

    /** Il valore e se e' stato creato adesso (201) o esisteva gia' (200). */
    public record Esito<T>(T valore, boolean creato) {
    }

    private final CategoriaRepository categorie;
    private final FornitoreRepository fornitori;
    private final DipendenteRepository dipendenti;

    public AnagraficheService(CategoriaRepository categorie, FornitoreRepository fornitori, DipendenteRepository dipendenti) {
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

    @Transactional(readOnly = true)
    public List<FornitoreDto> elencoFornitori(String q) {
        String filtro = pulisci(q) == null ? null : chiave(pulisci(q));
        return fornitori.findAllByOrderByNomeChiave().stream()
                .filter(f -> filtro == null || f.getNomeChiave().contains(filtro))
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
                .orElseGet(() -> new Esito<>(categorie.save(new Categoria(n, chiave(n), tipo)), true));
    }

    @Transactional
    public Esito<Fornitore> fornitore(String nome, String partitaIva) {
        String n = nomeObbligatorio(nome, "del fornitore");
        String piva = pulisci(partitaIva);
        if (piva != null && piva.length() > 30) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La partita IVA è troppo lunga.");
        }
        return fornitori.findByNomeChiave(chiave(n))
                .map(f -> new Esito<>(f, false))
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
        return new CategoriaDto(c.getId(), c.getNome(), c.getTipo());
    }

    public static FornitoreDto dto(Fornitore f) {
        return new FornitoreDto(f.getId(), f.getNome(), f.getPartitaIva());
    }

    public static DipendenteDto dto(Dipendente d) {
        return new DipendenteDto(d.getId(), d.getNome());
    }
}
