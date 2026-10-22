package it.contabilita.dati;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Impostazioni chiave/valore del servizio (e stato interno del backup, chiavi "backup."). */
@Entity
@Table(name = "impostazione")
public class Impostazione {

    @Id
    @Column(name = "chiave", nullable = false)
    private String chiave;

    @Column(name = "valore", nullable = false)
    private String valore;

    protected Impostazione() {
        // per JPA
    }

    public Impostazione(String chiave, String valore) {
        this.chiave = chiave;
        this.valore = valore;
    }

    public String getChiave() {
        return chiave;
    }

    public String getValore() {
        return valore;
    }

    public void setValore(String valore) {
        this.valore = valore;
    }
}
