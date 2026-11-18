import { $ } from "bun";
import { constants } from "node:fs";
import { copyFile, unlink } from "node:fs/promises";
import { checkTool, findTool } from "./tools";

export async function requireIpaZipTest() {
  if (process.platform !== "win32") {
    const unzip = findTool("unzip");
    if (unzip && await checkTool("unzip", unzip)) return [unzip, "-t"];
  }
  const sevenZip = findTool("7z");
  if (sevenZip && await checkTool("7z", sevenZip)) return [sevenZip, "t", "-tzip"];
  throw new Error("Missing ZIP validation tool. Run: bun setup.ts");
}

export async function validateAndSaveIpa(zipTest: string[]) {
  const downloaded = "Musi.download.ipa";
  await $`${zipTest} ${downloaded}`;
  try {
    await copyFile(downloaded, "Musi.ipa", constants.COPYFILE_EXCL);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Musi.ipa already exists; download kept as Musi.download.ipa.");
    }
    throw error;
  }
  await unlink(downloaded);
}
