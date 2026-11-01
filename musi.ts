import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

function findTool(name: string) {
  const installed = Bun.which(name);
  if (installed) return installed;
  if (process.platform !== "win32") return;
  const local = join(import.meta.dir, `${name}.exe`);
  if (existsSync(local)) return local;
  if (name === "7z") {
    const sevenZip = join(process.env.ProgramFiles || "C:\\Program Files", "7-Zip", "7z.exe");
    if (existsSync(sevenZip)) return sevenZip;
  }
}

function requireTool(name: string) {
  const tool = findTool(name);
  if (!tool) throw new Error(`Missing ${name}. See README.md > Dependencies.`);
  return tool;
}

function run(command: string, ...args: string[]) {
  return Bun.spawn([command, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).exited;
}

async function main() {
  const args = Bun.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(`Usage:
  bun musi.ts          Download Musi to Musi.ipa
  bun musi.ts install  Install Musi.ipa on one USB-connected iPhone
  bun musi.ts --help   Show this help

Run from the folder where you want to save or install Musi.ipa.`);
    return;
  }
  if (args.length > 1 || (args.length === 1 && args[0] !== "install")) {
    throw new Error("Unknown arguments. Run: bun musi.ts --help");
  }
  if (args[0] === "install") {
    if (!existsSync("Musi.ipa")) throw new Error("Missing Musi.ipa. Run: bun musi.ts");
    const deviceId = requireTool("idevice_id");
    const installer = requireTool("ideviceinstaller");
    const help = await $`${installer} --help 2>${Bun.stderr}`.text();
    const modern = /^\s*install PATH\b/m.test(help);
    if (!modern && !/^\s*-i,\s*--install\b/m.test(help)) {
      throw new Error("Unsupported ideviceinstaller. See README.md > Dependencies.");
    }

    console.log("Connect your iPhone by USB, unlock it, and trust this computer.");
    const devices = (await $`${deviceId} --list 2>${Bun.stderr}`.text())
      .trim().split(/\s+/).filter(Boolean);
    if (devices.length !== 1) {
      throw new Error(`Expected exactly one USB device; found ${devices.length}. Connect only your iPhone and retry.`);
    }
    await $`${installer} --udid ${devices[0]} ${modern ? "install" : "--install"} Musi.ipa`;
    console.log("Installation finished. Open Musi on your iPhone to verify it launches.");
    return;
  }

  if (existsSync("Musi.ipa")) throw new Error("Musi.ipa already exists. Move it before downloading again.");
  if (existsSync("Musi.download.ipa")) {
    throw new Error("Musi.download.ipa already exists. Move or remove it before retrying.");
  }
  const ipatool = requireTool("ipatool");
  const unzip = findTool("unzip");
  const zipTool = unzip ?? findTool("7z");
  if (!zipTool) throw new Error("Missing unzip or 7-Zip. See README.md > Dependencies.");

  console.log("Checking the active Apple ID. It must be the account that previously acquired Musi.");
  if ((await run(ipatool, "auth", "info")) !== 0) {
    const loginCode = await run(ipatool, "auth", "login");
    if (loginCode !== 0) process.exit(loginCode);
    const infoCode = await run(ipatool, "auth", "info");
    if (infoCode !== 0) process.exit(infoCode);
  }

  const code = await run(ipatool,
    "download", "--app-id", "591560124", "--platform", "iphone",
    "--output", "Musi.download.ipa",
  );
  if (code !== 0) process.exit(code);
  await $`${zipTool} ${unzip ? "-t" : "t"} Musi.download.ipa`;
  await $`mv -n Musi.download.ipa Musi.ipa`;
  if (existsSync("Musi.download.ipa")) throw new Error("Musi.ipa already exists; download kept as Musi.download.ipa.");
  console.log("Saved Musi.ipa. To install over USB, run: bun musi.ts install");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof $.ShellError ? error.exitCode : 1;
}
