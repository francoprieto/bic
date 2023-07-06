package py.org.firmador;

import lombok.extern.slf4j.Slf4j;

import java.text.SimpleDateFormat;
import java.util.Date;

@Slf4j
public class Log {
    
    private static final int INFO=0;
    private static final int ERROR=1;
    private static final int WARN=2;

    public static void error(String msg){
        msg(msg, ERROR, null);
    }

    public static void error(String msg, Exception ex){
        msg(msg, ERROR, ex);
    }

    public static void info(String msg){
        msg(msg, INFO, null);
    }

    public static void warn(String msg){
        msg(msg, WARN, null);
    }

    public static void msg(String msg, int tipo, Exception ex){
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        Date ahora = new Date();
        if(msg == null || msg.length() < 0) return;
        switch(tipo){
            case INFO:
                System.out.println(sdf.format(ahora) + " - INFO: " + msg);
                log.info(msg);
                break;
            case ERROR:
                System.err.println(sdf.format(ahora) + " - ERROR: " + msg);
                if(ex != null){
                    log.error(msg, ex);
                    ex.printStackTrace();
                }else log.error(msg);
                break;
            case WARN:
                System.out.println(sdf.format(ahora) + " - WARN: " + msg);
                log.warn(msg);
                break;
            default:
                break;
        }
    }
}
