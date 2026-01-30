import chalk from "chalk";
import { execSync } from "child_process";
import fs from "node:fs/promises";
import path from "path";

import type { ManifestData } from "./types/manifest-data";

// Configuration
const TMP_FOLDER = "build_temp";
const DIST_FOLDER = "dist";
const manifest = (await Bun.file("manifest.json").json()) as ManifestData;
const VERSION = manifest.version;
const ignorePatterns = [
  ".DS_Store",
  ".git",
  ".Trashes",
  ".Spotlight-V100",
  ".github",
];

console.log(`\n\nBuilding Snoozz ${chalk.bold.blueBright(`v${VERSION}`)}\n`);

try {
  // Step 1: Cleanup old files
  await cleanupFolders(TMP_FOLDER, DIST_FOLDER);

  // Step 2: Copy essential files
  await fs.mkdir(TMP_FOLDER, { recursive: true });
  await fs.mkdir(DIST_FOLDER, { recursive: true });
  await copyDir("html", path.join(TMP_FOLDER, "html"));
  await copyDir("icons", path.join(TMP_FOLDER, "icons"));
  await copyDir("sounds", path.join(TMP_FOLDER, "sounds"));

  // Step 3: Minify files
  await minifyFilesInDirectory("scripts", ".js", [
    "service-worker.js",
    "settings.js",
  ]);
  await minifyFilesInDirectory("styles", ".css");

  // Step 4: Update manifest file
  await outputManifestFile();

  // Step 5: Build Chrome release
  await createArchive("snoozz-chrome", VERSION);
  console.log(
    `\n\nCreated Chrome Release: ${chalk.magenta(`snoozz-chrome-${VERSION}.zip`)}`,
  );

  // Step 6: Add command to manifest for Firefox
  const modCommands: { [key: string]: any } = {
    _execute_browser_action: { description: "Open the Snoozz popup" },
  };
  for (const [key, value] of Object.entries(manifest.commands || {})) {
    modCommands[key] = value;
  }
  manifest.commands = modCommands;
  await outputManifestFile();

  // Step 7: Build Firefox release
  await createArchive("snoozz-ff", VERSION);
  console.log(
    `Created Firefox Release: ${chalk.magenta(`snoozz-ff-${VERSION}.zip`)}`,
  );

  // Step 8: Build GitHub release
  await copyFile("LICENSE", path.join(TMP_FOLDER, "LICENSE"));
  await createArchive("snoozz", VERSION);
  console.log(`Created GH Release: ${chalk.magenta(`snoozz-${VERSION}.zip`)}`);

  // Step 9: Modify manifest for Safari and build
  await copyFile("docs/safari.md", path.join(TMP_FOLDER, "safari.md"));
  await copyFile(
    "instructions_safari.txt",
    path.join(TMP_FOLDER, "instructions_safari.txt"),
  );
  await copyFile("safari.sh", path.join(TMP_FOLDER, "safari.sh"));

  if (manifest.permissions) {
    manifest.permissions = manifest.permissions.filter(
      (p: string) => p !== "idle" && p !== "notifications",
    );
    manifest.permissions = manifest.permissions.map((p: string) =>
      p.replace("tabs", "activeTab"),
    );
  }
  manifest.commands = {};
  await outputManifestFile();

  await createArchive("snoozz-safari", VERSION);
  console.log(
    `Created Safari Release: ${chalk.magenta(`snoozz-safari-${VERSION}.zip`)}`,
  );

  // Step 10: Cleanup
  await cleanupFolders(TMP_FOLDER);

  console.log("\n\n✓ Build completed successfully!\n");
} catch (error) {
  console.error("Build failed:", error);
  process.exit(1);
}

/**
 * Execute shell command
 */
function ex(command: string): string {
  try {
    return execSync(command, { encoding: "utf-8", stdio: "pipe" });
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    throw error;
  }
}

async function cleanupFolders(...folders: string[]) {
  for (const folder of folders) {
    await fs.rm(folder, { recursive: true, force: true });
  }
}

async function copyDir(src: string, dest: string) {
  if (!(await fs.exists(dest))) {
    await fs.mkdir(dest, { recursive: true });
  }

  const files = await fs.readdir(src);
  for (const file of files) {
    if (ignorePatterns.includes(file)) continue;

    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    const stat = await fs.stat(srcFile);

    if (stat.isDirectory()) {
      await copyDir(srcFile, destFile);
    } else {
      await copyFile(srcFile, destFile);
    }
  }
}

async function copyFile(srcFile: string, destFile: string) {
  const originalFile = Bun.file(srcFile);
  await Bun.write(destFile, originalFile);
}

async function replaceInHTMLFiles(original: string, replacement: string) {
  const htmlDir = path.join(TMP_FOLDER, "html");
  const htmlFiles = await fs.readdir(htmlDir);

  for (const htmlFile of htmlFiles) {
    if (htmlFile.endsWith(".html")) {
      const file = Bun.file(path.join(htmlDir, htmlFile));
      let content = await file.text();
      content = content.replace(new RegExp(original, "g"), replacement);
      await Bun.write(file, content);
    }
  }
}

function replaceInManifest(original: string, replacement: string): void {
  const manifestStr = JSON.stringify(manifest).replace(
    new RegExp(original, "g"),
    replacement,
  );
  Object.assign(manifest, JSON.parse(manifestStr));
}

async function minifyFilesInDirectory(
  directory: string,
  ext: string,
  exclude: string[] = [],
): Promise<Promise<Promise<void>>> {
  const targetDir = path.join(TMP_FOLDER, directory);

  if (!(await fs.exists(targetDir))) {
    await fs.mkdir(targetDir, { recursive: true });
  }

  const files = await fs.readdir(directory);
  const sameSize = (str: string) => str.padEnd(16);

  for (const name of files) {
    if (!name.endsWith(ext)) continue;

    process.stdout.write(
      `\n⧖ Minifying  ${chalk.bold.yellowBright(sameSize(name))} ...`,
    );

    const srcPath = path.join(directory, name);
    let destName = name.replace(new RegExp(`\\${ext}$`), `.min${ext}`);
    const destPath = path.join(targetDir, destName);

    try {
      if (exclude.includes(name) || name.endsWith(`.min${ext}`)) {
        await copyFile(srcPath, path.join(targetDir, name));
        console.log(
          `\r✓ Copied    ${chalk.bold.yellowBright(sameSize(name))} -> ${chalk.bold.green(name)}`,
          "",
        );
      } else if (ext === ".js") {
        ex(`uglifyjs ${srcPath} -c -m -o ${destPath}`);
        await replaceInHTMLFiles(name, destName);
        replaceInManifest(name, destName);
        console.log(
          `\r✓ Minified  ${chalk.bold.yellowBright(sameSize(name))} -> ${chalk.bold.green(destName)}`,
          "",
        );
      } else if (ext === ".css") {
        ex(`csso ${srcPath} -o ${destPath}`);
        await replaceInHTMLFiles(name, destName);
        console.log(
          `\r✓ Minified  ${chalk.bold.yellowBright(sameSize(name))} -> ${chalk.bold.green(destName)}`,
          "",
        );
      }
    } catch (error) {
      console.error(`Error minifying ${name}:`, error);
    }
  }
}

async function outputManifestFile() {
  const tempManifestFile = Bun.file(path.join(TMP_FOLDER, "manifest.json"));
  await Bun.write(tempManifestFile, JSON.stringify(manifest, null, 4));
}

async function createArchive(name: string, version: string) {
  await fs.mkdir(path.join(DIST_FOLDER, name), { recursive: true });
  await fs.cp(TMP_FOLDER, path.join(DIST_FOLDER, name), { recursive: true });
  ex(`cd ${DIST_FOLDER} && zip -r ${name}-${version}.zip ${name}`);
}
