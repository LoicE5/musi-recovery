import { $ } from "bun";
import { chmod, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { checkTool, findTool, requireTool, toolsDir } from "./tools";

// Pinned GitHub release assets; hashes checked against release metadata and downloads.
const ipatoolBase = "https://github.com/majd/ipatool/releases/download/v2.7.0";
const ipatoolHashes = {
  "windows-amd64": "b729608716908be287c2e6972f9e8cd05f879810ae5d182fc856c9e57cca0dd5",
  "linux-amd64": "68372de9743d468296f2dba5b413a3e7df56ad0c85b8d0f4f0f6c9b8b53a54e8",
  "linux-arm64": "133c3fb754bafcd61698ba6047b48096c7033345529f57d7a83d281f8a403c23",
};
const usbUrl = "https://github.com/raise-isayan/libimobiledevice-dist/releases/download/v2026.5/libimobiledevice-win64.zip";
const usbHash = "02ced638cc2cdfc55a70d725795f8adec775a7d45ff68f29e478b0092a57282e";

export function checkPlatform(os = process.platform, arch = process.arch) {
  if (!["darwin", "linux", "win32"].includes(os) || !["x64", "arm64"].includes(arch) ||
      (os === "win32" && arch !== "x64")) {
    throw new Error(`Unsupported platform: ${os}/${arch}. Supported: macOS and Linux x64/arm64, Windows x64.`);
  }
}

export function isDebian(release: string) {
  return /^(?:ID|ID_LIKE)=["']?(?:[^\n]*\s)?(?:debian|ubuntu)(?:[\s"']|$)/m.test(release);
}

export async function verifiedDownload(url: string, sha256: string) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} (${url})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== sha256) {
    throw new Error(`SHA-256 mismatch for ${url}. Nothing was extracted; retry setup.`);
  }
  return bytes;
}

async function installPackages(command: string[]) {
  console.log(`Proposed command: ${command.join(" ")}`);
  if (!process.stdin.isTTY) throw new Error("Run setup in an interactive terminal to approve installation, or run the command above yourself.");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  let answer: string;
  try {
    answer = await terminal.question("Install these missing dependencies? [y/N] ");
  } finally {
    terminal.close();
  }
  if (!/^y(?:es)?$/i.test(answer.trim())) throw new Error("Installation cancelled. Rerun setup when ready.");
  await $`${command}`;
}

export async function installIpatool(os: "linux" | "win32", arch: "x64" | "arm64", directory = toolsDir) {
  checkPlatform(os, arch);
  if (typeof Bun.Archive !== "function") throw new Error("Update Bun from https://bun.sh before running setup (Bun.Archive is required).");
  const platform = `${os === "win32" ? "windows" : os}-${arch === "x64" ? "amd64" : arch}` as keyof typeof ipatoolHashes;
  const filename = `ipatool-2.7.0-${platform}${os === "win32" ? ".exe" : ""}`;
  const bytes = await verifiedDownload(`${ipatoolBase}/ipatool-2.7.0-${platform}.tar.gz`, ipatoolHashes[platform]);
  const executable = (await new Bun.Archive(bytes).files()).get(`bin/${filename}`);
  if (!executable) throw new Error("Unexpected ipatool archive layout: missing bin/" + filename);
  await mkdir(directory, { recursive: true });
  const staging = await mkdtemp(join(directory, ".ipatool-"));
  try {
    const target = join(staging, os === "win32" ? "ipatool.exe" : "ipatool");
    await Bun.write(target, executable);
    if (os !== "win32") await chmod(target, 0o755);
    if (!await checkTool("ipatool", target)) throw new Error("Downloaded ipatool cannot launch on this computer.");
    await rm(join(directory, "ipatool"), { recursive: true, force: true });
    await rename(staging, join(directory, "ipatool"));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function installWindowsUsb() {
  const bytes = await verifiedDownload(usbUrl, usbHash);
  await mkdir(toolsDir, { recursive: true });
  const staging = await mkdtemp(join(toolsDir, ".usb-"));
  try {
    const archive = join(staging, "usb.zip");
    const extracted = join(staging, "extracted");
    await Bun.write(archive, bytes);
    await $`${requireTool("7z")} x -y ${`-o${extracted}`} ${archive}`.quiet();
    for (const name of ["idevice_id", "ideviceinstaller"]) {
      if (!await checkTool(name, join(extracted, `${name}.exe`))) {
        throw new Error(`Downloaded ${name} cannot launch. Install Apple Devices, then retry setup.`);
      }
    }
    await rm(join(toolsDir, "usb"), { recursive: true, force: true });
    await rename(extracted, join(toolsDir, "usb"));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function main() {
  if (Bun.argv.length > 2) throw new Error("Usage: bun setup.ts");
  const os = process.platform;
  const arch = process.arch;
  console.log(`Detected ${os}/${arch}`);
  checkPlatform(os, arch);
  const brew = findTool("brew");
  if (os === "darwin" && !brew) {
    throw new Error("Homebrew is required on macOS. Install it using the instructions at https://brew.sh, then rerun bun setup.ts.");
  }

  if (os === "win32") {
    console.log("Install Apple Devices from https://apps.microsoft.com/detail/9np83lwlpz9k for Apple's USB drivers and service. Open it once and check that it recognizes your iPhone.");
    if (!await checkTool("7z")) throw new Error("Install 7-Zip x64 from https://www.7-zip.org (keep its default folder), then rerun bun setup.ts. It extracts USB tools and checks downloaded IPAs.");
    if (!await checkTool("ipatool")) await installIpatool(os, arch as "x64");
    if (!await checkTool("idevice_id") || !await checkTool("ideviceinstaller")) await installWindowsUsb();
  } else {
    let debian = false;
    if (os === "linux") {
      debian = isDebian(await readFile("/etc/os-release", "utf8").catch(() => ""));
      console.log("Linux USB installation requires your distribution's usbmuxd service and USB access permissions. Homebrew only provides client libraries. Packages normally activate the service when a phone connects.");
    }
    const packages: string[] = [];
    for (const [tool, formula, deb] of [
      ["ipatool", "ipatool", ""],
      ["idevice_id", "libimobiledevice", "libimobiledevice-utils"],
      ["ideviceinstaller", "ideviceinstaller", "ideviceinstaller"],
    ]) {
      if (!await checkTool(tool) && (brew || deb)) packages.push(brew ? formula : deb);
    }
    if (!await checkTool("unzip") && !await checkTool("7z")) packages.push("unzip");
    if (brew && packages.length) await installPackages([brew, "install", ...packages]);
    if (os === "linux" && !debian) {
      console.log("Manual requirements for this distribution: install usbmuxd as a system service, configure USB permissions, and install libimobiledevice (idevice_id), ideviceinstaller, unzip or 7-Zip, and ipatool. See README.md.");
      if (!brew && (!await checkTool("ipatool") || packages.length > 0)) {
        throw new Error("Install the manual requirements above, then rerun setup. Automatic package setup supports Debian/Ubuntu or Homebrew.");
      }
    }
    if (os === "linux" && debian) {
      const dpkg = Bun.spawn(["dpkg-query", "-W", "-f=${Status}", "usbmuxd"], { stdout: "pipe", stderr: "ignore" });
      const status = await new Response(dpkg.stdout).text();
      const serviceInstalled = await dpkg.exited === 0 && status.trim() === "install ok installed";
      const aptPackages = brew ? [] : packages;
      if (!serviceInstalled) aptPackages.push("usbmuxd");
      if (aptPackages.length) await installPackages(["sudo", "apt-get", "install", ...aptPackages]);
      if (!brew && !await checkTool("ipatool")) await installIpatool("linux", arch as "x64" | "arm64");
    }
  }

  const missing: string[] = [];
  for (const tool of ["ipatool", "idevice_id", "ideviceinstaller"]) {
    if (!await checkTool(tool)) missing.push(tool);
  }
  if (!await checkTool("unzip") && !await checkTool("7z")) missing.push("unzip or 7-Zip");
  if (missing.length) throw new Error(`Tools missing or unable to launch: ${missing.join(", ")}. Repair them and rerun setup; local .tools/ entries take priority over PATH.`);
  console.log("Setup complete: recovery tools launch successfully. USB drivers/service and iPhone trust still need to work. Next: bun musi.ts");
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
