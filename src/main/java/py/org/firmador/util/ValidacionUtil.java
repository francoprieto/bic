package py.org.firmador.util;

import com.itextpdf.text.pdf.security.OcspClient;
import eu.europa.esig.dss.model.DSSDocument;
import eu.europa.esig.dss.model.FileDocument;
import eu.europa.esig.dss.validation.CommonCertificateVerifier;
import eu.europa.esig.dss.validation.SignedDocumentValidator;
import eu.europa.esig.dss.validation.reports.Reports;

import java.io.File;

public class ValidacionUtil {
    public static boolean validar(File firmado) throws Exception {
        DSSDocument pdf = new FileDocument(firmado);
        SignedDocumentValidator validator = SignedDocumentValidator.fromDocument(pdf);

        // Configure DSS verifier
        CommonCertificateVerifier verifier = new CommonCertificateVerifier();

        // Build XiPKI OCSP client (with a default http client inside)
        OcspClient ocspClient = new OcspClientImpl();
        verifier.setOcspSource(new MyOcspSource(ocspClient));

        validator.setCertificateVerifier(verifier);

        Reports reports = validator.validateDocument();
        reports.
        System.out.println("=== SIMPLE REPORT ===");
        System.out.println(reports.getSimpleReport().print());
    }
}
