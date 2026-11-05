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
import it.contabilita.dati.Documento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.RicorrenzaRepository;
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
    private final RicorrenzaRepository ricorrenze;

    public AnagraficheService(CategoriaRepository categorie, FornitoreRepository fornitori, DipendenteRepository dipendenti,
                              MovimentoRepository movimenti, RicorrenzaRepository ricorrenze) {
        this.movimenti = movimenti;
        this.ricorrenze = ricorrenze;
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

    private static java.util.Map<Long, Long> mappa(List<Object[]> righe) {
        java.util.Map<Long, Long> m = new java.util.HashMap<>();
        for (Object[] riga : righe) {
            m.put((Long) riga[0], (Long) riga[1]);
        }
        return m;
    }

    @Transactional(readOnly = true)
    public List<CategoriaDto> elencoCategorie(Tipo tipo) {
        List<Categoria> righe = tipo == null ? categorie.findAllByOrderByNomeChiave() : categorie.findByTipoOrderByNomeChiave(tipo);
        java.util.Map<Long, Long> usi = mappa(movimenti.contaPerCategoria());
        return righe.stream().map(c -> new CategoriaDto(c.getId(), c.getNome(), c.getTipo(), c.isRetribuzione(), usi.getOrDefault(c.getId(), 0L))).toList();
    }

    /**
     * Con un testo: prima chi inizia col testo, poi chi lo contiene soltanto; dentro ogni gruppo i piu' usati
     * (per numero di movimenti), a parita' in ordine alfabetico. Senza testo: i piu' usati.
     */
    @Transactional(readOnly = true)
    public List<FornitoreDto> elencoFornitori(String q) {
        String filtro = pulisci(q) == null ? null : chiave(pulisci(q));
        java.util.Map<Long, Long> usi = mappa(movimenti.contaPerFornitore());
        return fornitori.findAllByOrderByNomeChiave().stream() // gia' alfabetico: il sort e' stabile
                .filter(f -> filtro == null || f.getNomeChiave().contains(filtro))
                .sorted(java.util.Comparator
                        .comparing((Fornitore f) -> filtro != null && f.getNomeChiave().startsWith(filtro) ? 0 : 1)
                        .thenComparing(f -> -usi.getOrDefault(f.getId(), 0L)))
                .map(f -> new FornitoreDto(f.getId(), f.getNome(), f.getPartitaIva(), usi.getOrDefault(f.getId(), 0L))).toList();
    }

    @Transactional(readOnly = true)
    public List<DipendenteDto> elencoDipendenti(String q) {
        String filtro = pulisci(q) == null ? null : chiave(pulisci(q));
        java.util.Map<Long, Long> usi = mappa(movimenti.contaPerDipendente());
        return dipendenti.findAllByOrderByNomeChiave().stream()
                .filter(d -> filtro == null || d.getNomeChiave().contains(filtro))
                .map(d -> new DipendenteDto(d.getId(), d.getNome(), usi.getOrDefault(d.getId(), 0L))).toList();
    }

    // ---- trova o crea ----

    /** Trova o crea dal solo nome (nei movimenti): una categoria nuova non e' mai una retribuzione. */
    @Transactional
    public Esito<Categoria> categoria(String nome, Tipo tipo) {
        return categoria(nome, tipo, null);
    }

    /**
     * Trova o crea. {@code retribuzione=true} vale solo per COSTO_FISSO (altrimenti 400) e solo per una categoria nuova:
     * se esiste gia' il suo flag non cambia.
     */
    @Transactional
    public Esito<Categoria> categoria(String nome, Tipo tipo, Boolean retribuzione) {
        if (tipo == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il tipo della categoria è obbligatorio.");
        }
        String n = nomeObbligatorio(nome, "della categoria");
        if (Boolean.TRUE.equals(retribuzione) && tipo != Tipo.COSTO_FISSO) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Solo una categoria di costo fisso può essere una retribuzione.");
        }
        return categorie.findByNomeChiaveAndTipo(chiave(n), tipo)
                .map(c -> new Esito<>(c, false))
                .orElseGet(() -> {
                    Categoria nuova = new Categoria(n, chiave(n), tipo);
                    nuova.setRetribuzione(Boolean.TRUE.equals(retribuzione));
                    return new Esito<>(categorie.save(nuova), true);
                });
    }

    private static final List<Documento> DOCUMENTI_RETRIBUZIONE =
            List.of(Documento.RETRIBUZIONE_REGOLARE, Documento.RETRIBUZIONE_EXTRA);

    /**
     * Rinomina e/o cambia il flag retribuzione (almeno uno dei due, altrimenti 400). 404 se non esiste. Rinominare
     * e' 409 se il nome c'e' gia' per quel tipo (qualunque categoria si rinomina). Il flag vero e' 400 se la categoria non e' di COSTO_FISSO; il flag falso e' 409 se la categoria ha
     * gia' retribuzioni (movimenti o ripetizioni con documento RETRIBUZIONE_*).
     */
    @Transactional
    public Categoria modificaCategoria(long id, String nome, Boolean retribuzione) {
        Categoria c = categorie.findById(id).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Categoria non trovata."));
        if (nome == null && retribuzione == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Indica il nome o se è una retribuzione.");
        }
        String nuovoNome = null;
        if (nome != null) {
            String n = nomeObbligatorio(nome, "della categoria");
            categorie.findByNomeChiaveAndTipo(chiave(n), c.getTipo()).ifPresent(altra -> {
                if (!altra.getId().equals(c.getId())) {
                    throw new ErroreApi(HttpStatus.CONFLICT, "Esiste già una categoria con questo nome.");
                }
            });
            nuovoNome = n;
        }
        if (retribuzione != null) {
            if (retribuzione && c.getTipo() != Tipo.COSTO_FISSO) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Solo una categoria di costo fisso può essere una retribuzione.");
            }
            if (!retribuzione && (movimenti.existsByCategoriaIdAndDocumentoIn(c.getId(), DOCUMENTI_RETRIBUZIONE)
                    || ricorrenze.existsByCategoriaIdAndDocumentoIn(c.getId(), DOCUMENTI_RETRIBUZIONE))) {
                throw new ErroreApi(HttpStatus.CONFLICT, "Questa categoria ha già delle retribuzioni.");
            }
        }
        if (nuovoNome != null) {
            c.rinomina(nuovoNome, chiave(nuovoNome));
        }
        if (retribuzione != null) {
            c.setRetribuzione(retribuzione);
        }
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

    // ---- rinomina e eliminazione di fornitori e dipendenti ----

    @Transactional
    public Fornitore modificaFornitore(long id, String nome, String partitaIva) {
        Fornitore f = fornitori.findById(id).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Fornitore non trovato."));
        String n = nomeObbligatorio(nome, "del fornitore");
        fornitori.findByNomeChiave(chiave(n)).ifPresent(altro -> {
            if (!altro.getId().equals(f.getId())) {
                throw new ErroreApi(HttpStatus.CONFLICT, "Esiste già un fornitore con questo nome.");
            }
        });
        String piva = pulisci(partitaIva);
        if (piva != null && piva.length() > 30) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La partita IVA è troppo lunga.");
        }
        f.rinomina(n, chiave(n));
        if (partitaIva != null) { // assente = invariata; vuota = tolta
            f.setPartitaIva(piva);
        }
        return fornitori.save(f);
    }

    @Transactional
    public Dipendente modificaDipendente(long id, String nome) {
        Dipendente d = dipendenti.findById(id).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Dipendente non trovato."));
        String n = nomeObbligatorio(nome, "del dipendente");
        dipendenti.findByNomeChiave(chiave(n)).ifPresent(altro -> {
            if (!altro.getId().equals(d.getId())) {
                throw new ErroreApi(HttpStatus.CONFLICT, "Esiste già un dipendente con questo nome.");
            }
        });
        d.rinomina(n, chiave(n));
        return dipendenti.save(d);
    }

    /**
     * Elimina la categoria. I movimenti e le ripetizioni che la usano passano a {@code sostituisciCon} (stesso tipo)
     * oppure, se manca, restano senza categoria. Tutto in una transazione.
     */
    @Transactional
    public void eliminaCategoria(long id, Long sostituisciCon) {
        Categoria c = categorie.findById(id).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Categoria non trovata."));
        Categoria altra = null;
        if (sostituisciCon != null) {
            altra = categorie.findById(sostituisciCon).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "La categoria con cui unire non esiste."));
            if (altra.getId().equals(c.getId())) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Per unire scegli una categoria diversa.");
            }
            if (altra.getTipo() != c.getTipo()) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Si possono unire solo categorie dello stesso tipo.");
            }
        }
        movimenti.spostaCategoria(c.getId(), altra);
        ricorrenze.spostaCategoria(c.getId(), altra);
        categorie.deleteById(c.getId());
    }

    @Transactional
    public void eliminaFornitore(long id, Long sostituisciCon) {
        Fornitore f = fornitori.findById(id).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Fornitore non trovato."));
        Fornitore altro = null;
        if (sostituisciCon != null) {
            altro = fornitori.findById(sostituisciCon).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Il fornitore con cui unire non esiste."));
            if (altro.getId().equals(f.getId())) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Per unire scegli un fornitore diverso.");
            }
        }
        movimenti.spostaFornitore(f.getId(), altro);
        ricorrenze.spostaFornitore(f.getId(), altro);
        fornitori.deleteById(f.getId());
    }

    @Transactional
    public void eliminaDipendente(long id, Long sostituisciCon) {
        Dipendente d = dipendenti.findById(id).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Dipendente non trovato."));
        Dipendente altro = null;
        if (sostituisciCon != null) {
            altro = dipendenti.findById(sostituisciCon).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Il dipendente con cui unire non esiste."));
            if (altro.getId().equals(d.getId())) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Per unire scegli un dipendente diverso.");
            }
        }
        movimenti.spostaDipendente(d.getId(), altro);
        ricorrenze.spostaDipendente(d.getId(), altro);
        dipendenti.deleteById(d.getId());
    }

    // ---- conversioni (con il conteggio degli usi) ----

    @Transactional(readOnly = true)
    public CategoriaDto vista(Categoria c) {
        return new CategoriaDto(c.getId(), c.getNome(), c.getTipo(), c.isRetribuzione(), movimenti.countByCategoriaId(c.getId()));
    }

    @Transactional(readOnly = true)
    public FornitoreDto vista(Fornitore f) {
        return new FornitoreDto(f.getId(), f.getNome(), f.getPartitaIva(), movimenti.countByFornitoreId(f.getId()));
    }

    @Transactional(readOnly = true)
    public DipendenteDto vista(Dipendente d) {
        return new DipendenteDto(d.getId(), d.getNome(), movimenti.countByDipendenteId(d.getId()));
    }
}
