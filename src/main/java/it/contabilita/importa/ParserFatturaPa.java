package it.contabilita.importa;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.Attributes;
import org.xml.sax.EntityResolver;
import org.xml.sax.ErrorHandler;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXNotRecognizedException;
import org.xml.sax.SAXNotSupportedException;
import org.xml.sax.SAXParseException;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.DefaultHandler;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.parsers.SAXParser;
import javax.xml.parsers.SAXParserFactory;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Lettura di una fattura elettronica FatturaPA (anche un lotto con piu' {@code FatturaElettronicaBody}), nel tracciato
 * ordinario ({@code FatturaElettronica}, FPR12/FPA12) e in quello semplificato ({@code FatturaElettronicaSemplificata},
 * FSM10: TD07, TD08, TD09).
 *
 * <p>Il tracciato semplificato e' diverso in tre punti: il fornitore ha partita IVA e nome come figli diretti di
 * {@code CedentePrestatore} (niente {@code DatiAnagrafici}/{@code Anagrafica}); il totale del documento non e' scritto; ogni
 * {@code DatiBeniServizi} (uno o piu') ha un {@code Importo} <b>IVA compresa</b> e {@code DatiIVA} con {@code Imposta} oppure
 * {@code Aliquota}. Quindi il totale e' la somma degli importi, l'IVA e' l'imposta scritta o, se c'e' solo l'aliquota, lo
 * scorporo dall'importo, e l'imponibile e' la differenza.
 *
 * <p>Gli elementi si riconoscono per nome locale, mai per prefisso: {@code p:}, {@code ns3:} o nessun prefisso
 * e le versioni FPR12/FPA12 si leggono allo stesso modo. Gli importi passano da {@link BigDecimal} e arrivano
 * a centesimi interi (arrotondamento al centesimo, mezzo verso l'alto) senza mai usare numeri in virgola mobile.
 *
 * <p>Sicurezza (XXE, "billion laughs"): il parser rifiuta qualunque {@code DOCTYPE}, quindi nessuna entita'
 * (interna o esterna) e nessuna DTD viene mai espansa o scaricata; nessun file locale viene letto e nessuna
 * richiesta di rete parte. Le altre funzioni di accesso esterno sono spente comunque (difesa a strati).
 *
 * <p>Memoria: il file si legge <b>a flusso</b> (SAX: e' lo stesso lettore XML che prima costruiva il DOM, quindi stessi
 * controlli e stessi errori) e in memoria si tengono solo gli elementi che la lettura guarda: vedi
 * {@link SoloQuelloCheSiLegge}. Gli {@code Allegati} (un PDF in base64 pesa megabyte) e le righe di dettaglio si
 * controllano come tutto il resto, ma non si conservano: i byte del file restano comunque a chi li allega.
 */
public final class ParserFatturaPa {

    /** Una fattura letta. Il tipo ({@code TD01}...) e' riportato com'e': decide il chiamante se importarla. */
    public record DatiFattura(String fornitoreNome, String partitaIva, String tipoDocumento, String numero,
                              LocalDate data, long imponibileCent, long ivaCent, long totaleCent) {
    }

    /**
     * Il messaggio lo legge il cliente: italiano semplice, senza nomi dei campi del tracciato, sigle o numeri di riga.
     * Il {@link #dettaglio()} tecnico (campo mancante, riga, errore del parser) serve solo al log.
     */
    public static class ErroreLettura extends Exception {
        private final String dettaglio;

        public ErroreLettura(String messaggio) {
            this(messaggio, null);
        }

        public ErroreLettura(String messaggio, String dettaglio) {
            super(messaggio);
            this.dettaglio = dettaglio;
        }

        /** Dettaglio tecnico per il log; se manca, il messaggio stesso. */
        public String dettaglio() {
            return dettaglio == null ? getMessage() : dettaglio;
        }
    }

    private static final SAXParserFactory FABBRICA = creaFabbrica();

    /** Serve solo a creare il documento vuoto in cui {@link SoloQuelloCheSiLegge} mette gli elementi tenuti: non legge niente. */
    private static final DocumentBuilderFactory FABBRICA_DOCUMENTI = creaFabbricaDocumenti();

    private ParserFatturaPa() {
    }

    private static SAXParserFactory creaFabbrica() {
        try {
            SAXParserFactory f = SAXParserFactory.newInstance();
            f.setNamespaceAware(true);
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            f.setXIncludeAware(false);
            return f;
        } catch (ParserConfigurationException | SAXException e) {
            throw new IllegalStateException("Parser XML non configurabile in modo sicuro", e);
        }
    }

    private static DocumentBuilderFactory creaFabbricaDocumenti() {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(true);
        return f;
    }

    public static List<DatiFattura> leggi(byte[] xml) throws ErroreLettura {
        return leggiDocumento(analizza(xml));
    }

    /**
     * Le fatture di un documento gia' aperto. Guarda SOLO gli elementi elencati in {@link SoloQuelloCheSiLegge}: chi
     * aggiunge qui la lettura di un altro elemento deve aggiungerlo anche li', altrimenti non lo trova. Separato da
     * {@link #leggi} perche' il test di parita' lo chiama anche sul documento intero, aperto come si faceva prima.
     */
    static List<DatiFattura> leggiDocumento(Document documento) throws ErroreLettura {
        Element radice = documento.getDocumentElement();
        boolean semplificata = "FatturaElettronicaSemplificata".equals(nome(radice));
        if (!semplificata && !"FatturaElettronica".equals(nome(radice))) {
            throw new ErroreLettura("Il file non è una fattura elettronica.",
                    "radice «" + nome(radice) + "» invece di FatturaElettronica o FatturaElettronicaSemplificata (non è FatturaPA)");
        }
        Element intestazione = figlio(radice, "FatturaElettronicaHeader");
        Element cedente = intestazione == null ? null : figlio(intestazione, "CedentePrestatore");
        // nel tracciato semplificato partita IVA e nome stanno direttamente nel CedentePrestatore
        Element anagrafiche = cedente == null || semplificata ? cedente : figlio(cedente, "DatiAnagrafici");
        if (anagrafiche == null) {
            throw new ErroreLettura("Nella fattura manca il nome del fornitore.",
                    semplificata ? "manca CedentePrestatore" : "manca CedentePrestatore/DatiAnagrafici");
        }
        String fornitore = nomeFornitore(semplificata ? anagrafiche : figlio(anagrafiche, "Anagrafica"));
        if (fornitore == null) {
            throw new ErroreLettura("Nella fattura manca il nome del fornitore.",
                    "manca " + (semplificata ? "" : "Anagrafica/") + "Denominazione (oppure Nome e Cognome) del CedentePrestatore");
        }
        Element idFiscale = figlio(anagrafiche, "IdFiscaleIVA");
        String partitaIva = idFiscale == null ? null : testo(figlio(idFiscale, "IdCodice"));

        List<DatiFattura> fatture = new ArrayList<>();
        for (Element body : figli(radice, "FatturaElettronicaBody")) {
            fatture.add(leggiBody(body, fornitore, partitaIva, semplificata));
        }
        if (fatture.isEmpty()) {
            throw new ErroreLettura("Il file non contiene nessuna fattura.", "manca FatturaElettronicaBody");
        }
        return fatture;
    }

    private static DatiFattura leggiBody(Element body, String fornitore, String partitaIva, boolean semplificata)
            throws ErroreLettura {
        Element generali = figlio(body, "DatiGenerali");
        Element documento = generali == null ? null : figlio(generali, "DatiGeneraliDocumento");
        if (documento == null) {
            throw new ErroreLettura("Nella fattura mancano numero e data.", "manca DatiGenerali/DatiGeneraliDocumento");
        }
        String tipo = testo(figlio(documento, "TipoDocumento"));
        String numero = testo(figlio(documento, "Numero"));
        if (numero == null) {
            throw new ErroreLettura("Manca il numero della fattura.", "manca DatiGeneraliDocumento/Numero");
        }
        String dataTesto = testo(figlio(documento, "Data"));
        LocalDate data;
        try {
            data = LocalDate.parse(dataTesto == null ? "" : dataTesto);
        } catch (DateTimeParseException e) {
            throw new ErroreLettura("La data della fattura manca o non è valida: «" + (dataTesto == null ? "" : dataTesto) + "».",
                    "DatiGeneraliDocumento/Data non valida: «" + dataTesto + "» (fattura " + numero + ")");
        }
        if (semplificata) {
            return leggiImportiSemplificata(body, fornitore, partitaIva, tipo, numero, data);
        }
        long imponibile = 0;
        long iva = 0;
        boolean haRiepilogo = false;
        Element beniServizi = figlio(body, "DatiBeniServizi");
        if (beniServizi != null) {
            for (Element riepilogo : figli(beniServizi, "DatiRiepilogo")) {
                haRiepilogo = true;
                imponibile += centesimi(testo(figlio(riepilogo, "ImponibileImporto")), "ImponibileImporto", true);
                iva += centesimi(testo(figlio(riepilogo, "Imposta")), "Imposta", true);
            }
        }
        String totaleTesto = testo(figlio(documento, "ImportoTotaleDocumento"));
        long totale = totaleTesto != null ? centesimi(totaleTesto, "ImportoTotaleDocumento", false) : imponibile + iva;
        if (!haRiepilogo) {
            imponibile = totale;
        }
        return new DatiFattura(fornitore, partitaIva, tipo, numero, data, imponibile, iva, totale);
    }

    /**
     * Gli importi del tracciato semplificato: un {@code DatiBeniServizi} per riga, con {@code Importo} IVA compresa. Senza
     * righe o senza un importo il totale non si inventa: la fattura non si legge.
     */
    private static DatiFattura leggiImportiSemplificata(Element body, String fornitore, String partitaIva, String tipo,
                                                        String numero, LocalDate data) throws ErroreLettura {
        List<Element> righe = figli(body, "DatiBeniServizi");
        if (righe.isEmpty()) {
            throw new ErroreLettura("Nella fattura manca il totale.", "fattura semplificata senza DatiBeniServizi (fattura " + numero + ")");
        }
        long totale = 0;
        long iva = 0;
        for (Element riga : righe) {
            String importoTesto = testo(figlio(riga, "Importo"));
            long importo = centesimi(importoTesto, "DatiBeniServizi/Importo", false);
            totale += importo;
            Element datiIva = figlio(riga, "DatiIVA");
            if (datiIva == null) {
                continue; // riga senza IVA (c'e' la Natura): tutta imponibile
            }
            String imposta = testo(figlio(datiIva, "Imposta"));
            String aliquota = testo(figlio(datiIva, "Aliquota"));
            if (imposta != null) {
                long impostaRiga = centesimi(imposta, "Imposta", true);
                // l'importo e' IVA compresa: un'imposta negativa o piu' grande dell'importo darebbe un imponibile senza senso
                if (impostaRiga < 0 || impostaRiga > importo) {
                    throw new ErroreLettura("L'IVA della fattura non è coerente con il totale.",
                            "DatiIVA/Imposta «" + imposta + "» negativa o maggiore di Importo «" + importoTesto + "» (fattura " + numero + ")");
                }
                iva += impostaRiga;
            } else if (aliquota != null) {
                iva += scorporo(importoTesto, aliquota);
            }
        }
        return new DatiFattura(fornitore, partitaIva, tipo, numero, data, totale - iva, iva, totale);
    }

    /** L'IVA dentro un importo IVA compresa: importo × aliquota / (100 + aliquota), al centesimo. */
    private static long scorporo(String importo, String aliquota) throws ErroreLettura {
        try {
            BigDecimal percento = new BigDecimal(aliquota.strip());
            if (percento.signum() < 0 || percento.compareTo(BigDecimal.valueOf(100)) > 0) {
                throw new NumberFormatException("aliquota fuori scala");
            }
            return new BigDecimal(importo.strip()).multiply(percento)
                    .divide(percento.add(BigDecimal.valueOf(100)), 2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
        } catch (NumberFormatException | ArithmeticException e) {
            throw new ErroreLettura("L'aliquota IVA della fattura non è valida: «" + aliquota + "».", "Aliquota non valida: «" + aliquota + "»");
        }
    }

    /** Decimale con punto -> centesimi, con BigDecimal. Un valore assente vale zero solo se {@code ammettiVuoto}. */
    private static long centesimi(String valore, String campo, boolean ammettiVuoto) throws ErroreLettura {
        if (valore == null) {
            if (ammettiVuoto) {
                return 0;
            }
            throw new ErroreLettura("Nella fattura manca " + nomeImporto(campo, false) + ".", "manca " + campo);
        }
        try {
            return new BigDecimal(valore.strip()).setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
        } catch (NumberFormatException | ArithmeticException e) {
            throw new ErroreLettura(nomeImporto(campo, true) + " della fattura non è un importo valido: «" + valore + "».",
                    campo + " non valido: «" + valore + "»");
        }
    }

    /** Il nome che il cliente conosce per un campo d'importo del tracciato, con l'articolo. */
    private static String nomeImporto(String campo, boolean maiuscola) {
        String nome = switch (campo) {
            case "ImponibileImporto" -> "l'imponibile";
            case "Imposta" -> "l'IVA";
            default -> "il totale";
        };
        return maiuscola ? nome.substring(0, 1).toUpperCase(java.util.Locale.ROOT) + nome.substring(1) : nome;
    }

    private static String nomeFornitore(Element anagrafica) {
        if (anagrafica == null) {
            return null;
        }
        String denominazione = testo(figlio(anagrafica, "Denominazione"));
        if (denominazione != null) {
            return denominazione;
        }
        String nome = testo(figlio(anagrafica, "Nome"));
        String cognome = testo(figlio(anagrafica, "Cognome"));
        String unito = ((nome == null ? "" : nome) + " " + (cognome == null ? "" : cognome)).strip();
        return unito.isEmpty() ? null : unito;
    }

    // ---- XML ----

    /**
     * Legge tutto il file (un errore in qualunque punto, allegati compresi, lo rifiuta come prima) e restituisce un
     * documento con i soli elementi che {@link #leggiDocumento} guarda.
     */
    static Document analizza(byte[] xml) throws ErroreLettura {
        try {
            SAXParser parser = FABBRICA.newSAXParser();
            senzaAccessoEsterno(parser, XMLConstants.ACCESS_EXTERNAL_DTD);
            senzaAccessoEsterno(parser, XMLConstants.ACCESS_EXTERNAL_SCHEMA);
            Document documento = FABBRICA_DOCUMENTI.newDocumentBuilder().newDocument();
            // i nomi li ha gia' controllati il lettore, con le regole della versione di XML del file: qui non si ricontrollano
            documento.setStrictErrorChecking(false);
            XMLReader lettore = parser.getXMLReader();
            lettore.setEntityResolver(NESSUNA_RISORSA_ESTERNA);
            lettore.setErrorHandler(SILENZIOSO);
            lettore.setContentHandler(new SoloQuelloCheSiLegge(documento));
            lettore.parse(new InputSource(new ByteArrayInputStream(xml)));
            return documento;
        } catch (SAXParseException e) {
            String m = e.getMessage() == null ? "" : e.getMessage();
            if (m.contains("DOCTYPE")) {
                throw new ErroreLettura("Il file contiene istruzioni non ammesse e non è stato letto.",
                        "dichiarazione DOCTYPE (DTD o entità) rifiutata, riga " + e.getLineNumber() + ": " + m);
            }
            throw new ErroreLettura("Il file non è una fattura elettronica valida.", "XML non valido, riga " + e.getLineNumber() + ": " + m);
        } catch (SAXException | IOException | ParserConfigurationException e) {
            throw new ErroreLettura("Il file non è una fattura elettronica valida.", "XML non leggibile: " + e);
        }
    }

    private static void senzaAccessoEsterno(SAXParser parser, String proprieta) {
        try {
            parser.setProperty(proprieta, "");
        } catch (SAXNotRecognizedException | SAXNotSupportedException nonSupportata) {
            // le funzioni impostate sulla fabbrica bastano
        }
    }

    /**
     * Mette nel documento solo quello che {@link #leggiDocumento} guarda, nei punti in cui lo guarda; il resto (con tutto
     * quello che contiene) si legge e si butta. La lettura cerca i figli per nome e in punti precisi, quindi quello che qui
     * non si tiene non lo vedrebbe comunque: il risultato e' lo stesso del documento intero ({@code ParserParitaTest} lo
     * confronta, file per file).
     *
     * <ul>
     *   <li>La radice si tiene sempre (il suo nome decide se e' una fattura); dentro, solo {@link #NELLA_RADICE}.</li>
     *   <li>Di ogni elemento "contenitore" si tengono solo i figli elencati in {@link #FIGLI} (quindi non {@code Allegati},
     *       {@code DatiPagamento}, {@code DettaglioLinee}...).</li>
     *   <li>Di un figlio che la lettura prende una volta sola (il primo con quel nome) si tiene solo il primo; si tengono
     *       tutti solo quelli che la lettura scorre: {@link #RIPETUTI}.</li>
     *   <li>Gli altri elementi tenuti sono "foglie" (numero, data, importi, nomi): la lettura ne prende il testo, compreso
     *       quello di eventuali elementi al loro interno, quindi si tiene solo quel testo, tutto in un pezzo.</li>
     * </ul>
     *
     * Cosi' la memoria non cresce con il file: gli allegati e le righe non contano, e nemmeno un file fatto apposta di
     * elementi ripetuti puo' riempire il documento di elementi che nessuno legge.
     */
    private static final class SoloQuelloCheSiLegge extends DefaultHandler {

        private static final Set<String> NELLA_RADICE = Set.of("FatturaElettronicaHeader", "FatturaElettronicaBody");

        /** Per ogni contenitore (per nome locale), i figli che la lettura guarda. Chi non e' fra le chiavi e' una foglia. */
        private static final Map<String, Set<String>> FIGLI = Map.ofEntries(
                Map.entry("FatturaElettronicaHeader", Set.of("CedentePrestatore")),
                // ordinario: DatiAnagrafici; semplificato: partita IVA e nome direttamente qui
                Map.entry("CedentePrestatore", Set.of("DatiAnagrafici", "IdFiscaleIVA", "Denominazione", "Nome", "Cognome")),
                Map.entry("DatiAnagrafici", Set.of("IdFiscaleIVA", "Anagrafica")),
                Map.entry("Anagrafica", Set.of("Denominazione", "Nome", "Cognome")),
                Map.entry("IdFiscaleIVA", Set.of("IdCodice")),
                Map.entry("FatturaElettronicaBody", Set.of("DatiGenerali", "DatiBeniServizi")),
                Map.entry("DatiGenerali", Set.of("DatiGeneraliDocumento")),
                Map.entry("DatiGeneraliDocumento", Set.of("TipoDocumento", "Numero", "Data", "ImportoTotaleDocumento")),
                // ordinario: DatiRiepilogo; semplificato: Importo e DatiIVA
                Map.entry("DatiBeniServizi", Set.of("DatiRiepilogo", "Importo", "DatiIVA")),
                Map.entry("DatiRiepilogo", Set.of("ImponibileImporto", "Imposta")),
                Map.entry("DatiIVA", Set.of("Imposta", "Aliquota")));

        /** I soli figli che la lettura scorre tutti (un lotto, i riepiloghi, le righe del semplificato): degli altri prende il primo. */
        private static final Set<String> RIPETUTI = Set.of("FatturaElettronicaBody", "DatiBeniServizi", "DatiRiepilogo");

        private final Document documento;
        private final StringBuilder testo = new StringBuilder();
        /** Per ogni elemento tenuto e aperto, i nomi dei figli non ripetuti gia' tenuti. */
        private final Deque<Set<String>> giaTenuti = new ArrayDeque<>();
        private Node corrente;
        /** Quanti elementi non tenuti sono aperti, uno dentro l'altro: finche' non e' zero non si tiene niente. */
        private int saltati;
        /** Dentro una foglia: 1 = la foglia stessa, di piu' = elementi al suo interno (di cui conta solo il testo). */
        private int nellaFoglia;

        SoloQuelloCheSiLegge(Document documento) {
            this.documento = documento;
            this.corrente = documento;
        }

        @Override
        public void startElement(String uri, String nomeLocale, String nomeQualificato, Attributes attributi) {
            if (saltati > 0) {
                saltati++;
                return;
            }
            if (nellaFoglia > 0) {
                nellaFoglia++;
                return;
            }
            int profondita = giaTenuti.size(); // quella di corrente: 0 = il documento, 1 = la radice
            if (!siTiene(nomeLocale, profondita)) {
                saltati = 1;
                return;
            }
            // Solo il nome locale, senza prefisso: la lettura guarda solo quello. Con il nome qualificato («p:Numero») il
            // documento ricaverebbe il nome locale tagliando il nome intero, cioe' una stringa nuova per OGNI elemento
            // (misurato: un file di soli elementi con prefisso tratteneva quasi 7 volte i suoi byte invece di 4); cosi'
            // invece tutti gli elementi con lo stesso nome usano la stessa stringa, quella del lettore XML.
            Element e = documento.createElementNS(uri == null || uri.isEmpty() ? null : uri, nomeLocale);
            corrente.appendChild(e);
            corrente = e;
            giaTenuti.push(new HashSet<>());
            if (profondita >= 1 && !FIGLI.containsKey(nomeLocale)) {
                nellaFoglia = 1;
            }
        }

        /** Se un elemento che si apre dentro {@link #corrente} (un contenitore, alla profondita' data) va tenuto. */
        private boolean siTiene(String nomeLocale, int profondita) {
            if (profondita == 0) {
                return true;
            }
            Set<String> guardati = profondita == 1 ? NELLA_RADICE : FIGLI.get(nome(corrente));
            if (!guardati.contains(nomeLocale)) {
                return false;
            }
            return RIPETUTI.contains(nomeLocale) || giaTenuti.peek().add(nomeLocale);
        }

        @Override
        public void endElement(String uri, String nomeLocale, String nomeQualificato) {
            if (saltati > 0) {
                saltati--;
                return;
            }
            if (nellaFoglia > 1) {
                nellaFoglia--;
                return;
            }
            if (nellaFoglia == 1) {
                nellaFoglia = 0;
                if (testo.length() > 0) {
                    corrente.appendChild(documento.createTextNode(testo.toString()));
                    testo.setLength(0);
                }
            }
            corrente = corrente.getParentNode();
            giaTenuti.pop();
        }

        @Override
        public void characters(char[] caratteri, int inizio, int lunghezza) {
            if (saltati == 0 && nellaFoglia > 0) {
                testo.append(caratteri, inizio, lunghezza);
            }
        }
    }

    private static final EntityResolver NESSUNA_RISORSA_ESTERNA = (publicId, systemId) -> {
        throw new SAXException("risorsa esterna non ammessa");
    };

    private static final ErrorHandler SILENZIOSO = new ErrorHandler() {
        @Override
        public void warning(SAXParseException e) {
        }

        @Override
        public void error(SAXParseException e) throws SAXException {
            throw e;
        }

        @Override
        public void fatalError(SAXParseException e) throws SAXException {
            throw e;
        }
    };

    private static String nome(Node n) {
        return n.getLocalName() != null ? n.getLocalName() : n.getNodeName();
    }

    private static Element figlio(Element padre, String nomeLocale) {
        for (Node n = padre.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && nomeLocale.equals(nome(e))) {
                return e;
            }
        }
        return null;
    }

    private static List<Element> figli(Element padre, String nomeLocale) {
        List<Element> r = new ArrayList<>();
        for (Node n = padre.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && nomeLocale.equals(nome(e))) {
                r.add(e);
            }
        }
        return r;
    }

    private static String testo(Element e) {
        if (e == null) {
            return null;
        }
        String t = e.getTextContent();
        if (t == null) {
            return null;
        }
        t = t.strip().replaceAll("\\s+", " ");
        return t.isEmpty() ? null : t;
    }
}
