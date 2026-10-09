const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

const isDevelopment = !app.isPackaged;

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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

app.whenReady().then(() => {
  createWindow();

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
