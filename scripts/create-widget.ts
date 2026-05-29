import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const PLUGINS_DIR = path.join(__dirname, "..", "src", "widgets", "plugins");
const LEGACY_DIR = path.join(__dirname, "..", "src", "widgets");

const name = process.argv[2];

if (!name) {
  console.error("Usage: pnpm create-widget <widget-name>");
  console.error("Example: pnpm create-widget my-service");
  process.exit(1);
}

if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error(`Invalid widget name "${name}". Use lowercase letters, digits, and hyphens (e.g., my-service).`);
  process.exit(1);
}

const pluginDir = path.join(PLUGINS_DIR, name);
const legacyDir = path.join(LEGACY_DIR, name);

if (fs.existsSync(pluginDir)) {
  console.error(`Plugin "${name}" already exists at ${pluginDir}`);
  process.exit(1);
}

if (fs.existsSync(legacyDir)) {
  console.error(
    `A legacy widget "${name}" already exists at ${legacyDir}. Migrate it manually or choose a different name.`,
  );
  process.exit(1);
}

fs.mkdirSync(pluginDir, { recursive: true });

const camelName = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const titleName = name
  .split("-")
  .map((w) => w[0].toUpperCase() + w.slice(1))
  .join(" ");

fs.writeFileSync(
  path.join(pluginDir, "types.ts"),
  `export interface ${titleName.replace(/ /g, "")}Stats {
  // Define your API response fields here
  // Example:
  // total: number;
  // active: number;
}
`,
);

fs.writeFileSync(
  path.join(pluginDir, "index.ts"),
  `import genericProxyHandler from "utils/proxy/handlers/generic";

import type { Widget } from "widgets/types";

const widget: Widget = {
  id: "${name}",
  name: "${titleName}",
  description: "TODO: describe what this widget monitors",

  definition: {
    api: "{url}/api/{endpoint}",
    proxyHandler: genericProxyHandler,

    mappings: {
      stats: {
        endpoint: "stats",
      },
    },
  },
};

export default widget;
`,
);

fs.writeFileSync(
  path.join(pluginDir, "component.tsx"),
  `import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";

import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }: { service: { widget: Record<string, unknown>; [key: string]: unknown } }) {
  const { t } = useTranslation();
  const { widget } = service;

  const { data: ${camelName}Data, error: ${camelName}Error } = useWidgetAPI(widget, "stats");

  if (${camelName}Error) {
    return <Container service={service} error={${camelName}Error} />;
  }

  if (!${camelName}Data) {
    return (
      <Container service={service}>
        <Block label="${name}.status" />
      </Container>
    );
  }

  return (
    <Container service={service}>
      <Block label="${name}.status" value={t("common.number", { value: 0 })} />
    </Container>
  );
}
`,
);

// Register the new built-in plugin in the static barrel (src/widgets/plugins-generated.ts).
execSync("node scripts/generate-plugin-barrel.mjs", { cwd: path.join(__dirname, ".."), stdio: "inherit" });

console.log(`Created plugin scaffold at ${pluginDir}/`);
console.log("");
console.log("Files created:");
console.log(`  ${pluginDir}/index.ts       -- widget definition (api, mappings)`);
console.log(`  ${pluginDir}/component.tsx   -- React component`);
console.log(`  ${pluginDir}/types.ts        -- API response types`);
console.log("");
console.log("Next steps:");
console.log("  1. Update the api URL template in index.ts");
console.log("  2. Define your endpoint mappings");
console.log("  3. Add response type definitions in types.ts");
console.log("  4. Implement the component UI in component.tsx");
console.log(`  5. Add translation keys in public/locales/en/${name}.json`);
console.log("  6. Run `pnpm dev` -- the plugin is registered in src/widgets/plugins-generated.ts");
