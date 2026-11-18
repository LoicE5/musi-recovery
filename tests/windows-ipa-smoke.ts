import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireIpaZipTest, validateAndSaveIpa } from "../ipa";

const zipTest = await requireIpaZipTest();
const downloaded = "Musi.download.ipa";
const saved = "Musi.ipa";
const contents = await readFile("ipa fixture.zip");
const cwd = process.cwd();
const directory = await mkdtemp(join(tmpdir(), "Musi IPA smoke "));
try {
  process.chdir(directory);
  await writeFile(downloaded, "not a ZIP");
  await assert.rejects(validateAndSaveIpa(zipTest));
  assert(!existsSync(saved));
  assert.equal(await readFile(downloaded, "utf8"), "not a ZIP");

  await writeFile(downloaded, contents);
  await writeFile(saved, "already saved");
  await assert.rejects(validateAndSaveIpa(zipTest), /Musi\.ipa already exists/);
  assert.equal(await readFile(saved, "utf8"), "already saved");
  assert.deepEqual(await readFile(downloaded), contents);

  await unlink(saved);
  await validateAndSaveIpa(zipTest);
  assert.deepEqual(await readFile(saved), contents);
  assert(!existsSync(downloaded));
} finally {
  process.chdir(cwd);
  await rm(directory, { recursive: true, force: true });
}
console.log("IPA validation and no-overwrite save checks passed.");
