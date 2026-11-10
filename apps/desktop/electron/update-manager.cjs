const { app } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const APP_REPO_URL = process.env.MOSAICO_REPO_URL || "https://github.com/Marco-Antonio-Fernandes/Mosaico-food.git";
const BRANCH = process.env.MOSAICO_REPO_BRANCH || "main";

function buildInfoPath() {
  return path.join(__dirname, "build-info.json");
}

function readBuildInfo() {
  try {
    return JSON.parse(fs.readFileSync(buildInfoPath(), "utf8"));
  } catch {
    return null;
  }
}

function statePath() {
  return path.join(app.getPath("userData"), "update-state.json");
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return null;
  }
}

async function writeState(next) {
  await fs.promises.mkdir(path.dirname(statePath()), { recursive: true });
  await fs.promises.writeFile(statePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function sourceRoot() {
  if (process.platform === "linux") {
    return path.join(app.getPath("home"), ".local", "share", "mosaico-food", "source");
  }
  return path.join(app.getPath("userData"), "source");
}

function appRepository() {
  return path.join(sourceRoot(), "mosaico-food");
}

function isRepository(directory) {
  return fs.existsSync(path.join(directory, ".git")) && fs.existsSync(path.join(directory, "package.json"));
}

function cloneUrl(url) {
  const token = process.env.MOSAICO_GIT_TOKEN;
  if (!token) return url;
  try {
    const parsed = new URL(url);
    parsed.username = "x-access-token";
    parsed.password = token;
    return parsed.toString();
  } catch {
    return url;
  }
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

async function verifyTools() {
  try {
    await run("git", ["--version"], { label: "git" });
  } catch {
    throw new Error("Git não encontrado neste computador. Instale o Git (ex.: sudo pacman -S git) e tente novamente.");
  }
  try {
    await run(npmCommand(), ["--version"], { label: "npm" });
  } catch {
    throw new Error("Node.js/npm não encontrado neste computador. Instale o Node.js e tente novamente.");
  }
}

async function ensureClone(directory, url, label, onProgress) {
  if (isRepository(directory)) return directory;
  await fs.promises.mkdir(path.dirname(directory), { recursive: true });
  if (fs.existsSync(directory)) await fs.promises.rm(directory, { recursive: true, force: true });
  onProgress?.({ phase: "clone", message: `Clonando ${label}…` });
  try {
    await run("git", ["clone", "--depth", "1", "--branch", BRANCH, cloneUrl(url), directory], {
      cwd: path.dirname(directory),
      label: `git clone (${label})`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/could not read Username|terminal prompts disabled|authentication failed|repository not found|permission denied|403|404/i.test(message)) {
      throw new Error(`Não foi possível clonar ${label}. Deixe o repositório público ou configure credenciais de acesso ao Git.`);
    }
    throw error;
  }
  return directory;
}

async function ensureRepository(onProgress) {
  await ensureClone(appRepository(), APP_REPO_URL, "repositório do app", onProgress);
}

function extractedAppDirectory() {
  const resources = process.resourcesPath || "";
  if (process.platform !== "linux") return null;
  if (resources.startsWith("/tmp/.mount_") || resources.includes("/.mount_")) return null;
  const directory = path.dirname(resources);
  return fs.existsSync(path.join(directory, "mosaico-food")) ? directory : null;
}

function installedResourcesDirectory() {
  const target = extractedAppDirectory();
  if (target) return path.join(target, "resources");
  return process.resourcesPath || null;
}

function copyRuntimeAssets(appDir) {
  const resources = installedResourcesDirectory();
  if (!resources) return;
  const desktop = path.join(appDir, "apps", "desktop");
  const pairs = [
    ["speech", path.join(desktop, "electron", "speech-runtime")],
    ["interpreter", path.join(desktop, "electron", "interpreter-runtime")],
  ];
  for (const [name, destination] of pairs) {
    const source = path.join(resources, name);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, destination, { recursive: true, force: true });
  }
}

async function checkForUpdates(onProgress) {
  try {
    await verifyTools();
    await ensureRepository(onProgress);
    const repoPath = appRepository();
    await git(["fetch", "--prune", "origin", BRANCH], repoPath, "git fetch");
    const cloneHead = await git(["rev-parse", "HEAD"], repoPath, "git rev-parse");
    const latestCommit = await git(["rev-parse", `origin/${BRANCH}`], repoPath, "git rev-parse");
    const buildInfo = readBuildInfo();
    const state = readState();
    const installedCommit = buildInfo?.commit || state?.installedCommit || cloneHead;
    const latestSubject = await git(["log", "-1", "--format=%s", `origin/${BRANCH}`], repoPath, "git log");
    const dirty = Boolean((await git(["status", "--porcelain"], repoPath, "git status")).trim());
    let behind = installedCommit === latestCommit ? 0 : 1;
    if (installedCommit !== latestCommit) {
      try {
        behind = Number(await git(["rev-list", "--count", `${installedCommit}..origin/${BRANCH}`], repoPath, "git rev-list")) || 1;
      } catch {
        behind = 1;
      }
    }
    return {
      remoteUrl: APP_REPO_URL,
      sourceDir: repoPath,
      branch: BRANCH,
      currentCommit: installedCommit,
      latestCommit,
      latestSubject,
      updateAvailable: installedCommit !== latestCommit,
      commitsBehind: behind,
      dirty,
      message: installedCommit !== latestCommit ? `${behind} commit(s) novo(s) em ${BRANCH}.` : "Você já está na versão mais recente do repositório.",
    };
  } catch (error) {
    return {
      remoteUrl: APP_REPO_URL,
      sourceDir: appRepository(),
      branch: BRANCH,
      currentCommit: null,
      latestCommit: null,
      latestSubject: null,
      updateAvailable: false,
      commitsBehind: 0,
      dirty: false,
      message: error instanceof Error ? error.message : "Não foi possível consultar o repositório.",
    };
  }
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
  await fs.promises.writeFile(scriptPath, `${lines.join("\n")}\n`, { mode: 0o755 });
  const child = spawn("setsid", ["bash", scriptPath], { detached: true, stdio: "ignore" });
  child.unref();
}

async function installUpdate(onProgress) {
  if (process.platform !== "linux") {
    throw new Error("Atualização por Git + build disponível no momento apenas para Linux.");
  }
  await verifyTools();
  await ensureRepository(onProgress);
  const repoPath = appRepository();

  onProgress?.({ phase: "git", message: "Baixando alterações do Git…" });
  await git(["fetch", "--prune", "origin", BRANCH], repoPath, "git fetch");
  await git(["reset", "--hard", `origin/${BRANCH}`], repoPath, "git reset");
  const targetCommit = await git(["rev-parse", `origin/${BRANCH}`], repoPath, "git rev-parse");

  onProgress?.({ phase: "deps", message: "Instalando dependências…" });
  await run(npmCommand(), ["install", "--include=dev", "--no-audit", "--no-fund"], { cwd: repoPath, label: "npm install" });

  onProgress?.({ phase: "assets", message: "Preparando modelos e backend local…" });
  copyRuntimeAssets(repoPath);
  const resources = installedResourcesDirectory();
  const installedBackend = resources ? path.join(resources, "backend") : null;
  if (!installedBackend || !fs.existsSync(path.join(installedBackend, "dist"))) {
    throw new Error("O backend local da instalação atual não foi encontrado.");
  }

  onProgress?.({ phase: "build", message: "Compilando o aplicativo…" });
  await run(npmCommand(), ["run", "build"], { cwd: repoPath, label: "npm run build" });

  onProgress?.({ phase: "package", message: "Empacotando a nova versão…" });
  const desktopPath = path.join(repoPath, "apps", "desktop");
  await run(npmCommand(), ["run", "prepare:build-info"], { cwd: desktopPath, label: "build-info" });
  const updateConfigPath = path.join(app.getPath("temp"), `mosaico-update-config-${Date.now()}.json`);
  const updateConfig = {
    appId: "br.com.mosaico.food",
    productName: "Mosaico Food",
    executableName: "mosaico-food",
    icon: "electron/assets/mosaico-food.png",
    directories: { output: "release" },
    files: ["dist/**", "electron/**", "package.json"],
    extraResources: [
      { from: installedBackend, to: "backend" },
      { from: "electron/speech-runtime", to: "speech" },
      { from: "electron/interpreter-runtime", to: "interpreter" },
    ],
  };
  await fs.promises.writeFile(updateConfigPath, `${JSON.stringify(updateConfig, null, 2)}\n`, "utf8");
  await run(npxCommand(), ["--yes", "electron-builder", "--dir", "--config", updateConfigPath], {
    cwd: desktopPath,
    label: "electron-builder",
  });

  await writeState({ installedCommit: targetCommit, installedAt: new Date().toISOString() });

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
  installUpdate,
};
