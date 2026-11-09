package it.contabilita.accesso;

import it.contabilita.dati.Impostazione;
import it.contabilita.dati.ImpostazioneRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * La password per entrare nell'app. Se non e' impostata l'app e' aperta (come prima); una volta impostata
 * ogni richiesta alle API ha bisogno di una sessione (cookie), che si ottiene con la password.
 * La password non si salva mai in chiaro: solo l'impronta PBKDF2 con sale, nella chiave interna
 * {@code accesso.password} (che le impostazioni non mostrano e non lasciano scrivere).
 * Le sessioni stanno in memoria: riavviando il servizio si rientra con la password.
 */
@Service
public class AccessoService {

    public static final String CHIAVE_PASSWORD = "accesso.password";
    // Senza uso la sessione cade dopo mezz'ora (ogni richiesta la rinnova); il cookie poi muore con il browser: ad ogni accesso la password.
    public static final Duration INATTIVITA_MASSIMA = Duration.ofMinutes(30);

    private static final int ITERAZIONI = 120_000;
    private static final int TENTATIVI_MASSIMI = 5;
    private static final Duration BLOCCO = Duration.ofSeconds(30);

    private final ImpostazioneRepository impostazioni;
    private final Clock orologio;
    private final SecureRandom casuale = new SecureRandom();
    private final Map<String, Instant> sessioni = new ConcurrentHashMap<>();
    private int tentativiFalliti;
    private Instant bloccoFinoA = Instant.MIN;

    public AccessoService(ImpostazioneRepository impostazioni, Clock orologio) {
        this.impostazioni = impostazioni;
        this.orologio = orologio;
    }

    /** Esito di un tentativo di accesso. */
    public enum Esito { OK, ERRATA, BLOCCATO }

    /** Il risultato di {@link #accedi}: l'esito e, se giusto, il token della sessione. */
    public record Tentativo(Esito esito, String token) {
    }

    @Transactional(readOnly = true)
    public boolean protetta() {
        return impostazioni.findById(CHIAVE_PASSWORD).isPresent();
    }

    /** Vera se la richiesta con questo token di sessione puo' passare. */
    public boolean sessioneValida(String token) {
        if (token == null) return false;
        Instant scadenza = sessioni.get(token);
        if (scadenza == null) return false;
        Instant adesso = orologio.instant();
        if (scadenza.isBefore(adesso)) {
            sessioni.remove(token);
            return false;
        }
        sessioni.put(token, adesso.plus(INATTIVITA_MASSIMA));
        return true;
    }

    /** Controlla la password con il limite dei tentativi; se giusta apre una sessione nuova. */
    public synchronized Tentativo accedi(String password) {
        Instant adesso = orologio.instant();
        if (adesso.isBefore(bloccoFinoA)) {
            return new Tentativo(Esito.BLOCCATO, null);
        }
        if (!verifica(password)) {
            if (++tentativiFalliti >= TENTATIVI_MASSIMI) {
                tentativiFalliti = 0;
                bloccoFinoA = adesso.plus(BLOCCO);
            }
            return new Tentativo(Esito.ERRATA, null);
        }
        tentativiFalliti = 0;
        return new Tentativo(Esito.OK, nuovaSessione());
    }

    public void esci(String token) {
        if (token != null) sessioni.remove(token);
    }

    /** Vera se la password data e' quella attuale (o se non ce n'e' nessuna). */
    @Transactional(readOnly = true)
    public boolean verifica(String password) {
        Optional<Impostazione> salvata = impostazioni.findById(CHIAVE_PASSWORD);
        if (salvata.isEmpty()) return true;
        if (password == null) return false;
        String[] parti = salvata.get().getValore().split(":");
        if (parti.length != 3) return false;
        byte[] atteso = Base64.getDecoder().decode(parti[2]);
        byte[] dato = impronta(password, Base64.getDecoder().decode(parti[1]), Integer.parseInt(parti[0]));
        return MessageDigest.isEqual(atteso, dato);
    }

    /**
     * Imposta, cambia o toglie la password (nuova nulla o vuota). Tutte le sessioni vecchie cadono;
     * se resta una password, torna il token di una sessione nuova per chi l'ha cambiata.
     */
    @Transactional
    public synchronized Optional<String> imposta(String nuova) {
        sessioni.clear();
        tentativiFalliti = 0;
        bloccoFinoA = Instant.MIN;
        if (nuova == null || nuova.isEmpty()) {
            impostazioni.deleteById(CHIAVE_PASSWORD);
            return Optional.empty();
        }
        byte[] sale = new byte[16];
        casuale.nextBytes(sale);
        String valore = ITERAZIONI + ":" + Base64.getEncoder().encodeToString(sale) + ":"
                + Base64.getEncoder().encodeToString(impronta(nuova, sale, ITERAZIONI));
        impostazioni.save(new Impostazione(CHIAVE_PASSWORD, valore));
        return Optional.of(nuovaSessione());
    }

    private String nuovaSessione() {
        byte[] b = new byte[32];
        casuale.nextBytes(b);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        Instant adesso = orologio.instant();
        sessioni.values().removeIf(s -> s.isBefore(adesso));
        sessioni.put(token, adesso.plus(INATTIVITA_MASSIMA));
        return token;
    }

    private static byte[] impronta(String password, byte[] sale, int iterazioni) {
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(new PBEKeySpec(password.toCharArray(), sale, iterazioni, 256)).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
