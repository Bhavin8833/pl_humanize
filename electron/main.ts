import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fork, ChildProcess } from 'child_process';
import fs from 'fs';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;

function launchBackend() {
    const backendPath = isDev
        ? path.join(__dirname, '../backend/server.js') // Assuming dist-electron/main.cjs
        : path.join(process.resourcesPath, 'backend/server.js');

    console.log('Backend Path:', backendPath);

    if (!fs.existsSync(backendPath)) {
        console.error('Backend file not found at:', backendPath);
        return;
    }

    // Spawn the backend using fork (uses Electron's bundled Node)
    // We pass process.env to ensure it has necessary environment variables
    backendProcess = fork(backendPath, [], {
        env: { ...process.env, PORT: '5000', ELECTRON_RUN_AS_NODE: '1' },
        stdio: 'pipe',
    });

    backendProcess.on('message', (message) => {
        console.log('Backend message:', message);
    });

    if (backendProcess.stdout) {
        backendProcess.stdout.on('data', (data) => console.log(`[Backend]: ${data}`));
    }

    if (backendProcess.stderr) {
        backendProcess.stderr.on('data', (data) => console.error(`[Backend Error]: ${data}`));
    }

    backendProcess.on('exit', (code) => {
        console.log(`Backend exited with code ${code}`);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: true, // We might want this for local file access if needed, or stick to contextBridge
            contextIsolation: false, // For simplicity in this migration, but ideally true
        },
        title: 'PL Humanizer',
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:8080/pl-humanizer/');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
        mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
            console.error('Failed to load:', code, desc);
        });
    } else {
        // In production, load the index.html from the dist folder
        // checking different possible paths for robustness
        const indexHtml = path.join(__dirname, '../dist/index.html');
        mainWindow.loadFile(indexHtml);
    }
}

app.whenReady().then(() => {
    launchBackend();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (backendProcess) {
        backendProcess.kill();
    }
});
