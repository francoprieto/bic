package py.org.firmador.util;

import py.org.firmador.dto.Resultado;

import javax.swing.*;

public class MensajeUtil {

    public static void showMessage(String message) {
        JOptionPane.showMessageDialog(null, message);
    }

    public static void showMessage(Resultado res) {
        if(res.getTipo() != null && !res.getTipo().equals("ok"))
            showError(res.getMensaje());
        else
            showInfo(res.getMensaje());
    }

    public static void showError(String message) {
        JOptionPane.showMessageDialog(
                null,
                message,
                "Error",
                JOptionPane.ERROR_MESSAGE
        );
    }

    public static void showInfo(String message) {
        JOptionPane.showMessageDialog(
                null,
                message,
                "Information",
                JOptionPane.INFORMATION_MESSAGE
        );
    }

}
