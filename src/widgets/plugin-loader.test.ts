import fs from "fs";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/logger", () => ({
  default: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { clearPluginCache, getPluginDefinitions } from "./plugin-loader";

const FIXTURES_DIR = path.join(__dirname, "__test_plugins__");

function writePlugin(name: string, content: string) {
  const dir = path.join(FIXTURES_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.js"), content);
}

function cleanFixtures() {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  }
  Object.keys(require.cache)
    .filter((key) => key.includes("__test_plugins__"))
    .forEach((key) => delete require.cache[key]);
}

describe("plugin-loader", () => {
  beforeEach(() => {
    clearPluginCache();
    cleanFixtures();
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    process.env.HOMEPAGE_PLUGINS_DIR = FIXTURES_DIR;
  });

  afterEach(() => {
    delete process.env.HOMEPAGE_PLUGINS_DIR;
    cleanFixtures();
  });

  it("returns empty registry when plugins directory does not exist", () => {
    cleanFixtures();
    clearPluginCache();
    process.env.HOMEPAGE_PLUGINS_DIR = path.join(FIXTURES_DIR, "nonexistent");
    const result = getPluginDefinitions();
    expect(result).toEqual({});
  });

  it("loads a valid plugin", () => {
    writePlugin(
      "testwidget",
      `module.exports = {
        default: {
          id: "testwidget",
          name: "Test Widget",
          definition: {
            api: "{url}/api/{endpoint}",
            mappings: { status: { endpoint: "status" } },
          },
        },
      };`,
    );

    const result = getPluginDefinitions();
    expect(result.testwidget).toBeDefined();
    expect(result.testwidget.api).toBe("{url}/api/{endpoint}");
  });

  it("skips plugin with missing id", () => {
    writePlugin(
      "noid",
      `module.exports = {
        default: {
          name: "No ID Widget",
          definition: { api: "{url}/api/{endpoint}" },
        },
      };`,
    );

    const result = getPluginDefinitions();
    expect(result.noid).toBeUndefined();
  });

  it("skips plugin with mismatched id and directory name", () => {
    writePlugin(
      "mismatch",
      `module.exports = {
        default: {
          id: "wrongname",
          name: "Mismatched Widget",
          definition: { api: "{url}/api/{endpoint}" },
        },
      };`,
    );

    const result = getPluginDefinitions();
    expect(result.mismatch).toBeUndefined();
    expect(result.wrongname).toBeUndefined();
  });

  it("skips plugin with missing definition", () => {
    writePlugin(
      "nodef",
      `module.exports = {
        default: {
          id: "nodef",
          name: "No Definition Widget",
        },
      };`,
    );

    const result = getPluginDefinitions();
    expect(result.nodef).toBeUndefined();
  });

  it("skips plugin that throws on require", () => {
    writePlugin("throws", `throw new Error("plugin init failure");`);

    const result = getPluginDefinitions();
    expect(result.throws).toBeUndefined();
  });

  it("skips plugin whose id conflicts with legacy keys", () => {
    writePlugin(
      "legacy",
      `module.exports = {
        default: {
          id: "legacy",
          name: "Legacy Conflict",
          definition: { api: "{url}/api/{endpoint}" },
        },
      };`,
    );

    const result = getPluginDefinitions(new Set(["legacy"]));
    expect(result.legacy).toBeUndefined();
  });

  it("registers aliases", () => {
    writePlugin(
      "aliased",
      `module.exports = {
        default: {
          id: "aliased",
          name: "Aliased Widget",
          aliases: ["alias1", "alias2"],
          definition: { api: "{url}/api/{endpoint}" },
        },
      };`,
    );

    const result = getPluginDefinitions();
    expect(result.aliased).toBeDefined();
    expect(result.alias1).toBe(result.aliased);
    expect(result.alias2).toBe(result.aliased);
  });

  it("skips alias that conflicts with existing key", () => {
    writePlugin(
      "hasconflict",
      `module.exports = {
        default: {
          id: "hasconflict",
          name: "Conflict Widget",
          aliases: ["existing"],
          definition: { api: "{url}/api/{endpoint}" },
        },
      };`,
    );

    const result = getPluginDefinitions(new Set(["existing"]));
    expect(result.hasconflict).toBeDefined();
    expect(result.existing).toBeUndefined();
  });
});
