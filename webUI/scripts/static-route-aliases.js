#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const HTML_EXT = ".html";
const SKIPPED_HTML_FILES = new Set(["404.html", "500.html"]);

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function walkHtmlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(HTML_EXT)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function aliasKeyForHtmlFile(outDir, filePath) {
  const rel = toPosixPath(path.relative(outDir, filePath));
  const basename = path.posix.basename(rel);

  if (SKIPPED_HTML_FILES.has(basename)) return null;

  if (basename === "index.html") {
    const dirname = path.posix.dirname(rel);
    return dirname === "." ? null : dirname;
  }

  return rel.slice(0, -HTML_EXT.length);
}

function collectStaticRouteAliases(outDir) {
  const resolvedOutDir = path.resolve(outDir);
  const aliases = new Map();

  for (const filePath of walkHtmlFiles(resolvedOutDir)) {
    const aliasKey = aliasKeyForHtmlFile(resolvedOutDir, filePath);
    if (!aliasKey || aliases.has(aliasKey)) continue;

    aliases.set(aliasKey, {
      sourceFile: filePath,
      sourceKey: toPosixPath(path.relative(resolvedOutDir, filePath)),
      aliasKey,
    });
  }

  return [...aliases.values()];
}

function buildS3Uri(bucketUri, key) {
  return `${bucketUri.replace(/\/+$/, "")}/${key}`;
}

function uploadStaticRouteAliases(outDir, bucketUri, options = {}) {
  const aliases = collectStaticRouteAliases(outDir);
  const spawn = options.spawnSync || spawnSync;
  const dryRun = options.dryRun === true;

  for (const alias of aliases) {
    const args = [
      "s3",
      "cp",
      alias.sourceFile,
      buildS3Uri(bucketUri, alias.aliasKey),
      "--content-type",
      "text/html; charset=utf-8",
      "--cache-control",
      "public,max-age=0,must-revalidate",
      "--only-show-errors",
    ];

    if (dryRun) continue;

    const result = spawn("aws", args, { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error(`Failed to upload static route alias ${alias.aliasKey}`);
    }
  }

  return aliases;
}

function printUsage() {
  console.error(
    "Usage: node scripts/static-route-aliases.js <list|upload> <out-dir> [s3://bucket[/prefix]]",
  );
}

if (require.main === module) {
  const [command, outDir, bucketUri] = process.argv.slice(2);

  try {
    if (command === "list" && outDir) {
      console.log(JSON.stringify(collectStaticRouteAliases(outDir), null, 2));
    } else if (command === "upload" && outDir && bucketUri) {
      const aliases = uploadStaticRouteAliases(outDir, bucketUri);
      console.log(`Uploaded ${aliases.length} extensionless static route alias(es).`);
    } else {
      printUsage();
      process.exitCode = 2;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

module.exports = {
  buildS3Uri,
  collectStaticRouteAliases,
  uploadStaticRouteAliases,
};
