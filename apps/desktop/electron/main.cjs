const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const defaultUserDataPath = app.getPath("userData");
const stableUserDataPath = path.join(app.getPath("appData"), "Mosaico Food");
app.setPath("userData", stableUserDataPath);
if (defaultUserDataPath !== stableUserDataPath) process.env.MOSAICO_LEGACY_USER_DATA_DIR = defaultUserDataPath;
const { createNewLocalDatabase, getBackendDiagnostic, getBackendUrl, startLocalBackend, stopLocalBackend } = require("./local-backend.cjs");
const { chooseBackupFolder, getBackupSettings, readBackupFile, startBackupScheduler, stopBackupScheduler, writeBackupFile } = require("./backup-manager.cjs");
const { startLocalSpeech, stopLocalSpeech, transcribeAudio } = require("./local-speech.cjs");
const { startLocalInterpreter, stopLocalInterpreter, interpretFoodText } = require("./local-interpreter.cjs");

const isDevelopment = !app.isPackaged;
const useBuiltRenderer = process.env.MOSAICO_USE_BUILT_RENDERER === "1";
let mainWindow = null;

if (isDevelopment) {
  const envFile = path.join(__dirname, "../.env");
  if (require("node:fs").existsSync(envFile)) process.loadEnvFile(envFile);
}
const configuredBackendUrl = process.env.MOSAICO_BACKEND_URL || (isDevelopment ? "http://localhost:3000" : "https://mosaico.rotatix.com.br");

// O backend local usa uma porta fixa. Sem o lock, abrir o aplicativo duas
// vezes deixava a segunda janela sem backend e exibia um erro enganoso de
// conexão, embora a primeira instância ainda estivesse funcionando.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

if (process.env.MOSAICO_ELECTRON_NO_SANDBOX === "1") {
  app.commandLine.appendSwitch("no-sandbox");
}

if (process.env.MOSAICO_ELECTRON_DISABLE_GPU === "1") {
  app.commandLine.appendSwitch("disable-gpu");
}

function loadMainRenderer(window) {
  if (window.isDestroyed()) return;

  if (isDevelopment && !useBuiltRenderer) {
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

function createWindow({ loading = false } = {}) {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: !loading,
    backgroundColor: loading ? "#14232d" : "#f4f7f8",
    title: "Mosaico Food",
    icon: path.join(__dirname, "assets/mosaico-food.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.env.MOSAICO_ELECTRON_NO_SANDBOX !== "1",
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  mainWindow = window;

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
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

  if (loading) {
    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) window.show();
    });
    void window.loadFile(path.join(__dirname, "loading.html"))
      .catch((error) => console.error("[Mosaico Food] Falha ao carregar a tela de abertura", error));
    return window;
  }

  loadMainRenderer(window);
  return window;
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

if (hasSingleInstanceLock) app.whenReady().then(() => {
  configureMediaPermissions();
  ipcMain.handle("mosaico:backend-url", () => {
    const backendUrl = getBackendUrl();
    if (!backendUrl) throw new Error("Backend local do Mosaico Food indisponível.");
    return backendUrl;
  });
  ipcMain.handle("mosaico:backend-diagnostic", () => getBackendDiagnostic());
  ipcMain.handle("mosaico:create-new-database", () => createNewLocalDatabase());
  ipcMain.handle("mosaico:transcribe-audio", (_event, audio, mimeType, prompt) => transcribeAudio(audio, mimeType, prompt));
  ipcMain.handle("mosaico:interpret-text", (_event, text, products) => interpretFoodText(text, products));
  ipcMain.handle("mosaico:choose-backup-folder", () => chooseBackupFolder());
  ipcMain.handle("mosaico:get-backup-settings", () => getBackupSettings());
  ipcMain.handle("mosaico:write-backup-file", (_event, input) => writeBackupFile(input));
  ipcMain.handle("mosaico:read-backup-file", () => readBackupFile());
  createWindow({ loading: true });

  // A interface não precisa esperar o motor de voz e o interpretador local.
  // Eles continuam subindo em segundo plano enquanto o usuário já vê o
  // carregamento e, depois, a tela principal.
  void Promise.all([startLocalSpeech(), startLocalInterpreter()])
    .catch((error) => console.error("[Mosaico Food] Falha ao iniciar recursos auxiliares", error));
  void startLocalBackend()
    .catch((error) => console.error("[Mosaico Food] Falha ao iniciar o backend local", error))
    .finally(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        loadMainRenderer(mainWindow);
        mainWindow.show();
      }
      startBackupScheduler(getBackendUrl);
    });

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
  stopBackupScheduler();
  stopLocalSpeech();
  stopLocalInterpreter();
  stopLocalBackend();
});
