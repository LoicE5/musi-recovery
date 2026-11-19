import { lstat, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

export const toolsDir = join(import.meta.dir, ".tools");
export const windowsIpatoolVersion = "2.8.1";
const ipatoolExecutableHashes = {
  "windows-amd64": "1c8145d4b39ff993ebce7cf832d5504ed563cc1526bb21ef5cef27d28aceb2dd",
  "linux-amd64": "ea99060f13b4b92bb26241bc91a1ee4e18d2819ad79a966da531996708a2b31d",
  "linux-arm64": "61c0ddcef9edb229b5fdda926cec1d992cee1e7cb5bea096747353438715ddd3",
};
const windowsUsbHash = "2a9b350e277823ee335ea3a181dff1fefdfd171f7851ff5f61e2180a12491ba3";

export async function sha256File(path: string) {
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifiedIpatool(os: "linux" | "win32", arch: string, directory: string) {
  const platform = `${os === "win32" ? "windows" : os}-${arch === "x64" ? "amd64" : arch}`;
  const expected = ipatoolExecutableHashes[platform as keyof typeof ipatoolExecutableHashes];
  const name = os === "win32" ? "ipatool.exe" : "ipatool";
  const executable = join(directory, name);
  try {
    if (!expected || !(await lstat(directory)).isDirectory()) return;
    if (os === "win32" && (await readdir(directory)).some(entry => entry !== name)) return;
    if ((await lstat(executable)).isFile() && await sha256File(executable) === expected) return executable;
  } catch {
    // Missing and unreadable files both require setup to restore the pinned tool.
  }
}

export async function verifiedWindowsUsb(directory = join(toolsDir, "usb")) {
  try {
    if (!(await lstat(directory)).isDirectory()) return false;
    const bundle = new Bun.CryptoHasher("sha256");
    // The release is flat. Hash every sorted filename and its digest, including DLLs.
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name);
      if (!(await lstat(path)).isFile()) return false;
      bundle.update(`${name}\0${await sha256File(path)}\n`);
    }
    return bundle.digest("hex") === windowsUsbHash;
  } catch {
    return false;
  }
}

export async function findTool(name: string) {
  const os = process.platform;
  if (os === "win32") {
    if (name === "7z") {
      const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles || "C:\\Program Files";
      if (isAbsolute(programFiles)) return Bun.which(join(programFiles, "7-Zip", "7z.exe"));
    }
    if (name === "ipatool") return verifiedIpatool(os, process.arch, join(toolsDir, "ipatool"));
    if ((name === "idevice_id" || name === "ideviceinstaller") && await verifiedWindowsUsb()) {
      return join(toolsDir, "usb", `${name}.exe`);
    }
    return;
  }

  const directories = ["/opt/homebrew/bin", "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin"];
  for (const executable of name === "7z" ? [name, "7zz"] : [name]) {
    const installed = Bun.which(executable);
    if (installed) {
      const fromTools = relative(toolsDir, installed);
      if (fromTools === ".." || fromTools.startsWith(`..${sep}`)) return installed;
    }
    for (const directory of directories) {
      const systemTool = Bun.which(join(directory, executable));
      if (systemTool) return systemTool;
    }
  }
  if (os === "linux" && name === "ipatool") {
    return verifiedIpatool(os, process.arch, join(toolsDir, "ipatool"));
  }
}

export async function requireTool(name: string) {
  const tool = await findTool(name);
  if (!tool) throw new Error(`Missing or changed ${name}. Run: bun setup.ts`);
  return tool;
}

export function installerCommand(help: string) {
  if (/^\s*install PATH\b/m.test(help)) return "install";
  if (/^\s*-i,\s*--install\b/m.test(help)) return "--install";
  throw new Error("Unsupported ideviceinstaller. Run bun setup.ts or upgrade ideviceinstaller.");
}

export async function checkTool(name: string, path?: string) {
  path ??= await findTool(name) ?? undefined;
  if (!path) return false;
  const args = name === "7z" ? ["i"] : name === "unzip" ? ["-v"] :
    name === "ipatool" ? ["--version"] : ["--help"];
  try {
    const child = Bun.spawn([path, ...args], {
      stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 10_000,
      cwd: process.platform === "win32" ? dirname(path) : undefined,
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ]);
    if (code !== 0) return false;
    if (process.platform === "win32" && name === "ipatool") {
      return stdout.trim().match(/^ipatool version v?(\S+)$/)?.[1] === windowsIpatoolVersion;
    }
    if (name === "ideviceinstaller") installerCommand(stdout + stderr);
    return true;
  } catch {
    return false;
  }
}
