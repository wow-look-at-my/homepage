import { useTranslation } from "next-i18next";
import { useCallback } from "react";

import QueueEntry from "../../../components/widgets/queue/queueEntry";

import type { SonarrQueueDetail, SonarrSeries } from "./types";

import useWidgetAPI from "utils/proxy/use-widget-api";
import Container from "components/services/widget/container";
import Block from "components/services/widget/block";

function getProgress(sizeLeft: number, size: number) {
  return sizeLeft === 0 ? 100 : (1 - sizeLeft / size) * 100;
}

function getTitle(queueEntry: SonarrQueueDetail, seriesData: SonarrSeries[]) {
  let title = "";
  const seriesTitle = seriesData.find((entry) => entry.id === queueEntry.seriesId)?.title;
  if (seriesTitle) title += `${seriesTitle}: `;
  const { episodeTitle } = queueEntry;
  if (episodeTitle) title += episodeTitle;
  if (title === "") return null;
  return title;
}

export default function Component({
  service,
}: {
  service: { widget: Record<string, unknown>; [key: string]: unknown };
}) {
  const { t } = useTranslation();
  const { widget } = service;

  const { data: wantedData, error: wantedError } = useWidgetAPI(widget, "wanted/missing") as {
    data: { totalRecords: number } | undefined;
    error: unknown;
  };
  const { data: queuedData, error: queuedError } = useWidgetAPI(widget, "queue") as {
    data: { totalRecords: number } | undefined;
    error: unknown;
  };
  const { data: seriesData, error: seriesError } = useWidgetAPI(widget, "series") as {
    data: SonarrSeries[] | undefined;
    error: unknown;
  };
  const { data: queueDetailsData, error: queueDetailsError } = useWidgetAPI(widget, "queue/details") as {
    data: SonarrQueueDetail[] | undefined;
    error: unknown;
  };

  const formatDownloadState = useCallback((downloadState: string) => {
    switch (downloadState) {
      case "importPending":
        return "import pending";
      case "failedPending":
        return "failed pending";
      default:
        return downloadState;
    }
  }, []);

  if (wantedError || queuedError || seriesError || queueDetailsError) {
    const finalError = wantedError ?? queuedError ?? seriesError ?? queueDetailsError;
    return <Container service={service} error={finalError} />;
  }

  if (!wantedData || !queuedData || !seriesData || !queueDetailsData) {
    return (
      <Container service={service}>
        <Block label="sonarr.wanted" />
        <Block label="sonarr.queued" />
        <Block label="sonarr.series" />
      </Container>
    );
  }

  const enableQueue =
    (widget as Record<string, unknown>)?.enableQueue && Array.isArray(queueDetailsData) && queueDetailsData.length > 0;

  return (
    <>
      <Container service={service}>
        <Block label="sonarr.wanted" value={t("common.number", { value: wantedData.totalRecords })} />
        <Block label="sonarr.queued" value={t("common.number", { value: queuedData.totalRecords })} />
        <Block label="sonarr.series" value={t("common.number", { value: seriesData.length })} />
      </Container>
      {enableQueue &&
        (queueDetailsData as SonarrQueueDetail[]).map((queueEntry) => (
          <QueueEntry
            progress={getProgress(queueEntry.sizeLeft, queueEntry.size)}
            timeLeft={queueEntry.timeLeft}
            title={getTitle(queueEntry, seriesData) ?? t("sonarr.unknown")}
            activity={formatDownloadState(queueEntry.trackedDownloadState)}
            key={`${queueEntry.seriesId}-${queueEntry.episodeId}`}
          />
        ))}
    </>
  );
}
