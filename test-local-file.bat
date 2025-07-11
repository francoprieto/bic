@echo off

set BIC=%cd%
set TARGET=%BIC%\target\bic-jar-with-dependencies.jar

java -jar %TARGET% --archivos="F:\firmas\\constancia.pdf,F:\firmas\Pluver04-6.pdf" --destino="F:\firmas\firmados"

pause