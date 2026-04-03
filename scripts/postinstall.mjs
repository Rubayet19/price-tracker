import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);

async function main() {
  try {
    const chromiumResolvedPath = import.meta.resolve("@sparticuz/chromium");
    const chromiumPath = chromiumResolvedPath.replace(/^file:\/\//, "");
    const chromiumDir = dirname(dirname(dirname(chromiumPath)));
    const binDir = join(chromiumDir, "bin");

    if (!existsSync(binDir)) {
      console.log("Chromium bin directory not found; skipping archive creation");
      return;
    }

    const publicDir = join(projectRoot, "public");
    const outputPath = join(publicDir, "chromium-pack.tar");

    execSync(`mkdir -p "${publicDir}" && tar -cf "${outputPath}" -C "${binDir}" .`, {
      stdio: "inherit",
      cwd: projectRoot,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown postinstall error";
    console.error("Failed to package Chromium for Vercel:", message);
    process.exit(0);
  }
}

await main();
