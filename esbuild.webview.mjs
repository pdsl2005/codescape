// esbuild.webview.mjs
// Bundles src/webview/ TypeScript into a single JS file for the webview.
// Run: node esbuild.webview.mjs

import * as esbuild from "esbuild";

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
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("Watching webview files...");
} else {
  await esbuild.build(config);
  console.log("Webview bundle built → out/webview/webviewBundle.js");
}
