package it.contabilita.movimenti;

import it.contabilita.api.Dto.ElencoMovimenti;
import it.contabilita.api.Dto.MovimentoDto;
import it.contabilita.api.Dto.MovimentoInput;
import it.contabilita.api.Dto.Rif;
import it.contabilita.api.Dto.RicorrenzaRif;
import it.contabilita.api.Dto.Totali;
import it.contabilita.allegati.AllegatiService;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Ambito;
import it.contabilita.dati.Documento;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Origine;
import it.contabilita.dati.Ricorrenza;
import it.contabilita.dati.Tipo;
import it.contabilita.ricorrenze.RicorrenzeService;
import it.contabilita.dati.Sede;
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
import java.util.Set;

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
    private final AllegatiService allegati;
    private final SediService sedi;

    public MovimentiService(MovimentoRepository movimenti, AnagraficheService anagrafiche,
                            RicorrenzeService ricorrenze, Clock clock, AllegatiService allegati, SediService sedi) {
        this.movimenti = movimenti;
        this.anagrafiche = anagrafiche;
        this.ricorrenze = ricorrenze;
        this.clock = clock;
        this.allegati = allegati;
        this.sedi = sedi;
    }

    // ---- lettura ----

    /** Movimenti del periodo, in ordine di data e id decrescenti, con i totali (di tutto l'elenco filtrato). */
    @Transactional(readOnly = true)
    public ElencoMovimenti elenca(LocalDate da, LocalDate a, Tipo tipo, String q, Long dipendenteId, Set<Long> sediIds,
                                   Set<Long> categorieIds) {
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
            if (sediIds != null) {
                p.add(root.get("sede").get("id").in(sediIds));
            }
            if (categorieIds != null) {
                // i movimenti senza categoria (es. le retribuzioni) restano fuori
                p.add(root.get("categoria").get("id").in(categorieIds));
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
                costi += m.getEffettoSuiCostiCent();
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
        return creaIn(input, sedi.perNuovoMovimento(input.sedeId()));
    }

    private MovimentoDto creaIn(MovimentoInput input, Sede sede) {
        LocalDateTime adesso = LocalDateTime.now(clock).withNano(0);
        Movimento m = new Movimento();
        applica(m, input);
        m.setSede(sede);
        m.setOrigine(Origine.MANO);
        m.setCreatoIl(adesso);
        m.setModificatoIl(adesso);
        if (input.ricorrenza() != null) {
            ricorrenze.creaDa(m, input.ricorrenza());
        }
        MovimentoDto risultato = dto(movimenti.save(m));
        if (input.ricorrenza() != null) {
            // subito le occorrenze dei mesi gia' dovuti (data nel passato), senza aspettare le 03:05
            ricorrenze.generaOccorrenzeMancanti(LocalDate.now(clock));
        }
        return risultato;
    }

    /**
     * «Tutte le sedi, dividi»: un movimento per ogni sede attiva, con l'importo diviso in parti uguali; i centesimi di
     * resto vanno uno ciascuno alle prime sedi (per ordine), cosi' la somma delle parti e' l'importo esatto. Tutto in
     * una transazione. Se l'importo ha meno centesimi delle sedi, le sedi in fondo restano senza parte (un movimento
     * da zero non esiste). Se il movimento e' ripetuto (costo fisso), ogni sede ha la sua ripetizione con la sua parte:
     * i mesi dopo escono gia' divisi. Con {@code sediScelte} (gli id) si divide solo fra quelle sedi, che devono essere almeno due
     * e attive; senza (null) fra tutte le sedi attive.
     */
    @Transactional
    public List<MovimentoDto> dividi(MovimentoInput input, Set<Long> sediScelte) {
        valida(input);
        if (input.sedeId() != null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Per dividere fra più sedi non indicare la sede.");
        }
        List<Sede> attive = sedi.attive();
        if (sediScelte != null) {
            if (sediScelte.size() < 2) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "Per dividere scegli almeno due sedi.");
            }
            for (Long id : sediScelte) {
                sedi.perNuovoMovimento(id); // sede inesistente o archiviata = 400
            }
            attive = attive.stream().filter(s -> sediScelte.contains(s.getId())).toList();
        }
        long base = input.importoCent() / attive.size();
        long resto = input.importoCent() % attive.size();
        List<MovimentoDto> creati = new ArrayList<>();
        for (int i = 0; i < attive.size(); i++) {
            long parte = base + (i < resto ? 1 : 0);
            if (parte <= 0) {
                continue;
            }
            MovimentoInput perSede = new MovimentoInput(input.data(), input.tipo(), input.documento(), parte,
                    input.categoria(), input.fornitore(), input.dipendente(), input.descrizione(),
                    input.numeroDocumento(), input.note(), input.ricorrenza(), null);
            creati.add(creaIn(perSede, attive.get(i)));
        }
        return creati;
    }

    @Transactional
    public MovimentoDto modifica(Long id, MovimentoInput input, Ambito ambito) {
        valida(input);
        Movimento m = trova(id);
        applica(m, input);
        if (input.sedeId() != null && !input.sedeId().equals(m.getSede().getId())) {
            m.setSede(sedi.perNuovoMovimento(input.sedeId())); // spostare un movimento su una sede archiviata non si puo'
        }
        m.setModificatoIl(LocalDateTime.now(clock).withNano(0));
        Ricorrenza r = m.getRicorrenza();
        boolean generare = false;
        if (r != null) {
            RicorrenzeService.validaDocumentoRicorrente(m.getDocumento());
            // L'ambito decide solo se i dati di questo movimento (importo, voce...) diventano quelli dei prossimi;
            // la frequenza e' della ripetizione, non di un movimento: se il corpo la porta, cambia sempre.
            if (ambito == Ambito.QUESTO_E_PROSSIMI) {
                ricorrenze.copiaModello(m, r);
                generare = true;
            }
            if (input.ricorrenza() != null) {
                ricorrenze.aggiornaFrequenza(r, input.ricorrenza());
                generare = true;
            }
        } else if (input.ricorrenza() != null) {
            // un movimento singolo che diventa ripetuto: da qui in avanti con la frequenza scelta
            ricorrenze.creaDa(m, input.ricorrenza());
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
        allegati.eliminaFileDopoCommit(m.getAllegatoFile()); // il file sparisce solo se l'eliminazione e' confermata
    }

    // ---- validazione e conversioni ----

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
            RicorrenzeService.valida(in.ricorrenza());
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

    public static MovimentoDto dto(Movimento m) {
        Ricorrenza r = m.getRicorrenza();
        return new MovimentoDto(m.getId(), m.getData(), m.getTipo(), m.getDocumento(), m.getImportoCent(),
                m.getCategoria() == null ? null : new Rif(m.getCategoria().getId(), m.getCategoria().getNome()),
                m.getFornitore() == null ? null : new Rif(m.getFornitore().getId(), m.getFornitore().getNome()),
                m.getDipendente() == null ? null : new Rif(m.getDipendente().getId(), m.getDipendente().getNome()),
                new Rif(m.getSede().getId(), m.getSede().getNome()),
                m.getDescrizione(), m.getNumeroDocumento(), m.getNote(), m.getOrigine(),
                r == null ? null : new RicorrenzaRif(r.getId(), r.getGiorno(), r.isAttiva(), r.getUnita(), r.getIntervallo(), r.getProssimaData()),
                m.getAllegatoNome(), m.getCreatoIl(),
                // la colonna e' sempre valorizzata (uguale a creato_il alla nascita): "mai modificato" = null
                m.getModificatoIl() == null || m.getModificatoIl().equals(m.getCreatoIl()) ? null : m.getModificatoIl());
    }
}
