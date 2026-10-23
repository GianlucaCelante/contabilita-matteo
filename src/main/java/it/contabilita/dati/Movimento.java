package it.contabilita.dati;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "movimento")
public class Movimento {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Convert(converter = ConvertitoreData.class)
    @Column(nullable = false)
    private LocalDate data;

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

    @Column(name = "numero_documento")
    private String numeroDocumento;

    private String note;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Origine origine = Origine.MANO;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ricorrenza_id")
    private Ricorrenza ricorrenza;

    /** Mese (yyyy-MM) dell'occorrenza, solo per i movimenti di una ricorrenza. */
    @Column(name = "anno_mese")
    private String annoMese;

    @Column(name = "allegato_nome")
    private String allegatoNome;

    /** Nome interno (UUID + estensione) del file in {@code <cartella dati>/allegati/}; mai dedotto dall'input. */
    @Column(name = "allegato_file")
    private String allegatoFile;

    @Convert(converter = ConvertitoreIstante.class)
    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;

    @Convert(converter = ConvertitoreIstante.class)
    @Column(name = "modificato_il", nullable = false)
    private LocalDateTime modificatoIl;

    public Long getId() { return id; }
    public LocalDate getData() { return data; }
    public void setData(LocalDate data) { this.data = data; }
    public Tipo getTipo() { return tipo; }
    public void setTipo(Tipo tipo) { this.tipo = tipo; }
    public Documento getDocumento() { return documento; }
    public void setDocumento(Documento documento) { this.documento = documento; }
    public long getImportoCent() { return importoCent; }
    /** Quanto pesa sui costi: l'importo, tranne una nota di credito ricevuta, che li riduce. */
    public long getEffettoSuiCostiCent() { return documento == Documento.NOTA_DI_CREDITO ? -importoCent : importoCent; }
    public void setImportoCent(long importoCent) { this.importoCent = importoCent; }
    public Categoria getCategoria() { return categoria; }
    public void setCategoria(Categoria categoria) { this.categoria = categoria; }
    public Fornitore getFornitore() { return fornitore; }
    public void setFornitore(Fornitore fornitore) { this.fornitore = fornitore; }
    public Dipendente getDipendente() { return dipendente; }
    public void setDipendente(Dipendente dipendente) { this.dipendente = dipendente; }
    public String getDescrizione() { return descrizione; }
    public void setDescrizione(String descrizione) { this.descrizione = descrizione; }
    public String getNumeroDocumento() { return numeroDocumento; }
    public void setNumeroDocumento(String numeroDocumento) { this.numeroDocumento = numeroDocumento; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Origine getOrigine() { return origine; }
    public void setOrigine(Origine origine) { this.origine = origine; }
    public Ricorrenza getRicorrenza() { return ricorrenza; }
    public void setRicorrenza(Ricorrenza ricorrenza) { this.ricorrenza = ricorrenza; }
    public String getAnnoMese() { return annoMese; }
    public void setAnnoMese(String annoMese) { this.annoMese = annoMese; }
    public String getAllegatoNome() { return allegatoNome; }
    public void setAllegatoNome(String allegatoNome) { this.allegatoNome = allegatoNome; }
    public String getAllegatoFile() { return allegatoFile; }
    public void setAllegatoFile(String allegatoFile) { this.allegatoFile = allegatoFile; }
    public LocalDateTime getCreatoIl() { return creatoIl; }
    public void setCreatoIl(LocalDateTime creatoIl) { this.creatoIl = creatoIl; }
    public LocalDateTime getModificatoIl() { return modificatoIl; }
    public void setModificatoIl(LocalDateTime modificatoIl) { this.modificatoIl = modificatoIl; }
}
