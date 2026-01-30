import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import chalk from "chalk";

// Types
interface ManifestData {
  version: string;
  permissions: string[];
  commands: { [key: string]: any };
  [key: string]: any;
}

// Configuration
const TMP_FOLDER = "build_temp";
const DIST_FOLDER = "dist";
const manifest: ManifestData = JSON.parse(
  fs.readFileSync("manifest.json", "utf-8"),
);
const VERSION = manifest.version;

console.log(`\n\nBuilding Snoozz ${chalk.bold.blueBright(`v${VERSION}`)}\n`);

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

/**
 * Remove old files and directories
 */
function cleanupOldFiles(): void {
  const oldDirs = [TMP_FOLDER, DIST_FOLDER];

  for (const file of oldDirs) {
    if (fs.existsSync(file)) {
      fs.rmSync(file, { recursive: true, force: true });
    }
  }
}

/**
 * Copy directory with ignore patterns
 */
function copyDirIgnoring(
  src: string,
  dest: string,
  patterns: string[] = [],
): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const files = fs.readdirSync(src);
  for (const file of files) {
    if (patterns.includes(file)) continue;

    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    const stat = fs.statSync(srcFile);

    if (stat.isDirectory()) {
      copyDirIgnoring(srcFile, destFile, patterns);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  }
}

/**
 * Replace string in HTML files
 */
function replaceInHTMLFiles(original: string, replacement: string): void {
  const htmlDir = path.join(TMP_FOLDER, "html");
  const files = fs.readdirSync(htmlDir);

  for (const file of files) {
    if (file.endsWith(".html")) {
      const filePath = path.join(htmlDir, file);
      let content = fs.readFileSync(filePath, "utf-8");
      content = content.replace(new RegExp(original, "g"), replacement);
      fs.writeFileSync(filePath, content, "utf-8");
    }
  }
}

/**
 * Replace in manifest
 */
function replaceInManifest(original: string, replacement: string): void {
  const manifestStr = JSON.stringify(manifest).replace(
    new RegExp(original, "g"),
    replacement,
  );
  Object.assign(manifest, JSON.parse(manifestStr));
}

/**
 * Minify files in directory
 */
function minifyFilesInDirectory(
  directory: string,
  ext: string,
  exclude: string[] = [],
): void {
  const targetDir = path.join(TMP_FOLDER, directory);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const files = fs.readdirSync(directory);
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
        fs.copyFileSync(srcPath, path.join(targetDir, name));
        console.log(
          `\r✓ Copied    ${chalk.bold.yellowBright(sameSize(name))} -> ${chalk.bold.green(name)}`,
          "",
        );
      } else if (ext === ".js") {
        ex(`uglifyjs ${srcPath} -c -m -o ${destPath}`);
        replaceInHTMLFiles(name, destName);
        replaceInManifest(name, destName);
        console.log(
          `\r✓ Minified  ${chalk.bold.yellowBright(sameSize(name))} -> ${chalk.bold.green(destName)}`,
          "",
        );
      } else if (ext === ".css") {
        ex(`csso ${srcPath} -o ${destPath}`);
        replaceInHTMLFiles(name, destName);
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

/**
 * Create archive (zip)
 */
function createArchive(sourceDir: string, outputName: string): void {
  // For Node.js, we'll use the 'archiver' package or system command
  // Using system command for simplicity
  ex(
    `cd ${path.dirname(sourceDir)} && zip -r ${outputName}.zip ${path.basename(sourceDir)}`,
  );
}

/**
 * Main build process
 */
async function build(): Promise<void> {
  try {
    // Step 1: Cleanup old files
    cleanupOldFiles();

    // Step 2: Copy essential files
    const ignorePatterns = [
      ".DS_Store",
      ".git",
      ".Trashes",
      ".Spotlight-V100",
      ".github",
    ];

    fs.mkdirSync(TMP_FOLDER, { recursive: true });
    fs.mkdirSync(DIST_FOLDER, { recursive: true });
    copyDirIgnoring("html", path.join(TMP_FOLDER, "html"), ignorePatterns);
    copyDirIgnoring("icons", path.join(TMP_FOLDER, "icons"), ignorePatterns);
    copyDirIgnoring("sounds", path.join(TMP_FOLDER, "sounds"), ignorePatterns);

    // Step 3: Minify files
    minifyFilesInDirectory("scripts", ".js", [
      "service-worker.js",
      "settings.js",
    ]);
    minifyFilesInDirectory("styles", ".css");

    // Step 4: Update manifest file
    fs.writeFileSync(
      path.join(TMP_FOLDER, "manifest.json"),
      JSON.stringify(manifest, null, 4),
      "utf-8",
    );

    // Step 5: Build Chrome release
    let name = `snoozz-chrome-${VERSION}`;
    fs.mkdirSync(path.join(DIST_FOLDER, name), { recursive: true });
    fs.cpSync(TMP_FOLDER, path.join(DIST_FOLDER, name), { recursive: true });
    ex(`cd ${DIST_FOLDER} && zip -r ${name}.zip ${name}`);
    console.log(`\n\nCreated Chrome Release: ${chalk.magenta(name + ".zip")}`);

    // Step 6: Add command to manifest for Firefox
    const modCommands: { [key: string]: any } = {
      _execute_browser_action: { description: "Open the Snoozz popup" },
    };
    for (const [key, value] of Object.entries(manifest.commands || {})) {
      modCommands[key] = value;
    }
    manifest.commands = modCommands;
    fs.writeFileSync(
      path.join(TMP_FOLDER, "manifest.json"),
      JSON.stringify(manifest, null, 4),
      "utf-8",
    );

    // Step 7: Build Firefox release
    name = `snoozz-ff-${VERSION}`;
    fs.mkdirSync(path.join(DIST_FOLDER, name), { recursive: true });
    fs.cpSync(TMP_FOLDER, path.join(DIST_FOLDER, name), { recursive: true });
    ex(`cd ${DIST_FOLDER} && zip -r ${name}.zip ${name}`);
    console.log(`Created Firefox Release: ${chalk.magenta(name + ".zip")}`);

    // Step 8: Build GitHub release
    fs.copyFileSync("LICENSE", path.join(TMP_FOLDER, "LICENSE"));
    name = `snoozz-${VERSION}`;
    fs.mkdirSync(path.join(DIST_FOLDER, name), { recursive: true });
    fs.cpSync(TMP_FOLDER, path.join(DIST_FOLDER, name), { recursive: true });
    ex(`cd ${DIST_FOLDER} && zip -r ${name}.zip ${name}`);
    console.log(`Created GH Release: ${chalk.magenta(name + ".zip")}`);

    // Step 9: Modify manifest for Safari and build
    fs.copyFileSync("docs/safari.md", path.join(TMP_FOLDER, "safari.md"));
    fs.copyFileSync(
      "instructions_safari.txt",
      path.join(TMP_FOLDER, "instructions_safari.txt"),
    );
    fs.copyFileSync("safari.sh", path.join(TMP_FOLDER, "safari.sh"));

    if (manifest.permissions) {
      manifest.permissions = manifest.permissions.filter(
        (p: string) => p !== "idle" && p !== "notifications",
      );
      manifest.permissions = manifest.permissions.map((p: string) =>
        p.replace("tabs", "activeTab"),
      );
    }
    manifest.commands = {};

    fs.writeFileSync(
      path.join(TMP_FOLDER, "manifest.json"),
      JSON.stringify(manifest, null, 4),
      "utf-8",
    );

    name = `snoozz-safari-${VERSION}`;
    fs.mkdirSync(path.join(DIST_FOLDER, name), { recursive: true });
    fs.cpSync(TMP_FOLDER, path.join(DIST_FOLDER, name), { recursive: true });
    ex(`cd ${DIST_FOLDER} && zip -r ${name}.zip ${name}`);
    console.log(`Created Safari Release: ${chalk.magenta(name + ".zip")}`);

    // Step 10: Cleanup
    fs.rmSync(TMP_FOLDER, { recursive: true, force: true });

    console.log("\n\n✓ Build completed successfully!\n");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

// Run the build
build();
