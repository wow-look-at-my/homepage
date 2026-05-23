import crypto from "crypto";
import fs from "fs";
import path from "path";

import esbuild from "esbuild";

import createLogger from "utils/logger";

const logger = createLogger("pluginCompiler");

const SHARED_MODULES = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "next-i18next",
  "components/services/widget/block",
  "components/services/widget/container",
  "utils/proxy/use-widget-api",
  "swr",
]);

function sharedModulesPlugin() {
  return {
    name: "homepage-shared-modules",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (SHARED_MODULES.has(args.path)) {
          return { path: args.path, namespace: "homepage-shared" };
        }
        return undefined;
      });

      build.onLoad({ filter: /.*/, namespace: "homepage-shared" }, (args) => ({
        contents: `module.exports = window.__HOMEPAGE_SHARED__["${args.path}"];`,
        loader: "js",
      }));
    },
  };
}

const compiledPlugins = new Map();
let watchersStarted = false;

function findComponent(pluginDir) {
  for (const ext of ["component.tsx", "component.jsx", "component.ts", "component.js"]) {
    const p = path.join(pluginDir, ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function hashCode(code) {
  return crypto.createHash("md5").update(code).digest("hex").slice(0, 8);
}

async function compilePlugin(name, pluginDir) {
  const componentPath = findComponent(pluginDir);
  if (!componentPath) {
    logger.warn("External plugin '%s': no component file found", name);
    return null;
  }

  try {
    const result = await esbuild.build({
      entryPoints: [componentPath],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "__plugin_export__",
      platform: "browser",
      target: "es2017",
      jsx: "transform",
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment",
      banner: {
        js: `var React = window.__HOMEPAGE_SHARED__["react"];`,
      },
      footer: {
        js: [
          `window.__HOMEPAGE_PLUGINS__ = window.__HOMEPAGE_PLUGINS__ || {};`,
          `window.__HOMEPAGE_PLUGINS__["${name}"] = __plugin_export__["default"] || __plugin_export__;`,
        ].join("\n"),
      },
      plugins: [sharedModulesPlugin()],
      loader: { ".tsx": "tsx", ".ts": "ts", ".jsx": "jsx", ".js": "js" },
    });

    if (result.outputFiles && result.outputFiles.length > 0) {
      const code = result.outputFiles[0].text;
      return { code, hash: hashCode(code) };
    }
  } catch (err) {
    logger.error("External plugin '%s': compilation failed: %s", name, err);
  }
  return null;
}

async function compileAndStore(name, pluginDir) {
  const result = await compilePlugin(name, pluginDir);
  if (result) {
    const prev = compiledPlugins.get(name);
    compiledPlugins.set(name, result);
    if (prev && prev.hash !== result.hash) {
      logger.info("Recompiled external plugin: %s (hash %s -> %s)", name, prev.hash, result.hash);
    } else if (!prev) {
      logger.debug("Compiled external plugin: %s (hash %s, %d bytes)", name, result.hash, result.code.length);
    }
  }
}

function watchPluginDir(pluginDir, name) {
  const debounceTimers = new Map();

  try {
    fs.watch(pluginDir, { recursive: false }, (eventType, filename) => {
      if (!filename) return;

      const existing = debounceTimers.get(name);
      if (existing) clearTimeout(existing);

      debounceTimers.set(
        name,
        setTimeout(() => {
          debounceTimers.delete(name);
          logger.debug("File change detected in plugin '%s': %s", name, filename);
          compileAndStore(name, pluginDir);
        }, 200),
      );
    });
  } catch {
    // fs.watch may not be available on all platforms; fall back to no watching
  }
}

function startWatching(externalDir) {
  if (watchersStarted) return;
  watchersStarted = true;

  let entries;
  try {
    entries = fs.readdirSync(externalDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    watchPluginDir(path.join(externalDir, entry.name), entry.name);
  }

  // Watch the top-level dir for new plugin folders
  try {
    fs.watch(externalDir, { recursive: false }, (eventType, filename) => {
      if (!filename) return;
      const pluginDir = path.join(externalDir, filename);
      if (fs.existsSync(pluginDir) && fs.statSync(pluginDir).isDirectory() && !compiledPlugins.has(filename)) {
        logger.info("New external plugin detected: %s", filename);
        compileAndStore(filename, pluginDir);
        watchPluginDir(pluginDir, filename);
      }
    });
  } catch {
    // fall back to no watching
  }
}

let initPromise = null;

export async function initExternalPlugins() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const externalDir = process.env.HOMEPAGE_PLUGINS_DIR;
    if (!externalDir || !fs.existsSync(externalDir)) return;

    let entries;
    try {
      entries = fs.readdirSync(externalDir, { withFileTypes: true });
    } catch (err) {
      logger.error("Failed to read HOMEPAGE_PLUGINS_DIR '%s': %s", externalDir, err);
      return;
    }

    const promises = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      promises.push(compileAndStore(entry.name, path.join(externalDir, entry.name)));
    }
    await Promise.all(promises);

    startWatching(externalDir);
  })();

  return initPromise;
}

export function getCompiledPlugin(name) {
  const entry = compiledPlugins.get(name);
  return entry ? entry.code : null;
}

export function listExternalPlugins() {
  const result = {};
  for (const [name, entry] of compiledPlugins) {
    result[name] = entry.hash;
  }
  return result;
}

export function resetCompilerState() {
  compiledPlugins.clear();
  watchersStarted = false;
  initPromise = null;
}
