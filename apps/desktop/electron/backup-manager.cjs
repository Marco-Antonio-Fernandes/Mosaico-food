const { app, dialog } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const BACKUP_INTERVAL_MS = 3 * 60 * 60 * 1000;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
let backupTimer = null;
let backupRunning = false;

function settingsPath() {
  return path.join(app.getPath("userData"), "backup-settings.json");
}

async function getBackupSettings() {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    const value = JSON.parse(raw);
    return {
      folder: typeof value?.folder === "string" ? value.folder : null,
      lastBackupAt: typeof value?.lastBackupAt === "string" ? value.lastBackupAt : null,
    };
  } catch {
    return { folder: null, lastBackupAt: null };
  }
}

async function saveBackupSettings(next) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

async function chooseBackupFolder() {
  const result = await dialog.showOpenDialog({
    title: "Escolha a pasta dos backups do Mosaico Food",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const settings = await getBackupSettings();
  return saveBackupSettings({ ...settings, folder: path.resolve(result.filePaths[0]) });
}

function backupFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `mosaico-food-backup-${stamp}.json`;
}

async function writeBackupFile({ folder, content, markCompleted = true }) {
  if (typeof folder !== "string" || !folder.trim()) throw new Error("Escolha uma pasta para salvar o backup.");
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > MAX_BACKUP_BYTES) throw new Error("O backup excede o limite permitido.");
  const targetFolder = path.resolve(folder);
  await fs.mkdir(targetFolder, { recursive: true });
  const targetPath = path.join(targetFolder, backupFileName());
  await fs.writeFile(targetPath, content, { encoding: "utf8", flag: "wx" });
  const settings = await getBackupSettings();
  await saveBackupSettings({ ...settings, folder: targetFolder, ...(markCompleted ? { lastBackupAt: new Date().toISOString() } : {}) });
  return { path: targetPath, createdAt: new Date().toISOString() };
}

async function readBackupFile() {
  const result = await dialog.showOpenDialog({
    title: "Escolha um backup do Mosaico Food",
    properties: ["openFile"],
    filters: [{ name: "Backup do Mosaico Food", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const info = await fs.stat(filePath);
  if (info.size > MAX_BACKUP_BYTES) throw new Error("O arquivo de backup excede o limite permitido.");
  return { path: filePath, content: await fs.readFile(filePath, "utf8") };
}

async function runAutomaticBackup(getBackendUrl) {
  if (backupRunning) return;
  backupRunning = true;
  try {
    const settings = await getBackupSettings();
    if (!settings.folder) return;
    const lastBackupTime = settings.lastBackupAt ? Date.parse(settings.lastBackupAt) : 0;
    if (lastBackupTime && Date.now() - lastBackupTime < BACKUP_INTERVAL_MS) return;
    const backendUrl = getBackendUrl();
    if (!backendUrl) return;
    const response = await fetch(`${backendUrl}/api/v1/food/backups/export`);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data?.backup) throw new Error("Não foi possível gerar o backup automático.");
    await writeBackupFile({ folder: settings.folder, content: `${JSON.stringify(payload.data.backup, null, 2)}\n` });
    console.log("[Mosaico Food] Backup automático concluído.");
  } catch (error) {
    console.error(`[Mosaico Food] Falha no backup automático: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    backupRunning = false;
  }
}

function startBackupScheduler(getBackendUrl) {
  stopBackupScheduler();
  void runAutomaticBackup(getBackendUrl);
  backupTimer = setInterval(() => void runAutomaticBackup(getBackendUrl), BACKUP_INTERVAL_MS);
}

function stopBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = null;
}

module.exports = {
  chooseBackupFolder,
  getBackupSettings,
  readBackupFile,
  startBackupScheduler,
  stopBackupScheduler,
  writeBackupFile,
};
