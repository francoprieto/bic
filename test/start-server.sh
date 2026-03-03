#!/bin/bash

echo "========================================"
echo "Iniciando servidor de prueba BIC"
echo "========================================"
echo ""

cd "$(dirname "$0")"
node server.js
