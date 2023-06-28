import java.io.FileOutputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Security;
import java.security.cert.Certificate;
import java.util.ArrayList;
import java.util.List;

import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.CMSTypedData;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoGeneratorBuilder;
import org.bouncycastle.cms.jcajce.JcaX509CertificateHolder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;

public class PdfSigner {

    public static void main(String[] args) {
        String usbTokenAlias = "Your_USB_Token_Alias";
        String usbTokenPin = "Your_USB_Token_Pin";
        String inputFile = "path/to/input.pdf";
        String outputFile = "path/to/signed.pdf";

        try {
            // Load the USB token keystore
            KeyStore usbTokenKeyStore = KeyStore.getInstance("PKCS11");
            usbTokenKeyStore.load(null, usbTokenPin.toCharArray());
            PrivateKey privateKey = (PrivateKey) usbTokenKeyStore.getKey(usbTokenAlias, null);
            Certificate[] certificateChain = usbTokenKeyStore.getCertificateChain(usbTokenAlias);

            // Prepare the data to be signed
            byte[] inputData = PdfUtils.readFile(inputFile);
            CMSTypedData cmsData = new CMSProcessableByteArray(inputData);

            // Create the signed PDF document
            List<Certificate> certificateList = new ArrayList<>();
            for (Certificate certificate : certificateChain) {
                certificateList.add(certificate);
            }
            JcaCertStore certStore = new JcaCertStore(certificateList);
            CMSSignedDataGenerator cmsGenerator = new CMSSignedDataGenerator();
            cmsGenerator.addSignerInfoGenerator(
                new JcaSignerInfoGeneratorBuilder(new BouncyCastleProvider())
                    .build(privateKey, (java.security.cert.X509Certificate) certificateChain[0])
            );
            cmsGenerator.addCertificates(certStore);
            CMSSignedData cmsSignedData = cmsGenerator.generate(cmsData, true);

            // Write the signed PDF to output file
            byte[] signedData = cmsSignedData.getEncoded();
            FileOutputStream fos = new FileOutputStream(outputFile);
            fos.write(signedData);
            fos.close();

            System.out.println("PDF document signed successfully!");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

class PdfUtils {
    public static byte[] readFile(String filePath) throws IOException {
        Path path = Paths.get(filePath);
        return Files.readAllBytes(path);
    }
}