# Widget Plugin Authoring Guide

This guide covers how to create a new widget plugin for Homepage.

## Quick Start

```bash
pnpm create-widget my-service
```

This scaffolds a new plugin at `src/widgets/plugins/my-service/` with three files:

- `index.ts` -- widget definition (API template, proxy handler, endpoint mappings)
- `component.tsx` -- React component that renders the widget UI
- `types.ts` -- TypeScript interfaces for API response data

The plugin is auto-discovered at build/dev time -- no registration in any central file required.

## Plugin Structure

```
src/widgets/plugins/my-service/
  index.ts          # required: default-exports a Widget object
  component.tsx     # required: default-exports a React component
  types.ts          # optional: API response type definitions
```

### `index.ts` -- Widget Definition

```typescript
import genericProxyHandler from "utils/proxy/handlers/generic";
import type { Widget } from "widgets/types";

const widget: Widget = {
  id: "my-service",        // must match directory name
  name: "My Service",      // human-readable name
  description: "Monitors my service",

  definition: {
    api: "{url}/api/v1/{endpoint}",
    proxyHandler: genericProxyHandler,
    mappings: {
      stats: {
        endpoint: "stats",
        validate: ["total"],           // response must contain these fields
      },
      items: {
        endpoint: "items",
        params: ["page", "limit"],     // query params passed from component
        map: (data) => transform(data), // optional response transformation
      },
    },
  },

  aliases: ["my-service-v2"], // optional: additional type names
};

export default widget;
```

### The `Widget` Interface

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | yes | Unique identifier, must match the plugin directory name |
| `name` | `string` | yes | Human-readable display name |
| `description` | `string` | no | Brief description |
| `definition` | `WidgetDefinition` | yes | Proxy and API configuration |
| `aliases` | `string[]` | no | Additional type names that resolve to this widget |

### The `WidgetDefinition` Interface

| Field | Type | Description |
|-------|------|-------------|
| `api` | `string` | URL template with `{url}`, `{endpoint}`, `{key}` placeholders |
| `proxyHandler` | `ProxyHandler` | Proxy handler function (usually `genericProxyHandler`) |
| `mappings` | `Record<string, EndpointMapping>` | Map of endpoint names to their configurations |
| `headers` | `Record<string, string>` | Default HTTP headers for all endpoints |
| `allowedEndpoints` | `RegExp` | Regex for endpoints that bypass explicit mapping |

### The `EndpointMapping` Interface

| Field | Type | Description |
|-------|------|-------------|
| `endpoint` | `string` | Actual API path (substituted into `{endpoint}` in the API template) |
| `validate` | `string[]` | Fields that must exist in the response |
| `params` | `string[]` | Query parameter names to pass through to the upstream API |
| `optionalParams` | `string[]` | Optional query parameters (included only if provided) |
| `map` | `(data) => unknown` | Transform function applied to the response before returning to client |
| `method` | `string` | HTTP method override (default: `GET`) |
| `segments` | `string[]` | Dynamic URL path segments (e.g., `{id}` in the endpoint path) |
| `headers` | `Record<string, string>` | Per-endpoint header overrides |
| `body` | `unknown` | Request body (for POST/PUT endpoints) |

## Proxy Lifecycle

When a user's browser loads a widget:

1. The component calls `useWidgetAPI(widget, "stats")` (or whatever endpoint name)
2. The hook builds a URL: `/api/services/proxy?group=X&service=Y&endpoint=stats`
3. The server-side proxy route looks up the widget definition by type
4. It finds the `stats` mapping and builds the upstream URL from the `api` template
5. It calls the `proxyHandler` which fetches from the upstream service
6. Auth credentials (from `services.yaml`) are added as headers automatically
7. The response is validated (if `validate` is set) and transformed (if `map` is set)
8. The result is returned to the browser as JSON

Plugins never make client-side network requests. All upstream communication goes through the server-side proxy.

## Component Pattern

```tsx
import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";
import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;

  const { data, error } = useWidgetAPI(widget, "stats");

  // Error state
  if (error) return <Container service={service} error={error} />;

  // Loading state (data not yet available)
  if (!data) {
    return (
      <Container service={service}>
        <Block label="my-service.total" />
      </Container>
    );
  }

  // Loaded state
  return (
    <Container service={service}>
      <Block label="my-service.total" value={t("common.number", { value: data.total })} />
    </Container>
  );
}
```

### Key rules for components:

- Always handle three states: error, loading (no data), and loaded
- Use `<Container>` as the wrapper and `<Block>` for each data field
- Translation keys follow the pattern `widgetname.fieldname`
- Pass formatted values through `useTranslation()`'s `t()` function
- Multiple endpoints: call `useWidgetAPI` once per endpoint

## Configuration (services.yaml)

Users configure widgets in their `services.yaml`:

```yaml
- Services:
    - My Service:
        href: https://my-service.example.com
        icon: my-service.png
        widget:
          type: my-service
          url: http://localhost:8080
          key: my-api-key
```

The `url` and `key` fields map to `{url}` and `{key}` in the API template. The `type` field must match the plugin's `id`.

### Authentication

The proxy system handles auth automatically based on the `services.yaml` config:

- **API key in URL**: Use `{key}` in the `api` template (e.g., `"{url}/api?apikey={key}"`)
- **Basic auth**: Set `username` and `password` in the YAML config; the generic handler adds an `Authorization: Basic` header
- **Custom auth**: Use `credentialedProxyHandler` instead of `genericProxyHandler` for Bearer tokens, X-API-Key headers, etc.

## Aliases

If your service has alternate names (e.g., a rebrand), declare them in `aliases`:

```typescript
const widget: Widget = {
  id: "myapp",
  name: "MyApp",
  aliases: ["myapp-legacy", "oldname"],
  // ...
};
```

Users can use `type: myapp`, `type: myapp-legacy`, or `type: oldname` in their YAML.

## Testing

### Widget definition test

```typescript
import { describe, expect, it } from "vitest";
import { expectWidgetConfigShape } from "test-utils/widget-config";
import widget from "./index";

describe("my-service widget config", () => {
  it("exports a valid widget config", () => {
    expectWidgetConfigShape(widget.definition);
  });
});
```

### Component test

```tsx
// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils/render-with-providers";

const { useWidgetAPI } = vi.hoisted(() => ({ useWidgetAPI: vi.fn() }));
vi.mock("utils/proxy/use-widget-api", () => ({ default: useWidgetAPI }));

import Component from "./component";

describe("my-service component", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders placeholders while loading", () => {
    useWidgetAPI.mockReturnValue({ data: undefined, error: undefined });
    const { container } = renderWithProviders(
      <Component service={{ widget: { type: "my-service" } }} />,
      { settings: { hideErrors: false } },
    );
    expect(container.querySelectorAll(".service-block")).toHaveLength(1);
  });
});
```

Run tests: `pnpm test`

## Local Development

1. Create the plugin: `pnpm create-widget my-service`
2. Configure a test service in your local `services.yaml`
3. Start the dev server: `pnpm dev`
4. The plugin is auto-discovered and available immediately
5. Edit the component and see changes via hot reload

## Legacy Widgets

Existing widgets in `src/widgets/{name}/` continue to work unchanged. They are loaded from `legacy-widgets.js` and `legacy-components.js`. New widgets should be created as plugins in `src/widgets/plugins/`. To migrate a legacy widget, move its files to the plugin format and remove its entries from the legacy registries.
