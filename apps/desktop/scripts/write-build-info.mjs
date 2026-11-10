import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
let commit = "unknown";
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
} catch {
  // Empacotamento fora de um clone Git: mantém "unknown".
}
writeFileSync(
  join(root, "electron", "build-info.json"),
  `${JSON.stringify({ commit, builtAt: new Date().toISOString() }, null, 2)}\n`,
);
