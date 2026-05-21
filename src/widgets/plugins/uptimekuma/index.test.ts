import { describe, expect, it } from "vitest";

import { expectWidgetConfigShape } from "test-utils/widget-config";

import widget from "./index";

describe("plugins/uptimekuma widget config", () => {
  it("exports a valid widget config", () => {
    expectWidgetConfigShape(widget.definition);
  });

  it("has correct plugin metadata", () => {
    expect(widget.id).toBe("uptimekuma");
    expect(widget.name).toBe("Uptime Kuma");
  });

  it("defines endpoint mappings", () => {
    const mappings = widget.definition.mappings!;
    expect(mappings.status_page.endpoint).toBe("status-page");
    expect(mappings.heartbeat.endpoint).toBe("status-page/heartbeat");
  });
});
