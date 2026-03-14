'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

let logFile = null;

function init() {
  const dir = path.join(os.homedir(), '.bic', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, `bic-${new Date().toISOString().split('T')[0]}.log`);

  const write = (level, args) => {
    const line = `[${new Date().toISOString()}] [${level}] ${args.map(String).join(' ')}\n`;
    fs.appendFileSync(logFile, line, 'utf8');
  };

  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  console.log   = (...a) => { write('INFO',  a); orig.log.apply(console, a); };
  console.error = (...a) => { write('ERROR', a); orig.error.apply(console, a); };
  console.warn  = (...a) => { write('WARN',  a); orig.warn.apply(console, a); };
  console.info  = (...a) => { write('INFO',  a); orig.info.apply(console, a); };
}

module.exports = { init };
