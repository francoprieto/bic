package py.org.firmador;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.signatures.PdfPKCS7;
import com.itextpdf.signatures.PdfSigner;
import com.itextpdf.signatures.SignatureUtil;
import org.bouncycastle.cert.ocsp.*;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import py.org.firmador.util.OcspChecker;

import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.Security;
import java.security.cert.*;
import java.util.*;

public class Test {

    public static void main(String[] args) throws Exception {
        String pdfPath = "/Users/francoprieto/Downloads/PGN.pdf";
        validatePdfSignature(pdfPath);
    }

    public static void validatePdfSignature(String pdfPath) throws Exception {
        Security.addProvider(new org.bouncycastle.jce.provider.BouncyCastleProvider());

        PdfDocument pdfDoc = new PdfDocument(new PdfReader(pdfPath));
        SignatureUtil signUtil = new SignatureUtil(pdfDoc);

        List<String> names = signUtil.getSignatureNames();
        System.out.println("Found signatures: " + names);

        for (String name : names) {
            System.out.println("Checking signature: " + name);
            PdfPKCS7 pkcs7 = signUtil.readSignatureData(name);

            // Check if document has been modified after signing
            boolean integrity = pkcs7.verifySignatureIntegrityAndAuthenticity();
            System.out.println("Signature integrity OK? " + integrity);

            // Get the signing certificate
            X509Certificate signingCert = pkcs7.getSigningCertificate();
            System.out.println("Signed by: " + signingCert.getSubjectDN());

            // Validate certificate chain
            Certificate[] certChain = pkcs7.getSignCertificateChain();
            CertPath certPath = CertificateFactory.getInstance("X.509")
                    .generateCertPath(Arrays.asList(certChain));
            /*
            // Build a trust anchor list (your trusted CA certs)
            KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
            ks.load(new FileInputStream("truststore.jks"), "password".toCharArray());

            Set<TrustAnchor> trustAnchors = new HashSet<>();
            Enumeration<String> aliases = ks.aliases();
            while (aliases.hasMoreElements()) {
                X509Certificate caCert = (X509Certificate) ks.getCertificate(aliases.nextElement());
                trustAnchors.add(new TrustAnchor(caCert, null));
            }

            PKIXParameters params = new PKIXParameters(trustAnchors);
            params.setRevocationEnabled(false); // we’ll handle revocation manually

            CertPathValidator validator = CertPathValidator.getInstance("PKIX");
            PKIXCertPathValidatorResult result =
                    (PKIXCertPathValidatorResult) validator.validate(certPath, params);
            System.out.println("Certificate chain OK: " + result.getTrustAnchor());
*/
            // Check OCSP revocation
            //checkOcspRevocation(signingCert, (X509Certificate) certChain[0]); // issuer cert
            OcspChecker.checkOcsp(signingCert, (X509Certificate) certChain[0]);
        }
    }

}
