import fs from "fs";
import path from "path";

import createLogger from "utils/logger";

import type { Widget, WidgetRegistry } from "./types";

const logger = createLogger("pluginLoader");

const PLUGINS_DIR = path.join(__dirname, "plugins");

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

function loadPluginsFromDir(dir: string, registry: WidgetRegistry, seen: Set<string>): void {
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
      mod = require(pluginDir);
    } catch (err) {
      logger.error("Plugin '%s': failed to load: %s", dirName, err);
      continue;
    }

    const widget = mod.default ?? mod;

    if (!isValidWidget(widget, dirName)) {
      continue;
    }

    if (seen.has(widget.id)) {
      logger.warn("Plugin '%s': id already registered, skipping", widget.id);
      continue;
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
}

let cachedDefinitions: WidgetRegistry | null = null;

export function getPluginDefinitions(legacyKeys?: Set<string>): WidgetRegistry {
  if (cachedDefinitions) return cachedDefinitions;

  const registry: WidgetRegistry = {};
  const seen = new Set<string>(legacyKeys ?? []);

  loadPluginsFromDir(PLUGINS_DIR, registry, seen);

  const externalDir = process.env.HOMEPAGE_PLUGINS_DIR;
  if (externalDir) {
    loadPluginsFromDir(externalDir, registry, seen);
  }

  cachedDefinitions = registry;
  return registry;
}

export function clearPluginCache(): void {
  cachedDefinitions = null;
}
