package it.contabilita.importa;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.EntityResolver;
import org.xml.sax.ErrorHandler;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

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

    private static final DocumentBuilderFactory FABBRICA = creaFabbrica();

    private ParserFatturaPa() {
    }

    private static DocumentBuilderFactory creaFabbrica() {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setNamespaceAware(true);
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            f.setXIncludeAware(false);
            f.setExpandEntityReferences(false);
            try {
                f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
                f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            } catch (IllegalArgumentException nonSupportato) {
                // le funzioni sopra bastano
            }
            return f;
        } catch (ParserConfigurationException e) {
            throw new IllegalStateException("Parser XML non configurabile in modo sicuro", e);
        }
    }

    public static List<DatiFattura> leggi(byte[] xml) throws ErroreLettura {
        Document documento = analizza(xml);
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

    private static Document analizza(byte[] xml) throws ErroreLettura {
        try {
            DocumentBuilder builder = FABBRICA.newDocumentBuilder();
            builder.setEntityResolver(NESSUNA_RISORSA_ESTERNA);
            builder.setErrorHandler(SILENZIOSO);
            return builder.parse(new ByteArrayInputStream(xml));
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
