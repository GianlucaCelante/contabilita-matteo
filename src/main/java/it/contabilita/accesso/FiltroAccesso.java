package it.contabilita.accesso;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Con la password impostata chiude le API (401) a chi non ha una sessione. Restano aperti l'accesso stesso
 * ({@code /api/accesso}, per entrare e per sapere se serve) e {@code /api/versione} (il servizio risponde?).
 * L'interfaccia (file statici) e' pubblica: e' solo la pagina, i dati stanno dietro le API.
 */
@Component
public class FiltroAccesso extends OncePerRequestFilter {

    public static final String COOKIE = "contabilita_sessione";

    private final AccessoService accesso;

    public FiltroAccesso(AccessoService accesso) {
        this.accesso = accesso;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest richiesta) {
        String percorso = richiesta.getRequestURI();
        return !percorso.startsWith("/api/")
                || percorso.equals("/api/versione")
                || percorso.equals("/api/accesso")
                || "OPTIONS".equals(richiesta.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest richiesta, HttpServletResponse risposta, FilterChain catena)
            throws ServletException, IOException {
        if (!accesso.protetta() || accesso.sessioneValida(token(richiesta))) {
            catena.doFilter(richiesta, risposta);
            return;
        }
        risposta.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        risposta.setContentType("application/json");
        risposta.setCharacterEncoding(StandardCharsets.UTF_8.name());
        risposta.getWriter().write("{\"errore\":\"Accesso richiesto.\"}");
    }

    public static String token(HttpServletRequest richiesta) {
        Cookie[] cookie = richiesta.getCookies();
        if (cookie == null) return null;
        for (Cookie c : cookie) {
            if (COOKIE.equals(c.getName())) return c.getValue();
        }
        return null;
    }
}
