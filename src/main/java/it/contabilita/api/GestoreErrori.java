package it.contabilita.api;

import it.contabilita.PerLog;
import org.apache.catalina.connector.ClientAbortException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.util.unit.DataSize;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.io.IOException;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Ogni errore delle API risponde con {@code {"errore": "..."}} e il codice HTTP adeguato.
 * Tutte le risposte forzano esplicitamente {@code Content-Type: application/json}: un endpoint
 * che aveva gia' impostato un Content-Type diverso prima di lanciare l'eccezione (es. un
 * controller PNG) altrimenti fa fallire la negoziazione di Spring con "Failure in
 * @ExceptionHandler", che a sua volta arriva al browser come un errore ancora peggiore (visto nel
 * log del servizio installato).
 */
@RestControllerAdvice
public class GestoreErrori {

    private static final Logger log = LoggerFactory.getLogger(GestoreErrori.class);

    /** Quanto si puo' caricare in una richiesta ({@code spring.servlet.multipart.max-request-size}): lo dice il 400 del caricamento troppo grande. */
    private final DataSize caricamentoMassimo;

    /** Con il limite di application.yml: per i test che costruiscono il gestore a mano. */
    public GestoreErrori() {
        this(DataSize.ofMegabytes(120));
    }

    @Autowired
    public GestoreErrori(@Value("${spring.servlet.multipart.max-request-size:120MB}") DataSize caricamentoMassimo) {
        this.caricamentoMassimo = caricamentoMassimo;
    }

    @ExceptionHandler(ErroreApi.class)
    public ResponseEntity<Map<String, Object>> gestisciErroreApi(ErroreApi e) {
        Map<String, Object> corpo = new java.util.LinkedHashMap<>();
        corpo.put("errore", e.getMessage());
        corpo.putAll(e.getDettagli());
        return ResponseEntity.status(e.getStato()).contentType(MediaType.APPLICATION_JSON).body(corpo);
    }

    /**
     * Una risorsa statica mancante (un asset con un nome sbagliato, un percorso API senza
     * controller) non e' un errore del servizio: senza questo handler finiva nel catch-all
     * {@link #gestisciErroreGenerico(Exception)} e rispondeva 500 invece di 404.
     *
     * <p>Il messaggio e' come gli altri (maiuscola, parole del cliente): «Indirizzo non trovato: /api/…», con la barra
     * iniziale che Spring toglie dal percorso. Il percorso lo scrive chi chiama: nella risposta e nel log (a DEBUG, non e'
     * un guasto) passa da {@link PerLog#pulisci}, che toglie a capo e caratteri di controllo e lo accorcia oltre 300 caratteri.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, String>> gestisciRisorsaMancante(NoResourceFoundException e) {
        String percorso = e.getResourcePath() == null ? "" : e.getResourcePath();
        String pulito = PerLog.pulisci(percorso.startsWith("/") ? percorso : "/" + percorso);
        log.debug("indirizzo non trovato: {}", pulito);
        return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", "Indirizzo non trovato: " + pulito));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> gestisciArgomentoNonValido(IllegalArgumentException e) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(Map.of("errore", e.getMessage()));
    }

    /**
     * Un parametro della richiesta che non si converte nel tipo dichiarato ({@code
     * /api/storico?limite=tanti}, un id non numerico): e' un errore di chi chiama, non del
     * servizio - senza questo handler finiva nel catch-all e rispondeva 500.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>> gestisciTipoNonValido(MethodArgumentTypeMismatchException e) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", e.getName() + ": valore non valido: " + e.getValue()));
    }

    /**
     * Un metodo HTTP non supportato su una rotta che esiste (es. un'interfaccia vecchia in cache
     * che manda ancora un metodo tolto, o una richiesta scritta a mano sbagliata): errore di chi
     * chiama, non del servizio - senza questo handler finiva nel catch-all e rispondeva 500
     * "errore interno: Request method '...' is not supported" invece di 405 (segnalato il
     * 25/09/2026, docs/api.md). Messaggio generico apposta: il verbo o la rotta non aggiungono
     * niente a chi chiama e sono un dettaglio interno come un altro. Log a DEBUG, non ERROR/WARN:
     * non e' un guasto del servizio.
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, String>> gestisciMetodoNonSupportato(HttpRequestMethodNotSupportedException e) {
        log.debug("metodo non supportato: {}", PerLog.pulisci(e.getMessage())); // il nome del metodo lo scrive chi chiama
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", "Metodo non ammesso per questo indirizzo."));
    }

    /**
     * Un {@code Content-Type} che la rotta non legge (o che non e' nemmeno un tipo valido): errore di chi chiama, non del
     * servizio. Senza questo handler finiva nel catch-all: 500, una riga a ERROR con lo stack e, nel corpo, il messaggio di
     * Spring con dentro il valore scritto dal cliente. Il valore non torna nella risposta; nel log va solo a DEBUG, pulito.
     */
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<Map<String, String>> gestisciTipoDiContenutoNonAmmesso(HttpMediaTypeNotSupportedException e) {
        log.debug("tipo di contenuto non ammesso: {}", PerLog.pulisci(e.getMessage()));
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", "Tipo di contenuto non ammesso per questo indirizzo."));
    }

    /**
     * Un {@code Accept} che la rotta non sa soddisfare (per esempio un PDF chiesto a una rotta che da' JSON): 406. La
     * risposta resta JSON, come ogni errore: il Content-Type e' forzato, quindi Spring non rinegozia.
     */
    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    public ResponseEntity<Map<String, String>> gestisciFormatoNonDisponibile(HttpMediaTypeNotAcceptableException e) {
        log.debug("formato della risposta non disponibile: {}", PerLog.pulisci(e.getMessage()));
        return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", "Formato della risposta non disponibile per questo indirizzo."));
    }

    /**
     * Un corpo della richiesta che non si legge come JSON (sintassi rotta, es. chiavi senza
     * virgolette, o nessun corpo dove ne serve uno): errore di chi chiama, non del servizio - senza
     * questo handler finiva nel catch-all e rispondeva 500 con dentro il messaggio grezzo di
     * Jackson (posizione, offset del buffer) invece di 400 (segnalato il 25/09/2026, docs/api.md,
     * insieme al 405 sopra). Messaggio generico apposta, senza i dettagli di Jackson: non
     * aiuterebbero chi chiama e sono un dettaglio interno - il log li terrebbe se servissero, ma
     * qui niente log (WARN o ERROR): come gli altri 400 di questa classe, non e' un guasto del
     * servizio.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> gestisciCorpoIlleggibile(HttpMessageNotReadableException e) {
        // Un campo con un valore del tipo sbagliato (enum sconosciuto, data non valida, testo al
        // posto di un numero): si dice quale campo, senza i dettagli interni di Jackson.
        if (e.getCause() instanceof com.fasterxml.jackson.databind.exc.InvalidFormatException f && !f.getPath().isEmpty()) {
            String campo = f.getPath().get(f.getPath().size() - 1).getFieldName();
            if (campo != null) {
                return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("errore", "Valore non valido per «" + campo + "»: " + f.getValue()));
            }
        }
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", "Richiesta non leggibile: JSON non valido."));
    }

    /**
     * Caricamento troppo grande per i limiti multipart (fase 4): errore di chi chiama, non del servizio. Il testo vale per
     * un file come per tanti (l'importazione ne carica piu' d'uno) e dice il massimo: i due limiti di application.yml, per
     * file e per richiesta, sono uguali apposta, cosi' il numero e' vero in tutti e due i casi.
     */
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> gestisciCaricamentoTroppoGrande(Exception e) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", "Il caricamento è troppo grande (massimo " + caricamentoMassimo.toMegabytes()
                        + " MB per volta): scegli meno file, o file più piccoli, e riprova."));
    }

    /**
     * Un caricamento che non si riesce a leggere: la richiesta non e' un caricamento (multipart) dove ne serve uno, oppure
     * e' arrivata rotta o a meta'. Errore di chi chiama o della rete, non del servizio: 400, e nel log solo a DEBUG. Il
     * file troppo grande ha il suo handler qui sopra (piu' specifico, quindi vince).
     */
    @ExceptionHandler(org.springframework.web.multipart.MultipartException.class)
    public ResponseEntity<Map<String, String>> gestisciCaricamentoNonValido(org.springframework.web.multipart.MultipartException e) {
        log.debug("caricamento non valido: {}", PerLog.pulisci(e.getMessage()));
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", "Il caricamento del file non è valido: riprova."));
    }

    /** Manca un parametro obbligatorio della richiesta ({@code ?nome=}). Il nome e' quello dichiarato dalla rotta, non un valore del cliente. */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, String>> gestisciParametroMancante(MissingServletRequestParameterException e) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", "Manca il parametro «" + e.getParameterName() + "»."));
    }

    /** Manca il campo multipart atteso (per esempio «file» o «files»). */
    @ExceptionHandler(org.springframework.web.multipart.support.MissingServletRequestPartException.class)
    public ResponseEntity<Map<String, String>> gestisciPartMancante(
            org.springframework.web.multipart.support.MissingServletRequestPartException e) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", "Manca il campo «" + e.getRequestPartName() + "» nella richiesta."));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> gestisciValidazione(MethodArgumentNotValidException e) {
        String messaggio = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .orElse("dati non validi");
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(Map.of("errore", messaggio));
    }

    /**
     * Il browser ha chiuso la connessione (cambio pagina su {@code /api/eventi}, refresh a meta'
     * di una risposta): la connessione e' gia' rotta, scrivere un corpo JSON fallirebbe di nuovo.
     * Non e' un errore del servizio: si logga a DEBUG (non ERROR/WARN) e non si scrive nulla.
     */
    @ExceptionHandler({AsyncRequestNotUsableException.class, ClientAbortException.class})
    public void gestisciConnessioneCadutaLatoClient(Exception e) {
        log.debug("connessione interrotta dal client: {}", PerLog.pulisci(e.getMessage()));
    }

    /**
     * Stessa cosa quando il socket muore mentre si scrive un corpo binario (es. il PNG
     * dell'anteprima, chiesto e poi abbandonato dal browser che ha già cambiato prodotto): Tomcat
     * non sempre lo incarta in {@link ClientAbortException}, arriva una {@link IOException} nuda
     * con il messaggio del sistema (in italiano su Windows). Si riconosce dal messaggio.
     */
    private static final Pattern CONNESSIONE_CADUTA = Pattern.compile(
            "connessione interrotta|connection reset|connection was aborted|forcibly closed|broken pipe|connessione .* chiusa",
            Pattern.CASE_INSENSITIVE);

    /** Il testo del 500 per il cliente: sempre questo, mai il messaggio dell'eccezione. */
    static final String ERRORE_INTERNO = "Errore interno: riprova. Se continua, riavvia il programma sul computer.";

    /**
     * Tutto quello che non ha un handler suo: un guasto del servizio. Al cliente arriva un testo generico (il messaggio
     * dell'eccezione puo' contenere dati suoi o dettagli interni, e non gli direbbe cosa fare); il dettaglio va solo nel
     * log, a ERROR con lo stack, passando da {@link PerLog#conStack}: tipo e messaggio veri, ma senza a capo ne' caratteri
     * di controllo, perche' il messaggio puo' riportare un valore arrivato con la richiesta.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> gestisciErroreGenerico(Exception e) {
        if (e instanceof IOException && e.getMessage() != null && CONNESSIONE_CADUTA.matcher(e.getMessage()).find()) {
            log.debug("connessione interrotta dal client mentre si scriveva la risposta: {}", PerLog.pulisci(e.getMessage()));
            return null;
        }
        log.error("errore non gestito in una richiesta API", PerLog.conStack(e));
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("errore", ERRORE_INTERNO));
    }
}
