package it.contabilita.importa;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Fatture FatturaPA sintetiche (dati inventati) generate nei test: nessun file XML nel repository. */
public final class FattureProva {

    private FattureProva() {
    }

    public static String denominazione(String nome, String piva) {
        return "<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>" + piva
                + "</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>" + nome
                + "</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>";
    }

    public static String persona(String nome, String cognome, String piva) {
        return "<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>" + piva
                + "</IdCodice></IdFiscaleIVA><Anagrafica><Nome>" + nome + "</Nome><Cognome>" + cognome
                + "</Cognome></Anagrafica></DatiAnagrafici></CedentePrestatore>";
    }

    /** Un FatturaElettronicaBody con un solo riepilogo. */
    public static String body(String tipo, String numero, String data, String totale, String imponibile, String imposta) {
        return "<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>" + tipo
                + "</TipoDocumento><Divisa>EUR</Divisa><Data>" + data + "</Data><Numero>" + numero + "</Numero>"
                + (totale == null ? "" : "<ImportoTotaleDocumento>" + totale + "</ImportoTotaleDocumento>")
                + "</DatiGeneraliDocumento></DatiGenerali><DatiBeniServizi><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA>"
                + "<ImponibileImporto>" + imponibile + "</ImponibileImporto><Imposta>" + imposta
                + "</Imposta></DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody>";
    }

    /** Documento completo senza prefisso di namespace. */
    public static String fattura(String cedente, String... bodies) {
        return fatturaConPrefisso("", cedente, bodies);
    }

    /** Come {@link #fattura} ma con tutti gli elementi qualificati da {@code prefisso} (es. "p"). */
    public static String fatturaConPrefisso(String prefisso, String cedente, String... bodies) {
        String testo = "<FatturaElettronicaHeader>" + cedente + "</FatturaElettronicaHeader>" + String.join("", bodies);
        String nsDichiarazione = prefisso.isEmpty()
                ? "xmlns=\"http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2\""
                : "xmlns:" + prefisso + "=\"http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2\"";
        String corpo = prefisso.isEmpty() ? testo : testo.replaceAll("<(/?)([A-Za-z])", "<$1" + prefisso + ":$2");
        String radice = prefisso.isEmpty() ? "FatturaElettronica" : prefisso + ":FatturaElettronica";
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<" + radice + " versione=\"FPR12\" " + nsDichiarazione + ">"
                + corpo + "</" + radice + ">";
    }

    public static byte[] byt(String xml) {
        return xml.getBytes(StandardCharsets.UTF_8);
    }

    /** Uno zip in memoria con i nomi esatti dati (anche con "../"). */
    public static byte[] zip(Map<String, byte[]> voci) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(out)) {
            for (var v : voci.entrySet()) {
                z.putNextEntry(new ZipEntry(v.getKey()));
                z.write(v.getValue());
                z.closeEntry();
            }
        }
        return out.toByteArray();
    }

    public static Map<String, byte[]> voci(Object... coppie) {
        Map<String, byte[]> m = new LinkedHashMap<>();
        for (int i = 0; i < coppie.length; i += 2) {
            Object v = coppie[i + 1];
            m.put((String) coppie[i], v instanceof String s ? byt(s) : (byte[]) v);
        }
        return m;
    }

    // ---- busta CMS/PKCS#7 sintetica (DER fittizio, nessuna firma vera) ----

    private static byte[] tlv(int tag, byte[] valore) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(tag);
        int n = valore.length;
        if (n < 128) {
            o.write(n);
        } else if (n < 256) {
            o.write(0x81);
            o.write(n);
        } else {
            o.write(0x82);
            o.write(n >> 8);
            o.write(n & 0xFF);
        }
        o.writeBytes(valore);
        return o.toByteArray();
    }

    private static byte[] cat(byte[]... parti) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        for (byte[] p : parti) {
            o.writeBytes(p);
        }
        return o.toByteArray();
    }

    private static final byte[] OID_SIGNED_DATA = {0x06, 0x09, 0x2A, (byte) 0x86, 0x48, (byte) 0x86, (byte) 0xF7, 0x0D, 0x01, 0x07, 0x02};
    private static final byte[] OID_DATA = {0x06, 0x09, 0x2A, (byte) 0x86, 0x48, (byte) 0x86, (byte) 0xF7, 0x0D, 0x01, 0x07, 0x01};

    /** Busta con il contenuto in un unico OCTET STRING contiguo, certificati e firma finti dopo. */
    public static byte[] p7mContiguo(byte[] contenuto) {
        byte[] encap = tlv(0x30, cat(OID_DATA, tlv(0xA0, tlv(0x04, contenuto))));
        return busta(encap);
    }

    /** Busta con il contenuto spezzato in blocchi OCTET STRING dentro un OCTET STRING costruito a lunghezza indefinita. */
    public static byte[] p7mABlocchi(byte[] contenuto, int dimensioneBlocco) {
        ByteArrayOutputStream blocchi = new ByteArrayOutputStream();
        for (int i = 0; i < contenuto.length; i += dimensioneBlocco) {
            byte[] pezzo = java.util.Arrays.copyOfRange(contenuto, i, Math.min(contenuto.length, i + dimensioneBlocco));
            blocchi.writeBytes(tlv(0x04, pezzo));
        }
        byte[] costruito = cat(new byte[]{0x24, (byte) 0x80}, blocchi.toByteArray(), new byte[]{0, 0});
        byte[] encap = tlv(0x30, cat(OID_DATA, tlv(0xA0, costruito)));
        return busta(encap);
    }

    private static byte[] busta(byte[] encap) {
        byte[] versione = {0x02, 0x01, 0x01};
        byte[] digest = {0x31, 0x00};
        byte[] certificati = tlv(0xA0, new byte[300]);
        byte[] firmatari = tlv(0x31, new byte[200]);
        byte[] signedData = tlv(0x30, cat(versione, digest, encap, certificati, firmatari));
        return tlv(0x30, cat(OID_SIGNED_DATA, tlv(0xA0, signedData)));
    }
}
