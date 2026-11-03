import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPlatform, installIpatool, isDebian, verifiedDownload } from "../setup";
import { checkTool, installerCommand } from "../tools";

const temporary: string[] = [];
const originalFetch = globalThis.fetch;
afterEach(async () => {
  globalThis.fetch = originalFetch;
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "musi-dependencies-"));
  temporary.push(directory);
  for (const name of ["tools.ts", "musi.ts", "setup.ts"]) {
    await Bun.write(join(directory, name), Bun.file(join(import.meta.dir, "..", name)));
  }
  return directory;
}

async function script(path: string, body: string) {
  await mkdir(join(path, ".."), { recursive: true });
  await Bun.write(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
}

test("platform and distribution selection rejects unsupported builds", () => {
  for (const os of ["darwin", "linux"] as const) {
    for (const arch of ["x64", "arm64"] as const) expect(() => checkPlatform(os, arch)).not.toThrow();
  }
  expect(() => checkPlatform("win32", "x64")).not.toThrow();
  expect(() => checkPlatform("win32", "arm64")).toThrow("Unsupported platform");
  expect(() => checkPlatform("linux", "ia32")).toThrow("Unsupported platform");
  expect(() => checkPlatform("freebsd", "x64")).toThrow("Unsupported platform");
  for (const release of ['ID=debian', 'ID="ubuntu"', 'ID=mint\nID_LIKE="ubuntu debian"']) expect(isDebian(release)).toBe(true);
  expect(isDebian('ID=fedora\nID_LIKE="rhel"')).toBe(false);
});

test("download rejects HTTP failures and corrupt bytes before extraction", async () => {
  globalThis.fetch = (async () => new Response("missing", { status: 404 })) as typeof fetch;
  await expect(verifiedDownload("https://example.test/tool", "0".repeat(64))).rejects.toThrow("HTTP 404");
  globalThis.fetch = (async () => new Response("corrupted")) as typeof fetch;
  await expect(verifiedDownload("https://example.test/tool", "0".repeat(64))).rejects.toThrow("SHA-256 mismatch");
  const hash = new Bun.CryptoHasher("sha256").update("valid").digest("hex");
  globalThis.fetch = (async () => new Response("valid")) as typeof fetch;
  expect(new TextDecoder().decode(await verifiedDownload("https://example.test/tool", hash))).toBe("valid");
});

test("installer syntax supports both documented versions", () => {
  expect(installerCommand("Commands:\n  install PATH  Install app\n")).toBe("install");
  expect(installerCommand("  -i, --install ARCHIVE Install app\n")).toBe("--install");
  expect(() => installerCommand("unrelated help")).toThrow("Unsupported ideviceinstaller");
});

// Shell fixtures exercise POSIX launch/discovery behavior; Windows needs a real host.
const posixTest = process.platform === "win32" ? test.skip : test;
posixTest("local discovery precedes PATH, works from another cwd, and creates nothing", async () => {
  const directory = await fixture();
  const local = join(directory, ".tools", "ipatool", "ipatool");
  await script(local, 'echo "ipatool version fixture"');
  const onPath = join(directory, "path", "ipatool");
  await script(onPath, "exit 9");
  const locate = () => Bun.spawn([process.execPath, "-e", `import {findTool} from ${JSON.stringify(join(directory, "tools.ts"))}; console.log(findTool("ipatool"));`], {
    cwd: tmpdir(), env: { ...process.env, PATH: join(directory, "path") }, stdout: "pipe", stderr: "pipe",
  });
  const child = locate();
  expect((await new Response(child.stdout).text()).trim()).toBe(local);
  expect(await child.exited).toBe(0);
  await rm(join(directory, ".tools"), { recursive: true });
  const fallback = locate();
  expect((await new Response(fallback.stdout).text()).trim()).toBe(onPath);
  expect(await fallback.exited).toBe(0);
  const { findTool } = await import(join(directory, "tools.ts"));
  findTool("certainly-not-a-musi-tool");
  expect(existsSync(join(directory, ".tools"))).toBe(false);
});

posixTest("launch probes reject missing, broken and incompatible tools", async () => {
  const directory = await fixture();
  const path = join(directory, "probe");
  expect(await checkTool("ipatool", path)).toBe(false);
  await script(path, "exit 7");
  expect(await checkTool("ipatool", path)).toBe(false);
  await script(path, "echo unrelated-help");
  expect(await checkTool("ideviceinstaller", path)).toBe(false);
  await script(path, 'echo "  install PATH  Install app"');
  expect(await checkTool("ideviceinstaller", path)).toBe(true);
});

posixTest("recovery keeps saved IPAs and refuses zero or multiple USB devices", async () => {
  const directory = await fixture();
  const ipa = join(directory, "Musi.ipa");
  await Bun.write(ipa, "saved-ipa");
  const run = async (...args: string[]) => {
    const child = Bun.spawn([process.execPath, join(directory, "musi.ts"), ...args], {
      cwd: directory, stdout: "pipe", stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ]);
    return { code, output: stdout + stderr };
  };
  expect((await run()).output).toContain("Musi.ipa already exists");
  await script(join(directory, ".tools", "usb", "ideviceinstaller"), 'if [ "$1" = "--help" ]; then echo "  install PATH  Install app"; else exit 99; fi');
  for (const devices of ["", "phone-a phone-b"]) {
    await script(join(directory, ".tools", "usb", "idevice_id"), `echo '${devices}'`);
    const result = await run("install");
    expect(result.code).toBe(1);
    expect(result.output).toContain("Expected exactly one USB device");
    expect(await Bun.file(ipa).text()).toBe("saved-ipa");
  }
});

const linuxTest = process.platform === "linux" ? test : test.skip;
linuxTest("setup reruns reuse launchable tools without downloads or package changes", async () => {
  const directory = await fixture();
  for (const [relative, body] of [
    ["ipatool/ipatool", "echo ipatool-version-fixture"],
    ["usb/idevice_id", "echo idevice-id-help"],
    ["usb/ideviceinstaller", 'echo "  install PATH  Install app"'],
    ["unzip", "echo unzip-version-fixture"],
    ["brew", "exit 99"],
  ]) await script(join(directory, ".tools", relative), body);
  const path = join(directory, "path");
  await script(join(path, "dpkg-query"), 'echo "install ok installed"');
  for (let attempt = 0; attempt < 2; attempt++) {
    const child = Bun.spawn([process.execPath, join(directory, "setup.ts")], {
      cwd: tmpdir(), env: { ...process.env, PATH: path }, stdout: "pipe", stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout).toContain("Setup complete");
    expect(stdout).not.toContain("Downloading");
    expect(stdout).not.toContain("Proposed command");
  }
});

test("a corrupt dependency download preserves previously installed files", async () => {
  const directory = await fixture();
  const saved = join(directory, ".tools", "ipatool", "ipatool");
  await mkdir(join(saved, ".."), { recursive: true });
  await Bun.write(saved, "existing dependency");
  globalThis.fetch = (async () => new Response("corrupt archive")) as typeof fetch;
  await expect(installIpatool("linux", "arm64", join(directory, ".tools"))).rejects.toThrow("SHA-256 mismatch");
  expect(await Bun.file(saved).text()).toBe("existing dependency");
});
