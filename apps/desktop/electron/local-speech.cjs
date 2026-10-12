const { app } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const SPEECH_PORT = Number(process.env.MOSAICO_SPEECH_PORT || 8787);
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
let speechProcess = null;
let speechStarted = false;
let startPromise = null;

function speechRoot() {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "speech")
    : process.env.MOSAICO_LOCAL_SPEECH_ROOT || path.join(__dirname, "speech-runtime");
  const platformRoot = path.join(root, `${process.platform}-${process.arch}`);
  return [platformRoot, root];
}

function findRuntimeFile(names) {
  for (const root of speechRoot()) {
    for (const name of names) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function waitForPort(port, timeoutMs = 45_000) {
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

async function startLocalSpeech() {
  if (speechStarted) return true;
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const executable = findRuntimeFile(process.platform === "win32"
      ? ["whisper-server.exe", "whisper-whisper-server.exe", "whisper-server", "whisper-whisper-server"]
      : ["whisper-server", "whisper-whisper-server"]);
    const model = findRuntimeFile(["models/ggml-base.bin", "ggml-base.bin", "models/ggml-tiny.bin", "ggml-tiny.bin"]);
    if (!executable || !model) {
      console.warn("[Mosaico Food] Motor local de voz não foi incluído no instalador.");
      return false;
    }
    if (process.platform !== "win32") {
      try { fs.chmodSync(executable, 0o755); } catch { /* o pacote pode estar em modo somente leitura */ }
    }

    speechProcess = spawn(executable, [
      "--model", model,
      "--host", "127.0.0.1",
      "--port", String(SPEECH_PORT),
      "--language", "pt",
      "--threads", "2",
      "--no-gpu",
      "--no-timestamps",
    ], {
      cwd: path.dirname(executable),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    speechProcess.stdout.on("data", (chunk) => console.log(`[Mosaico voz] ${chunk.toString().trim()}`));
    speechProcess.stderr.on("data", (chunk) => console.error(`[Mosaico voz] ${chunk.toString().trim()}`));
    speechProcess.once("exit", () => { speechStarted = false; speechProcess = null; });

    speechStarted = await waitForPort(SPEECH_PORT);
    if (!speechStarted) {
      speechProcess.kill();
      speechProcess = null;
    }
    return speechStarted;
  })().finally(() => { startPromise = null; });

  return startPromise;
}

async function transcribeAudio(audio, mimeType = "audio/wav", prompt = "") {
  if (ArrayBuffer.isView(audio)) {
    audio = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
  }
  if (!(audio instanceof ArrayBuffer) || audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
    return { available: true, text: null, understood: false };
  }
  if (!await startLocalSpeech()) return { available: false, text: null, understood: false };

  const form = new FormData();
  form.append("file", new Blob([audio], { type: mimeType }), "mosaico-audio.wav");
  form.append("language", "pt");
  form.append("temperature", "0");
  if (prompt) form.append("prompt", prompt.slice(0, 4000));
  form.append("response_format", "json");
  try {
    const response = await fetch(`http://127.0.0.1:${SPEECH_PORT}/inference`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    const payload = await response.json().catch(() => null);
    const text = payload && typeof payload.text === "string" ? payload.text.trim() : "";
    return { available: true, text: text || null, understood: Boolean(text) };
  } catch {
    return { available: true, text: null, understood: false };
  }
}

function stopLocalSpeech() {
  if (!speechProcess || speechProcess.killed) return;
  speechProcess.kill();
  speechProcess = null;
  speechStarted = false;
}

module.exports = { startLocalSpeech, stopLocalSpeech, transcribeAudio };
