package py.org.firmador.util;

import org.bouncycastle.asn1.ASN1Primitive;
import org.bouncycastle.asn1.DEROctetString;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.Extensions;
import org.bouncycastle.asn1.x509.AuthorityInformationAccess;
import org.bouncycastle.asn1.x509.AccessDescription;
import org.bouncycastle.asn1.x509.GeneralName;
import org.bouncycastle.cert.ocsp.*;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.cert.X509Certificate;

public class OcspChecker {

    public static void checkOcsp(X509Certificate cert, X509Certificate issuer) throws Exception {
        String ocspUrl = getOcspUrl(cert);
        if (ocspUrl == null) {
            System.out.println("No OCSP URL in certificate.");
            return;
        }
        System.out.println("OCSP URL: " + ocspUrl);

        CertificateID id = new CertificateID(
                new JcaDigestCalculatorProviderBuilder().build().get(CertificateID.HASH_SHA1),
                new org.bouncycastle.cert.X509CertificateHolder(issuer.getEncoded()),
                cert.getSerialNumber());

        OCSPReqBuilder builder = new OCSPReqBuilder();
        builder.addRequest(id);
        OCSPReq ocspReq = builder.build();

        OCSPResp ocspResp = sendOcspRequest(ocspUrl, ocspReq);
        if (ocspResp.getStatus() == OCSPResp.SUCCESSFUL) {
            BasicOCSPResp basicResp = (BasicOCSPResp) ocspResp.getResponseObject();
            SingleResp[] responses = basicResp.getResponses();
            for (SingleResp resp : responses) {
                Object status = resp.getCertStatus();
                if (status == CertificateStatus.GOOD) {
                    System.out.println("Certificate status: GOOD (not revoked)");
                } else if (status instanceof RevokedStatus) {
                    System.out.println("Certificate status: REVOKED");
                } else {
                    System.out.println("Certificate status: UNKNOWN");
                }
            }
        } else {
            System.out.println("OCSP response status: " + ocspResp.getStatus());
        }
    }

    private static OCSPResp sendOcspRequest(String ocspUrl, OCSPReq ocspReq) throws Exception {
        byte[] encodedReq = ocspReq.getEncoded();
        URL url = new URL(ocspUrl);
        HttpURLConnection con = (HttpURLConnection) url.openConnection();
        con.setRequestMethod("POST");
        con.setRequestProperty("Content-Type", "application/ocsp-request");
        con.setRequestProperty("Accept", "application/ocsp-response");
        con.setDoOutput(true);

        try (OutputStream out = con.getOutputStream()) {
            out.write(encodedReq);
        }

        try (InputStream in = con.getInputStream()) {
            return new OCSPResp(in);
        }
    }

    private static String getOcspUrl(X509Certificate cert) throws Exception {
        byte[] aiaExtVal = cert.getExtensionValue(Extension.authorityInfoAccess.getId());
        if (aiaExtVal == null) return null;
        ASN1Primitive derObj = JcaX509ExtensionUtils.parseExtensionValue(aiaExtVal);
        AuthorityInformationAccess aia = AuthorityInformationAccess.getInstance(derObj);
        for (AccessDescription ad : aia.getAccessDescriptions()) {
            if (ad.getAccessMethod().equals(AccessDescription.id_ad_ocsp)) {
                GeneralName gn = ad.getAccessLocation();
                return gn.getName().toString();
            }
        }
        return null;
    }

    // Utility to parse DEROctetString extension
    static class JcaX509ExtensionUtils {
        static ASN1Primitive parseExtensionValue(byte[] extVal) throws Exception {
            DEROctetString oct = (DEROctetString) DEROctetString.fromByteArray(extVal);
            return ASN1Primitive.fromByteArray(oct.getOctets());
        }
    }
}

