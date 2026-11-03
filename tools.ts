import { join } from "node:path";

export const toolsDir = join(import.meta.dir, ".tools");

export function findTool(name: string) {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  for (const directory of [toolsDir, join(toolsDir, "ipatool"), join(toolsDir, "usb")]) {
    const local = Bun.which(join(directory, executable));
    if (local) return local;
  }
  const installed = Bun.which(name);
  if (installed) return installed;
  if (process.platform === "win32" && name === "7z") {
    return Bun.which(join(process.env.ProgramFiles || "C:\\Program Files", "7-Zip", "7z.exe"));
  }
  if (process.platform !== "win32") {
    for (const directory of ["/opt/homebrew/bin", "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin"]) {
      const installed = Bun.which(join(directory, name));
      if (installed) return installed;
    }
  }
}

export function requireTool(name: string) {
  const tool = findTool(name);
  if (!tool) throw new Error(`Missing ${name}. Run: bun setup.ts`);
  return tool;
}

export function installerCommand(help: string) {
  if (/^\s*install PATH\b/m.test(help)) return "install";
  if (/^\s*-i,\s*--install\b/m.test(help)) return "--install";
  throw new Error("Unsupported ideviceinstaller. Run bun setup.ts or upgrade ideviceinstaller.");
}

export async function checkTool(name: string, path = findTool(name)) {
  if (!path) return false;
  const args = name === "7z" ? ["i"] : name === "unzip" ? ["-v"] :
    name === "ipatool" ? ["--version"] : ["--help"];
  try {
    const child = Bun.spawn([path, ...args], {
      stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 10_000,
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ]);
    if (code !== 0) return false;
    if (name === "ideviceinstaller") installerCommand(stdout + stderr);
    return true;
  } catch {
    return false;
  }
}
