const { app } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
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

function toolPath() {
  const home = os.homedir();
  const candidates = [
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
    path.join(home, ".local", "bin"),
    path.join(home, "bin"),
    "/opt/node/bin",
  ];
  const nvmDirectory = path.join(home, ".nvm", "versions", "node");
  try {
    for (const version of fs.readdirSync(nvmDirectory)) {
      candidates.push(path.join(nvmDirectory, version, "bin"));
    }
  } catch {
    // Sem nvm instalado.
  }
  const existing = (process.env.PATH || "").split(":").filter(Boolean);
  const directories = [...new Set([...candidates, ...existing])].filter((directory) => {
    try { return fs.statSync(directory).isDirectory(); } catch { return false; }
  });
  return directories.join(":");
}

function commandEnvironment() {
  return { ...process.env, PATH: toolPath() };
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function executableCandidates(command) {
  if (path.isAbsolute(command) || command.includes(path.sep)) return [command];
  const names = command === "node" ? ["node", "nodejs"] : [command];
  const extensions = process.platform === "win32" ? [".cmd", ".exe", ".bat", ""] : [""];
  const candidates = [];
  for (const directory of toolPath().split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) {
      for (const extension of extensions) {
        const candidate = path.join(directory, `${name}${extension}`);
        try {
          if (fs.statSync(candidate).isFile()) {
            fs.accessSync(candidate, fs.constants.X_OK);
            candidates.push(candidate);
          }
        } catch {
          // Continua procurando.
        }
      }
    }
  }
  candidates.push(command);
  return [...new Set(candidates)];
}

function findExecutable(command) {
  return executableCandidates(command)[0] ?? command;
}

function run(command, args, { cwd, label } = {}) {
  const candidates = executableCandidates(command);
  return new Promise((resolve, reject) => {
    let candidateIndex = 0;
    let lastError = "";

    const attempt = () => {
      const executable = candidates[candidateIndex];
      if (!executable) {
        reject(new Error(`${label || command}: ${lastError || "nenhum executável válido encontrado"}`));
        return;
      }
      let settled = false;
      const child = spawn(executable, args, {
        cwd,
        env: commandEnvironment(),
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
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        lastError = `${executable}: ${error.message}`;
        candidateIndex += 1;
        attempt();
      });
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        if (code === 0) {
          resolve(output);
          return;
        }
        lastError = `${executable} falhou (código ${code}).\n${output.slice(-800)}`;
        candidateIndex += 1;
        attempt();
      });
    };

    attempt();
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
    await run("node", ["--version"], { label: "node" });
  } catch {
    throw new Error(`Node.js não encontrado neste computador. Instale o Node.js (ex.: sudo pacman -S nodejs npm) e tente novamente. Pastas verificadas: ${toolPath()}`);
  }
  try {
    await run(npmCommand(), ["--version"], { label: "npm" });
  } catch {
    throw new Error(`npm não encontrado neste computador. Instale o npm (ex.: sudo pacman -S npm) e tente novamente. Pastas verificadas: ${toolPath()}`);
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

  onProgress?.({ phase: "deps", message: "Instalando dependências do aplicativo…" });
  await run(npmCommand(), ["install", "--include=dev", "--no-audit", "--no-fund"], { cwd: repoPath, label: "npm install" });
  const localBackendPath = path.join(repoPath, "local-backend");
  if (!fs.existsSync(path.join(localBackendPath, "package.json"))) {
    throw new Error("O backend local não foi encontrado no repositório.");
  }
  onProgress?.({ phase: "deps", message: "Instalando dependências do backend local…" });
  await run(npmCommand(), ["install", "--include=dev", "--no-audit", "--no-fund"], { cwd: localBackendPath, label: "npm install (backend local)" });

  onProgress?.({ phase: "assets", message: "Preparando modelos locais…" });
  copyRuntimeAssets(repoPath);

  onProgress?.({ phase: "build", message: "Compilando aplicativo e backend local…" });
  await run(npmCommand(), ["run", "build"], { cwd: repoPath, label: "npm run build" });
  await run(npmCommand(), ["run", "build:back"], { cwd: repoPath, label: "npm run build:back" });

  onProgress?.({ phase: "package", message: "Empacotando a nova versão…" });
  const desktopPath = path.join(repoPath, "apps", "desktop");
  await run(npmCommand(), ["run", "prepare:build-info"], { cwd: desktopPath, label: "build-info" });
  await run(npxCommand(), ["--yes", "electron-builder", "--dir", "--config", "electron-builder.yml"], {
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
