package it.contabilita.api;

import it.contabilita.dati.Impostazione;
import it.contabilita.dati.ImpostazioneRepository;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.TreeMap;

/**
 * {@code GET/PUT /api/impostazioni}: mappa chiave -> valore. Nella fase 1 non ci sono chiavi
 * predefinite: ogni chiave e' libera (l'interfaccia ci tiene le sue preferenze). Le chiavi con
 * prefisso {@code backup.} sono stato interno di {@code BackupService}: non si vedono e non si scrivono.
 */
@RestController
@RequestMapping("/api/impostazioni")
public class ImpostazioniController {

    private static final String PREFISSO_CHIAVE_INTERNA = "backup.";
    private static final int CHIAVE_MASSIMA = 100;
    private static final int VALORE_MASSIMO = 2000;

    private final ImpostazioneRepository repository;

    public ImpostazioniController(ImpostazioneRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public Map<String, String> tutte() {
        Map<String, String> mappa = new TreeMap<>();
        repository.findAll().stream()
                .filter(i -> !i.getChiave().startsWith(PREFISSO_CHIAVE_INTERNA))
                .forEach(i -> mappa.put(i.getChiave(), i.getValore()));
        return mappa;
    }

    @PutMapping
    @Transactional
    public Map<String, String> aggiorna(@RequestBody Map<String, String> nuove) {
        nuove.forEach(ImpostazioniController::valida);
        nuove.forEach((chiave, valore) -> repository.save(new Impostazione(chiave, valore)));
        return tutte();
    }

    private static void valida(String chiave, String valore) {
        if (chiave == null || chiave.isBlank() || chiave.length() > CHIAVE_MASSIMA) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Chiave di impostazione non valida.");
        }
        if (chiave.startsWith(PREFISSO_CHIAVE_INTERNA)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "impostazione non riconosciuta: " + chiave);
        }
        if (valore == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, chiave + ": il valore è obbligatorio.");
        }
        if (valore.length() > VALORE_MASSIMO) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, chiave + ": il valore è troppo lungo.");
        }
    }
}
