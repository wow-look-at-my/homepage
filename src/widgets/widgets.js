import legacyWidgets from "./legacy-widgets";
import { getPluginDefinitions } from "./plugin-loader";

const legacyKeys = new Set(Object.keys(legacyWidgets));
const pluginDefinitions = getPluginDefinitions(legacyKeys);

const widgets = {
  ...legacyWidgets,
  ...pluginDefinitions,
};

export default widgets;
