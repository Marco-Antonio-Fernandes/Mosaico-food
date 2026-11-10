const { app } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const DEFAULT_LOCAL_PORT = Number(process.env.MOSAICO_LOCAL_PORT || 31415);
let localPort = DEFAULT_LOCAL_PORT;
let backendProcess = null;
let localBackendStarted = false;
let localBackendError = null;

function backendRoot() {
  if (!app.isPackaged) {
    return process.env.MOSAICO_LOCAL_BACKEND_ROOT || path.resolve(__dirname, "../../../local-backend");
  }
  return path.join(process.resourcesPath, "backend");
}

function readBackendEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function backendEnv(root) {
  const home = app.getPath("home");
  const candidates = [
    process.env.MOSAICO_BACKEND_ENV_FILE,
    path.join(root, ".env"),
    path.join(home, "Documentos", "Mosaico Food", "local-backend", ".env"),
    path.join(home, "Documents", "Mosaico Food", "local-backend", ".env"),
    path.join(home, "Documentos", "mosaico-back", ".env"),
    path.join(home, "Documents", "mosaico-back", ".env"),
  ].filter(Boolean);
  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  return filePath ? readBackendEnvFile(filePath) : {};
}

function nodeRuntimes() {
  // The Electron executable inside an AppImage can launch the UI correctly
  // but hang when it is reused as `node` through ELECTRON_RUN_AS_NODE. The
  // local Prisma migration and backend must prefer a real system Node runtime.
  return [...new Set([process.env.MOSAICO_NODE_BIN, "node", process.execPath].filter(Boolean))];
}

function localDatabasePath() {
  const dataDirectory = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDirectory, { recursive: true });
  const databasePath = path.join(dataDirectory, "mosaico.sqlite");
  const legacyDirectory = process.env.MOSAICO_LEGACY_USER_DATA_DIR
    ? path.join(process.env.MOSAICO_LEGACY_USER_DATA_DIR, "data")
    : null;
  const legacyPath = legacyDirectory ? path.join(legacyDirectory, "mosaico.sqlite") : null;
  if (!fs.existsSync(databasePath) && legacyPath && fs.existsSync(legacyPath)) {
    fs.copyFileSync(legacyPath, databasePath);
    for (const suffix of ["-wal", "-shm"]) {
      const legacySidecar = `${legacyPath}${suffix}`;
      if (fs.existsSync(legacySidecar)) fs.copyFileSync(legacySidecar, `${databasePath}${suffix}`);
    }
    console.log("[Mosaico Food] Banco local antigo migrado para a pasta persistente.");
  }
  return databasePath;
}

function runNodeScript(script, args, environment, cwd) {
  const runtimes = nodeRuntimes();
  const run = (runtime, index = 0) => new Promise((resolve, reject) => {
    // The packaged Electron binary is the first runtime. A system Node is a
    // fallback for Linux installations where ELECTRON_RUN_AS_NODE is blocked.
    const child = spawn(runtime, [script, ...args], {
      cwd,
      env: { ...process.env, ...(runtime === process.execPath ? { ELECTRON_RUN_AS_NODE: "1" } : {}), ...environment },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", (error) => {
      if (index + 1 < runtimes.length) {
        run(runtimes[index + 1], index + 1).then(resolve, reject);
        return;
      }
      reject(error);
    });
    child.once("close", (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      if (index + 1 < runtimes.length) {
        run(runtimes[index + 1], index + 1).then(resolve, reject);
        return;
      }
      reject(new Error(output || `Processo terminou com código ${code}.`));
    });
  });
  return run(runtimes[0]);
}

async function prepareDatabase(root, databaseUrl) {
  const databaseFile = databaseUrl.replace(/^file:/, "");
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  const schema = path.join(root, "prisma", "schema.prisma");
  if (!fs.existsSync(prismaCli) || !fs.existsSync(schema)) {
    throw new Error("O instalador não contém o schema local do banco.");
  }

  const pushArgs = ["db", "push", "--schema", schema, "--skip-generate"];
  const environment = {
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl,
  };
  try {
    await runNodeScript(prismaCli, pushArgs, environment, root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    // Bancos locais criados antes do controle de caixa não têm activeKey.
    // O Prisma classifica a criação do índice único como possível perda de
    // dados, mesmo quando a coluna ainda não existe e todos os registros
    // preservam seus valores. Faça backup e aceite somente essa alteração.
    if (!/activeKey/.test(message) || !/accept-data-loss/.test(message)) throw error;

    const backupPath = `${databaseFile}.antes-do-ajuste-${new Date().toISOString().replace(/[.:]/g, "-")}`;
    fs.copyFileSync(databaseFile, backupPath);
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${databaseFile}${suffix}`;
      if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, `${backupPath}${suffix}`);
    }
    console.warn(`[Mosaico Food] Banco local respaldado em ${backupPath}. Aplicando a compatibilidade do controle de caixa.`);
    await runNodeScript(prismaCli, [...pushArgs, "--accept-data-loss"], environment, root);
  }
}

function waitForHealth(port, child, timeoutMs = 30_000) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const check = () => {
      if (child.exitCode !== null) {
        finish(false);
        return;
      }
      const request = http.get({ hostname: "127.0.0.1", port, path: "/api/health", timeout: 1000 }, (response) => {
        response.resume();
        response.once("end", () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
            finish(true);
            return;
          }
          retry();
        });
      });
      request.once("error", retry);
      request.once("timeout", () => request.destroy());
    };
    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) finish(false);
      else setTimeout(check, 250);
    };
    check();
  });
}

function probeHealth(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: "/api/health", timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.once("end", () => {
        let payload = null;
        try {
          payload = JSON.parse(body);
        } catch {
          // A porta pode estar ocupada por outro serviço.
        }
        resolve({ statusCode: response.statusCode ?? 0, payload });
      });
    });
    request.once("error", () => resolve(null));
    request.once("timeout", () => request.destroy());
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    const finish = (available) => {
      server.removeAllListeners();
      resolve(available);
    };
    server.once("error", () => finish(false));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => finish(true));
    });
  });
}

async function chooseLocalPort() {
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = DEFAULT_LOCAL_PORT + offset;
    if (await isPortAvailable(candidate)) return candidate;
  }
  return null;
}

function compactError(error) {
  const message = error instanceof Error ? error.message : String(error || "Erro desconhecido");
  return message.replace(/\s+/g, " ").trim().slice(-600);
}

function spawnBackend(root, entry, databaseUrl, runtime) {
  return spawn(runtime, [entry], {
    cwd: root,
    env: {
      ...process.env,
      ...backendEnv(root),
      ...(runtime === process.execPath ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      NODE_ENV: "development",
      PORT: String(localPort),
      HOST: "127.0.0.1",
      DATABASE_URL: databaseUrl,
      CORS_ORIGIN: "",
      MOSAICO_RELAY_ONLY: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function startLocalBackend() {
  localBackendError = null;
  localPort = DEFAULT_LOCAL_PORT;

  // Permite que uma janela aberta durante uma atualização/reabertura reutilize
  // o backend Mosaico que já está na porta, em vez de tratá-lo como falha.
  const existingBackend = await probeHealth(localPort, 1500);
  if (existingBackend?.payload?.data?.service === "mosaico-back") {
    localBackendStarted = true;
    console.log(`[Mosaico Food] Backend local existente reutilizado em http://127.0.0.1:${localPort}.`);
    return true;
  }

  const availablePort = await chooseLocalPort();
  if (!availablePort) {
    localBackendError = `Nenhuma porta local disponível entre ${DEFAULT_LOCAL_PORT} e ${DEFAULT_LOCAL_PORT + 19}.`;
    return false;
  }
  localPort = availablePort;
  if (localPort !== DEFAULT_LOCAL_PORT) {
    console.warn(`[Mosaico Food] A porta ${DEFAULT_LOCAL_PORT} está ocupada; usando ${localPort}.`);
  }

  const root = backendRoot();
  if (!root) {
    localBackendError = "Pasta do backend local não foi encontrada.";
    return false;
  }

  const entry = path.join(root, "dist", "main.js");
  if (!fs.existsSync(entry)) {
    localBackendError = `Arquivo do backend local não encontrado: ${entry}`;
    console.warn(`[Mosaico Food] ${localBackendError}`);
    return false;
  }

  const databaseUrl = `file:${localDatabasePath()}`;
  try {
    await prepareDatabase(root, databaseUrl);
  } catch (error) {
    localBackendError = `Não foi possível preparar o banco local: ${compactError(error)}`;
    console.error(`[Mosaico Food] ${localBackendError}`);
    return false;
  }

  const runtimes = nodeRuntimes();
  for (const runtime of runtimes) {
    let startupOutput = "";
    try {
      backendProcess = spawnBackend(root, entry, databaseUrl, runtime);
      backendProcess.once("error", (error) => console.error(`[Mosaico local] Falha ao iniciar o backend com ${runtime}: ${error.message}`));
      backendProcess.stdout.on("data", (chunk) => {
        startupOutput += chunk.toString();
        console.log(`[Mosaico local] ${chunk.toString().trim()}`);
      });
      backendProcess.stderr.on("data", (chunk) => {
        startupOutput += chunk.toString();
        console.error(`[Mosaico local] ${chunk.toString().trim()}`);
      });
      backendProcess.once("exit", (code, signal) => {
        localBackendStarted = false;
        if (code !== 0 && !localBackendError) localBackendError = `Backend local encerrou (${code ?? signal ?? "desconhecido"}).`;
        console.error(`[Mosaico local] Backend encerrado (${code ?? signal ?? "desconhecido"}).`);
      });

      localBackendStarted = await waitForHealth(localPort, backendProcess);
      if (localBackendStarted) {
        localBackendError = null;
        return true;
      }
      const failedRuntime = runtime === process.execPath ? "Electron" : runtime;
      const detail = compactError(startupOutput);
      localBackendError = `Backend local não respondeu pela porta ${localPort} usando ${failedRuntime}.${detail ? ` ${detail}` : ""}`;
      if (backendProcess && !backendProcess.killed) backendProcess.kill();
      backendProcess = null;
    } catch (error) {
      localBackendError = `Falha ao iniciar backend local: ${compactError(error)}`;
      if (backendProcess && !backendProcess.killed) backendProcess.kill();
      backendProcess = null;
    }
  }
  return false;
}

function stopLocalBackend() {
  if (!backendProcess || backendProcess.killed) return;
  backendProcess.kill();
  backendProcess = null;
  localBackendStarted = false;
}

async function createNewLocalDatabase() {
  if (!backendProcess || backendProcess.killed) {
    throw new Error("Feche a outra janela do Mosaico Food antes de criar um novo banco.");
  }
  const databasePath = localDatabasePath();
  const processToStop = backendProcess;
  stopLocalBackend();
  if (processToStop && processToStop.exitCode === null) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      processToStop.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = `${databasePath}.antes-do-novo-banco-${timestamp}`;
  const archivedFiles = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    const currentPath = `${databasePath}${suffix}`;
    if (!fs.existsSync(currentPath)) continue;
    const targetPath = `${archivePath}${suffix}`;
    fs.renameSync(currentPath, targetPath);
    archivedFiles.push(targetPath);
  }
  fs.closeSync(fs.openSync(databasePath, "a"));
  const started = await startLocalBackend();
  if (!started) throw new Error("O banco novo foi criado, mas o backend local não voltou a iniciar.");
  return { archivePath: archivedFiles[0] ?? null };
}

function getBackendUrl() {
  return localBackendStarted ? `http://127.0.0.1:${localPort}` : null;
}

function getBackendDiagnostic() {
  return {
    running: localBackendStarted,
    url: getBackendUrl(),
    error: localBackendError,
  };
}

module.exports = { createNewLocalDatabase, getBackendDiagnostic, getBackendUrl, startLocalBackend, stopLocalBackend };
