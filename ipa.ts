import { $ } from "bun";
import { constants } from "node:fs";
import { copyFile, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { checkTool, findTool, sha256File } from "./tools";

export const savedIpa = "Musi.ipa";
export const ipaChecksum = "Musi.ipa.sha256";

export async function requireIpaZipTest() {
  if (process.platform !== "win32") {
    const unzip = await findTool("unzip");
    if (unzip && await checkTool("unzip", unzip)) return [unzip, "-t"];
  }
  const sevenZip = await findTool("7z");
  if (sevenZip && await checkTool("7z", sevenZip)) return [sevenZip, "t", "-tzip"];
  throw new Error("Missing ZIP validation tool. Run: bun setup.ts");
}

async function checkZip(zipTest: string[], path: string) {
  const cwd = process.platform === "win32" ? dirname(zipTest[0]) : process.cwd();
  await $`${zipTest} ${resolve(path)}`.cwd(cwd);
}

export async function validateAndSaveIpa(zipTest: string[]) {
  const downloaded = "Musi.download.ipa";
  const expected = await sha256File(downloaded);
  await checkZip(zipTest, downloaded);
  try {
    await copyFile(downloaded, savedIpa, constants.COPYFILE_EXCL);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Musi.ipa already exists; download kept as Musi.download.ipa.");
    }
    throw error;
  }
  try {
    await verifyIpaHash(expected);
    await writeFile(ipaChecksum, `${expected}\n`, { flag: "wx" });
  } catch (error) {
    await unlink(savedIpa);
    throw error;
  }
  await unlink(downloaded);
}

export async function verifyIpaHash(expected: string) {
  if (await sha256File(savedIpa) !== expected) throw new Error("Musi.ipa SHA-256 mismatch. The IPA has changed.");
}

export async function verifySavedIpa(trusted = false) {
  if (!await Bun.file(savedIpa).exists()) throw new Error("Missing Musi.ipa. Run: bun musi.ts");
  const checksum = await readFile(ipaChecksum, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (checksum === undefined) {
    if (!trusted) throw new Error("Missing Musi.ipa.sha256. Keep the checksum with the downloaded IPA.");
    const zipTest = await requireIpaZipTest();
    const expected = await sha256File(savedIpa);
    await checkZip(zipTest, savedIpa);
    return expected;
  }
  const expected = checksum.trim();
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error("Invalid Musi.ipa.sha256. Restore the original checksum.");
  await verifyIpaHash(expected);
  return expected;
}
