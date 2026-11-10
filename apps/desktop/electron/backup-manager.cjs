const { app, dialog } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

function settingsPath() {
  return path.join(app.getPath("userData"), "backup-settings.json");
}

async function getBackupSettings() {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    const value = JSON.parse(raw);
    return {
      lastBackupAt: typeof value?.lastBackupAt === "string" ? value.lastBackupAt : null,
    };
  } catch {
    return { lastBackupAt: null };
  }
}

async function saveBackupSettings(next) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function defaultBackupName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `mosaico-food-backup-${stamp}.json`;
}

async function saveBackupFile({ content }) {
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > MAX_BACKUP_BYTES) {
    throw new Error("O backup excede o limite permitido.");
  }
  const result = await dialog.showSaveDialog({
    title: "Salvar backup do Mosaico Food",
    defaultPath: path.join(app.getPath("downloads"), defaultBackupName()),
    buttonLabel: "Salvar backup",
    filters: [{ name: "Backup do Mosaico Food", extensions: ["json"] }],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });
  if (result.canceled || !result.filePath) return null;
  const targetPath = path.resolve(result.filePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, { encoding: "utf8" });
  const settings = await getBackupSettings();
  const saved = await saveBackupSettings({ ...settings, lastBackupAt: new Date().toISOString() });
  return { path: targetPath, createdAt: saved.lastBackupAt };
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

module.exports = {
  getBackupSettings,
  readBackupFile,
  saveBackupFile,
};
