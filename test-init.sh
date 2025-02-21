#!/bin/bash
export BIC=$(pwd)
export TARGET=$BIC/target/bic-jar-with-dependencies.jar

$JAVA_HOME/bin/java -jar $TARGET --init=true