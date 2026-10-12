const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const { getBackendUrl, startLocalBackend, stopLocalBackend } = require("./local-backend.cjs");
const { startLocalSpeech, stopLocalSpeech, transcribeAudio } = require("./local-speech.cjs");
const { startLocalInterpreter, stopLocalInterpreter, interpretFoodText } = require("./local-interpreter.cjs");

const isDevelopment = !app.isPackaged;
const configuredBackendUrl = process.env.MOSAICO_BACKEND_URL || "https://mosaico.rotatix.com.br";

if (process.env.MOSAICO_ELECTRON_NO_SANDBOX === "1") {
  app.commandLine.appendSwitch("no-sandbox");
}

if (process.env.MOSAICO_ELECTRON_DISABLE_GPU === "1") {
  app.commandLine.appendSwitch("disable-gpu");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#f4f7f8",
    title: "Mosaico Food",
    icon: path.join(__dirname, "assets/mosaico-food.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.env.MOSAICO_ELECTRON_NO_SANDBOX !== "1",
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, url) => {
    console.error("[Mosaico Food] Falha ao carregar", {
      errorCode,
      errorDescription,
      url,
    });
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[Mosaico Food renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDevelopment) {
    void window
      .loadURL("http://127.0.0.1:5173")
      .catch((error) => console.error("[Mosaico Food] Falha na URL do Vite", error));

    if (process.env.MOSAICO_ELECTRON_DEVTOOLS === "1") {
      window.webContents.openDevTools({ mode: "detach" });
    }

    return;
  }

  void window.loadFile(path.join(__dirname, "../dist/index.html"));
}

function configureMediaPermissions() {
  const defaultSession = require("electron").session.defaultSession;
  // The voice assistant uses navigator.mediaDevices.getUserMedia() in the
  // renderer. Without these handlers Electron can silently deny the request,
  // especially when the packaged window is loaded from file://.
  defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === "media");
  defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
}

app.whenReady().then(() => {
  configureMediaPermissions();
  ipcMain.handle("mosaico:backend-url", () => getBackendUrl(configuredBackendUrl));
  ipcMain.handle("mosaico:transcribe-audio", (_event, audio, mimeType, prompt) => transcribeAudio(audio, mimeType, prompt));
  ipcMain.handle("mosaico:interpret-text", (_event, text, products) => interpretFoodText(text, products));
  void Promise.all([startLocalBackend(), startLocalSpeech(), startLocalInterpreter()])
    .catch((error) => console.error("[Mosaico Food] Falha ao iniciar recursos locais", error))
    .finally(() => createWindow());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopLocalSpeech();
  stopLocalInterpreter();
  stopLocalBackend();
});
