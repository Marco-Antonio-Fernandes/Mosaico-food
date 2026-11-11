const { app } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const INTERPRETER_PORT = Number(process.env.MOSAICO_INTERPRETER_PORT || 8788);
const MAX_TEXT_LENGTH = 12_000;
let interpreterProcess = null;
let interpreterStarted = false;
let startPromise = null;
let idleTimer = null;
const INTERPRETER_IDLE_MS = Number(process.env.MOSAICO_INTERPRETER_IDLE_MS || 120_000);

function scheduleInterpreterIdleStop() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (interpreterProcess) {
      console.log("[Mosaico interpretação] Interpretador parado por inatividade para liberar memória.");
      stopLocalInterpreter();
    }
  }, INTERPRETER_IDLE_MS);
}

function interpreterRoot() {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "interpreter")
    : process.env.MOSAICO_LOCAL_INTERPRETER_ROOT || path.join(__dirname, "interpreter-runtime");
  const platformRoot = path.join(root, `${process.platform}-${process.arch}`);
  return [platformRoot, root];
}

function findRuntimeFile(names) {
  for (const root of interpreterRoot()) {
    for (const name of names) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function waitForPort(port, timeoutMs = 45_000) {
  const startedAt = Date.now();
  return new Promise(resolve => {
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

async function startLocalInterpreter() {
  if (interpreterStarted) return true;
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const executable = findRuntimeFile(process.platform === "win32"
      ? ["llama-server.exe", "llama-server"]
      : ["llama-server"]);
    const model = findRuntimeFile([
      "models/Qwen3-1.7B-Q8_0.gguf",
      "Qwen3-1.7B-Q8_0.gguf",
    ]);
    if (!executable || !model) {
      console.warn("[Mosaico Food] Interpretador local não foi incluído no instalador.");
      return false;
    }
    if (process.platform !== "win32") {
      try { fs.chmodSync(executable, 0o755); } catch { /* o pacote pode estar em modo somente leitura */ }
    }

    interpreterProcess = spawn(executable, [
      "--model", model,
      "--host", "127.0.0.1",
      "--port", String(INTERPRETER_PORT),
      "--ctx-size", "4096",
      "--threads", String(Math.max(1, Math.min(4, Number(process.env.MOSAICO_INTERPRETER_THREADS || 2)))),
      "--n-gpu-layers", "0",
    ], {
      cwd: path.dirname(executable),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    interpreterProcess.stdout.on("data", chunk => console.log(`[Mosaico interpretação] ${chunk.toString().trim()}`));
    interpreterProcess.stderr.on("data", chunk => console.error(`[Mosaico interpretação] ${chunk.toString().trim()}`));
    interpreterProcess.once("exit", () => { interpreterStarted = false; interpreterProcess = null; });

    interpreterStarted = await waitForPort(INTERPRETER_PORT);
    if (!interpreterStarted) {
      interpreterProcess.kill();
      interpreterProcess = null;
    }
    return interpreterStarted;
  })().finally(() => { startPromise = null; });

  return startPromise;
}

function catalogText(products) {
  return products
    .filter(product => product && typeof product.name === "string")
    .slice(0, 500)
    .map(product => {
      const aliases = Array.isArray(product.aliases) ? product.aliases.filter(alias => typeof alias === "string") : [];
      return `- ${product.name}${aliases.length ? ` (apelidos: ${aliases.join(", ")})` : ""}`;
    })
    .join("\n");
}

function operationToCommand(operation) {
  const quantity = Number(operation.quantity);
  const product = String(operation.product || "").trim();
  if (!product || !Number.isInteger(quantity) || quantity <= 0) return null;

  if (operation.action === "sale") {
    const total = Number(operation.totalCents);
    return operation.totalKnown === true && Number.isInteger(total) && total >= 0
      ? `vendi ${quantity} ${product} por ${(total / 100).toFixed(2).replace(".", ",")} reais`
      : `vendi ${quantity} ${product}`;
  }
  if (operation.action === "prepare") return `preparei ${quantity} ${product}`;
  if (operation.action === "receive_ready") return `adicionei ${quantity} ${product} pronto`;
  if (operation.action === "receive_unprepared") return `adicionei ${quantity} ${product} para preparar`;
  if (operation.action === "loss") return `dei baixa em ${quantity} ${product} como perda`;
  return null;
}

async function interpretFoodText(text, products = []) {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT_LENGTH) {
    return { available: true, text: null, understood: false };
  }
  if (!await startLocalInterpreter()) return { available: false, text: null, understood: false };

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      operations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["sale", "prepare", "receive_ready", "receive_unprepared", "loss"] },
            product: { type: "string" },
            quantity: { type: "integer", minimum: 1 },
            totalCents: { type: "integer", minimum: 0 },
            totalKnown: { type: "boolean" },
          },
          required: ["action", "product", "quantity", "totalCents", "totalKnown"],
        },
      },
    },
    required: ["operations"],
  };
  const system = [
    "Você interpreta comandos de estoque de uma loja brasileira.",
    "Responda somente com JSON conforme o schema.",
    "Não invente produtos: use exatamente o nome do catálogo mais próximo.",
    "vendi, venda, vendei, rendi e mendi significam sale.",
    "assei, assar, fritei, fritar e preparei significam prepare: é algo que estava para preparar.",
    "comprei ou adicionei pronto significam receive_ready.",
    "comprei para assar, fritar, preparar, congelado ou cru significam receive_unprepared.",
    "perdi, descartei, venceu, sobrou ou dei baixa significam loss.",
    "Se houver várias ações, retorne todas na ordem falada.",
    "Se a frase estiver incompleta, retorne operations vazio.",
    "Catálogo atual:\n" + catalogText(products),
  ].join("\n");

  try {
    const response = await fetch(`http://127.0.0.1:${INTERPRETER_PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "Qwen3-1.7B-Q8_0.gguf",
        temperature: 0,
        max_tokens: 700,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${text.trim()}\n/no_think` },
        ],
        response_format: { type: "json_object", schema },
        chat_template_kwargs: { enable_thinking: false },
        reasoning_effort: "none",
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const payload = await response.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    if (!response.ok || typeof content !== "string") return { available: true, text: null, understood: false };
    const parsed = JSON.parse(content);
    const commands = Array.isArray(parsed.operations) ? parsed.operations.map(operationToCommand).filter(Boolean) : [];
    return { available: true, text: commands.length ? commands.join(", ") : null, understood: commands.length > 0 };
  } catch (error) {
    console.error(`[Mosaico interpretação] Falha ao interpretar: ${error instanceof Error ? error.message : String(error)}`);
    return { available: true, text: null, understood: false };
  } finally {
    scheduleInterpreterIdleStop();
  }
}

function stopLocalInterpreter() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!interpreterProcess || interpreterProcess.killed) return;
  interpreterProcess.kill();
  interpreterProcess = null;
  interpreterStarted = false;
}

module.exports = { startLocalInterpreter, stopLocalInterpreter, interpretFoodText };
