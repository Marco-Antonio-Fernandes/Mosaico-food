const { app } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const LOCAL_PORT = Number(process.env.MOSAICO_LOCAL_PORT || 31415);
let backendProcess = null;
let localBackendStarted = false;

function backendRoot() {
  if (!app.isPackaged) return process.env.MOSAICO_LOCAL_BACKEND_ROOT || null;
  return path.join(process.resourcesPath, "backend");
}

function localDatabasePath() {
  const dataDirectory = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDirectory, { recursive: true });
  return path.join(dataDirectory, "mosaico.sqlite");
}

function runNodeScript(script, args, environment, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...environment },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(output) : reject(new Error(output || `Processo terminou com código ${code}.`)));
  });
}

async function prepareDatabase(root, databaseUrl) {
  const databaseFile = databaseUrl.replace(/^file:/, "");
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  const schema = path.join(root, "prisma", "schema.prisma");
  if (!fs.existsSync(prismaCli) || !fs.existsSync(schema)) {
    throw new Error("O instalador não contém o schema local do banco.");
  }

  await runNodeScript(prismaCli, ["db", "push", "--schema", schema, "--skip-generate"], {
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl,
  }, root);
}

function waitForPort(port, timeoutMs = 30_000) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) resolve(false);
        else setTimeout(check, 250);
      });
    };
    check();
  });
}

async function startLocalBackend() {
  if (!app.isPackaged && process.env.MOSAICO_USE_LOCAL_BACKEND !== "1") return false;
  const root = backendRoot();
  if (!root) return false;

  const entry = path.join(root, "dist", "main.js");
  if (!fs.existsSync(entry)) {
    console.warn("[Mosaico Food] Backend local não empacotado; usando a URL configurada.");
    return false;
  }

  const databaseUrl = `file:${localDatabasePath()}`;
  try {
    await prepareDatabase(root, databaseUrl);
  } catch (error) {
    console.error("[Mosaico Food] Não foi possível preparar o banco local.", error);
    return false;
  }

  backendProcess = spawn(process.execPath, [entry], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "development",
      PORT: String(LOCAL_PORT),
      HOST: "127.0.0.1",
      DATABASE_URL: databaseUrl,
      CORS_ORIGIN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  backendProcess.once("error", (error) => console.error(`[Mosaico local] Falha ao iniciar o backend: ${error.message}`));
  backendProcess.stdout.on("data", (chunk) => console.log(`[Mosaico local] ${chunk.toString().trim()}`));
  backendProcess.stderr.on("data", (chunk) => console.error(`[Mosaico local] ${chunk.toString().trim()}`));
  backendProcess.once("exit", (code, signal) => {
    localBackendStarted = false;
    console.error(`[Mosaico local] Backend encerrado (${code ?? signal ?? "desconhecido"}).`);
  });

  localBackendStarted = await waitForPort(LOCAL_PORT);
  if (!localBackendStarted) {
    backendProcess.kill();
    backendProcess = null;
  }
  return localBackendStarted;
}

function stopLocalBackend() {
  if (!backendProcess || backendProcess.killed) return;
  backendProcess.kill();
  backendProcess = null;
  localBackendStarted = false;
}

function getBackendUrl(fallbackUrl) {
  return localBackendStarted ? `http://127.0.0.1:${LOCAL_PORT}` : fallbackUrl;
}

module.exports = { getBackendUrl, startLocalBackend, stopLocalBackend };
