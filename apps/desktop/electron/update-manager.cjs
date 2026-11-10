const { app, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

function settingsPath() {
  return path.join(app.getPath("userData"), "update-settings.json");
}

async function readSettings() {
  try {
    const value = JSON.parse(await fsp.readFile(settingsPath(), "utf8"));
    return { repoPath: typeof value?.repoPath === "string" ? value.repoPath : null };
  } catch {
    return { repoPath: null };
  }
}

async function writeSettings(next) {
  await fsp.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fsp.writeFile(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function isRepository(directory) {
  if (!directory) return false;
  return fs.existsSync(path.join(directory, ".git")) && fs.existsSync(path.join(directory, "package.json"));
}

function candidateRepositories() {
  const home = app.getPath("home");
  return [
    process.env.MOSAICO_SOURCE_DIR,
    path.join(home, "Documentos", "Mosaico Food"),
    path.join(home, "Documents", "Mosaico Food"),
    path.resolve(__dirname, "../../.."),
  ].filter((candidate) => typeof candidate === "string" && candidate);
}

async function resolveRepository() {
  const settings = await readSettings();
  if (isRepository(settings.repoPath)) return settings.repoPath;
  const found = candidateRepositories().find(isRepository);
  if (found) {
    await writeSettings({ repoPath: found });
    return found;
  }
  return null;
}

async function chooseUpdateRepository() {
  const current = await resolveRepository();
  const result = await dialog.showOpenDialog({
    title: "Escolha a pasta do código-fonte do Mosaico Food",
    defaultPath: current || app.getPath("home"),
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const repoPath = path.resolve(result.filePaths[0]);
  if (!isRepository(repoPath)) {
    throw new Error("A pasta escolhida não é um clone do repositório do Mosaico Food.");
  }
  await writeSettings({ repoPath });
  return { repoPath };
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function run(command, args, { cwd, label } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    const collect = (chunk) => {
      output += chunk.toString();
      if (output.length > 12_000) output = output.slice(-12_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", (error) => reject(new Error(`${label || command}: ${error.message}`)));
    child.once("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${label || command} falhou (código ${code}).\n${output.slice(-800)}`));
    });
  });
}

async function git(args, cwd, label) {
  return (await run("git", args, { cwd, label })).trim();
}

async function checkForUpdates() {
  const repoPath = await resolveRepository();
  if (!repoPath) {
    return {
      repoPath: null,
      branch: null,
      currentCommit: null,
      latestCommit: null,
      latestSubject: null,
      updateAvailable: false,
      dirty: false,
      message: "Escolha a pasta do repositório do Mosaico Food.",
    };
  }
  const dirty = Boolean((await git(["status", "--porcelain"], repoPath, "git status")).trim());
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], repoPath, "git branch");
  await git(["fetch", "--prune", "origin", branch], repoPath, "git fetch");
  const currentCommit = await git(["rev-parse", "HEAD"], repoPath, "git rev-parse");
  const latestCommit = await git(["rev-parse", `origin/${branch}`], repoPath, "git rev-parse");
  const behind = Number(await git(["rev-list", "--count", `HEAD..origin/${branch}`], repoPath, "git rev-list"));
  const latestSubject = await git(["log", "-1", "--format=%s", `origin/${branch}`], repoPath, "git log");
  return {
    repoPath,
    branch,
    currentCommit,
    latestCommit,
    latestSubject,
    updateAvailable: behind > 0,
    commitsBehind: behind,
    dirty,
    message: behind > 0 ? `${behind} commit(s) novo(s) em ${branch}.` : "Você já está na versão mais recente do repositório.",
  };
}

function extractedAppDirectory() {
  const resources = process.resourcesPath || "";
  if (process.platform !== "linux") return null;
  if (resources.startsWith("/tmp/.mount_") || resources.includes("/.mount_")) return null;
  const directory = path.dirname(resources);
  return fs.existsSync(path.join(directory, "mosaico-food")) ? directory : null;
}

async function replaceInstalledApp(targetDir, sourceDir, pid) {
  const parent = path.dirname(targetDir);
  const previous = path.join(parent, "app.previous");
  const scriptPath = path.join(app.getPath("temp"), `mosaico-food-update-${Date.now()}.sh`);
  const lines = [
    "#!/bin/bash",
    "set -e",
    `while kill -0 ${pid} 2>/dev/null; do sleep 1; done`,
    `rm -rf ${JSON.stringify(previous)}`,
    `mv ${JSON.stringify(targetDir)} ${JSON.stringify(previous)}`,
    `mkdir -p ${JSON.stringify(targetDir)}`,
    `cp -a ${JSON.stringify(sourceDir)}/. ${JSON.stringify(targetDir)}/`,
    `chmod +x ${JSON.stringify(path.join(targetDir, "mosaico-food"))}`,
    `setsid ${JSON.stringify(path.join(targetDir, "mosaico-food"))} >/dev/null 2>&1 &`,
  ];
  await fsp.writeFile(scriptPath, `${lines.join("\n")}\n`, { mode: 0o755 });
  const child = spawn("setsid", ["bash", scriptPath], { detached: true, stdio: "ignore" });
  child.unref();
}

async function installUpdate(onProgress) {
  if (process.platform !== "linux") {
    throw new Error("Atualização por git + build disponível no momento apenas para Linux.");
  }
  const status = await checkForUpdates();
  if (!status.repoPath) throw new Error("Escolha a pasta do repositório do Mosaico Food.");
  if (status.dirty) throw new Error("O repositório tem alterações locais. Faça commit ou descarte antes de atualizar.");
  if (!status.updateAvailable) throw new Error("Você já está na versão mais recente do repositório.");
  const repoPath = status.repoPath;

  onProgress?.({ phase: "git", message: "Baixando alterações do Git…" });
  await git(["pull", "--ff-only", "origin", status.branch], repoPath, "git pull");

  onProgress?.({ phase: "deps", message: "Instalando dependências…" });
  await run(npmCommand(), ["install", "--include=dev", "--no-audit", "--no-fund"], { cwd: repoPath, label: "npm install" });
  const backendPath = path.join(repoPath, "..", "mosaico-back");
  if (fs.existsSync(path.join(backendPath, "package.json"))) {
    await run(npmCommand(), ["install", "--include=dev", "--no-audit", "--no-fund"], { cwd: backendPath, label: "npm install (backend)" });
  }

  onProgress?.({ phase: "build", message: "Compilando aplicativo e backend…" });
  await run(npmCommand(), ["run", "build"], { cwd: repoPath, label: "npm run build" });
  await run(npmCommand(), ["run", "build:back"], { cwd: repoPath, label: "npm run build:back" });

  onProgress?.({ phase: "package", message: "Empacotando a nova versão…" });
  const desktopPath = path.join(repoPath, "apps", "desktop");
  await run(npxCommand(), ["--yes", "electron-builder", "--dir", "--config", "electron-builder.yml"], {
    cwd: desktopPath,
    label: "electron-builder",
  });

  onProgress?.({ phase: "install", message: "Instalando e reiniciando…" });
  const sourceDir = path.join(desktopPath, "release", "linux-unpacked");
  if (!fs.existsSync(path.join(sourceDir, "mosaico-food"))) {
    throw new Error("O empacotamento não gerou o aplicativo esperado.");
  }
  const targetDir = extractedAppDirectory();
  if (!targetDir) {
    throw new Error("Não foi possível localizar a instalação do Mosaico Food para substituir.");
  }
  await replaceInstalledApp(targetDir, sourceDir, process.pid);
  setTimeout(() => app.quit(), 500);
  return { restarting: true };
}

module.exports = {
  checkForUpdates,
  chooseUpdateRepository,
  installUpdate,
};
