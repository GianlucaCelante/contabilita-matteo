package it.contabilita.dati;

import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.time.YearMonth;

/** Ricorrenza mensile: il modello delle occorrenze future. */
@Entity
@Table(name = "ricorrenza")
public class Ricorrenza {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private int giorno;

    @Column(nullable = false)
    private boolean attiva = true;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Tipo tipo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Documento documento;

    @Column(name = "importo_cent", nullable = false)
    private long importoCent;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "categoria_id")
    private Categoria categoria;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "fornitore_id")
    private Fornitore fornitore;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dipendente_id")
    private Dipendente dipendente;

    private String descrizione;
    private String note;

    /** Ultimo mese (yyyy-MM) gia' trattato dal generatore. */
    @Column(name = "ultimo_mese", nullable = false)
    private String ultimoMese;

    @Convert(converter = ConvertitoreIstante.class)
    @Column(name = "creata_il", nullable = false)
    private LocalDateTime creataIl;

    public Long getId() { return id; }
    public int getGiorno() { return giorno; }
    public void setGiorno(int giorno) { this.giorno = giorno; }
    public boolean isAttiva() { return attiva; }
    public void setAttiva(boolean attiva) { this.attiva = attiva; }
    public Tipo getTipo() { return tipo; }
    public void setTipo(Tipo tipo) { this.tipo = tipo; }
    public Documento getDocumento() { return documento; }
    public void setDocumento(Documento documento) { this.documento = documento; }
    public long getImportoCent() { return importoCent; }
    public void setImportoCent(long importoCent) { this.importoCent = importoCent; }
    public Categoria getCategoria() { return categoria; }
    public void setCategoria(Categoria categoria) { this.categoria = categoria; }
    public Fornitore getFornitore() { return fornitore; }
    public void setFornitore(Fornitore fornitore) { this.fornitore = fornitore; }
    public Dipendente getDipendente() { return dipendente; }
    public void setDipendente(Dipendente dipendente) { this.dipendente = dipendente; }
    public String getDescrizione() { return descrizione; }
    public void setDescrizione(String descrizione) { this.descrizione = descrizione; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public YearMonth getUltimoMese() { return YearMonth.parse(ultimoMese); }
    public void setUltimoMese(YearMonth mese) { this.ultimoMese = mese.toString(); }
    public LocalDateTime getCreataIl() { return creataIl; }
    public void setCreataIl(LocalDateTime creataIl) { this.creataIl = creataIl; }
}
