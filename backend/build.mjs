/**
 * Vercel build for the API.
 *
 * Emits a complete Build Output API v3 directory, so nothing else should build
 * on top of it. `vercel.json` sets `framework: null` for exactly that reason:
 * the project's Hono preset used to run after this script and replace the
 * bundle with plain src/*.js, which keeps TypeScript's extensionless imports.
 * Node's ESM resolver rejects those, so every cold start died with
 * ERR_MODULE_NOT_FOUND and the deployed function returned 500 on every request.
 */

import { build } from "esbuild";
import { mkdirSync, writeFileSync, copyFileSync, cpSync } from "fs";
import { execSync } from "child_process";

const FUNC_DIR = ".vercel/output/functions/index.func";
mkdirSync(FUNC_DIR, { recursive: true });

// Bundle the entire app into a single file
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: `${FUNC_DIR}/index.mjs`,
  // Mark npm packages as external (resolved from node_modules at runtime)
  packages: "external",
  sourcemap: true,
  minify: false,
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

// Copy package.json and install production deps in function dir
copyFileSync("package.json", `${FUNC_DIR}/package.json`);
execSync("npm install --omit=dev --legacy-peer-deps", {
  cwd: FUNC_DIR,
  stdio: "inherit",
});

// Function config
writeFileSync(
  `${FUNC_DIR}/.vc-config.json`,
  JSON.stringify(
    {
      handler: "index.mjs",
      runtime: "nodejs22.x",
      launcherType: "Nodejs",
      shouldAddHelpers: true,
      shouldAddSourcemapSupport: true,
      maxDuration: 60,
    },
    null,
    2
  )
);

// Vercel output config with catch-all route
mkdirSync(".vercel/output", { recursive: true });
writeFileSync(
  ".vercel/output/config.json",
  JSON.stringify(
    {
      version: 3,
      routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/index" }],
    },
    null,
    2
  )
);

console.log("Build complete → .vercel/output/");
