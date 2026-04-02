package py.org.firmador;

/**
 * Logger simple que escribe a stdout/stderr con prefijos estructurados.
 * Electron captura estos streams para mostrarlos en la UI.
 */
public class Log {

    public static void info(String msg) {
        System.out.println("INFO: " + msg);
    }

    public static void warn(String msg) {
        System.out.println("WARN: " + msg);
    }

    public static void error(String msg) {
        System.err.println("ERROR: " + msg);
    }

    public static void error(String msg, Exception ex) {
        System.err.println("ERROR: " + msg);
        if (ex != null) ex.printStackTrace(System.err);
    }
}
