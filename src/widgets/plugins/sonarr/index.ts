import { asJson } from "utils/proxy/api-helpers";
import genericProxyHandler from "utils/proxy/handlers/generic";

import type { Widget } from "widgets/types";

const widget: Widget = {
  id: "sonarr",
  name: "Sonarr",
  description: "TV series management and download automation",

  definition: {
    api: "{url}/api/v3/{endpoint}?apikey={key}",
    proxyHandler: genericProxyHandler,

    mappings: {
      series: {
        endpoint: "series",
        map: (data: unknown) =>
          asJson(data).map((entry: { title: string; id: number }) => ({
            title: entry.title,
            id: entry.id,
          })),
      },
      queue: {
        endpoint: "queue",
        validate: ["totalRecords"],
      },
      "wanted/missing": {
        endpoint: "wanted/missing",
        validate: ["totalRecords"],
      },
      "queue/details": {
        endpoint: "queue/details",
        map: (data: unknown) =>
          asJson(data)
            .map((entry: Record<string, unknown>) => ({
              trackedDownloadState: entry.trackedDownloadState,
              trackedDownloadStatus: entry.trackedDownloadStatus,
              timeLeft: entry.timeleft,
              size: entry.size,
              sizeLeft: entry.sizeleft,
              seriesId: entry.seriesId,
              episodeTitle: (entry.episode as Record<string, unknown>)?.title ?? entry.title,
              episodeId: (entry.episodeId as number) ?? entry.id,
              status: entry.status,
            }))
            .sort((a: { trackedDownloadState: string; sizeLeft: number; size: number },
                   b: { trackedDownloadState: string; sizeLeft: number; size: number }) => {
              const downloadingA = a.trackedDownloadState === "downloading";
              const downloadingB = b.trackedDownloadState === "downloading";
              if (downloadingA && !downloadingB) return -1;
              if (downloadingB && !downloadingA) return 1;

              const percentA = a.sizeLeft / a.size;
              const percentB = b.sizeLeft / b.size;
              if (percentA < percentB) return -1;
              if (percentA > percentB) return 1;
              return 0;
            }),
      },
      calendar: {
        endpoint: "calendar",
        params: ["start", "end", "unmonitored", "includeSeries", "includeEpisodeFile", "includeEpisodeImages"],
      },
    },
  },
};

export default widget;
