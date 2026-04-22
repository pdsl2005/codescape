// esbuild.webview.mjs
// Bundles src/webview/ TypeScript into a single JS file for the webview.
// Run: node esbuild.webview.mjs

import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Redirects CDN three.js imports (used in media/renderer3.js) to the local
// node_modules copy so esbuild can bundle them without network access.
const cdnRedirectPlugin = {
  name: "cdn-redirect",
  setup(build) {
    build.onResolve({ filter: /^https?:\/\/.+three/ }, (args) => {
      const match = args.path.match(/three@[\d.]+\/(.+)$/);
      if (match) {
        return { path: resolve(__dirname, "node_modules/three", match[1]) };
      }
      return null;
    });
  },
};

const isWatch = process.argv.includes("--watch");

const config = {
  entryPoints: ["src/webview/webviewMain.ts"],
  bundle: true,
  outfile: "out/webview/webviewBundle.js",
  format: "iife",          // self-executing, no module system needed
  target: "es2020",
  sourcemap: false,
  minify: false,            // keep readable for debugging, flip to true later
  external: [],             // everything gets inlined
  plugins: [cdnRedirectPlugin],
};

function copyAssets() {
  mkdirSync(resolve(__dirname, "out/webview/css"), { recursive: true });
  copyFileSync(
    resolve(__dirname, "src/webview/css/webview.css"),
    resolve(__dirname, "out/webview/css/webview.css"),
  );
  mkdirSync(resolve(__dirname, "out/webview/html"), { recursive: true });
  copyFileSync(
    resolve(__dirname, "src/webview/html/webview.html"),
    resolve(__dirname, "out/webview/html/webview.html"),
  );
}

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  copyAssets();
  console.log("Watching webview files...");
} else {
  await esbuild.build(config);
  copyAssets();
  console.log("Webview bundle built → out/webview/webviewBundle.js");
}
