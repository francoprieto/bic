#!/bin/bash
export BIC=$(pwd)
export TARGET=$BIC/target/bic-jar-with-dependencies.jar

$JAVA_HOME/bin/java -jar $TARGET --archivos="/Users/francoprieto/Downloads/CARLOS PRIETO 178121 ESTUDIO.PDF,/Users/francoprieto/Downloads/test.pdf"