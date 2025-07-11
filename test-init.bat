@echo off

set BIC=%cd%
set TARGET=%BIC%\target\bic-jar-with-dependencies.jar

java -jar %TARGET% --init=true

pause