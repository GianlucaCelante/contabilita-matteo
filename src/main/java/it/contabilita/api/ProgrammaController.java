package it.contabilita.api;

import it.contabilita.programma.BackupService;
import it.contabilita.programma.BackupService.CartellaBackup;
import it.contabilita.programma.BackupService.StatoProgramma;
import it.contabilita.programma.RipristinoService;
import it.contabilita.programma.RipristinoService.Copia;
import it.contabilita.programma.RipristinoService.EsitoRichiesta;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** {@code /api/programma}: versione e copie di sicurezza (docs/api.md). */
@RestController
@RequestMapping("/api/programma")
public class ProgrammaController {

    public record CartellaDto(String cartella) {
    }

    public record RichiestaRipristino(String copia) {
    }

    private final BackupService backup;
    private final RipristinoService ripristino;

    public ProgrammaController(BackupService backup, RipristinoService ripristino) {
        this.backup = backup;
        this.ripristino = ripristino;
    }

    @GetMapping
    public StatoProgramma programma() {
        return backup.stato();
    }

    /** {@code cartella} vuota o null spegne le copie; altrimenti 400 se non esiste o non e' scrivibile. */
    @PutMapping("/backup")
    public StatoProgramma impostaCartella(@RequestBody CartellaDto corpo) {
        return backup.impostaCartella(corpo.cartella());
    }

    /** Copia subito: {@code {cartella}} e' la sottocartella datata creata. 409 se manca la cartella o una copia e' in corso. */
    @PostMapping("/backup")
    public CartellaBackup eseguiSubito() {
        return backup.eseguiSubito();
    }

    /** Le copie nella cartella configurata, dalla piu' recente: {@code [{nome, quando, dimensioneByte}]}. */
    @GetMapping("/copie")
    public List<Copia> copie() {
        return ripristino.elenca();
    }

    /** Ripristino a riavvio: 202 {@code {riavvio, copiaDiSicurezza}}, poi l'app esce con codice 75. */
    @PostMapping("/ripristina")
    public ResponseEntity<EsitoRichiesta> ripristina(@RequestBody RichiestaRipristino corpo) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ripristino.ripristina(corpo.copia()));
    }
}
