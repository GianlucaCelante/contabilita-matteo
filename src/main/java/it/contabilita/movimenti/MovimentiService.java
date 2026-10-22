package it.contabilita.movimenti;

import it.contabilita.api.Dto.ElencoMovimenti;
import it.contabilita.api.Dto.MovimentoDto;
import it.contabilita.api.Dto.MovimentoInput;
import it.contabilita.api.Dto.Rif;
import it.contabilita.api.Dto.RicorrenzaRif;
import it.contabilita.api.Dto.Totali;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Ambito;
import it.contabilita.dati.Documento;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Origine;
import it.contabilita.dati.Ricorrenza;
import it.contabilita.dati.Tipo;
import it.contabilita.ricorrenze.RicorrenzeService;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Il registro dei movimenti: elenco con totali, lettura, creazione, modifica e eliminazione con ambito. */
@Service
public class MovimentiService {

    static final long IMPORTO_MASSIMO_CENT = 1_000_000_000_000L;
    static final int DESCRIZIONE_MASSIMA = 500;
    static final int NUMERO_DOCUMENTO_MASSIMO = 100;
    static final int NOTE_MASSIME = 2000;

    private final MovimentoRepository movimenti;
    private final AnagraficheService anagrafiche;
    private final RicorrenzeService ricorrenze;
    private final Clock clock;

    public MovimentiService(MovimentoRepository movimenti, AnagraficheService anagrafiche,
                            RicorrenzeService ricorrenze, Clock clock) {
        this.movimenti = movimenti;
        this.anagrafiche = anagrafiche;
        this.ricorrenze = ricorrenze;
        this.clock = clock;
    }

    // ---- lettura ----

    /** Movimenti del periodo, in ordine di data e id decrescenti, con i totali (di tutto l'elenco filtrato). */
    @Transactional(readOnly = true)
    public ElencoMovimenti elenca(LocalDate da, LocalDate a, Tipo tipo, String q, Long dipendenteId) {
        if (da != null && a != null && da.isAfter(a)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La data iniziale non può essere dopo quella finale.");
        }
        Specification<Movimento> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (da != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("data"), da));
            }
            if (a != null) {
                p.add(cb.lessThanOrEqualTo(root.get("data"), a));
            }
            if (tipo != null) {
                p.add(cb.equal(root.get("tipo"), tipo));
            }
            if (dipendenteId != null) {
                p.add(cb.equal(root.get("dipendente").get("id"), dipendenteId));
            }
            return cb.and(p.toArray(new Predicate[0]));
        };
        List<Movimento> righe = movimenti.findAll(spec, Sort.by(Sort.Direction.DESC, "data").and(Sort.by(Sort.Direction.DESC, "id")));
        String filtro = AnagraficheService.pulisci(q);
        if (filtro != null) {
            String chiave = AnagraficheService.chiave(filtro);
            righe = righe.stream().filter(m -> corrisponde(m, chiave)).toList();
        }
        long ricavi = 0;
        long costi = 0;
        for (Movimento m : righe) {
            if (m.getTipo().isCosto()) {
                costi += m.getImportoCent();
            } else {
                ricavi += m.getImportoCent();
            }
        }
        return new ElencoMovimenti(righe.stream().map(MovimentiService::dto).toList(), new Totali(ricavi, costi, ricavi - costi));
    }

    private static boolean corrisponde(Movimento m, String chiave) {
        return contiene(m.getFornitore() == null ? null : m.getFornitore().getNome(), chiave)
                || contiene(m.getDescrizione(), chiave)
                || contiene(m.getNote(), chiave);
    }

    private static boolean contiene(String testo, String chiave) {
        return testo != null && testo.toLowerCase(Locale.ROOT).contains(chiave);
    }

    @Transactional(readOnly = true)
    public MovimentoDto leggi(Long id) {
        return dto(trova(id));
    }

    private Movimento trova(Long id) {
        return movimenti.findWithRelazioniById(id)
                .orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Movimento non trovato."));
    }

    // ---- scrittura ----

    @Transactional
    public MovimentoDto crea(MovimentoInput input) {
        valida(input);
        LocalDateTime adesso = LocalDateTime.now(clock).withNano(0);
        Movimento m = new Movimento();
        applica(m, input);
        m.setOrigine(Origine.MANO);
        m.setCreatoIl(adesso);
        m.setModificatoIl(adesso);
        if (input.ricorrenza() != null) {
            ricorrenze.creaDa(m, giorno(input));
        }
        MovimentoDto risultato = dto(movimenti.save(m));
        if (input.ricorrenza() != null) {
            // subito le occorrenze dei mesi gia' dovuti (data nel passato), senza aspettare le 03:05
            ricorrenze.generaOccorrenzeMancanti(LocalDate.now(clock));
        }
        return risultato;
    }

    @Transactional
    public MovimentoDto modifica(Long id, MovimentoInput input, Ambito ambito) {
        valida(input);
        Movimento m = trova(id);
        applica(m, input);
        m.setModificatoIl(LocalDateTime.now(clock).withNano(0));
        Ricorrenza r = m.getRicorrenza();
        boolean generare = false;
        if (r != null) {
            RicorrenzeService.validaDocumentoRicorrente(m.getDocumento());
            if (ambito == Ambito.QUESTO_E_PROSSIMI) {
                ricorrenze.copiaModello(m, r);
                if (input.ricorrenza() != null && input.ricorrenza().giorno() != null) {
                    r.setGiorno(giorno(input));
                }
                generare = true;
            }
        } else if (input.ricorrenza() != null) {
            // un movimento singolo che diventa ripetuto: da qui in avanti ogni mese
            ricorrenze.creaDa(m, giorno(input));
            generare = true;
        }
        MovimentoDto risultato = dto(movimenti.save(m));
        if (generare) {
            ricorrenze.generaOccorrenzeMancanti(LocalDate.now(clock));
        }
        return risultato;
    }

    @Transactional
    public void elimina(Long id, Ambito ambito) {
        Movimento m = trova(id);
        if (ambito == Ambito.QUESTO_E_PROSSIMI && m.getRicorrenza() != null) {
            m.getRicorrenza().setAttiva(false);
        }
        movimenti.delete(m);
    }

    // ---- validazione e conversioni ----

    private static int giorno(MovimentoInput input) {
        RicorrenzeService.validaGiorno(input.ricorrenza().giorno());
        return input.ricorrenza().giorno();
    }

    static void valida(MovimentoInput in) {
        if (in == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Richiesta vuota.");
        }
        if (in.data() == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La data è obbligatoria.");
        }
        if (in.tipo() == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il tipo è obbligatorio.");
        }
        if (in.documento() == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il documento è obbligatorio.");
        }
        if (!in.tipo().ammette(in.documento())) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST,
                    "Il documento " + in.documento() + " non è ammesso per il tipo " + in.tipo() + ".");
        }
        if (in.importoCent() == null || in.importoCent() <= 0) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "L'importo deve essere maggiore di zero.");
        }
        if (in.importoCent() > IMPORTO_MASSIMO_CENT) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "L'importo è troppo grande.");
        }
        lunghezza(in.descrizione(), DESCRIZIONE_MASSIMA, "La descrizione");
        lunghezza(in.numeroDocumento(), NUMERO_DOCUMENTO_MASSIMO, "Il numero del documento");
        lunghezza(in.note(), NOTE_MASSIME, "Le note");
        if (in.ricorrenza() != null) {
            RicorrenzeService.validaGiorno(in.ricorrenza().giorno());
            RicorrenzeService.validaDocumentoRicorrente(in.documento());
        }
    }

    private static void lunghezza(String testo, int massimo, String cosa) {
        if (testo != null && testo.length() > massimo) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, cosa + " è troppo lungo (massimo " + massimo + " caratteri).");
        }
    }

    private void applica(Movimento m, MovimentoInput in) {
        m.setData(in.data());
        m.setTipo(in.tipo());
        m.setDocumento(in.documento());
        m.setImportoCent(in.importoCent());
        m.setCategoria(AnagraficheService.pulisci(in.categoria()) == null ? null
                : anagrafiche.categoria(in.categoria(), in.tipo()).valore());
        m.setFornitore(AnagraficheService.pulisci(in.fornitore()) == null ? null
                : anagrafiche.fornitore(in.fornitore(), null).valore());
        m.setDipendente(AnagraficheService.pulisci(in.dipendente()) == null ? null
                : anagrafiche.dipendente(in.dipendente()).valore());
        m.setDescrizione(vuotoANull(in.descrizione()));
        m.setNumeroDocumento(vuotoANull(in.numeroDocumento()));
        m.setNote(vuotoANull(in.note()));
    }

    private static String vuotoANull(String testo) {
        return testo == null || testo.isBlank() ? null : testo.strip();
    }

    static MovimentoDto dto(Movimento m) {
        Ricorrenza r = m.getRicorrenza();
        return new MovimentoDto(m.getId(), m.getData(), m.getTipo(), m.getDocumento(), m.getImportoCent(),
                m.getCategoria() == null ? null : new Rif(m.getCategoria().getId(), m.getCategoria().getNome()),
                m.getFornitore() == null ? null : new Rif(m.getFornitore().getId(), m.getFornitore().getNome()),
                m.getDipendente() == null ? null : new Rif(m.getDipendente().getId(), m.getDipendente().getNome()),
                m.getDescrizione(), m.getNumeroDocumento(), m.getNote(), m.getOrigine(),
                r == null ? null : new RicorrenzaRif(r.getId(), r.getGiorno(), r.isAttiva()),
                m.getAllegatoNome());
    }
}
