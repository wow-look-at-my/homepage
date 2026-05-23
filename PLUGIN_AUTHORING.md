# Widget Plugin Authoring Guide

## How Plugins Work

Homepage supports two kinds of widget plugins:

1. **Built-in plugins** (`src/widgets/plugins/`) -- bundled by webpack at build time. Best for development and first-party contributions. Auto-discovered, hot-reloadable, fully typed.

2. **External plugins** (`HOMEPAGE_PLUGINS_DIR`) -- loaded at runtime without rebuilding the app. Drop a folder containing a widget definition and a component into any directory, point the env var at it, restart the server. The server compiles the component with esbuild on startup and serves it to the browser dynamically.

Both kinds use the same plugin format: an `index.ts` (or `.js`) with the widget definition and a `component.tsx` (or `.jsx`) with the React UI.

## External Plugins (No Rebuild)

Set the `HOMEPAGE_PLUGINS_DIR` environment variable to a directory containing your plugin folders. On server startup, Homepage:

1. Scans the directory for plugin folders
2. Loads each `index.ts`/`.js` to register the proxy definition (API template, mappings)
3. Compiles each `component.tsx`/`.jsx` with esbuild into a browser-loadable bundle
4. Serves the compiled bundles via `/api/plugins/{name}`
5. The browser loads and renders them on demand

No rebuild. No touching core files. No Docker image customization.

### Quick start

```bash
# Create a plugin directory anywhere on the filesystem
mkdir -p /opt/homepage-plugins/my-service

# Write the widget definition
cat > /opt/homepage-plugins/my-service/index.js << 'PLUGIN'
module.exports = {
  id: "my-service",
  name: "My Service",
  definition: {
    api: "{url}/api/{endpoint}",
    mappings: {
      stats: { endpoint: "stats" },
    },
  },
};
PLUGIN

# Write the component
cat > /opt/homepage-plugins/my-service/component.jsx << 'PLUGIN'
import React from "react";
import { useTranslation } from "next-i18next";
import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;
  const { data, error } = useWidgetAPI(widget, "stats");

  if (error) return <Container service={service} error={error} />;
  if (!data) return <Container service={service}><Block label="my-service.status" /></Container>;

  return (
    <Container service={service}>
      <Block label="my-service.status" value={t("common.number", { value: data.total })} />
    </Container>
  );
}
PLUGIN

# Point Homepage at the plugins directory and restart
export HOMEPAGE_PLUGINS_DIR=/opt/homepage-plugins
# restart your Homepage server
```

Add the widget to `services.yaml`:

```yaml
- Services:
    - My Service:
        widget:
          type: my-service
          url: http://localhost:8080
```

The widget appears immediately after restart. No rebuild needed.

### Docker with volume mount

```bash
docker run -p 3000:3000 \
  -v /opt/homepage-plugins:/external-plugins \
  -e HOMEPAGE_PLUGINS_DIR=/external-plugins \
  ghcr.io/gethomepage/homepage:latest
```

### Available imports in external plugins

External plugin components can import these shared modules (provided by Homepage at runtime):

| Import path | What you get |
|-------------|-------------|
| `react` | React, hooks (useState, useEffect, etc.) |
| `next-i18next` | `{ useTranslation }` |
| `components/services/widget/block` | Block component (default export) |
| `components/services/widget/container` | Container component (default export) |
| `utils/proxy/use-widget-api` | useWidgetAPI hook (default export) |
| `swr` | useSWR hook (default export) |

Any other imports must be self-contained within your plugin folder. You cannot import from arbitrary Homepage internals.

### Hot reload

External plugins hot-reload when their source files change. The server watches `HOMEPAGE_PLUGINS_DIR` for filesystem events, recompiles the affected plugin with esbuild, and the browser picks up the new version within ~2 seconds (via polling). No restart, no rebuild, no page refresh -- just save the file and see the updated widget.

New plugin folders added to the directory are also detected and compiled automatically.

### Limitations of external plugins

- Only the shared modules listed above are available as imports
- Complex plugins that need internal components (e.g., QueueEntry) must be built-in plugins instead

## Built-in Plugins (Source Checkout)

For development and first-party contributions, use the built-in plugin path:

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

The plugin is live immediately. Hot reload works. No core files touched. Full access to all internal modules.

## No Code Option -- `customapi`

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

## What Requires What

| Action | Rebuild? | Restart? |
|--------|----------|----------|
| Add a built-in plugin to `src/widgets/plugins/` | Yes | -- |
| Change a built-in plugin's component during `pnpm dev` | No (hot reload) | No |
| Add an external plugin to `HOMEPAGE_PLUGINS_DIR` | No | No (auto-detected) |
| Change an external plugin's files | No | No (auto-recompiled) |
| Change `services.yaml` | No | No |
| Use `customapi` widget | No | No |
