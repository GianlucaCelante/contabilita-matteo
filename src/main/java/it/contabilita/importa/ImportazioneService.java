package it.contabilita.importa;

import it.contabilita.PerLog;
import it.contabilita.allegati.AllegatiService;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Documento;
import it.contabilita.dati.Fornitore;
import it.contabilita.dati.FornitoreRepository;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Origine;
import it.contabilita.dati.Sede;
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
import it.contabilita.movimenti.SediService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.unit.DataSize;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Importazione delle fatture elettroniche in due tempi (docs/api.md): {@link #anteprima} legge i file e tiene le
 * fatture in memoria sotto un {@code importazioneId} (scadenza 30 minuti, orologio iniettato; al massimo 20 e, in
 * byte, {@code contabilita.importa.memoria-massima}: vedi {@link #faiPosto} e {@link #faiPostoPerLaLettura}); {@link #conferma}
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
    // Quali tipi di documento si importano (come nel progetto del ristorante; l'elenco ragionato e' in docs/api.md):
    // - costi, come fattura pagata: fatture e parcelle, acconti (TD02, TD03), semplificata (TD07), note di debito (TD05, TD09);
    // - note di credito (TD04, TD08): riducono i costi;
    // - TD17/18/19 (autofatture per acquisti dall'estero): costi al totale lordo, l'originale estero non arriva da SdI;
    // - TD16 no: l'originale del fornitore italiano e' gia' una fattura a parte.
    private static final Set<String> NOTE_DI_CREDITO = Set.of("TD04", "TD08");
    private static final Set<String> NOTE_DI_DEBITO = Set.of("TD05", "TD09");
    private static final Set<String> INTEGRAZIONI_CONTEGGIATE = Set.of("TD17", "TD18", "TD19");
    private static final String INTEGRAZIONE_ESCLUSA = "TD16";
    private static final Set<String> TIPI_AMMESSI = Set.of("TD01", "TD02", "TD03", "TD05", "TD06", "TD07", "TD09", "TD17", "TD18", "TD19",
            "TD24", "TD25", "TD04", "TD08");
    private static final DateTimeFormatter GIORNO_MESE = DateTimeFormatter.ofPattern("dd/MM");

    /** Una fattura letta, con quello che serve alla conferma (non esce mai dal servizio). */
    private record Letta(FatturaLetta pubblica, DatiFattura dati, byte[] originale, String nomeAllegato) {
    }

    /**
     * {@code ordine}: il numero d'arrivo, per sapere qual e' la piu' vecchia quando bisogna far posto. {@code peso}: i byte
     * dei file originali che l'importazione tiene in memoria (calcolato una volta, all'arrivo).
     */
    private record Importazione(long ordine, Instant scade, Map<Integer, Letta> fatture, long peso) {
    }

    /** Quello che serve per decidere chi scartare: numero d'arrivo e byte. */
    record Voce(long ordine, long peso) {
    }

    /** Quanta parte della memoria massima della JVM possono occupare, al piu', i file delle anteprime. */
    private static final int PERCENTO_DELLA_MEMORIA = 40;

    /** Quanta parte della memoria massima della JVM possono occupare, al piu', i file di UNA anteprima: vedi {@link #limiteLettura}. */
    private static final int PERCENTO_DI_UNA_LETTURA = 25;

    /**
     * Quante volte i suoi byte si mette in conto che occupi un XML mentre {@link ParserFatturaPa} lo legge: vedi
     * {@link #limiteFile}. Il nome viene da quando il file si apriva tutto in memoria come DOM: allora valeva 8 (una
     * fattura con tante righe, visitata tutta, occupava circa 6 volte i suoi byte; un file fatto apposta di elementi
     * minimi circa 26, e non era coperto).
     *
     * <p>Da novembre 2026 {@link ParserFatturaPa} legge a flusso e tiene solo quello che guarda, e il fattore e' 6.
     * Misure con Java 17 su file da 10 MB, picco compreso (la memoria piu' piccola con cui la lettura riesce): una
     * fattura vera, con tante righe o con un PDF allegato, chiede circa 4 MB oltre ai suoi byte; i file peggiori che si
     * e' riusciti a costruire (soli riepiloghi vuoti; sole righe del semplificato) fra 4 e 4,8 volte i loro byte a file
     * letto e circa 5 di picco (5,2). 6 copre quindi le fatture vere e i file fatti apposta che sono stati misurati, con
     * poco margine sul peggiore; una busta firmata attorno a uno di quei file (un'altra volta i suoi byte) sta appena sopra.
     * NON e' una dimostrazione del caso peggiore possibile, e non e' stato misurato il picco di piu' letture insieme
     * (numeri in docs/api.md, «Lettura a flusso»).
     */
    static final int FATTORE_DOM = 6;

    /** Un file caricato come lo dichiara il browser, prima di essere letto: nome e dimensione. */
    public record Dichiarato(String nome, long byteTotali) {
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
    private final SediService sedi;
    private final LettoreFile lettore;
    private final TransactionTemplate tx;
    private final TransactionTemplate txLettura;
    private final Clock clock;
    /** Tetto in byte dei file originali tenuti in memoria da tutte le anteprime insieme: vedi {@link #tettoEffettivo}. */
    private final long memoriaMassima;
    /** Quanti byte si possono caricare, e leggere (una volta estratti gli zip), in una sola anteprima: vedi {@link #limiteLettura}. */
    private final long letturaMassima;
    private final Map<String, Importazione> importazioni = new ConcurrentHashMap<>();
    private final AtomicLong arrivate = new AtomicLong();

    @Autowired
    public ImportazioneService(MovimentoRepository movimenti, FornitoreRepository fornitori, AnagraficheService anagrafiche,
                               AllegatiService allegati, SediService sedi, PlatformTransactionManager gestoreTransazioni,
                               Clock clock, @Value("${contabilita.importa.memoria-massima:96MB}") DataSize memoriaMassima,
                               @Value("${contabilita.importa.lettura-massima:200MB}") DataSize letturaMassima) {
        this(movimenti, fornitori, anagrafiche, allegati, sedi, gestoreTransazioni, clock, memoriaMassima, letturaMassima,
                Runtime.getRuntime().maxMemory());
    }

    /** Con la memoria massima della JVM passata da fuori: i limiti che la seguono si provano senza dipendere dalla macchina. */
    ImportazioneService(MovimentoRepository movimenti, FornitoreRepository fornitori, AnagraficheService anagrafiche,
                        AllegatiService allegati, SediService sedi, PlatformTransactionManager gestoreTransazioni,
                        Clock clock, DataSize memoriaMassima, DataSize letturaMassima, long memoriaDellaJvm) {
        this.movimenti = movimenti;
        this.fornitori = fornitori;
        this.anagrafiche = anagrafiche;
        this.allegati = allegati;
        this.sedi = sedi;
        this.tx = new TransactionTemplate(gestoreTransazioni);
        this.txLettura = new TransactionTemplate(gestoreTransazioni);
        this.txLettura.setReadOnly(true);
        this.clock = clock;
        this.memoriaMassima = tettoEffettivo(memoriaMassima.toBytes(), memoriaDellaJvm);
        if (this.memoriaMassima < memoriaMassima.toBytes()) {
            log.info("Importazione: il tetto di memoria delle anteprime è {} MB invece di {} MB, perché la memoria del programma è {} MB.",
                    this.memoriaMassima / (1024 * 1024), memoriaMassima.toMegabytes(), memoriaDellaJvm / (1024 * 1024));
        }
        this.letturaMassima = limiteLettura(letturaMassima.toBytes(), memoriaDellaJvm);
        String avviso = avvisoLimiteLettura(letturaMassima.toBytes(), memoriaDellaJvm);
        if (avviso != null) {
            log.info(avviso);
        }
        String avvisoFile = avvisoLimiteFile(memoriaDellaJvm);
        if (avvisoFile != null) {
            log.info(avvisoFile);
        }
        this.lettore = new LettoreFile(LettoreFile.MAX_FILE, limiteFile(memoriaDellaJvm), this.letturaMassima);
    }

    /**
     * Il tetto che vale davvero: il minimo fra quello configurato e il {@value #PERCENTO_DELLA_MEMORIA}% della memoria
     * massima della JVM ({@code -Xmx}: l'installer avvia il servizio con 512 MB). Un tetto piu' alto della memoria non
     * scatterebbe mai: si finirebbe la memoria prima di scartare qualcosa.
     */
    static long tettoEffettivo(long configurato, long memoriaDellaJvm) {
        return parteDellaMemoria(configurato, memoriaDellaJvm, PERCENTO_DELLA_MEMORIA);
    }

    /**
     * Quanti byte si accettano in UNA anteprima, sia come file caricati sia come file letti (quelli estratti dagli zip
     * compresi): il minimo fra il limite configurato ({@code contabilita.importa.lettura-massima}, al piu' i 200 MB di
     * {@link LettoreFile}) e il {@value #PERCENTO_DI_UNA_LETTURA}% della memoria massima della JVM. Stessa regola di
     * {@link #tettoEffettivo}, con una parte piu' piccola: mentre si legge, in memoria ci sono insieme il caricamento, i
     * file estratti e le anteprime di prima che il nuovo carico non fa uscire (vedi {@link #faiPostoPerLaLettura}). Con i 512 MB
     * dell'installer sono 128 MB; con 256 MB sarebbero 64.
     */
    static long limiteLettura(long configurato, long memoriaDellaJvm) {
        return parteDellaMemoria(Math.min(configurato, LettoreFile.MAX_BYTE_TOTALE), memoriaDellaJvm, PERCENTO_DI_UNA_LETTURA);
    }

    /**
     * La riga di log dell'avvio quando il limite di lettura configurato non vale, con la causa vera: la memoria del
     * programma, oppure il massimo fisso di {@link LettoreFile} (che non dipende dalla memoria). {@code null} se vale il
     * limite configurato. I numeri sono solo configurazione e memoria: niente che arrivi dal cliente.
     */
    static String avvisoLimiteLettura(long configurato, long memoriaDellaJvm) {
        long effettivo = limiteLettura(configurato, memoriaDellaJvm);
        if (effettivo >= configurato) {
            return null;
        }
        String causa = effettivo < LettoreFile.MAX_BYTE_TOTALE
                ? "la memoria del programma è " + LettoreFile.formato(memoriaDellaJvm)
                : LettoreFile.formato(LettoreFile.MAX_BYTE_TOTALE) + " è il massimo che il programma legge in una volta";
        return "Importazione: in una sola lettura si accettano al massimo " + LettoreFile.formato(effettivo) + " invece di "
                + LettoreFile.formato(configurato) + ", perché " + causa + ".";
    }

    /**
     * Quanto puo' pesare, al piu', UN file da leggere (caricato da solo o estratto da uno zip): il minimo fra i 20 MB di
     * {@link LettoreFile} e il {@value #PERCENTO_DI_UNA_LETTURA}% della memoria massima della JVM diviso per
     * {@value #FATTORE_DOM} ({@link #FATTORE_DOM}). Stessa regola e stessa parte di {@link #limiteLettura}: li' contano i
     * byte dei file, qui la memoria che serve per LEGGERNE uno, che puo' essere piu' volte i suoi byte (si legge un file
     * alla volta, e quello che il parser tiene si butta appena lette le fatture). Con i 512 MB dell'installer sono 20 MB
     * (128 / 6 fa 21, vale il massimo); il limite scende sotto i 20 MB solo con meno di 480 MB di memoria: con 256 MB sono
     * 10. Dal megabyte in su il risultato e' in MB interi, per difetto: e' il numero che il messaggio dice al cliente
     * («massimo 10 MB»), e un file fra 10 e 11 MB non deve passare con un massimo dichiarato di 10.
     */
    static long limiteFile(long memoriaDellaJvm) {
        long limite = Math.min(LettoreFile.MAX_BYTE_FILE, parteDellaMemoria(Long.MAX_VALUE, memoriaDellaJvm, PERCENTO_DI_UNA_LETTURA) / FATTORE_DOM);
        long megabyte = 1024 * 1024;
        return limite >= megabyte ? limite / megabyte * megabyte : limite;
    }

    /** La riga di log dell'avvio quando la memoria abbassa il limite per file; {@code null} se valgono i 20 MB. */
    static String avvisoLimiteFile(long memoriaDellaJvm) {
        long effettivo = limiteFile(memoriaDellaJvm);
        if (effettivo >= LettoreFile.MAX_BYTE_FILE) {
            return null;
        }
        return "Importazione: un file si legge se pesa al massimo " + LettoreFile.formato(effettivo) + " invece di "
                + LettoreFile.formato(LettoreFile.MAX_BYTE_FILE) + ", perché la memoria del programma è " + LettoreFile.formato(memoriaDellaJvm) + ".";
    }

    private static long parteDellaMemoria(long configurato, long memoriaDellaJvm, int percento) {
        // quoziente e resto separati: il conto e' esatto (128 MB giusti con 512) e Long.MAX_VALUE non trabocca
        long perLaJvm = memoriaDellaJvm / 100 * percento + memoriaDellaJvm % 100 * percento / 100;
        return Math.max(0, Math.min(configurato, perLaJvm));
    }

    /**
     * Da chiamare PRIMA di portare in memoria i file caricati (e dopo {@link #controllaCaricamento}), con nome e dimensione
     * dichiarata di ognuno: toglie subito le anteprime piu' vecchie che il nuovo carico farebbe comunque uscire, invece di
     * tenerle in memoria per tutta la lettura (prima uscivano solo a lettura finita: nel momento peggiore c'erano insieme
     * le anteprime di prima, il caricamento e i file estratti). Regola in {@link #daScartarePrima}.
     *
     * <p>Se poi la lettura fallisce, le anteprime tolte qui sono perse per niente (chi le conferma riceve il 404 «rileggi i
     * file»). Per questo si toglie il meno possibile: contano solo i byte che possono davvero entrare in memoria
     * ({@link LettoreFile#pesoAtteso}: non un tipo non supportato, non un file oltre il massimo), vale solo il tetto in byte
     * e non quello sul numero (20 anteprime leggere non pesano), e ci si ferma appena il carico ci sta. Il resto lo fa
     * {@link #faiPosto} quando l'anteprima e' pronta, come prima. Mai alla conferma.
     */
    public void faiPostoPerLaLettura(List<Dichiarato> file) {
        if (file == null || file.isEmpty()) {
            return;
        }
        long inArrivo = 0;
        for (Dichiarato d : file) {
            inArrivo += d == null ? 0 : lettore.pesoAtteso(nomeBase(d.nome()), d.byteTotali());
        }
        faiPostoPrima(inArrivo);
    }

    private synchronized void faiPostoPrima(long inArrivo) {
        pulisciScadute();
        Map<String, Voce> voci = new java.util.HashMap<>();
        importazioni.forEach((id, i) -> voci.put(id, new Voce(i.ordine(), i.peso())));
        List<String> via = daScartarePrima(voci, inArrivo, memoriaMassima);
        if (!via.isEmpty()) {
            log.info("Importazione: {} anteprime scartate prima della lettura, per far posto a {} byte in arrivo (tetto {} byte)", via.size(),
                    inArrivo, memoriaMassima);
            via.forEach(importazioni::remove);
        }
    }

    /**
     * Da chiamare PRIMA di portare in memoria i file caricati, con la somma delle loro dimensioni: oltre il limite di una
     * lettura si rifiuta tutto, con un 400 che dice quanto si puo' caricare.
     */
    public void controllaCaricamento(long byteTotali) {
        if (byteTotali > letturaMassima) {
            log.warn("Importazione: caricamento di {} byte rifiutato, oltre il massimo di una lettura ({} byte)", byteTotali, letturaMassima);
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "I file scelti sono troppo grandi tutti insieme (massimo "
                    + LettoreFile.formato(letturaMassima) + " per volta): scegline meno e riprova.");
        }
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
        long giaLetti = 0; // i byte dei file letti finora in questa anteprima: il limite di LettoreFile vale per tutti insieme

        for (FileCaricato caricato : caricati) {
            LettoreFile.Risultato letti = lettore.leggi(nomeBase(caricato.nome()), caricato.contenuto(), giaLetti);
            letti.errori().forEach(e -> errori.add(new ErroreImportazione(e.nomeFile(), e.messaggio())));
            // I file di questo carico (di uno zip: tutte le voci lette) sono gia' in memoria tutti insieme: contano da subito.
            for (LettoreFile.FileXml file : letti.file()) {
                giaLetti += file.originale().length;
            }
            for (LettoreFile.FileXml file : letti.file()) {
                List<DatiFattura> fatture;
                try {
                    fatture = leggiFatture(file, giaLetti);
                } catch (ErroreLettura e) {
                    log.warn("Importazione, {}: {}", PerLog.pulisci(file.nomeFile()), PerLog.pulisci(e.dettaglio()));
                    errori.add(new ErroreImportazione(file.nomeFile(), e.getMessage()));
                    continue;
                }
                for (DatiFattura dati : fatture) {
                    String problema = problema(dati, fatture.size() > 1);
                    if (problema != null) {
                        log.info("Importazione, {}: fattura {} non importata (TipoDocumento {}, totale {} centesimi): {}",
                                PerLog.pulisci(file.nomeFile()), PerLog.pulisci(dati.numero()), PerLog.pulisci(dati.tipoDocumento()),
                                dati.totaleCent(), PerLog.pulisci(problema));
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
            aggiungi(id, clock.instant().plus(DURATA), perIndice, peso(lette));
        }
        return new Anteprima(id, lette.stream().map(Letta::pubblica).toList(), errori);
    }

    /**
     * Apre un file e ne legge le fatture. L'XML di una fattura firmata e' una copia in piu' dei byte, estratta qui e
     * lasciata all'uscita: vive solo per la lettura di QUESTO file, e in quel tempo conta nel totale della lettura
     * ({@link LettoreFile#xmlDi}).
     */
    private List<DatiFattura> leggiFatture(LettoreFile.FileXml file, long inMemoria) throws ErroreLettura {
        return ParserFatturaPa.leggi(lettore.xmlDi(file, inMemoria));
    }

    // I tipi che non si importano, col nome che il cliente capisce: il codice (TD26…) e' gergo e resta nel log.
    private static final Map<String, String> NOMI_TIPI_NON_GESTITI = Map.ofEntries(
            Map.entry("TD20", "autofattura"),
            Map.entry("TD21", "autofattura"),
            Map.entry("TD22", "estrazione di beni da un deposito IVA"),
            Map.entry("TD23", "estrazione di beni da un deposito IVA"),
            Map.entry("TD26", "cessione di beni ammortizzabili"),
            Map.entry("TD27", "autofattura"),
            Map.entry("TD28", "acquisto da San Marino"),
            Map.entry("TD29", "autofattura"));

    /** Motivo per cui la fattura non si importa, oppure null. Lo legge il cliente: niente codici del tracciato. */
    private static String problema(DatiFattura d, boolean inLotto) {
        String prefisso = inLotto ? "Fattura " + d.numero() + ": " : "";
        String tipo = d.tipoDocumento();
        if (INTEGRAZIONE_ESCLUSA.equals(tipo)) {
            return prefisso + "Autofattura di integrazione: non importata, la fattura originale del fornitore è già una fattura a parte.";
        }
        if (!TIPI_AMMESSI.contains(tipo == null ? "" : tipo)) {
            if (tipo == null) {
                return prefisso + "Nella fattura manca il tipo di documento: non importata.";
            }
            String nome = NOMI_TIPI_NON_GESTITI.get(tipo);
            return prefisso + "Tipo di documento non gestito" + (nome == null ? "" : " (" + nome + ")") + ": non importato.";
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
                esito[0], motivo != null, motivo, notaDiCredito(dati), INTEGRAZIONI_CONTEGGIATE.contains(dati.tipoDocumento()),
                dati.tipoDocumento(), NOTE_DI_DEBITO.contains(dati.tipoDocumento()));
        return new Letta(pubblica, dati, file.originale(), file.nomeAllegato());
    }

    /**
     * La chiave dei doppioni dentro lo stesso gruppo di file: documento, fornitore, numero e data, come
     * {@link #trovaDuplicato} contro i movimenti gia' registrati. Il documento e' quello del movimento che nascera'
     * ({@link #documentoDi}): una nota di credito e una fattura con lo stesso numero e la stessa data non sono doppie.
     *
     * <p>Una nota di debito (TD05/TD09) invece e' un movimento FATTURA, e il tipo del file non si conserva nel movimento:
     * contro il registrato non si potrebbe distinguerla da una fattura, quindi non la si distingue nemmeno qui (altrimenti
     * l'anteprima la darebbe per buona e la conferma la scarterebbe). Limite scritto in docs/api.md.
     */
    static String chiaveFattura(DatiFattura d) {
        String f = d.partitaIva() != null ? "iva:" + d.partitaIva().strip().toUpperCase(Locale.ROOT)
                : "nome:" + d.fornitoreNome().toLowerCase(Locale.ROOT);
        return documentoDi(d) + "|" + f + "|" + d.numero() + "|" + d.data();
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
        Sede sede = sedi.perNuovoMovimento(richiesta.sedeId()); // la stessa per tutte le righe; un errore e' un 400 prima di salvare
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
                String esito = importaRiga(letta, riga.categoria(), sede);
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
    private String importaRiga(Letta letta, String categoria, Sede sede) {
        String[] fileScritto = new String[1];
        try {
            tx.executeWithoutResult(s -> crea(letta, categoria, sede, fileScritto));
            return null;
        } catch (Duplicata e) {
            return e.getMessage() + ": non aggiunta.";
        } catch (RuntimeException e) {
            allegati.eliminaFile(fileScritto[0]);
            log.warn("Riga {} non importata: {}", letta.pubblica().indice(), PerLog.pulisci(e));
            return e instanceof ErroreApi ? e.getMessage() : "Non è stato possibile salvare la fattura.";
        }
    }

    private void crea(Letta letta, String categoria, Sede sede, String[] fileScritto) {
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
        // Dall'XML arriva lo storico: le fatture nascono gia' pagate (le note di credito non hanno stato).
        m.setPagata(m.getDocumento() == Documento.FATTURA);
        m.setImportoCent(d.totaleCent());
        m.setFornitore(fornitore);
        m.setSede(sede);
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
    }

    /**
     * I byte che un'importazione tiene in memoria: i file originali, da allegare alla conferma. Un file conta una volta
     * sola anche se contiene piu' fatture (un lotto): le sue fatture puntano agli stessi byte.
     */
    private static long peso(List<Letta> lette) {
        Set<byte[]> file = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        long byteTotali = 0;
        for (Letta letta : lette) {
            if (letta.originale() != null && file.add(letta.originale())) {
                byteTotali += letta.originale().length;
            }
        }
        return byteTotali;
    }

    /**
     * Una sola alla volta: due anteprime insieme non si contano a meta' ne' si scartano a vicenda. Anche il numero d'arrivo
     * si assegna qui dentro, sotto lo stesso lock: preso fuori, fra due caricamenti contemporanei quello col numero piu'
     * basso poteva entrare per secondo e farsi scartare appena letto.
     */
    private synchronized void aggiungi(String id, Instant scade, Map<Integer, Letta> fatture, long peso) {
        importazioni.put(id, new Importazione(arrivate.incrementAndGet(), scade, fatture, peso));
        faiPosto(id);
    }

    /**
     * Due tetti: al massimo {@value #IMPORTAZIONI_MASSIME} importazioni in memoria e al massimo {@code memoriaMassima} byte
     * di file originali in tutto (vedi {@link #tettoEffettivo}). Oltre, si toglie la piu' vecchia per ordine
     * d'arrivo, finche' si rientra.
     * Si fa posto solo quando ne arriva una nuova (mai alla conferma) e l'ordine e' un contatore, non la scadenza: cosi'
     * l'importazione appena letta non e' mai quella scartata, nemmeno se due scadono nello stesso istante o se l'orologio
     * e' tornato indietro (cambio dell'ora del computer, orologio dei test). Vale anche per i byte: un'anteprima che da
     * sola supera il tetto resta, da sola (il cliente l'ha appena letta e deve poterla confermare; quanto puo' pesare lo
     * limitano gia' il caricamento e LettoreFile), e si toglie quando arriva la successiva.
     */
    private void faiPosto(String nuova) {
        Map<String, Voce> voci = new java.util.HashMap<>();
        importazioni.forEach((id, i) -> voci.put(id, new Voce(i.ordine(), i.peso())));
        daScartare(voci, nuova, IMPORTAZIONI_MASSIME, memoriaMassima).forEach(importazioni::remove);
    }

    /**
     * Quali importazioni togliere perche' restino al massimo {@code massime} e {@code tetto} byte: le piu' vecchie per
     * numero d'arrivo, una alla volta, finche' si rientra. {@code nuova}, quella appena inserita, non e' mai fra queste.
     */
    static List<String> daScartare(Map<String, Voce> voci, String nuova, int massime, long tetto) {
        List<String> vecchie = voci.keySet().stream().filter(id -> !id.equals(nuova))
                .sorted(Comparator.comparingLong((String id) -> voci.get(id).ordine())).toList();
        int quante = voci.size();
        long byteTotali = voci.values().stream().mapToLong(Voce::peso).sum();
        List<String> via = new ArrayList<>();
        for (String id : vecchie) {
            if (quante <= massime && byteTotali <= tetto) {
                break;
            }
            via.add(id);
            quante--;
            byteTotali -= voci.get(id).peso();
        }
        return via;
    }

    /**
     * Quali importazioni togliere PRIMA di leggere un carico di {@code inArrivo} byte perche' ci stia sotto {@code tetto}
     * insieme a quelle che restano: le piu' vecchie per numero d'arrivo, una alla volta, finche' ci sta. E' la stessa
     * scelta che {@link #daScartare} farebbe a lettura riuscita con un'anteprima di quel peso; in piu', qui un carico che
     * non pesa niente non fa togliere niente (nemmeno se si e' gia' oltre il tetto) e il numero di anteprime non conta.
     */
    static List<String> daScartarePrima(Map<String, Voce> voci, long inArrivo, long tetto) {
        if (inArrivo <= 0) {
            return List.of();
        }
        List<String> vecchie = voci.keySet().stream().sorted(Comparator.comparingLong((String id) -> voci.get(id).ordine())).toList();
        long byteTotali = voci.values().stream().mapToLong(Voce::peso).sum();
        List<String> via = new ArrayList<>();
        for (String id : vecchie) {
            if (byteTotali <= tetto - inArrivo) { // la sottrazione non trabocca: tetto >= 0 e inArrivo > 0
                break;
            }
            via.add(id);
            byteTotali -= voci.get(id).peso();
        }
        return via;
    }

    private static String nomeBase(String nome) {
        if (nome == null || nome.isBlank()) {
            return "file";
        }
        return nome.substring(Math.max(nome.lastIndexOf('/'), nome.lastIndexOf('\\')) + 1);
    }
}
