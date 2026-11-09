import { chmodSync, copyFileSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = fileURLToPath(new URL("../electron/interpreter-runtime/", import.meta.url));
const platform = process.env.MOSAICO_TARGET_PLATFORM || process.platform;
const arch = process.env.MOSAICO_TARGET_ARCH || process.arch;
const platformDirectory = join(root, `${platform}-${arch}`);
const modelDirectory = join(root, "models");
const modelPath = join(modelDirectory, "Qwen3-1.7B-Q8_0.gguf");
const serverName = platform === "win32" ? "llama-server.exe" : "llama-server";
const serverPath = join(platformDirectory, serverName);
const modelUrl = "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf?download=true";

function validFile(filePath) {
  try { return statSync(filePath).isFile() && statSync(filePath).size > 0; } catch { return false; }
}

function requireSupportedTarget() {
  if (!((platform === "linux" || platform === "darwin" || platform === "win32") && (arch === "x64" || arch === "arm64"))) {
    throw new Error(`Interpretador local não preparado para ${platform}-${arch}. Use Linux/macOS/Windows x64 ou arm64.`);
  }
}

function copyConfiguredServer() {
  const configuredServer = process.env.MOSAICO_LLAMA_SERVER;
  if (!configuredServer) return;
  const source = resolve(configuredServer);
  if (!validFile(source)) throw new Error(`MOSAICO_LLAMA_SERVER não aponta para um executável: ${source}`);
  mkdirSync(platformDirectory, { recursive: true });
  copyFileSync(source, serverPath);
  if (platform === "win32") {
    const sourceDirectory = resolve(source, "..");
    for (const name of readdirSync(sourceDirectory).filter((entry) => /\.dll$/i.test(entry))) {
      copyFileSync(join(sourceDirectory, name), join(platformDirectory, name));
    }
  }
  if (platform !== "win32") {
    try { chmodSync(serverPath, 0o755); } catch { /* pacote pode estar em modo somente leitura */ }
  }
}

function hasRuntimeLibraries() {
  if (platform === "win32") return true;
  try { return readdirSync(platformDirectory).some((name) => /^lib.+\.(so|dylib)(\..*)?$/.test(name)); } catch { return false; }
}

function buildServer() {
  if (platform === "win32") {
    if (!validFile(serverPath)) throw new Error("Para Windows, compile o llama-server.exe e informe MOSAICO_LLAMA_SERVER.");
    return;
  }
  const source = resolve(process.env.MOSAICO_LLAMA_CPP_DIR || "/tmp/llama.cpp");
  const build = join(source, "build-mosaico");
  const needsBuild = !validFile(serverPath) || !hasRuntimeLibraries();
  if (needsBuild && !validFile(join(source, "CMakeLists.txt"))) {
    execFileSync("git", ["clone", "--depth", "1", "https://github.com/ggml-org/llama.cpp.git", source], { stdio: "inherit" });
  }
  if (needsBuild) {
    execFileSync("cmake", ["-S", source, "-B", build, "-DCMAKE_BUILD_TYPE=Release", "-DGGML_NATIVE=OFF"], { stdio: "inherit" });
    execFileSync("cmake", ["--build", build, "--config", "Release", "--target", "llama-server", "-j2"], { stdio: "inherit" });
  }
  const candidates = [join(build, "bin", "llama-server"), join(build, "bin", "Release", "llama-server.exe")];
  // Quando o executável antigo existe, mas as bibliotecas estão faltando,
  // precisamos preferir o binário recém-compilado. Caso contrário o processo
  // pode copiar as .so novas para junto de um executável incompatível.
  const built = candidates.find(validFile) || (validFile(serverPath) ? serverPath : null);
  if (!built) throw new Error("O build terminou, mas o llama-server não foi encontrado.");
  mkdirSync(platformDirectory, { recursive: true });
  if (built !== serverPath) copyFileSync(built, serverPath);
  const libraryDirectory = join(build, "bin");
  if (platform !== "win32" && statSync(libraryDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    const libraries = readdirSync(libraryDirectory).filter((name) => /^lib.+\.(so|dylib)(\..*)?$/.test(name));
    for (const library of libraries) copyFileSync(join(libraryDirectory, library), join(platformDirectory, library));
    if (libraries.length === 0) console.warn("==> Nenhuma biblioteca dinâmica do llama.cpp foi encontrada em", libraryDirectory);
  }
  if (platform !== "win32") chmodSync(serverPath, 0o755);
}

async function downloadModel() {
  if (validFile(modelPath)) return;
  mkdirSync(modelDirectory, { recursive: true });
  console.log("==> baixando Qwen3-1.7B-Q8_0 (aproximadamente 1,83 GB)");
  const partialPath = `${modelPath}.part`;
  try {
    // curl suporta retomada por HTTP Range e várias tentativas. O fetch do
    // Node pode abortar downloads grandes quando o servidor passa alguns
    // minutos sem enviar um pacote, mesmo que a conexão ainda esteja viva.
    execFileSync("curl", [
      "--location",
      "--fail",
      "--retry", "8",
      "--retry-delay", "5",
      "--retry-all-errors",
      "--connect-timeout", "30",
      "--max-time", "0",
      "--continue-at", "-",
      "--output", partialPath,
      modelUrl,
    ], { stdio: "inherit" });

    if (!validFile(partialPath) || statSync(partialPath).size < 100_000_000) {
      throw new Error("O arquivo do modelo foi baixado incompleto.");
    }
    renameSync(partialPath, modelPath);
  } catch (error) {
    // Preserve o .part para que a próxima execução continue de onde parou.
    throw new Error(`Download do Qwen falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  }
}

requireSupportedTarget();
copyConfiguredServer();
buildServer();
await downloadModel();
console.log(`Interpretador local pronto: ${serverPath}`);
