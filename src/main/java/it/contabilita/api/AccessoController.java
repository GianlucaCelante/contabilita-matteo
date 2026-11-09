package it.contabilita.api;

import it.contabilita.accesso.AccessoService;
import it.contabilita.accesso.AccessoService.Esito;
import it.contabilita.accesso.AccessoService.Tentativo;
import it.contabilita.accesso.FiltroAccesso;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Optional;

/**
 * La password per entrare: {@code GET /api/accesso} (serve? sono dentro?), {@code POST} (entra),
 * {@code DELETE} (esce), {@code PUT /api/accesso/password} (imposta, cambia o toglie).
 */
@RestController
@RequestMapping("/api/accesso")
public class AccessoController {

    private static final int LUNGHEZZA_MINIMA = 4;
    private static final int LUNGHEZZA_MASSIMA = 200;

    public record StatoAccesso(boolean protetta, boolean autenticato) {
    }

    public record Credenziali(String password) {
    }

    public record CambioPassword(String attuale, String nuova) {
    }

    private final AccessoService accesso;

    public AccessoController(AccessoService accesso) {
        this.accesso = accesso;
    }

    @GetMapping
    public StatoAccesso stato(HttpServletRequest richiesta) {
        boolean protetta = accesso.protetta();
        return new StatoAccesso(protetta, !protetta || accesso.sessioneValida(FiltroAccesso.token(richiesta)));
    }

    @PostMapping
    public ResponseEntity<StatoAccesso> entra(@RequestBody Credenziali corpo) {
        if (!accesso.protetta()) {
            return ResponseEntity.ok(new StatoAccesso(false, true));
        }
        Tentativo tentativo = accesso.accedi(corpo.password());
        if (tentativo.esito() == Esito.BLOCCATO) {
            throw new ErroreApi(HttpStatus.TOO_MANY_REQUESTS, "Troppi tentativi: aspetta mezzo minuto e riprova.");
        }
        if (tentativo.esito() == Esito.ERRATA) {
            throw new ErroreApi(HttpStatus.UNAUTHORIZED, "Password sbagliata.");
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie(tentativo.token(), null).toString())
                .body(new StatoAccesso(true, true));
    }

    @DeleteMapping
    public ResponseEntity<Void> esci(HttpServletRequest richiesta) {
        accesso.esci(FiltroAccesso.token(richiesta));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString()).build();
    }

    /** {@code nuova} vuota toglie la password. Con una password gia' impostata serve anche {@code attuale}. */
    @PutMapping("/password")
    public ResponseEntity<StatoAccesso> cambia(@RequestBody CambioPassword corpo) {
        if (accesso.protetta() && !accesso.verifica(corpo.attuale())) {
            throw new ErroreApi(HttpStatus.FORBIDDEN, "La password attuale non è giusta.");
        }
        String nuova = corpo.nuova();
        if (nuova != null && !nuova.isEmpty()
                && (nuova.length() < LUNGHEZZA_MINIMA || nuova.length() > LUNGHEZZA_MASSIMA)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST,
                    "La password deve avere almeno " + LUNGHEZZA_MINIMA + " caratteri.");
        }
        Optional<String> token = accesso.imposta(nuova);
        String cookie = token.isPresent()
                ? cookie(token.get(), null).toString()
                : cookie("", Duration.ZERO).toString();
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie)
                .body(new StatoAccesso(token.isPresent(), true));
    }

    /** {@code durata} nulla = cookie «di sessione»: sparisce quando si chiude il browser. */
    private static ResponseCookie cookie(String valore, Duration durata) {
        ResponseCookie.ResponseCookieBuilder b = ResponseCookie.from(FiltroAccesso.COOKIE, valore)
                .httpOnly(true).sameSite("Lax").path("/");
        return (durata == null ? b : b.maxAge(durata)).build();
    }
}
