# Widget Plugin Authoring Guide

## How Plugins Work

Homepage auto-discovers widget plugins from `src/widgets/plugins/`. Each plugin is a folder containing a widget definition and a React component. When you run `pnpm dev` or `pnpm build`, the build system picks up every plugin automatically -- no registration in any central file.

There are two parts to every widget:

1. **Server-side definition** (`index.ts`) -- tells the proxy layer how to reach the upstream API, what endpoints are allowed, and how to transform responses. Loaded at runtime via filesystem scan.
2. **Client-side component** (`component.tsx`) -- the React UI that renders the widget. Loaded at build time via webpack.

Because the component is bundled by webpack, **plugins must be present in the source tree when the app is built**. You cannot drop a plugin into a running Homepage instance and have its UI appear without a rebuild. The proxy layer would work, but the browser would show "missing widget type" because webpack never bundled the component.

## Adding a Plugin Without Modifying Core Files

The key guarantee: you never edit `widgets.js`, `components.js`, or any other core file. You create a folder, build, and run. That's it.

### Path 1: Source checkout (recommended for development)

```bash
# Clone the repo
git clone https://github.com/gethomepage/homepage.git
cd homepage

# Scaffold a new plugin
pnpm install
pnpm create-widget my-service

# Edit the generated files in src/widgets/plugins/my-service/
# Then run
pnpm dev
```

The plugin is live immediately. Hot reload works. No core files touched.

### Path 2: Custom Docker image (recommended for deployment)

If you run Homepage via Docker and want to add a custom widget to your deployment:

```dockerfile
FROM ghcr.io/gethomepage/homepage:latest AS base

# Copy your plugin into the plugins directory
COPY my-service-plugin/ /app/src/widgets/plugins/my-service/

# Rebuild with your plugin included
RUN pnpm build
```

Build and run your custom image:

```bash
docker build -t my-homepage .
docker run -p 3000:3000 my-homepage
```

Your plugin is baked into the image. The core Homepage source is untouched -- your plugin sits alongside it in the plugins directory.

### Path 3: No code at all -- `customapi`

If you don't need a custom UI and just want to display fields from an arbitrary API, the built-in `customapi` widget handles this entirely through YAML configuration:

```yaml
- Services:
    - My Service:
        widget:
          type: customapi
          url: http://localhost:8080/api/stats
          mappings:
            - field: total_users
              label: Users
              format: number
            - field: uptime_percent
              label: Uptime
              format: percent
```

No plugin code needed. See the Homepage docs for full `customapi` options.

## Plugin Structure

```
src/widgets/plugins/my-service/
  index.ts          # required: default-exports a Widget object
  component.tsx     # required: default-exports a React component
  types.ts          # optional: API response type definitions
```

### Scaffolding

```bash
pnpm create-widget my-service
```

Creates all three files with boilerplate. The script validates the name and checks for conflicts with existing widgets.

## Writing the Definition (`index.ts`)

The definition tells the server-side proxy how to talk to your service's API.

```typescript
import genericProxyHandler from "utils/proxy/handlers/generic";
import type { Widget } from "widgets/types";

const widget: Widget = {
  id: "my-service",        // must match the folder name exactly
  name: "My Service",
  description: "Monitors my service",

  definition: {
    // URL template. {url} comes from the user's services.yaml.
    // {endpoint} is replaced per-mapping. {key} is the API key.
    api: "{url}/api/v1/{endpoint}",
    proxyHandler: genericProxyHandler,

    mappings: {
      // Each key is an endpoint name used in the component
      stats: {
        endpoint: "stats",               // actual API path
        validate: ["total"],             // response must contain these fields
      },
      items: {
        endpoint: "items",
        params: ["page", "limit"],       // query params forwarded from the component
        map: (data) => transform(data),  // optional: reshape the response
      },
    },
  },

  // Optional: register alternative type names
  aliases: ["my-service-v2"],
};

export default widget;
```

### URL Template Placeholders

| Placeholder | Source | Example |
|-------------|--------|---------|
| `{url}` | `widget.url` in `services.yaml` | `http://localhost:8080` |
| `{endpoint}` | The mapping's `endpoint` field | `stats` |
| `{key}` | `widget.key` in `services.yaml` | `abc123` |

You can use any field from the user's YAML config as a placeholder. For example, `{slug}` works if the user sets `slug: my-page` in their config.

### Endpoint Mapping Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `endpoint` | `string` | -- | API path substituted into `{endpoint}` |
| `validate` | `string[]` | -- | Fields that must exist in the response (returns error if missing) |
| `params` | `string[]` | -- | Query parameter names to forward from the component call |
| `optionalParams` | `string[]` | -- | Query params included only if the component provides them |
| `map` | `(data) => unknown` | -- | Transform the raw API response before sending to the browser |
| `method` | `string` | `GET` | HTTP method |
| `segments` | `string[]` | -- | Dynamic URL path segments (e.g., `{id}`) |
| `headers` | `Record<string, string>` | -- | Extra HTTP headers for this endpoint |
| `body` | `unknown` | -- | Request body for POST/PUT |

### Authentication

Auth is handled automatically based on the user's `services.yaml`:

- **API key in URL**: Use `{key}` in the `api` template (e.g., `"{url}/api?apikey={key}"`)
- **Basic auth**: The user sets `username` and `password`; the generic handler adds `Authorization: Basic` automatically
- **Bearer/custom headers**: Use `credentialedProxyHandler` instead of `genericProxyHandler`

```typescript
import credentialedProxyHandler from "utils/proxy/handlers/credentialed";

const widget: Widget = {
  // ...
  definition: {
    api: "{url}/api/{endpoint}",
    proxyHandler: credentialedProxyHandler,
    // The credentialed handler reads widget.key and sends it
    // as an appropriate auth header based on the service type
  },
};
```

## Writing the Component (`component.tsx`)

The component renders the widget UI using data fetched through the proxy.

```tsx
import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";
import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }: { service: { widget: Record<string, unknown>; [key: string]: unknown } }) {
  const { t } = useTranslation();
  const { widget } = service;

  // Fetch data through the proxy. "stats" matches a key in definition.mappings.
  const { data, error } = useWidgetAPI(widget, "stats");

  // 1. Error state
  if (error) return <Container service={service} error={error} />;

  // 2. Loading state (data hasn't arrived yet)
  if (!data) {
    return (
      <Container service={service}>
        <Block label="my-service.total" />
        <Block label="my-service.active" />
      </Container>
    );
  }

  // 3. Loaded state
  return (
    <Container service={service}>
      <Block label="my-service.total" value={t("common.number", { value: data.total })} />
      <Block label="my-service.active" value={t("common.number", { value: data.active })} />
    </Container>
  );
}
```

### Rules

- Always handle all three states: error, loading, loaded
- Use `<Container>` as the outer wrapper and `<Block>` for each data field
- Call `useWidgetAPI(widget, "endpointName")` for each endpoint defined in your mappings
- Format values through `t()` from `useTranslation()` (handles locale-aware number/date formatting)
- Never make HTTP requests directly from the component -- all data flows through the proxy

### Multiple Endpoints

Call `useWidgetAPI` once per endpoint:

```tsx
const { data: statusData, error: statusError } = useWidgetAPI(widget, "status");
const { data: statsData, error: statsError } = useWidgetAPI(widget, "stats");

if (statusError || statsError) {
  return <Container service={service} error={statusError ?? statsError} />;
}
```

### Passing Query Parameters

If your mapping declares `params`, pass them from the component:

```tsx
// In the component:
const { data } = useWidgetAPI(widget, "items", { page: 1, limit: 10 });

// In the definition:
mappings: {
  items: {
    endpoint: "items",
    params: ["page", "limit"],
  },
},
```

### Refresh Interval

To poll an endpoint on an interval:

```tsx
const { data } = useWidgetAPI(widget, "stats", { refreshInterval: 5000 });
```

## Proxy Lifecycle

When a user's browser loads a widget:

```
Browser                   Server                     Upstream Service
  |                         |                              |
  |-- useWidgetAPI -------->|                              |
  |   GET /api/services/    |                              |
  |   proxy?endpoint=stats  |                              |
  |                         |-- Look up widget type ------>|
  |                         |   in merged registry         |
  |                         |                              |
  |                         |-- Build URL from template -->|
  |                         |   "{url}/api/v1/stats"       |
  |                         |   + auth headers             |
  |                         |                              |
  |                         |-- httpProxy(url) ----------->|
  |                         |                              |
  |                         |<-- Raw response -------------|
  |                         |                              |
  |                         |-- validate + map() --------->|
  |                         |                              |
  |<-- JSON response -------|                              |
```

API keys, passwords, and upstream URLs never leave the server. The browser only sees the sanitized, mapped JSON response.

## User Configuration (services.yaml)

Users add your widget to their `services.yaml`:

```yaml
- Services:
    - My Service:
        href: https://my-service.example.com
        icon: my-service.png
        widget:
          type: my-service    # matches your plugin's id
          url: http://localhost:8080
          key: my-api-key
```

Any field under `widget:` is available as a placeholder in your `api` template and accessible in your component via `widget.fieldName`.

## Aliases

If your service was rebranded or has alternate names:

```typescript
const widget: Widget = {
  id: "myapp",
  name: "MyApp",
  aliases: ["myapp-legacy", "oldname"],
  // ...
};
```

Users can use `type: myapp`, `type: myapp-legacy`, or `type: oldname` interchangeably.

## Translation Keys

Widget labels use i18n translation keys. Create a JSON file at `public/locales/en/my-service.json`:

```json
{
  "total": "Total",
  "active": "Active",
  "status": "Status"
}
```

In the component, reference these as `my-service.total`, `my-service.active`, etc. The `<Block label="my-service.total" />` component looks up the key automatically.

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

  it("has correct metadata", () => {
    expect(widget.id).toBe("my-service");
    expect(widget.name).toBe("My Service");
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
    expect(container.querySelectorAll(".service-block")).toHaveLength(2);
  });

  it("renders data when loaded", () => {
    useWidgetAPI.mockReturnValue({
      data: { total: 42, active: 10 },
      error: undefined,
    });
    renderWithProviders(
      <Component service={{ widget: { type: "my-service" } }} />,
      { settings: { hideErrors: false } },
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
```

Run tests: `pnpm test`

## Reference Implementations

Three built-in plugins demonstrate increasing complexity:

| Plugin | Complexity | Key features |
|--------|-----------|--------------|
| `src/widgets/plugins/adguard/` | Simple | Single endpoint, no auth, no transforms |
| `src/widgets/plugins/uptimekuma/` | Medium | Custom `{slug}` URL param, heartbeat aggregation in component |
| `src/widgets/plugins/sonarr/` | Complex | API key auth, 5 endpoints, `map` transforms, `validate`, `params`, queue UI |

Read these to understand the pattern before writing your own.

## What Requires a Rebuild

| Action | Rebuild needed? |
|--------|----------------|
| Add a plugin to `src/widgets/plugins/` | Yes (`pnpm build` or `pnpm dev`) |
| Change a plugin's component | No (hot reload in `pnpm dev`) |
| Change a plugin's definition | Yes (server restart or rebuild) |
| Change `services.yaml` | No (reloaded at runtime) |
| Use `customapi` widget | No (YAML-only, no code) |
