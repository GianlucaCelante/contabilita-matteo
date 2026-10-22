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
 * Lettura di una fattura elettronica FatturaPA (anche un lotto con piu' {@code FatturaElettronicaBody}).
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

    /** Motivo gia' scritto per l'utente. */
    public static class ErroreLettura extends Exception {
        public ErroreLettura(String messaggio) {
            super(messaggio);
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
        if (!"FatturaElettronica".equals(nome(radice))) {
            throw new ErroreLettura("Il file non è una fattura elettronica (FatturaPA).");
        }
        Element intestazione = figlio(radice, "FatturaElettronicaHeader");
        Element cedente = intestazione == null ? null : figlio(intestazione, "CedentePrestatore");
        Element anagrafiche = cedente == null ? null : figlio(cedente, "DatiAnagrafici");
        if (anagrafiche == null) {
            throw new ErroreLettura("Manca il nome del fornitore (CedentePrestatore).");
        }
        String fornitore = nomeFornitore(figlio(anagrafiche, "Anagrafica"));
        if (fornitore == null) {
            throw new ErroreLettura("Manca il nome del fornitore (Denominazione, oppure Nome e Cognome).");
        }
        Element idFiscale = figlio(anagrafiche, "IdFiscaleIVA");
        String partitaIva = idFiscale == null ? null : testo(figlio(idFiscale, "IdCodice"));

        List<DatiFattura> fatture = new ArrayList<>();
        for (Element body : figli(radice, "FatturaElettronicaBody")) {
            fatture.add(leggiBody(body, fornitore, partitaIva));
        }
        if (fatture.isEmpty()) {
            throw new ErroreLettura("Il file non contiene nessuna fattura (manca FatturaElettronicaBody).");
        }
        return fatture;
    }

    private static DatiFattura leggiBody(Element body, String fornitore, String partitaIva) throws ErroreLettura {
        Element generali = figlio(body, "DatiGenerali");
        Element documento = generali == null ? null : figlio(generali, "DatiGeneraliDocumento");
        if (documento == null) {
            throw new ErroreLettura("Mancano i dati generali del documento (DatiGeneraliDocumento).");
        }
        String tipo = testo(figlio(documento, "TipoDocumento"));
        String numero = testo(figlio(documento, "Numero"));
        if (numero == null) {
            throw new ErroreLettura("Manca il numero della fattura.");
        }
        String dataTesto = testo(figlio(documento, "Data"));
        LocalDate data;
        try {
            data = LocalDate.parse(dataTesto == null ? "" : dataTesto);
        } catch (DateTimeParseException e) {
            throw new ErroreLettura("La data della fattura manca o non è valida: «" + (dataTesto == null ? "" : dataTesto) + "».");
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

    /** Decimale con punto -> centesimi, con BigDecimal. Un valore assente vale zero solo se {@code ammettiVuoto}. */
    private static long centesimi(String valore, String campo, boolean ammettiVuoto) throws ErroreLettura {
        if (valore == null) {
            if (ammettiVuoto) {
                return 0;
            }
            throw new ErroreLettura("Importo mancante: " + campo + ".");
        }
        try {
            return new BigDecimal(valore.strip()).setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
        } catch (NumberFormatException | ArithmeticException e) {
            throw new ErroreLettura("Importo non valido in " + campo + ": «" + valore + "».");
        }
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
                throw new ErroreLettura("Il file contiene una dichiarazione DOCTYPE (DTD o entità): non è una fattura valida e non viene letto.");
            }
            throw new ErroreLettura("Il file non è un XML valido (riga " + e.getLineNumber() + ").");
        } catch (SAXException | IOException | ParserConfigurationException e) {
            throw new ErroreLettura("Il file non è un XML valido.");
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
