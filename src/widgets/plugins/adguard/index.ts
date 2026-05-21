import genericProxyHandler from "utils/proxy/handlers/generic";

import type { Widget } from "widgets/types";

const widget: Widget = {
  id: "adguard",
  name: "AdGuard Home",
  description: "DNS-level ad blocker statistics",

  definition: {
    api: "{url}/control/{endpoint}",
    proxyHandler: genericProxyHandler,
    mappings: {
      stats: {
        endpoint: "stats",
      },
    },
  },
};

export default widget;
