import dynamic from "next/dynamic";

const pluginComponents: Record<string, ReturnType<typeof dynamic>> = {};

try {
  const ctx = require.context("./plugins", true, /^\.\/[^/]+\/component\.(tsx|jsx)$/, "lazy");

  for (const key of ctx.keys()) {
    const match = key.match(/^\.\/([^/]+)\/component\.(tsx|jsx)$/);
    if (match) {
      const name = match[1];
      pluginComponents[name] = dynamic(() => ctx(key) as Promise<{ default: React.ComponentType<any> }>);
    }
  }
} catch {
  // require.context fails if the plugins directory is empty or doesn't exist at build time
}

export default pluginComponents;
