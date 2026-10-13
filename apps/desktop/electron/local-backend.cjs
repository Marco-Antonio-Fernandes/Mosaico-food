const { app } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const LOCAL_PORT = Number(process.env.MOSAICO_LOCAL_PORT || 31415);
let backendProcess = null;
let localBackendStarted = false;
let localBackendError = null;

function backendRoot() {
  if (!app.isPackaged) {
    return process.env.MOSAICO_LOCAL_BACKEND_ROOT || path.resolve(__dirname, "../../../mosaico-back");
  }
  return path.join(process.resourcesPath, "backend");
}

function nodeRuntimes() {
  return [...new Set([process.env.MOSAICO_NODE_BIN || process.execPath, "node"].filter(Boolean))];
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

  await runNodeScript(prismaCli, ["db", "push", "--schema", schema, "--skip-generate"], {
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl,
  }, root);
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

function compactError(error) {
  const message = error instanceof Error ? error.message : String(error || "Erro desconhecido");
  return message.replace(/\s+/g, " ").trim().slice(-600);
}

function spawnBackend(root, entry, databaseUrl, runtime) {
  return spawn(runtime, [entry], {
    cwd: root,
    env: {
      ...process.env,
      ...(runtime === process.execPath ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      NODE_ENV: "development",
      PORT: String(LOCAL_PORT),
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
    try {
      backendProcess = spawnBackend(root, entry, databaseUrl, runtime);
      backendProcess.once("error", (error) => console.error(`[Mosaico local] Falha ao iniciar o backend com ${runtime}: ${error.message}`));
      backendProcess.stdout.on("data", (chunk) => console.log(`[Mosaico local] ${chunk.toString().trim()}`));
      backendProcess.stderr.on("data", (chunk) => console.error(`[Mosaico local] ${chunk.toString().trim()}`));
      backendProcess.once("exit", (code, signal) => {
        localBackendStarted = false;
        if (code !== 0 && !localBackendError) localBackendError = `Backend local encerrou (${code ?? signal ?? "desconhecido"}).`;
        console.error(`[Mosaico local] Backend encerrado (${code ?? signal ?? "desconhecido"}).`);
      });

      localBackendStarted = await waitForHealth(LOCAL_PORT, backendProcess);
      if (localBackendStarted) {
        localBackendError = null;
        return true;
      }
      const failedRuntime = runtime === process.execPath ? "Electron" : runtime;
      localBackendError = `Backend local não respondeu pela porta ${LOCAL_PORT} usando ${failedRuntime}.`;
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

function getBackendUrl() {
  return localBackendStarted ? `http://127.0.0.1:${LOCAL_PORT}` : null;
}

function getBackendDiagnostic() {
  return {
    running: localBackendStarted,
    url: getBackendUrl(),
    error: localBackendError,
  };
}

module.exports = { getBackendDiagnostic, getBackendUrl, startLocalBackend, stopLocalBackend };
