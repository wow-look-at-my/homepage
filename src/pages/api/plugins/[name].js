import { getCompiledPlugin, initExternalPlugins } from "utils/plugin-compiler";

export default async function handler(req, res) {
  await initExternalPlugins();

  const { name } = req.query;
  const code = getCompiledPlugin(name);

  if (!code) {
    return res.status(404).json({ error: "Plugin not found" });
  }

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  return res.status(200).send(code);
}
