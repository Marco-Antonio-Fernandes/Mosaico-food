const { app } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { Readable } = require("node:stream");
const path = require("node:path");
const { z } = require("zod");

const DEFAULT_MANIFEST_URL = "https://mosaico.rotatix.com.br/updates/mosaico-food/latest.json";
const FETCH_TIMEOUT_MS = 20_000;
const manifestSchema = z.object({
  version: z.string().min(1),
  url: z.string().url(),
  sha256: z.string().optional(),
  notes: z.string().optional(),
  publishedAt: z.string().optional(),
});
let pendingUpdate = null;

function manifestUrl() {
  return process.env.MOSAICO_UPDATE_MANIFEST_URL || DEFAULT_MANIFEST_URL;
}

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/i.exec(String(value || "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isNewer(current, latest) {
  const a = parseVersion(current);
  const b = parseVersion(latest);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (b[index] > a[index]) return true;
    if (b[index] < a[index]) return false;
  }
  return false;
}

function emptyStatus(extra = {}) {
  return {
    currentVersion: app.getVersion(),
    latestVersion: null,
    updateAvailable: false,
    downloading: false,
    notes: null,
    publishedAt: null,
    manifestUrl: manifestUrl(),
    ...extra,
  };
}

async function checkForUpdates() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(manifestUrl(), {
      signal: controller.signal,
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) throw new Error(`O servidor de atualizações respondeu ${response.status}.`);
    const parsed = manifestSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("O servidor de atualizações enviou um manifesto inválido.");
    const manifest = parsed.data;
    pendingUpdate = manifest;
    return emptyStatus({
      latestVersion: manifest.version,
      updateAvailable: isNewer(app.getVersion(), manifest.version),
      notes: typeof manifest.notes === "string" ? manifest.notes : null,
      publishedAt: typeof manifest.publishedAt === "string" ? manifest.publishedAt : null,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("O servidor de atualizações demorou demais para responder.");
    }
    if (error instanceof TypeError) {
      throw new Error("Não foi possível conectar ao servidor de atualizações.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function updateDirectory() {
  return path.join(app.getPath("userData"), "updates");
}

async function downloadFile(url, destination, onProgress) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30 * 60 * 1000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`Não foi possível baixar a atualização (${response.status}).`);
    const total = Number(response.headers.get("content-length") || 0);
    let received = 0;
    let lastEmit = 0;
    const handle = await fsp.open(destination, "w");
    try {
      for await (const chunk of Readable.fromWeb(response.body)) {
        await handle.write(chunk);
        received += chunk.length;
        const now = Date.now();
        if (onProgress && (now - lastEmit > 250 || received === total)) {
          lastEmit = now;
          onProgress({ received, total, percent: total ? Math.min(100, Math.round((received / total) * 100)) : null });
        }
      }
    } finally {
      await handle.close();
    }
    return { received, total };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("O download da atualização demorou demais.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function sha256Of(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", ...options });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`O comando de atualização terminou com código ${code}.`));
    });
  });
}

function extractedAppDirectory() {
  const resources = process.resourcesPath || "";
  if (process.platform !== "linux") return null;
  if (resources.startsWith("/tmp/.mount_") || resources.includes("/.mount_")) return null;
  const directory = path.dirname(resources);
  return fs.existsSync(path.join(directory, "mosaico-food")) ? directory : null;
}

async function runUnixReplacer({ targetDir, extractedDir, appImagePath, pid }) {
  const scriptPath = path.join(updateDirectory(), "apply-update.sh");
  const lines = [
    "#!/bin/bash",
    "set -e",
    `while kill -0 ${pid} 2>/dev/null; do sleep 1; done`,
  ];
  if (targetDir) {
    const parent = path.dirname(targetDir);
    const previous = path.join(parent, "app.previous");
    lines.push(`rm -rf ${JSON.stringify(previous)}`);
    lines.push(`mv ${JSON.stringify(targetDir)} ${JSON.stringify(previous)}`);
    lines.push(`mv ${JSON.stringify(extractedDir)} ${JSON.stringify(targetDir)}`);
    lines.push(`chmod +x ${JSON.stringify(path.join(targetDir, "mosaico-food"))}`);
    lines.push(`rm -rf ${JSON.stringify(previous)}`);
    lines.push(`setsid ${JSON.stringify(path.join(targetDir, "mosaico-food"))} >/dev/null 2>&1 &`);
  } else {
    lines.push(`mv ${JSON.stringify(appImagePath)} ${JSON.stringify(process.env.APPIMAGE)}`);
    lines.push(`chmod +x ${JSON.stringify(process.env.APPIMAGE)}`);
    lines.push(`setsid ${JSON.stringify(process.env.APPIMAGE)} >/dev/null 2>&1 &`);
  }
  await fsp.writeFile(scriptPath, `${lines.join("\n")}\n`, { mode: 0o755 });
  const child = spawn("setsid", ["bash", scriptPath], { detached: true, stdio: "ignore" });
  child.unref();
}

async function installUpdate(onProgress) {
  if (!pendingUpdate) throw new Error("Consulte as atualizações antes de instalar.");
  if (!isNewer(app.getVersion(), pendingUpdate.version)) throw new Error("Você já está na versão mais recente.");
  const directory = updateDirectory();
  await fsp.mkdir(directory, { recursive: true });
  const isWindows = process.platform === "win32";
  const fileName = isWindows ? "mosaico-food-update.exe" : "mosaico-food-update.AppImage";
  const downloadPath = path.join(directory, fileName);
  await fsp.rm(downloadPath, { force: true });

  await downloadFile(pendingUpdate.url, downloadPath, onProgress);
  onProgress?.({ phase: "verifying", percent: null });

  if (typeof pendingUpdate.sha256 === "string" && pendingUpdate.sha256.trim()) {
    const digest = await sha256Of(downloadPath);
    if (digest.toLowerCase() !== pendingUpdate.sha256.trim().toLowerCase()) {
      await fsp.rm(downloadPath, { force: true });
      throw new Error("A verificação de integridade da atualização falhou.");
    }
  }

  if (isWindows) {
    onProgress?.({ phase: "installing", percent: null });
    const child = spawn(downloadPath, ["/S"], { detached: true, stdio: "ignore" });
    child.unref();
    setTimeout(() => app.quit(), 400);
    return { restarting: true };
  }

  if (process.platform !== "linux") throw new Error("Atualização automática disponível apenas para Linux e Windows.");

  await fsp.chmod(downloadPath, 0o755);
  const targetDirectory = extractedAppDirectory();
  let extractedDir = null;
  if (targetDirectory) {
    onProgress?.({ phase: "extracting", percent: null });
    const extractRoot = path.join(directory, "extract");
    await fsp.rm(extractRoot, { recursive: true, force: true });
    await fsp.mkdir(extractRoot, { recursive: true });
    await run(downloadPath, ["--appimage-extract"], { cwd: extractRoot });
    extractedDir = path.join(extractRoot, "squashfs-root");
    if (!fs.existsSync(path.join(extractedDir, "mosaico-food"))) {
      throw new Error("O pacote de atualização não contém o aplicativo.");
    }
  } else if (!process.env.APPIMAGE) {
    throw new Error("Não foi possível localizar a instalação para aplicar a atualização.");
  }

  onProgress?.({ phase: "installing", percent: null });
  await runUnixReplacer({
    targetDir: targetDirectory,
    extractedDir,
    appImagePath: downloadPath,
    pid: process.pid,
  });
  setTimeout(() => app.quit(), 400);
  return { restarting: true };
}

module.exports = {
  checkForUpdates,
  installUpdate,
};
