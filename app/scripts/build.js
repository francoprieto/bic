'use strict';

/**
 * Script de build: compila el JAR con Maven y prepara extraResources.
 * Uso: node scripts/build.js <plataforma> [fat]
 *   plataformas: win64 | mac-arm | mac-x64 | linux
 *   fat: incluye JDK empaquetado (solo win64 por ahora)
 */

const { execSync, exec } = require('child_process');
const path = require('path');
const fs   = require('fs');

const [,, platform = 'win64', tipo = 'slim'] = process.argv;
const projectRoot    = path.resolve(__dirname, '..', '..');
const coreDir        = path.join(projectRoot, 'core');
const extraResources = path.join(__dirname, '..', 'extraResources');
const targetDir      = path.join(coreDir, 'target');
const jarName        = 'bic-core-jar-with-dependencies.jar';

console.log(`\n▶ Build [${tipo}] para [${platform}]\n`);

// ─── 1. Compilar JAR ──────────────────────────────────────────────────────────
console.log('→ Compilando JAR con Maven...');
const javaHome = detectJavaHome();
const env = { ...process.env };
if (javaHome) {
  env.JAVA_HOME = javaHome;
  console.log('  JAVA_HOME:', javaHome);
}

try {
  const mvn = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
  execSync(`${mvn} clean package -DskipTests`, { cwd: coreDir, env, stdio: 'inherit' });
} catch (e) {
  console.error('✗ Maven falló');
  process.exit(1);
}

const jarSrc = path.join(targetDir, jarName);
if (!fs.existsSync(jarSrc)) {
  console.error('✗ JAR no encontrado en', jarSrc);
  process.exit(1);
}
console.log('✓ JAR compilado:', jarSrc);

// ─── 2. Preparar extraResources ───────────────────────────────────────────────
fs.rmSync(extraResources, { recursive: true, force: true });
fs.mkdirSync(path.join(extraResources, 'target'), { recursive: true });

fs.copyFileSync(jarSrc, path.join(extraResources, 'target', jarName));
console.log('✓ JAR copiado a extraResources/target/');

// ─── 3. JDK empaquetado (fat build, solo Windows) ────────────────────────────
if (tipo === 'fat' && platform === 'win64') {
  const jdkVersion = '17.0.11';
  const jdkUrl = `https://download.java.net/java/GA/jdk17/${jdkVersion}/GPL/openjdk-${jdkVersion}_windows-x64_bin.zip`;
  const jdkDest = path.join(extraResources, 'jdk');

  if (!fs.existsSync(jdkDest)) {
    console.log('→ Descargando JDK', jdkVersion, '...');
    downloadAndExtract(jdkUrl, extraResources, jdkDest);
  } else {
    console.log('✓ JDK ya existe en extraResources/jdk/');
  }
}

console.log('\n✓ extraResources listo. Ejecutando electron-builder...\n');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectJavaHome() {
  // Intentar java_home en macOS
  if (process.platform === 'darwin') {
    try {
      const j17 = execSync('/usr/libexec/java_home -v 17 2>/dev/null').toString().trim();
      if (j17) return j17;
    } catch (_) {}
  }
  // Usar JAVA_HOME del entorno si ya está seteado
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  return null;
}

function downloadAndExtract(url, destDir, finalDir) {
  const https = require('https');
  const zipPath = path.join(destDir, 'jdk.zip');

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const file = fs.createWriteStream(zipPath);
  https.get(url, res => {
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('✓ JDK descargado');
      const cmd = process.platform === 'win32'
        ? `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`
        : `unzip -o "${zipPath}" -d "${destDir}"`;
      execSync(cmd, { stdio: 'inherit' });
      fs.unlinkSync(zipPath);
      // Renombrar carpeta jdk-X.Y.Z a jdk
      const extracted = fs.readdirSync(destDir).find(d => d.startsWith('jdk-'));
      if (extracted) fs.renameSync(path.join(destDir, extracted), finalDir);
      console.log('✓ JDK extraído en extraResources/jdk/');
    });
  }).on('error', e => { console.error('✗ Error descargando JDK:', e.message); process.exit(1); });
}
