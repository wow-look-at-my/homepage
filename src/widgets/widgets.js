import legacyWidgets from "./legacy-widgets";
import { getPluginDefinitions } from "./plugin-loader";
import builtinPlugins from "./plugins-generated";

const legacyKeys = new Set(Object.keys(legacyWidgets));
const pluginDefinitions = getPluginDefinitions(builtinPlugins, legacyKeys);

const widgets = {
  ...legacyWidgets,
  ...pluginDefinitions,
};

export default widgets;
