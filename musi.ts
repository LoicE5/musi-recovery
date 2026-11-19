import { $ } from "bun";
import { existsSync } from "node:fs";
import { lstat, mkdtemp, open, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { requireTool, installerCommand } from "./tools";
import { ipaChecksum, requireIpaZipTest, savedIpa, validateAndSaveIpa, verifyIpaHash, verifySavedIpa } from "./ipa";

export async function withWindowsIpatoolState<T>(download: (env: NodeJS.ProcessEnv) => Promise<T>) {
  const env = Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key.toUpperCase(), value]));
  const legacyHome = join(env.HOMEDRIVE || "", env.HOMEPATH || "");
  const profiles = [
    join(legacyHome, ".ipatool"),
    join(homedir(), ".ipatool"),
    ...[env.XDG_STATE_HOME, env.XDG_DATA_HOME]
      .filter((base): base is string => !!base && isAbsolute(base))
      .map(base => join(base, "ipatool")),
  ];
  for (const profile of new Set(profiles)) {
    const entry = await lstat(profile).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    if (entry) throw new Error(`Existing ipatool profile found at ${profile}. Use a clean Windows profile to sign in.`);
  }

  const local = env.LOCALAPPDATA;
  if (!local || !isAbsolute(local)) throw new Error("Windows Local AppData is unavailable. Sign into a local Windows profile and retry.");
  // Local AppData gives the new directory the Windows user's profile permissions.
  const state = await mkdtemp(join(local, "MusiRecovery-ipatool-"));
  const root = parse(state).root;
  try {
    return await download({
      ...env,
      XDG_STATE_HOME: state,
      XDG_DATA_HOME: state,
      // ipatool 2.8.1 uses this pair to find legacy state before opening XDG storage.
      HOMEDRIVE: root.slice(0, -1),
      HOMEPATH: state.slice(root.length - 1),
    });
  } finally {
    try {
      await rm(state, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Could not remove temporary ipatool state. Delete ${state} after closing Musi Recovery.`, { cause: error });
    }
  }
}

async function downloadIpa() {
  const partial = "Musi.download.ipa";
  if (existsSync(savedIpa)) throw new Error("Musi.ipa already exists. Move it and its checksum before downloading again.");
  if (existsSync(ipaChecksum)) throw new Error("Musi.ipa.sha256 already exists. Move it before downloading again.");
  if (existsSync(partial)) {
    throw new Error("Musi.download.ipa already exists. Move or remove it before retrying.");
  }
  const ipatool = await requireTool("ipatool");
  const zipTest = await requireIpaZipTest();
  const isWindows = process.platform === "win32";

  async function download(env?: NodeJS.ProcessEnv) {
    const run = (...args: string[]) => Bun.spawn([ipatool, ...args], {
      cwd: isWindows ? dirname(ipatool) : undefined,
      env, stdin: "inherit", stdout: "inherit", stderr: "inherit",
    }).exited;
    const checkedRun = async (...args: string[]) => {
      const code = await run(...args);
      if (code !== 0) {
        process.exitCode = code;
        throw new Error(`ipatool ${args[0] === "auth" ? `auth ${args[1]}` : args[0]} failed.`);
      }
    };

    if (isWindows) {
      console.log("Sign in with the Apple Account that previously acquired Musi.");
      console.log("When ipatool asks for a local keychain passphrase, choose a separate passphrase from your Apple Account password. Reuse that local passphrase during this download.");
      await checkedRun("auth", "login");
    } else {
      console.log("Checking the active Apple Account. It must be the account that previously acquired Musi.");
      if ((await run("auth", "info")) !== 0) {
        await checkedRun("auth", "login");
        await checkedRun("auth", "info");
      }
    }
    // Reserve the output before ipatool opens it, so two launchers cannot write it together.
    const reservation = await open(partial, "wx", 0o600);
    try {
      await reservation.close();
      if (existsSync(savedIpa) || existsSync(ipaChecksum)) throw new Error("A Musi download was already saved.");
      await checkedRun("download", "--app-id", "591560124", "--platform", "iphone", "--output", resolve(partial));
    } catch (error) {
      if ((await stat(partial).catch(() => undefined))?.size === 0) await rm(partial, { force: true });
      throw error;
    }
  }

  if (isWindows) await withWindowsIpatoolState(download);
  else await download();
  await validateAndSaveIpa(zipTest);
  console.log("Saved Musi.ipa and Musi.ipa.sha256.");
}

async function installIpa(expectedHash: string) {
  const deviceId = await requireTool("idevice_id");
  const installer = await requireTool("ideviceinstaller");
  const toolCwd = process.platform === "win32" ? dirname(installer) : process.cwd();
  const help = await $`${installer} --help 2>${Bun.stderr}`.cwd(toolCwd).text();
  const installCommand = installerCommand(help);

  console.log("Checking for one USB-connected iPhone.");
  const devices = (await $`${deviceId} --list 2>${Bun.stderr}`.cwd(toolCwd).text())
    .trim().split(/\s+/).filter(Boolean);
  if (devices.length !== 1) {
    throw new Error(`Expected exactly one USB device; found ${devices.length}. Connect only your iPhone and retry.`);
  }
  await verifyIpaHash(expectedHash);
  await $`${installer} --udid ${devices[0]} ${installCommand} ${resolve(savedIpa)}`.cwd(toolCwd);
  console.log("Installation finished. Open Musi on your iPhone to verify it launches.");
}

async function runWindowsLauncher() {
  if (process.platform !== "win32") throw new Error("The double-click launcher requires Windows.");
  const retry = existsSync(savedIpa);
  if (!retry) await downloadIpa();
  const expected = await verifySavedIpa();
  if (retry) console.log("Reusing verified Musi.ipa. Skipping Apple Account sign-in.");

  console.log("\nConnect only your iPhone by USB and unlock it.");
  console.log("Tap Trust if prompted. Check that your iPhone appears in Apple Devices.");
  console.log("Use the same Apple Account for Media & Purchases on the iPhone.");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await terminal.question("Press Enter when the iPhone is ready. ");
  } finally {
    terminal.close();
  }
  await installIpa(expected);
}

async function main() {
  const args = Bun.argv.slice(2);
  if (args.length === 0) {
    await downloadIpa();
    console.log("To install over USB, run: bun musi.ts install");
    return;
  }
  if (args.length === 1 && args[0] === "--help") {
    console.log(`Usage:
  bun musi.ts                        Download Musi to Musi.ipa and save its checksum
  bun musi.ts install                Install the verified IPA on one USB-connected iPhone
  bun musi.ts install --trusted-ipa  Check and install an older IPA you trust without a checksum
  bun musi.ts --help                 Show this help

Run from the folder where you want to save or install Musi.ipa.`);
    return;
  }
  if (args.length === 1 && args[0] === "--windows-launcher") {
    await runWindowsLauncher();
    return;
  }
  if (args[0] === "install" && (args.length === 1 || (args.length === 2 && args[1] === "--trusted-ipa"))) {
    const expected = await verifySavedIpa(args[1] === "--trusted-ipa");
    console.log("Connect your iPhone by USB, unlock it, and trust this computer.");
    await installIpa(expected);
    return;
  }
  throw new Error("Unknown arguments. Run: bun musi.ts --help");
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof $.ShellError ? error.exitCode : process.exitCode || 1;
  }
}
