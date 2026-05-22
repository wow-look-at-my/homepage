import esbuild from "esbuild";
import fs from "fs";
import path from "path";

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
let initialized = false;

function findComponent(pluginDir) {
  for (const ext of ["component.tsx", "component.jsx", "component.ts", "component.js"]) {
    const p = path.join(pluginDir, ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
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
      loader: {
        ".tsx": "tsx",
        ".ts": "ts",
        ".jsx": "jsx",
        ".js": "js",
      },
    });

    if (result.outputFiles && result.outputFiles.length > 0) {
      return result.outputFiles[0].text;
    }
  } catch (err) {
    logger.error("External plugin '%s': compilation failed: %s", name, err);
  }
  return null;
}

export async function initExternalPlugins() {
  if (initialized) return;

  const externalDir = process.env.HOMEPAGE_PLUGINS_DIR;
  if (!externalDir || !fs.existsSync(externalDir)) {
    initialized = true;
    return;
  }

  let entries;
  try {
    entries = fs.readdirSync(externalDir, { withFileTypes: true });
  } catch (err) {
    logger.error("Failed to read HOMEPAGE_PLUGINS_DIR '%s': %s", externalDir, err);
    initialized = true;
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const name = entry.name;
    const pluginDir = path.join(externalDir, name);
    const code = await compilePlugin(name, pluginDir);
    if (code) {
      compiledPlugins.set(name, code);
      logger.debug("Compiled external plugin: %s (%d bytes)", name, code.length);
    }
  }

  initialized = true;
}

export function getCompiledPlugin(name) {
  return compiledPlugins.get(name) || null;
}

export function listExternalPlugins() {
  return Array.from(compiledPlugins.keys());
}

export function resetCompilerState() {
  compiledPlugins.clear();
  initialized = false;
}
