import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const extensionToml = await readFile("editors/zed/extension.toml", "utf8");
const cargoToml = await readFile("editors/zed/Cargo.toml", "utf8");
const cargoLock = await readFile("editors/zed/Cargo.lock", "utf8");

function tomlVersion(source, label) {
  const match = /^version\s*=\s*"([^"]+)"\s*$/m.exec(source);
  assert.ok(match, `${label} does not contain a version`);
  return match[1];
}

function cargoLockVersion(source, packageName) {
  for (const block of source.split("[[package]]")) {
    if (!new RegExp(`^\\s*name\\s*=\\s*"${packageName}"\\s*$`, "m").test(block)) continue;
    return tomlVersion(block, `editors/zed/Cargo.lock package ${packageName}`);
  }
  assert.fail(`editors/zed/Cargo.lock does not contain package ${packageName}`);
}

const versions = {
  "package.json": packageJson.version,
  "package-lock.json": packageLock.version,
  "package-lock root package": packageLock.packages?.[""]?.version,
  "Zed extension.toml": tomlVersion(extensionToml, "editors/zed/extension.toml"),
  "Zed Cargo.toml": tomlVersion(cargoToml, "editors/zed/Cargo.toml"),
  "Zed Cargo.lock": cargoLockVersion(cargoLock, "flintmark-zed"),
};
const expected = packageJson.version;
for (const [label, version] of Object.entries(versions)) {
  assert.equal(version, expected, `${label} version ${version} does not match ${expected}`);
}

console.log(`All Flintmark release manifests agree on ${expected}.`);
