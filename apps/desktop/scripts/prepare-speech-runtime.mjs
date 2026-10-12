import { chmodSync, copyFileSync, createWriteStream, mkdirSync, statSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";

const root = fileURLToPath(new URL("../electron/speech-runtime/", import.meta.url));
const platform = process.env.MOSAICO_TARGET_PLATFORM || process.platform;
const arch = process.env.MOSAICO_TARGET_ARCH || process.arch;
const platformDirectory = join(root, `${platform}-${arch}`);
const modelDirectory = join(root, "models");
const modelPath = join(modelDirectory, "ggml-base.bin");
const legacyModelPath = join(modelDirectory, "ggml-tiny.bin");
const serverName = platform === "win32" ? "whisper-server.exe" : "whisper-server";
const serverPath = join(platformDirectory, serverName);
const modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin?download=true";

function requireSupportedTarget() {
  if (!((platform === "linux" || platform === "win32") && (arch === "x64" || arch === "arm64"))) {
    throw new Error(`Plataforma de voz não preparada: ${platform}-${arch}. Use Linux/Windows x64 ou arm64.`);
  }
}

function validFile(filePath) {
  try {
    return statSync(filePath).isFile() && statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

function copyConfiguredServer() {
  const configuredServer = process.env.MOSAICO_WHISPER_SERVER;
  if (!configuredServer) return;
  const source = resolve(configuredServer);
  if (!validFile(source)) throw new Error(`MOSAICO_WHISPER_SERVER não aponta para um executável: ${source}`);
  mkdirSync(platformDirectory, { recursive: true });
  copyFileSync(source, serverPath);
  if (platform !== "win32") {
    try { chmodSync(serverPath, 0o755); } catch { /* o pacote pode estar em modo somente leitura */ }
  }
}

async function downloadModel() {
  if (validFile(modelPath)) {
    if (validFile(legacyModelPath)) {
      try { unlinkSync(legacyModelPath); } catch { /* arquivo antigo pode estar em uso */ }
    }
    return;
  }
  mkdirSync(modelDirectory, { recursive: true });
  try {
    const response = await fetch(modelUrl, { redirect: "follow" });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    await new Promise((resolvePromise, rejectPromise) => {
      const file = createWriteStream(modelPath);
      file.once("finish", resolvePromise);
      const fail = (error) => {
        try { unlinkSync(modelPath); } catch { /* arquivo parcial não é necessário */ }
        rejectPromise(error);
      };
      file.once("error", fail);
      Readable.fromWeb(response.body).once("error", fail).pipe(file);
    });
    if (validFile(legacyModelPath)) {
      try { unlinkSync(legacyModelPath); } catch { /* arquivo antigo pode estar em uso */ }
    }
  } catch (error) {
    if (validFile(legacyModelPath)) {
      console.warn(`Modelo base indisponível; usando o modelo tiny existente. Motivo: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    throw error;
  }
}

async function main() {
  requireSupportedTarget();
  copyConfiguredServer();
  if (!validFile(serverPath)) {
    throw new Error(`Executável Whisper ausente em ${serverPath}. Compile whisper.cpp para ${platform}-${arch} ou informe MOSAICO_WHISPER_SERVER antes de empacotar.`);
  }
  await downloadModel();
  console.log(`Motor de voz pronto: ${platform}-${arch}`);
}

await main();
