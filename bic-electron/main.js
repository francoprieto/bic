/**
 * APLICACION NODEJS-ELECTRON LLAMADA DESDE UN BROWSER.
 * Basada en el codigo:
 * https://github.com/oikonomopo/electron-deep-linking-mac-win
 * https://www.example-code.com/nodejs/pkcs11_sign_pdf.asp
 * Uso:
 * Se puede abrir de un sitio web a través de un enlace con el protocolo 'bic' y pasar parametros.
 * bic://
 */

const { app, BrowserWindow } = require('electron')
// Module with utilities for working with file and directory paths.
const path = require('path')
// Module with utilities for URL resolution and parsing.
const url = require('url')


const bicurl = 'http://localhost:4200/bic';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

// Deep linked url
let deeplinkingUrl = '';

// Force Single Instance Application
const gotTheLock = app.requestSingleInstanceLock()
if (gotTheLock) {
	app.on('second-instance', (e, argv) => {
		// Someone tried to run a second instance, we should focus our window.

		// Protocol handler for win32
		// argv: An array of the second instance’s (command line / deep linked) arguments
		if (process.platform == 'win32') {
			// Keep only command line / deep linked arguments
			deeplinkingUrl = argv.slice(1)
		}
		logEverywhere('app.makeSingleInstance# ' + deeplinkingUrl)

		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore()
			mainWindow.focus()
		}
	})
} else {
	app.quit()
	return
}

function firmar(archivo, pin){

}

function createWindow() {
	// Create the browser window.
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 900,
		webPreferences: {
			nodeIntegration: true
		}
	})

	// and load the index.html of the app.
	//mainWindow.loadURL(bicurl);

    mainWindow.webContents.openDevTools()
	// Protocol handler for win32
	if (process.platform == 'win32') {
		// Keep only command line / deep linked arguments
		deeplinkingUrl = process.argv.slice(1)
	}

	if (deeplinkingUrl && deeplinkingUrl.length > 1) {
		let params = deeplinkingUrl.replaceAll('bic://', '');
        logEverywhere('createWindow# ' + params);
	}

    mainWindow.loadURL(__dirname + '/index.html');

	// Emitted when the window is closed.
	mainWindow.on('closed', function () {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		mainWindow = null
	})
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('activate', function () {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (mainWindow === null) {
		createWindow()
	}
})

if (!app.isDefaultProtocolClient('bic')) {
	// Define custom protocol handler. Deep linking works on packaged versions of the application!
	app.setAsDefaultProtocolClient('bic')
}

app.on('will-finish-launching', function () {
	// Protocol handler for osx
	app.on('open-url', function (event, url) {
		event.preventDefault()
		deeplinkingUrl = url;
	})
})

// Log both at dev console and at running node console instance
function logEverywhere(s) {
	console.log(s)
	if (mainWindow && mainWindow.webContents) {
		mainWindow.webContents.executeJavaScript(`console.log("${s}")`)
	}
}