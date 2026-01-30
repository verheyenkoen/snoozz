const pkg = await Bun.file("package.json").json();
const manifestFile = Bun.file("manifest.json");
const manifest = await manifestFile.json();

manifest.version = pkg.version;

await Bun.write(manifestFile, JSON.stringify(manifest, null, 2));
console.log(`manifest.json version updated to ${pkg.version}`);

// Stage changes
await Bun.$`git add manifest.json`;
