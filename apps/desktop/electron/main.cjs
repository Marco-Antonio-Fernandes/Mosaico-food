const { app, BrowserView, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const defaultUserDataPath = app.getPath("userData");
const stableUserDataPath = path.join(app.getPath("appData"), "Mosaico Food");
app.setPath("userData", stableUserDataPath);
if (defaultUserDataPath !== stableUserDataPath) process.env.MOSAICO_LEGACY_USER_DATA_DIR = defaultUserDataPath;
const { createNewLocalDatabase, getBackendDiagnostic, getBackendUrl, startLocalBackend, stopLocalBackend } = require("./local-backend.cjs");
const { getBackupSettings, readBackupFile, saveBackupFile } = require("./backup-manager.cjs");
const { checkForUpdates, installUpdate } = require("./update-manager.cjs");
const { stopLocalSpeech, transcribeAudio } = require("./local-speech.cjs");
const { stopLocalInterpreter, interpretFoodText } = require("./local-interpreter.cjs");
const { getPrinterSettings, printFoodOrder, printTestOrder, savePrinterSettings } = require("./printer.cjs");

const isDevelopment = !app.isPackaged;
const useBuiltRenderer = process.env.MOSAICO_USE_BUILT_RENDERER === "1";
let mainWindow = null;

let whatsappBrowserView = null;
let whatsappBrowserAccountId = null;
let whatsappBrowserBounds = null;
let whatsappBrowserVisible = false;

const WHATSAPP_URL = "https://web.whatsapp.com/";
const WHATSAPP_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function whatsappPartition(accountId) {
  const safeId = String(accountId || "default").replace(/[^a-zA-Z0-9_-]/g, "-") || "default";
  return `persist:mosaico-whatsapp-${safeId}`;
}

function notifyWhatsappStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("mosaico:whatsapp-status", payload);
}

function removeWhatsappBrowserView() {
  whatsappBrowserVisible = false;
  if (!mainWindow || mainWindow.isDestroyed() || !whatsappBrowserView) return;
  if (mainWindow.getBrowserViews().includes(whatsappBrowserView)) {
    mainWindow.removeBrowserView(whatsappBrowserView);
  }
}

function destroyWhatsappBrowserView() {
  whatsappBrowserVisible = false;
  removeWhatsappBrowserView();
  if (whatsappBrowserView && !whatsappBrowserView.webContents.isDestroyed()) {
    whatsappBrowserView.webContents.destroy();
  }
  whatsappBrowserView = null;
  whatsappBrowserAccountId = null;
}

async function createWhatsappBrowserView(accountId) {
  const normalizedAccountId = String(accountId || "default");
  if (whatsappBrowserView && whatsappBrowserAccountId === normalizedAccountId) {
    return whatsappBrowserView;
  }

  destroyWhatsappBrowserView();
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Match the packaged Linux launcher. The host's Electron sandbox can
      // start the guest renderer with both --enable-sandbox and --no-sandbox
      // when the application is launched without the setuid helper, which
      // makes WhatsApp die while creating its shared-memory surface.
      sandbox: process.env.MOSAICO_ELECTRON_NO_SANDBOX !== "1",
      partition: whatsappPartition(normalizedAccountId),
    },
  });
  whatsappBrowserView = view;
  whatsappBrowserAccountId = normalizedAccountId;
  view.setBackgroundColor("#f0f2f5");
  view.webContents.setUserAgent(WHATSAPP_USER_AGENT);
  // Mantém o WhatsApp vivo entre as telas. O processo continua em segundo
  // plano para não recarregar a página a cada navegação em PCs mais fracos.
  view.webContents.setBackgroundThrottling(true);
  view.webContents.session.setPermissionCheckHandler((_webContents, permission) => permission === "media");
  view.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  view.webContents.session.setSpellCheckerEnabled(false);
  view.webContents.on("did-start-loading", () => {
    notifyWhatsappStatus({ state: "loading", message: "Carregando WhatsApp Web…" });
  });
  view.webContents.on("did-finish-load", () => {
    notifyWhatsappStatus({ state: "ready", message: "WhatsApp Web pronto para uso." });
  });
  view.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    notifyWhatsappStatus({ state: "error", message: `Falha ao carregar o WhatsApp Web (${errorCode}: ${errorDescription}).`, url: validatedURL });
  });
  view.webContents.on("render-process-gone", (_event, details) => {
    notifyWhatsappStatus({ state: "error", message: `O processo interno do WhatsApp foi encerrado (${details.reason}).` });
  });
  view.webContents.on("page-title-updated", (_event, title) => {
    const match = /^\((\d+)\)/.exec(title || "");
    if (!match || Number(match[1]) <= 0) return;
    mainWindow?.webContents.send("mosaico:whatsapp-notification", { unreadCount: Number(match[1]), title });
  });
  view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  try {
    await view.webContents.loadURL(WHATSAPP_URL);
  } catch (error) {
    notifyWhatsappStatus({ state: "error", message: `Falha ao abrir o WhatsApp Web: ${error instanceof Error ? error.message : String(error)}.` });
  }
  return view;
}

function setWhatsappBrowserBounds(input) {
  const values = ["left", "top", "width", "height"].map(key => Number(input?.[key]));
  if (values.some(value => !Number.isFinite(value))) return;
  const [left, top, width, height] = values;
  whatsappBrowserBounds = { left, top, width, height };
  if (!mainWindow || mainWindow.isDestroyed() || !whatsappBrowserView) return;
  if (!whatsappBrowserVisible) return;
  if (width < 2 || height < 2) {
    removeWhatsappBrowserView();
    return;
  }
  mainWindow.addBrowserView(whatsappBrowserView);
  whatsappBrowserView.setBounds({
    x: Math.max(0, Math.round(left)),
    y: Math.max(0, Math.round(top)),
    width: Math.max(2, Math.round(width)),
    height: Math.max(2, Math.round(height)),
  });
}

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
      webviewTag: true,
      sandbox: process.env.MOSAICO_ELECTRON_NO_SANDBOX !== "1",
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  mainWindow = window;

  window.on("closed", () => {
    destroyWhatsappBrowserView();
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
  ipcMain.handle("mosaico:whatsapp-show", async (_event, accountId) => {
    await createWhatsappBrowserView(accountId);
    whatsappBrowserVisible = true;
    if (whatsappBrowserBounds) setWhatsappBrowserBounds(whatsappBrowserBounds);
    return { ready: true };
  });
  ipcMain.on("mosaico:whatsapp-bounds", (_event, bounds) => setWhatsappBrowserBounds(bounds));
  ipcMain.handle("mosaico:whatsapp-hide", () => removeWhatsappBrowserView());
  ipcMain.handle("mosaico:whatsapp-reload", () => whatsappBrowserView?.webContents.reload());

  ipcMain.handle("mosaico:create-new-database", () => createNewLocalDatabase());
  ipcMain.handle("mosaico:transcribe-audio", (_event, audio, mimeType, prompt) => transcribeAudio(audio, mimeType, prompt));
  ipcMain.handle("mosaico:interpret-text", (_event, text, products) => interpretFoodText(text, products));
  ipcMain.handle("mosaico:get-backup-settings", () => getBackupSettings());
  ipcMain.handle("mosaico:save-backup-file", (_event, input) => saveBackupFile(input));
  ipcMain.handle("mosaico:read-backup-file", () => readBackupFile());
  ipcMain.handle("mosaico:app-version", () => app.getVersion());
  const sendUpdateProgress = (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("mosaico:update-progress", progress);
  };
  ipcMain.handle("mosaico:check-for-updates", () => checkForUpdates(sendUpdateProgress));
  ipcMain.handle("mosaico:install-update", () => installUpdate(sendUpdateProgress));
  ipcMain.handle("mosaico:get-printer-settings", () => getPrinterSettings());
  ipcMain.handle("mosaico:save-printer-settings", (_event, input) => savePrinterSettings(input));
  ipcMain.handle("mosaico:test-printer", () => printTestOrder());
  ipcMain.handle("mosaico:print-food-order", (_event, order) => printFoodOrder(order));
  createWindow({ loading: true });

  // Motores locais de voz e interpretação sobem sob demanda, na primeira
  // mensagem de áudio ou texto que precisar deles. Em computadores com pouca
  // RAM, manter o modelo de linguagem sempre carregado consumia ~2 GB.
  void startLocalBackend()
    .catch((error) => console.error("[Mosaico Food] Falha ao iniciar o backend local", error))
    .finally(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        loadMainRenderer(mainWindow);
        mainWindow.show();
      }
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
  stopLocalSpeech();
  stopLocalInterpreter();
  stopLocalBackend();
});
