import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ipaChecksum, requireIpaZipTest, savedIpa, validateAndSaveIpa, verifySavedIpa } from "../ipa";
import { sha256File } from "../tools";

const zipTest = await requireIpaZipTest();
const downloaded = "Musi.download.ipa";
const contents = await readFile("ipa fixture.zip");
const cwd = process.cwd();
const directory = await mkdtemp(join(tmpdir(), "Musi IPA smoke "));
try {
  process.chdir(directory);
  await writeFile(downloaded, "not a ZIP");
  await assert.rejects(validateAndSaveIpa(zipTest));
  assert(!existsSync(savedIpa));
  assert(!existsSync(ipaChecksum));
  assert.equal(await readFile(downloaded, "utf8"), "not a ZIP");

  await writeFile(downloaded, contents);
  await writeFile(savedIpa, "already saved");
  await assert.rejects(validateAndSaveIpa(zipTest), /Musi\.ipa already exists/);
  assert.equal(await readFile(savedIpa, "utf8"), "already saved");
  assert.deepEqual(await readFile(downloaded), contents);
  await assert.rejects(verifySavedIpa(true));
  await writeFile(savedIpa, contents);
  await assert.rejects(verifySavedIpa(), /Missing Musi\.ipa\.sha256/);
  assert.equal(await verifySavedIpa(true), await sha256File(savedIpa));

  await unlink(savedIpa);
  await validateAndSaveIpa(zipTest);
  assert.deepEqual(await readFile(savedIpa), contents);
  const expected = await sha256File(savedIpa);
  assert.equal(await readFile(ipaChecksum, "utf8"), `${expected}\n`);
  assert.equal(await verifySavedIpa(), expected);
  assert(!existsSync(downloaded));
  await writeFile(savedIpa, "changed");
  await assert.rejects(verifySavedIpa(), /Musi\.ipa SHA-256 mismatch/);
} finally {
  process.chdir(cwd);
  await rm(directory, { recursive: true, force: true });
}
console.log("IPA validation, checksum, and no-overwrite save checks passed.");
