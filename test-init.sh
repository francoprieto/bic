#!/bin/bash
export BIC=$(pwd)
export TARGET=$BIC/target/bic-1.0.0-jar-with-dependencies.jar

$JAVA_HOME/bin/java -jar $TARGET --init=true