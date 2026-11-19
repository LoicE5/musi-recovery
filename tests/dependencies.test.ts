import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { withWindowsIpatoolState } from "../musi";
import { checkPlatform, installIpatool, isDebian, verifiedDownload } from "../setup";
import { checkTool, installerCommand, sha256File } from "../tools";

const temporary: string[] = [];
const originalFetch = globalThis.fetch;
afterEach(async () => {
  globalThis.fetch = originalFetch;
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "musi-dependencies-"));
  temporary.push(directory);
  for (const name of ["tools.ts", "ipa.ts", "musi.ts", "setup.ts"]) {
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
posixTest("POSIX discovery uses PATH and ignores an unverified local executable", async () => {
  const directory = await fixture();
  const local = join(directory, ".tools", "ipatool", "ipatool");
  await script(local, 'echo "ipatool version fixture"');
  const onPath = join(directory, "path", "ipatool");
  await script(onPath, "exit 9");
  const locate = () => Bun.spawn([process.execPath, "-e", `import {findTool} from ${JSON.stringify(join(directory, "tools.ts"))}; console.log(await findTool("ipatool"));`], {
    cwd: tmpdir(), env: { ...process.env, PATH: join(directory, "path") }, stdout: "pipe", stderr: "pipe",
  });
  const child = locate();
  expect((await new Response(child.stdout).text()).trim()).toBe(onPath);
  expect(await child.exited).toBe(0);
  await rm(join(directory, ".tools"), { recursive: true });
  const { findTool } = await import(join(directory, "tools.ts"));
  await findTool("certainly-not-a-musi-tool");
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
  const path = join(directory, "path");
  const run = async (...args: string[]) => {
    const child = Bun.spawn([process.execPath, join(directory, "musi.ts"), ...args], {
      cwd: directory, env: { ...process.env, PATH: path }, stdout: "pipe", stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ]);
    return { code, output: stdout + stderr };
  };
  expect((await run()).output).toContain("Musi.ipa already exists");
  expect((await run("install")).output).toContain("Missing Musi.ipa.sha256");
  await Bun.write(join(directory, "Musi.ipa.sha256"), `${await sha256File(ipa)}\n`);
  await script(join(path, "ideviceinstaller"), 'if [ "$1" = "--help" ]; then echo "  install PATH  Install app"; else exit 99; fi');
  for (const devices of ["", "phone-a phone-b"]) {
    await script(join(path, "idevice_id"), `echo '${devices}'`);
    const result = await run("install");
    expect(result.code).toBe(1);
    expect(result.output).toContain("Expected exactly one USB device");
    expect(await Bun.file(ipa).text()).toBe("saved-ipa");
  }
  await script(join(path, "idevice_id"), 'echo changed > Musi.ipa\necho phone-a');
  const changedDuringPairing = await run("install");
  expect(changedDuringPairing.code).toBe(1);
  expect(changedDuringPairing.output).toContain("Musi.ipa SHA-256 mismatch");
  const changedBeforePairing = await run("install", "--trusted-ipa");
  expect(changedBeforePairing.output).toContain("Musi.ipa SHA-256 mismatch");
  expect(changedBeforePairing.output).not.toContain("Checking for one USB-connected iPhone");
});

const linuxTest = process.platform === "linux" ? test : test.skip;
linuxTest("setup reruns reuse launchable tools without downloads or package changes", async () => {
  const directory = await fixture();
  const path = join(directory, "path");
  for (const [relative, body] of [
    ["ipatool", "echo ipatool-version-fixture"],
    ["idevice_id", "echo idevice-id-help"],
    ["ideviceinstaller", 'echo "  install PATH  Install app"'],
    ["unzip", "echo unzip-version-fixture"],
    ["brew", "exit 99"],
  ]) await script(join(path, relative), body);
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

test("Windows sign-in uses a fresh local directory, cleans up, and blocks migration", async () => {
  const directory = await fixture();
  const home = join(directory, "home");
  const root = parse(home).root;
  const overrides = {
    HOMEDRIVE: root.slice(0, -1), HOMEPATH: home.slice(root.length - 1),
    LOCALAPPDATA: directory, XDG_STATE_HOME: join(directory, "external state"), XDG_DATA_HOME: "",
  };
  const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    let priorState: string | undefined;
    for (const fail of [false, true]) {
      const operation = withWindowsIpatoolState(async env => {
        const state = env.XDG_STATE_HOME!;
        expect(dirname(state)).toBe(directory);
        expect(state).not.toBe(priorState);
        priorState = state;
        expect(join(env.HOMEDRIVE || "", env.HOMEPATH || "")).toBe(state);
        expect(env.XDG_DATA_HOME).toBe(state);
        await Bun.write(join(state, "fake-session"), "fixture");
        if (fail) throw new Error("handled download failure");
      });
      if (fail) await expect(operation).rejects.toThrow("handled download failure");
      else await operation;
      expect(priorState).toBeDefined();
      expect(existsSync(priorState!)).toBe(false);
    }

    for (const profile of [join(home, ".ipatool"), join(overrides.XDG_STATE_HOME, "ipatool")]) {
      await mkdir(profile, { recursive: true });
      await expect(withWindowsIpatoolState(async () => {
        throw new Error("sign-in should not run with existing state");
      })).rejects.toThrow("Use a clean Windows profile");
      expect(existsSync(profile)).toBe(true);
      await rm(profile, { recursive: true });
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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
