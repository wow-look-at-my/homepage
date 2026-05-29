import fs from "fs";
import path from "path";

import type { Widget, WidgetRegistry } from "./types";

import createLogger from "utils/logger";


const logger = createLogger("pluginLoader");

// webpack rewrites bare `require(expr)` into something it cannot resolve, but it
// leaves `__non_webpack_require__` alone, mapping it to the real Node require.
// Under Vitest/Node `__non_webpack_require__` is undefined, so we fall back to the
// normal `require` -- which keeps the loader tests (temp .js fixtures) working.
const runtimeRequire: NodeRequire = typeof __non_webpack_require__ !== "undefined" ? __non_webpack_require__ : require;

function isValidWidget(obj: unknown, dirName: string): obj is Widget {
  if (!obj || typeof obj !== "object") {
    logger.error("Plugin '%s': export is not an object", dirName);
    return false;
  }

  const w = obj as Record<string, unknown>;

  if (typeof w.id !== "string" || w.id.length === 0) {
    logger.error("Plugin '%s': missing or invalid 'id' (must be a non-empty string)", dirName);
    return false;
  }

  if (w.id !== dirName) {
    logger.error("Plugin '%s': id '%s' does not match directory name", dirName, w.id);
    return false;
  }

  if (typeof w.name !== "string" || w.name.length === 0) {
    logger.error("Plugin '%s': missing or invalid 'name' (must be a non-empty string)", dirName);
    return false;
  }

  if (!w.definition || typeof w.definition !== "object") {
    logger.error("Plugin '%s': missing or invalid 'definition' (must be an object)", dirName);
    return false;
  }

  const def = w.definition as Record<string, unknown>;
  if (typeof def.api !== "string" && typeof def.proxyHandler !== "function") {
    logger.error("Plugin '%s': definition must have an 'api' string or a 'proxyHandler' function", dirName);
    return false;
  }

  return true;
}

function registerWidget(widget: Widget, registry: WidgetRegistry, seen: Set<string>): void {
  if (seen.has(widget.id)) {
    logger.warn("Plugin '%s': id already registered, skipping", widget.id);
    return;
  }

  registry[widget.id] = widget.definition;
  seen.add(widget.id);
  logger.debug("Loaded plugin: %s", widget.id);

  if (widget.aliases) {
    for (const alias of widget.aliases) {
      if (seen.has(alias)) {
        logger.warn("Plugin '%s': alias '%s' conflicts with existing widget, skipping alias", widget.id, alias);
        continue;
      }
      registry[alias] = widget.definition;
      seen.add(alias);
      logger.debug("Registered alias: %s -> %s", alias, widget.id);
    }
  }
}

// Built-in plugins (src/widgets/plugins/<name>/index.ts) are bundled at build time.
// Discover them with webpack's require.context -- the same webpack-friendly idiom
// plugin-components.ts uses -- in "sync" mode, because widgets.js consumes the
// definitions synchronously at module init. Under Vitest/Node require.context does not
// exist and throws; the catch makes this a no-op there (built-ins are exercised by each
// plugin's own index.test.ts instead).
function loadBuiltinPlugins(registry: WidgetRegistry, seen: Set<string>): void {
  try {
    const ctx = require.context("./plugins", true, /^\.\/[^/]+\/index\.(ts|js)$/, "sync");
    for (const key of ctx.keys()) {
      const match = key.match(/^\.\/([^/]+)\/index\.(ts|js)$/);
      if (!match) continue;

      const dirName = match[1];
      const mod = ctx(key) as { default?: unknown };
      const widget = mod.default ?? mod;

      if (isValidWidget(widget, dirName)) {
        registerWidget(widget, registry, seen);
      }
    }
  } catch {
    // require.context is unavailable outside a webpack build (e.g. under Vitest).
  }
}

// External plugins live in HOMEPAGE_PLUGINS_DIR and are loaded at runtime, so webpack can
// never bundle them. They ship plain CommonJS (index.js/.cjs); load them with the real
// Node require via runtimeRequire (native require cannot load .ts).
function loadExternalPlugins(dir: string, registry: WidgetRegistry, seen: Set<string>): void {
  if (!fs.existsSync(dir)) {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    logger.error("Failed to read plugins directory '%s': %s", dir, err);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirName = entry.name;
    const pluginDir = path.join(dir, dirName);

    let mod: { default?: unknown };
    try {
      mod = runtimeRequire(pluginDir);
    } catch (err) {
      logger.error("Plugin '%s': failed to load: %s", dirName, err);
      continue;
    }

    const widget = mod.default ?? mod;

    if (isValidWidget(widget, dirName)) {
      registerWidget(widget, registry, seen);
    }
  }
}

let cachedDefinitions: WidgetRegistry | null = null;

export function getPluginDefinitions(legacyKeys?: Set<string>): WidgetRegistry {
  if (cachedDefinitions) return cachedDefinitions;

  const registry: WidgetRegistry = {};
  const seen = new Set<string>(legacyKeys ?? []);

  loadBuiltinPlugins(registry, seen);

  const externalDir = process.env.HOMEPAGE_PLUGINS_DIR;
  if (externalDir) {
    loadExternalPlugins(externalDir, registry, seen);
  }

  cachedDefinitions = registry;
  return registry;
}

export function clearPluginCache(): void {
  cachedDefinitions = null;
}
