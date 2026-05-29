# CLAUDE.md

Orientation notes for working in this repo. The goal of this file is so you do
**not** have to re-explore the codebase (especially the widget/plugin system)
from scratch every session. Update it when the architecture changes.

## What this is

Homepage — a static, self-hosted application dashboard (the `gethomepage/homepage`
project). Next.js app that renders a configurable dashboard of "services" and
"widgets", proxying all upstream API calls server-side so credentials never reach
the browser.

- **Framework**: Next.js 16 (Pages Router, `src/pages/`), React 19.
- **Package manager**: **pnpm only** (enforced by `preinstall: only-allow pnpm`).
- **Tests**: Vitest. **Build**: webpack (`next build --webpack`), `output: "standalone"`.
- **Config dir** at runtime: `HOMEPAGE_CONFIG_DIR` (default `/app/config`). See
  `src/utils/config/config.js` (`CONF_DIR`). Users configure via YAML
  (`services.yaml`, `widgets.yaml`, `settings.yaml`, `bookmarks.yaml`).
- **Docs site**: MkDocs under `docs/` (`mkdocs.yml`, Python/uv toolchain).
- **i18n**: `next-i18next`, locale JSON under `public/locales/<lang>/`.

## Commands

```bash
pnpm install            # install deps
pnpm dev                # next dev
pnpm build              # next build --webpack (production)
pnpm start              # next start  (NOTE: with output:standalone, prod run is
                        #   `node .next/standalone/server.js`)
pnpm test               # vitest run (all tests)
pnpm test:watch         # vitest watch
pnpm lint               # eslint
pnpm typecheck          # tsc --noEmit
pnpm create-widget NAME # scaffold a built-in plugin in src/widgets/plugins/NAME
```

Run a single test file: `npx vitest run path/to/file.test.ts`.

## Service request flow (how a widget gets its data)

1. Browser renders a service's widget via `src/components/services/widget.jsx`.
2. The component calls `useWidgetAPI(widget, "<endpointName>")`
   (`src/utils/proxy/use-widget-api`).
3. That hits `GET /api/services/proxy` (`src/pages/api/services/proxy.js`), which
   looks up the widget **definition** in the merged registry `widgets/widgets`
   (`widgets[type]`), maps the opaque endpoint name to a real upstream path, adds
   auth, proxies upstream, optionally runs `map()`, and returns sanitized JSON.
4. If `widgets[type]` is undefined the proxy returns **403 "Unknown proxy service
   type"**. (Useful signal when debugging registration.)

API keys/passwords/URLs never leave the server.

## Widget / plugin architecture (the part you keep re-indexing)

There are **three tiers**, all merged into two registries consumed by the app:

- **Definitions registry** `src/widgets/widgets.js` → `{ ...legacyWidgets, ...pluginDefinitions }`.
  Imported by the server proxy + proxy handlers.
- **Components registry** `src/widgets/components.js` → `{ ...legacyComponents, ...pluginComponents }`.
  Imported by `widget.jsx` to pick the React component for a `type`.

Tiers:

1. **Legacy widgets** — `src/widgets/<name>/{widget.js,component.jsx,proxy.js}`.
   ~150+ hand-written. Statically imported in `src/widgets/legacy-widgets.js`
   (definitions) and `src/widgets/legacy-components.js` (components). This is the
   tier that actually works in production today.
2. **Built-in plugins** — `src/widgets/plugins/<name>/{index.ts,component.tsx,types.ts}`.
   Unified format. Examples: `adguard`, `sonarr`, `uptimekuma`.
   - Definitions loaded by `src/widgets/plugin-loader.ts` (`getPluginDefinitions`).
   - Components loaded by `src/widgets/plugin-components.ts` via
     `require.context("./plugins", true, /component\.(tsx|jsx)$/, "lazy")`.
3. **External plugins** — dropped into `HOMEPAGE_PLUGINS_DIR` at runtime, no rebuild.
   - Definitions ALSO loaded by `plugin-loader.ts` (`loadPluginsFromDir(externalDir,...)`).
   - Components compiled on demand with esbuild by `src/utils/plugin-compiler.js`
     (`initExternalPlugins` is lazily invoked inside the `/api/plugins/*` routes),
     served via `src/pages/api/plugins/[name].js`, listed via
     `src/pages/api/plugins/list.js`, and loaded in the browser by
     `src/components/services/external-widget.jsx` (injects a `<script>`, reads
     `window.__HOMEPAGE_PLUGINS__[type]`). `widget.jsx` polls `/api/plugins/list`
     every 2s to discover them.
   - Shared modules an external component may import are whitelisted in
     `SHARED_MODULES` (plugin-compiler.js) and provided at runtime via
     `window.__HOMEPAGE_SHARED__` (external-widget.jsx): `react`, `next-i18next`,
     `components/services/widget/{block,container}`, `utils/proxy/use-widget-api`,
     `swr`.

Conflict rule: plugin ids that collide with a legacy key are skipped (legacy wins).
See `plugin-loader.ts` `isValidWidget` for the validation contract (id must equal
the directory name; `definition` needs an `api` string or a `proxyHandler`).

Author guide: `PLUGIN_AUTHORING.md` (format, mappings, auth, testing, examples).

## Known status / issues (verified 2026-05-29)

**The plugin system (tier 2 & 3) is NOT production-ready: plugin DEFINITIONS do
not load in a webpack build, so plugins render their UI but cannot fetch data.**

- Root cause: `src/widgets/plugin-loader.ts:71` uses a runtime-computed
  `require(pluginDir)`. Webpack cannot statically resolve this — `next build`
  prints `Critical dependency: the request of a dependency is an expression`
  with the import trace `plugin-loader.ts -> widgets.js -> api/services/proxy.js`,
  and at runtime the require throws, so `getPluginDefinitions()` registers nothing.
- Verified at runtime: built-in `sonarr`/`adguard`/`uptimekuma` and an external
  `myext` plugin all return `403 {"error":"Unknown proxy service type"}` from
  `/api/services/proxy`, while a legacy widget (`radarr`) is found. For the
  external plugin, `/api/plugins/list` and `/api/plugins/<name>` (the esbuild
  COMPONENT path) work — only the DEFINITION path is broken.
- Components are fine because `plugin-components.ts` uses `require.context` (the
  webpack-friendly idiom). The fix is to load built-in definitions the same way
  (a `require.context` over `plugins/*/index.*`), and to load EXTERNAL definitions
  with the real Node require (e.g. `__non_webpack_require__`) since webpack will
  never bundle an arbitrary runtime path.
- Plugin-system tests (`plugin-loader.test.ts`, `plugin-compiler.test.js`, and the
  per-plugin tests) all pass under Vitest — they exercise the loader with temp
  `.js` fixtures and import components directly, so they do NOT catch this
  webpack-only failure. A production `next build` + proxy probe is required to see it.

## Repo conventions

- Pages Router under `src/pages/`; API routes under `src/pages/api/`.
- Server proxy handlers: `src/utils/proxy/handlers/` (`generic`, `credentialed`, ...).
- Keep credentials server-side; never fetch upstream from a component.
- Translation keys live in `public/locales/en/<widget>.json` and are referenced as
  `<widget>.<key>` in `<Block label=...>`.
</content>
</invoke>
