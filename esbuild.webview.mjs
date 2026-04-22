// esbuild.webview.mjs
// Bundles src/webview/ TypeScript into a single JS file for the webview.
// Run: node esbuild.webview.mjs

import * as esbuild from "esbuild";
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

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("Watching webview files...");
} else {
  await esbuild.build(config);
  console.log("Webview bundle built → out/webview/webviewBundle.js");
}
