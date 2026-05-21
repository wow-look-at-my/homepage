import { describe, expect, it } from "vitest";

import { expectWidgetConfigShape } from "test-utils/widget-config";

import widget from "./index";

describe("plugins/sonarr widget config", () => {
  it("exports a valid widget config", () => {
    expectWidgetConfigShape(widget.definition);
  });

  it("has correct plugin metadata", () => {
    expect(widget.id).toBe("sonarr");
    expect(widget.name).toBe("Sonarr");
  });

  it("defines all required endpoint mappings", () => {
    const mappings = widget.definition.mappings!;
    expect(mappings.series.endpoint).toBe("series");
    expect(mappings.queue.endpoint).toBe("queue");
    expect(mappings["wanted/missing"].endpoint).toBe("wanted/missing");
    expect(mappings["queue/details"].endpoint).toBe("queue/details");
    expect(mappings.calendar.endpoint).toBe("calendar");
  });
});
