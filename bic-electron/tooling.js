'use strict';

const args = process.argv;

const tipo = args[2];
const plataforma = args[3];

const { exec } = require("child_process");
const path = require('path');
const fs = require('fs');
const https = require('https');

const extraResources = path.join('.','extraResources');
const bicFile = 'bic-jar-with-dependencies.jar';
const source = path.join('..','target', bicFile);

const jdkVrs = '11.0.2';
const jdkWin64 = new URL('https://download.java.net/java/GA/jdk11/9/GPL/openjdk-' + jdkVrs + '_windows-x64_bin.zip');

console.log('Procesando', args[2], args[3]);

fs.rmSync(extraResources, { recursive: true, force: true });
fs.mkdirSync(extraResources);

if(plataforma === 'win64') {
    
    fs.mkdir(path.join(extraResources,'target'), { recursive: true }, (err)=> {
        if(err) {
            console.error('Error creating directory:', err);
            return;
        }   
        fs.copyFile(source, path.join(extraResources,'target',bicFile), (err) => {   
            if(err) {
                console.error('Error copying file:', err);
            }           
        });
    });

    if (tipo === 'fat'){
        console.log('Inicio de descarga de JDK')
        if(!fs.existsSync(path.join(extraResources,'jdk')))
            descargarJDK(jdkWin64, extraResources);
    }  
}

function descargarJDK(url, resources){
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    https.get(url, (response) => {
        if (response.statusCode !== 200) {
            console.error(`Failed to download JDK: ${response.statusCode}`);
            return;
        }
        
        const filePath = path.join(resources, 'jdk.zip');
        const fileStream = fs.createWriteStream(filePath);
        
        response.pipe(fileStream);
        console.log("Downloading JDK");

        fileStream.on('finish', () => {
            fileStream.close();
            console.log('JDK downloaded successfully:', filePath);
            unzip(filePath, resources).finally(()=>{
                fs.unlinkSync(filePath);
                fs.renameSync(path.join(resources,'jdk-' + jdkVrs), path.join(resources,'jdk'));
                console.log("JDK descomprimido en ");                
            });
        });

    }).on('error', (err) => {
        console.error('Error downloading JDK:', err);
    });
}

function unzip(zipPath, outputDir) {
    return new Promise((resolve, reject) => {
        zipPath = path.resolve(zipPath);
        outputDir = path.resolve(outputDir);

        // Detect platform and choose command
        let cmd;
        if (process.platform === "win32") {
            // Windows: use tar (available in Win10+ PowerShell)
            cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outputDir}' -Force"`;
        } else {
            // Linux / macOS
            cmd = `unzip -o "${zipPath}" -d "${outputDir}"`;
        }

        exec(cmd, (err, stdout, stderr) => {
            if (err) return reject(stderr || err.message);
            resolve();
        });
    });
}    

