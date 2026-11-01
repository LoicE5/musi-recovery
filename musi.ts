import { $ } from "bun";
import { existsSync } from "node:fs";

function requireTool(name: string, install: string) {
  if (!Bun.which(name)) throw new Error(`Missing ${name}. Run: ${install}`);
}

function ipatool(...args: string[]) {
  return Bun.spawn(["ipatool", ...args], {
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
  if (process.platform !== "darwin") throw new Error("This CLI requires macOS.");

  if (args[0] === "install") {
    if (!existsSync("Musi.ipa")) throw new Error("Missing Musi.ipa. Run: bun musi.ts");
    requireTool("idevice_id", "brew install libimobiledevice");
    requireTool("ideviceinstaller", "brew install ideviceinstaller");
    const help = await $`ideviceinstaller --help 2>${Bun.stderr}`.text();
    if (!/^\s*install PATH\b/m.test(help)) {
      throw new Error("ideviceinstaller 1.2.0+ is required. Run: brew upgrade ideviceinstaller");
    }

    console.log("Connect your iPhone by USB, unlock it, and trust this Mac.");
    const devices = (await $`idevice_id --list 2>${Bun.stderr}`.text())
      .trim().split(/\s+/).filter(Boolean);
    if (devices.length !== 1) {
      throw new Error(`Expected exactly one USB device; found ${devices.length}. Connect only your iPhone and retry.`);
    }
    await $`ideviceinstaller --udid ${devices[0]} install Musi.ipa`;
    console.log("Installation finished. Open Musi on your iPhone to verify it launches.");
    return;
  }

  if (existsSync("Musi.ipa")) throw new Error("Musi.ipa already exists. Move it before downloading again.");
  if (existsSync("Musi.download.ipa")) {
    throw new Error("Musi.download.ipa already exists. Move or remove it before retrying.");
  }
  requireTool("ipatool", "brew install ipatool");
  requireTool("unzip", "use macOS's built-in unzip");

  console.log("Checking the active Apple ID. It must be the account that previously acquired Musi.");
  if ((await ipatool("auth", "info")) !== 0) {
    const loginCode = await ipatool("auth", "login");
    if (loginCode !== 0) process.exit(loginCode);
    const infoCode = await ipatool("auth", "info");
    if (infoCode !== 0) process.exit(infoCode);
  }

  const code = await ipatool(
    "download", "--app-id", "591560124", "--platform", "iphone",
    "--output", "Musi.download.ipa",
  );
  if (code !== 0) process.exit(code);
  await $`unzip -t Musi.download.ipa`;
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
