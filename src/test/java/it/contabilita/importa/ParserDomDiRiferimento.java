package it.contabilita.importa;

import it.contabilita.importa.ParserFatturaPa.DatiFattura;
import it.contabilita.importa.ParserFatturaPa.ErroreLettura;
import org.w3c.dom.Document;
import org.xml.sax.EntityResolver;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;

/**
 * Il percorso di PRIMA (s59), tenuto solo nei test come termine di paragone: il file aperto tutto in memoria come DOM,
 * allegati compresi, con la stessa configurazione e gli stessi messaggi che aveva {@code ParserFatturaPa.analizza} fino a
 * novembre 2026 (codice copiato com'era). La lettura dei dati dal documento e' quella di oggi
 * ({@link ParserFatturaPa#leggiDocumento}), che non e' cambiata: {@link ParserParitaTest} confronta i due percorsi.
 */
final class ParserDomDiRiferimento {

    private static final DocumentBuilderFactory FABBRICA = creaFabbrica();

    private ParserDomDiRiferimento() {
    }

    static List<DatiFattura> leggi(byte[] xml) throws ErroreLettura {
        return ParserFatturaPa.leggiDocumento(analizza(xml));
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

    static Document analizza(byte[] xml) throws ErroreLettura {
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
}
