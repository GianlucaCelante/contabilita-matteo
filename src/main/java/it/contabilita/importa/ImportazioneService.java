package it.contabilita.importa;

import it.contabilita.allegati.AllegatiService;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Documento;
import it.contabilita.dati.Fornitore;
import it.contabilita.dati.FornitoreRepository;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Origine;
import it.contabilita.dati.Tipo;
import it.contabilita.importa.ImportaDto.Anteprima;
import it.contabilita.importa.ImportaDto.Conferma;
import it.contabilita.importa.ImportaDto.ErroreImportazione;
import it.contabilita.importa.ImportaDto.EsitoConferma;
import it.contabilita.importa.ImportaDto.FatturaLetta;
import it.contabilita.importa.ImportaDto.FileCaricato;
import it.contabilita.importa.ImportaDto.FornitoreLetto;
import it.contabilita.importa.ImportaDto.RigaConferma;
import it.contabilita.importa.ImportaDto.RigaIgnorata;
import it.contabilita.importa.ParserFatturaPa.DatiFattura;
import it.contabilita.importa.ParserFatturaPa.ErroreLettura;
import it.contabilita.movimenti.AnagraficheService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Importazione delle fatture elettroniche in due tempi (docs/api.md): {@link #anteprima} legge i file e tiene le
 * fatture in memoria sotto un {@code importazioneId} (scadenza 30 minuti, orologio iniettato); {@link #conferma}
 * crea un movimento per riga scelta. Nulla si salva finche' non si conferma.
 *
 * <p>La conferma e' atomica per riga: ogni riga ha la sua transazione (fornitore, categoria, movimento e file
 * allegato insieme); una riga che fallisce finisce in {@code ignorate} senza toccare le altre.
 */
@Service
public class ImportazioneService {

    private static final Logger log = LoggerFactory.getLogger(ImportazioneService.class);

    static final Duration DURATA = Duration.ofMinutes(30);
    private static final int IMPORTAZIONI_MASSIME = 20;
    // Come nel progetto del ristorante (catalog-service, FatturaPaDocumentTypes): fatture e parcelle sono costi; le note di
    // credito li riducono; TD17/18/19 (autofatture per acquisti dall'estero) sono costi al totale lordo perche' l'originale
    // estero non arriva da SdI; TD16 no, perche' l'originale del fornitore italiano e' gia' una fattura a parte.
    private static final Set<String> NOTE_DI_CREDITO = Set.of("TD04", "TD08");
    private static final Set<String> INTEGRAZIONI_CONTEGGIATE = Set.of("TD17", "TD18", "TD19");
    private static final String INTEGRAZIONE_ESCLUSA = "TD16";
    private static final Set<String> TIPI_AMMESSI = Set.of("TD01", "TD02", "TD06", "TD17", "TD18", "TD19", "TD24", "TD25", "TD04", "TD08");
    private static final DateTimeFormatter GIORNO_MESE = DateTimeFormatter.ofPattern("dd/MM");

    /** Una fattura letta, con quello che serve alla conferma (non esce mai dal servizio). */
    private record Letta(FatturaLetta pubblica, DatiFattura dati, byte[] originale, String nomeAllegato) {
    }

    private record Importazione(Instant scade, Map<Integer, Letta> fatture) {
    }

    /** Segnala una riga gia' registrata al momento della conferma. */
    private static final class Duplicata extends RuntimeException {
        Duplicata(String motivo) {
            super(motivo, null, false, false);
        }
    }

    private final MovimentoRepository movimenti;
    private final FornitoreRepository fornitori;
    private final AnagraficheService anagrafiche;
    private final AllegatiService allegati;
    private final LettoreFile lettore = new LettoreFile();
    private final TransactionTemplate tx;
    private final TransactionTemplate txLettura;
    private final Clock clock;
    private final Map<String, Importazione> importazioni = new ConcurrentHashMap<>();

    public ImportazioneService(MovimentoRepository movimenti, FornitoreRepository fornitori, AnagraficheService anagrafiche,
                               AllegatiService allegati, PlatformTransactionManager gestoreTransazioni, Clock clock) {
        this.movimenti = movimenti;
        this.fornitori = fornitori;
        this.anagrafiche = anagrafiche;
        this.allegati = allegati;
        this.tx = new TransactionTemplate(gestoreTransazioni);
        this.txLettura = new TransactionTemplate(gestoreTransazioni);
        this.txLettura.setReadOnly(true);
        this.clock = clock;
    }

    // ---- anteprima ----

    public Anteprima anteprima(List<FileCaricato> caricati) {
        if (caricati == null || caricati.isEmpty()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Scegli almeno un file da leggere.");
        }
        pulisciScadute();
        List<ErroreImportazione> errori = new ArrayList<>();
        List<Letta> lette = new ArrayList<>();
        Set<String> viste = new HashSet<>();
        int[] indice = {0};

        for (FileCaricato caricato : caricati) {
            LettoreFile.Risultato letti = lettore.leggi(nomeBase(caricato.nome()), caricato.contenuto());
            letti.errori().forEach(e -> errori.add(new ErroreImportazione(e.nomeFile(), e.messaggio())));
            for (LettoreFile.FileXml file : letti.file()) {
                List<DatiFattura> fatture;
                try {
                    fatture = ParserFatturaPa.leggi(file.xml());
                } catch (ErroreLettura e) {
                    errori.add(new ErroreImportazione(file.nomeFile(), e.getMessage()));
                    continue;
                }
                for (DatiFattura dati : fatture) {
                    String problema = problema(dati, fatture.size() > 1);
                    if (problema != null) {
                        errori.add(new ErroreImportazione(file.nomeFile(), problema));
                        continue;
                    }
                    Letta letta = valuta(indice[0]++, file, dati, viste);
                    lette.add(letta);
                }
            }
        }
        String id = UUID.randomUUID().toString();
        Map<Integer, Letta> perIndice = new ConcurrentHashMap<>();
        lette.forEach(l -> perIndice.put(l.pubblica().indice(), l));
        if (!lette.isEmpty()) {
            importazioni.put(id, new Importazione(clock.instant().plus(DURATA), perIndice));
        }
        return new Anteprima(id, lette.stream().map(Letta::pubblica).toList(), errori);
    }

    /** Motivo per cui la fattura non si importa, oppure null. */
    private static String problema(DatiFattura d, boolean inLotto) {
        String prefisso = inLotto ? "Fattura " + d.numero() + ": " : "";
        String tipo = d.tipoDocumento();
        if (INTEGRAZIONE_ESCLUSA.equals(tipo)) {
            return prefisso + "Integrazione TD16: non importata, la fattura originale del fornitore è già una fattura a parte.";
        }
        if (!TIPI_AMMESSI.contains(tipo == null ? "" : tipo)) {
            return prefisso + "Tipo di documento " + (tipo == null ? "mancante" : tipo)
                    + " non ammesso: fattura non importata (si importano TD01, TD02, TD04, TD06, TD08, TD17, TD18, TD19, TD24 e TD25).";
        }
        if (d.totaleCent() == 0) {
            return prefisso + "Importo zero: non c'è nessun costo da registrare.";
        }
        if (d.totaleCent() < 0) {
            return prefisso + "Importo negativo: fattura non importata.";
        }
        if (d.totaleCent() > 1_000_000_000_000L) {
            return prefisso + "Importo troppo grande: fattura non importata.";
        }
        if (d.numero().length() > 100 || d.fornitoreNome().length() > 120) {
            return prefisso + "Numero o nome del fornitore troppo lunghi: fattura non importata.";
        }
        return null;
    }

    private Letta valuta(int indice, LettoreFile.FileXml file, DatiFattura dati, Set<String> viste) {
        String[] esito = txLettura.execute(s -> {
            String motivo = null;
            Optional<Movimento> gia = trovaDuplicato(dati);
            if (gia.isPresent()) {
                motivo = "Già registrata il " + gia.get().getCreatoIl().format(GIORNO_MESE);
            }
            return new String[]{suggerisci(dati), motivo};
        });
        String motivo = esito[1];
        if (motivo == null && !viste.add(chiaveFattura(dati))) {
            motivo = "Duplicata nello stesso gruppo di file";
        }
        FatturaLetta pubblica = new FatturaLetta(indice, file.nomeFile(), new FornitoreLetto(dati.fornitoreNome(), dati.partitaIva()),
                dati.numero(), dati.data(), dati.imponibileCent(), dati.ivaCent(), dati.totaleCent(),
                esito[0], motivo != null, motivo, notaDiCredito(dati), INTEGRAZIONI_CONTEGGIATE.contains(dati.tipoDocumento()));
        return new Letta(pubblica, dati, file.originale(), file.nomeAllegato());
    }

    private static String chiaveFattura(DatiFattura d) {
        String f = d.partitaIva() != null ? "iva:" + d.partitaIva().strip().toUpperCase(Locale.ROOT)
                : "nome:" + d.fornitoreNome().toLowerCase(Locale.ROOT);
        return f + "|" + d.numero() + "|" + d.data();
    }

    private static boolean notaDiCredito(DatiFattura d) {
        return NOTE_DI_CREDITO.contains(d.tipoDocumento());
    }

    /** Una nota di credito e' un movimento di tipo diverso da una fattura: un numero uguale non le rende doppie. */
    private static Documento documentoDi(DatiFattura d) {
        return notaDiCredito(d) ? Documento.NOTA_DI_CREDITO : Documento.FATTURA;
    }

    private Optional<Movimento> trovaDuplicato(DatiFattura d) {
        return movimenti.findByDocumentoAndNumeroDocumentoAndData(documentoDi(d), d.numero(), d.data()).stream()
                .filter(m -> stessoFornitore(m.getFornitore(), d))
                .findFirst();
    }

    /** Stessa partita IVA se entrambi la hanno, altrimenti stesso nome (senza distinguere maiuscole). */
    private static boolean stessoFornitore(Fornitore f, DatiFattura d) {
        if (f == null) {
            return false;
        }
        if (f.getPartitaIva() != null && d.partitaIva() != null) {
            return f.getPartitaIva().strip().equalsIgnoreCase(d.partitaIva().strip());
        }
        return f.getNomeChiave().equals(d.fornitoreNome().toLowerCase(Locale.ROOT));
    }

    /** L'ultima categoria usata per quel fornitore (stessa partita IVA o stesso nome), oppure null. */
    private String suggerisci(DatiFattura d) {
        List<Fornitore> candidati = new ArrayList<>();
        if (d.partitaIva() != null) {
            fornitori.findFirstByPartitaIvaOrderByIdAsc(d.partitaIva()).ifPresent(candidati::add);
        }
        fornitori.findByNomeChiave(d.fornitoreNome().toLowerCase(Locale.ROOT))
                .filter(f -> candidati.stream().noneMatch(c -> c.getId().equals(f.getId()))).ifPresent(candidati::add);
        Movimento ultimo = null;
        for (Fornitore f : candidati) {
            Optional<Movimento> m = movimenti.findFirstByFornitoreIdAndTipoAndCategoriaIsNotNullOrderByIdDesc(f.getId(), Tipo.COSTO_VARIABILE);
            if (m.isPresent() && (ultimo == null || m.get().getId() > ultimo.getId())) {
                ultimo = m.get();
            }
        }
        return ultimo == null ? null : ultimo.getCategoria().getNome();
    }

    // ---- conferma ----

    public EsitoConferma conferma(Conferma richiesta) {
        if (richiesta == null || richiesta.importazioneId() == null || richiesta.righe() == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Richiesta non valida: servono importazioneId e righe.");
        }
        pulisciScadute();
        Importazione importazione = importazioni.get(richiesta.importazioneId());
        if (importazione == null) {
            throw new ErroreApi(HttpStatus.NOT_FOUND, "L'importazione è scaduta: rileggi i file.");
        }
        int importati = 0;
        List<RigaIgnorata> ignorate = new ArrayList<>();
        Set<Integer> fatte = new HashSet<>();
        for (RigaConferma riga : richiesta.righe()) {
            if (riga == null || riga.indice() == null) {
                ignorate.add(new RigaIgnorata(-1, "Riga senza indice."));
                continue;
            }
            int indice = riga.indice();
            Letta letta = importazione.fatture().get(indice);
            if (letta == null) {
                ignorate.add(new RigaIgnorata(indice, "Fattura sconosciuta in questa importazione."));
            } else if (!fatte.add(indice)) {
                ignorate.add(new RigaIgnorata(indice, "Riga ripetuta: importata una volta sola."));
            } else if (letta.pubblica().duplicata()) {
                ignorate.add(new RigaIgnorata(indice, letta.pubblica().motivo() + ": non aggiunta."));
            } else {
                String esito = importaRiga(letta, riga.categoria());
                if (esito == null) {
                    importati++;
                } else {
                    ignorate.add(new RigaIgnorata(indice, esito));
                }
            }
        }
        return new EsitoConferma(importati, ignorate);
    }

    /** Una riga, in una transazione sua. Torna null se importata, altrimenti il motivo. */
    private String importaRiga(Letta letta, String categoria) {
        String[] fileScritto = new String[1];
        try {
            tx.executeWithoutResult(s -> crea(letta, categoria, fileScritto));
            return null;
        } catch (Duplicata e) {
            return e.getMessage() + ": non aggiunta.";
        } catch (RuntimeException e) {
            allegati.eliminaFile(fileScritto[0]);
            log.warn("Riga {} non importata: {}", letta.pubblica().indice(), e.toString());
            return e instanceof ErroreApi ? e.getMessage() : "Non è stato possibile salvare la fattura.";
        }
    }

    private void crea(Letta letta, String categoria, String[] fileScritto) {
        DatiFattura d = letta.dati();
        Optional<Movimento> gia = trovaDuplicato(d);
        if (gia.isPresent()) {
            throw new Duplicata("Già registrata il " + gia.get().getCreatoIl().format(GIORNO_MESE));
        }
        Fornitore fornitore = d.partitaIva() == null ? null : fornitori.findFirstByPartitaIvaOrderByIdAsc(d.partitaIva()).orElse(null);
        if (fornitore == null) {
            fornitore = anagrafiche.fornitore(d.fornitoreNome(), d.partitaIva()).valore();
        }
        LocalDateTime adesso = LocalDateTime.now(clock).withNano(0);
        Movimento m = new Movimento();
        m.setData(d.data());
        m.setTipo(Tipo.COSTO_VARIABILE);
        m.setDocumento(documentoDi(d));
        m.setImportoCent(d.totaleCent());
        m.setFornitore(fornitore);
        String nomeCategoria = categoria == null || categoria.isBlank() ? null : categoria;
        m.setCategoria(nomeCategoria == null ? null : anagrafiche.categoria(nomeCategoria, Tipo.COSTO_VARIABILE).valore());
        m.setNumeroDocumento(d.numero());
        m.setOrigine(Origine.XML);
        m.setCreatoIl(adesso);
        m.setModificatoIl(adesso);
        fileScritto[0] = allegati.salvaPerImportazione(m, letta.nomeAllegato(), letta.originale(),
                letta.nomeAllegato().toLowerCase(Locale.ROOT).endsWith(".p7m"));
        movimenti.saveAndFlush(m);
    }

    // ---- memoria ----

    private void pulisciScadute() {
        Instant ora = clock.instant();
        importazioni.values().removeIf(i -> !i.scade().isAfter(ora));
        while (importazioni.size() > IMPORTAZIONI_MASSIME) {
            importazioni.entrySet().stream().min(java.util.Map.Entry.comparingByValue(java.util.Comparator.comparing(Importazione::scade)))
                    .ifPresent(e -> importazioni.remove(e.getKey()));
        }
    }

    private static String nomeBase(String nome) {
        if (nome == null || nome.isBlank()) {
            return "file";
        }
        return nome.substring(Math.max(nome.lastIndexOf('/'), nome.lastIndexOf('\\')) + 1);
    }
}
