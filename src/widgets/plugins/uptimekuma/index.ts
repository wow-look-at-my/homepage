import genericProxyHandler from "utils/proxy/handlers/generic";
import type { Widget } from "widgets/types";

const widget: Widget = {
  id: "uptimekuma",
  name: "Uptime Kuma",
  description: "Self-hosted uptime monitoring",

  definition: {
    api: "{url}/api/{endpoint}/{slug}",
    proxyHandler: genericProxyHandler,

    mappings: {
      status_page: {
        endpoint: "status-page",
      },
      heartbeat: {
        endpoint: "status-page/heartbeat",
      },
    },
  },
};

export default widget;
