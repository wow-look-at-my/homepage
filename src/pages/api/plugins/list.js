import { initExternalPlugins, listExternalPlugins } from "utils/plugin-compiler";

export default async function handler(req, res) {
  await initExternalPlugins();
  res.setHeader("Cache-Control", "no-cache");
  res.status(200).json(listExternalPlugins());
}
