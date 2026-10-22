package it.contabilita.api;

import it.contabilita.programma.BackupService;
import it.contabilita.programma.BackupService.CartellaBackup;
import it.contabilita.programma.BackupService.StatoProgramma;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/programma}: versione e copie di sicurezza (docs/api.md). */
@RestController
@RequestMapping("/api/programma")
public class ProgrammaController {

    public record CartellaDto(String cartella) {
    }

    private final BackupService backup;

    public ProgrammaController(BackupService backup) {
        this.backup = backup;
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
}
