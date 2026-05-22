import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getCompiledPlugin, initExternalPlugins, listExternalPlugins, resetCompilerState } from "./plugin-compiler";

const FIXTURES_DIR = path.join(__dirname, "__test_external_plugins__");

function writeExternalPlugin(name, componentCode) {
  const dir = path.join(FIXTURES_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "component.jsx"), componentCode);
  fs.writeFileSync(
    path.join(dir, "index.js"),
    `module.exports = { default: { id: "${name}", name: "${name}", definition: { api: "{url}/api/{endpoint}" } } };`,
  );
}

describe("plugin-compiler", () => {
  beforeEach(() => {
    resetCompilerState();
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    process.env.HOMEPAGE_PLUGINS_DIR = FIXTURES_DIR;
  });

  afterEach(() => {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
    delete process.env.HOMEPAGE_PLUGINS_DIR;
  });

  it("compiles a simple external plugin component", async () => {
    writeExternalPlugin(
      "test-ext",
      `
      import React from "react";
      export default function Component({ service }) {
        return React.createElement("div", null, "hello from ", service.widget.type);
      }
    `,
    );

    await initExternalPlugins();

    expect(listExternalPlugins()).toContain("test-ext");

    const code = getCompiledPlugin("test-ext");
    expect(code).toBeTruthy();
    expect(code).toContain("__HOMEPAGE_PLUGINS__");
    expect(code).toContain("test-ext");
  });

  it("returns empty list when no external plugins dir", async () => {
    process.env.HOMEPAGE_PLUGINS_DIR = path.join(FIXTURES_DIR, "nonexistent");

    await initExternalPlugins();

    expect(listExternalPlugins()).toEqual([]);
  });

  it("skips plugins without a component file", async () => {
    const dir = path.join(FIXTURES_DIR, "no-component");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.js"), "module.exports = {};");

    await initExternalPlugins();

    expect(getCompiledPlugin("no-component")).toBeNull();
  });
});
