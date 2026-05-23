import { describe, expect, it } from "vitest";

import widget from "./index";

import { expectWidgetConfigShape } from "test-utils/widget-config";


describe("plugins/adguard widget config", () => {
  it("exports a valid widget config", () => {
    expectWidgetConfigShape(widget.definition);
    expect(widget.definition.mappings?.stats?.endpoint).toBe("stats");
  });

  it("has correct plugin metadata", () => {
    expect(widget.id).toBe("adguard");
    expect(widget.name).toBe("AdGuard Home");
  });
});
