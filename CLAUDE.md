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
pnpm dev                # next dev --webpack (webpack, for plugin require.context parity)
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
   - Definitions loaded by `src/widgets/plugin-loader.ts` (`loadBuiltinPlugins` via
     `require.context("./plugins", true, /index\.(ts|js)$/, "sync")`, registered through
     `getPluginDefinitions`).
   - Components loaded by `src/widgets/plugin-components.ts` via
     `require.context("./plugins", true, /component\.(tsx|jsx)$/, "lazy")`.
3. **External plugins** — dropped into `HOMEPAGE_PLUGINS_DIR` at runtime, no rebuild.
   - Definitions ALSO loaded by `plugin-loader.ts` (`loadExternalPlugins`, via a runtime
     `__non_webpack_require__` so webpack never tries to bundle the arbitrary path).
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

## Plugin system status (definition-loading fixed 2026-05-29)

Plugin DEFINITIONS now load in a webpack build, so built-in and external plugins
fetch data through the proxy. Previously every plugin 403'd ("Unknown proxy service
type") because `plugin-loader.ts` used a runtime-computed `require(pluginDir)` that
webpack could not resolve (`Critical dependency: the request of a dependency is an
expression`).

- Built-in definitions: `loadBuiltinPlugins` discovers `plugins/*/index.(ts|js)` via
  `require.context(..., "sync")` (webpack-friendly, same idiom as `plugin-components.ts`).
  Wrapped in try/catch so it no-ops under Vitest.
- External definitions: `loadExternalPlugins` loads each `HOMEPAGE_PLUGINS_DIR/*/index.js`
  with `runtimeRequire` — `__non_webpack_require__` (the real Node require) inside a webpack
  bundle, falling back to `require` under Vitest. Webpack never bundles arbitrary paths.
- `dev` uses `next dev --webpack` (package.json) so `require.context` behaves the same in
  dev and prod.
- LIMITATION (by design): definitions are cached at server start and the proxy reads a
  static merged `widgets` object, so a NEW external plugin (or an edited `index.js`)
  registers only after a server **restart**; its component still hot-compiles. See
  PLUGIN_AUTHORING.md "Hot reload".
- The unit tests do NOT cover the webpack path (`require.context` / `__non_webpack_require__`
  don't exist under Vitest), so this class of bug is webpack-only. Verify with a production
  `next build` + `/api/services/proxy` probe: grep `.next/server` for a plugin's unique
  `description`, and confirm built-in `sonarr`/`adguard`/`uptimekuma` + an external plugin
  no longer return 403 "Unknown proxy service type" (legacy `radarr` is the control).

## Repo conventions

- Pages Router under `src/pages/`; API routes under `src/pages/api/`.
- Server proxy handlers: `src/utils/proxy/handlers/` (`generic`, `credentialed`, ...).
- Keep credentials server-side; never fetch upstream from a component.
- Translation keys live in `public/locales/en/<widget>.json` and are referenced as
  `<widget>.<key>` in `<Block label=...>`.
</content>
</invoke>
