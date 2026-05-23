import { useTranslation } from "next-i18next";

import type { UptimeKumaHeartbeat, UptimeKumaStatusPage } from "./types";

import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import useWidgetAPI from "utils/proxy/use-widget-api";


export default function Component({
  service,
}: {
  service: { widget: Record<string, unknown>; [key: string]: unknown };
}) {
  const { t } = useTranslation();

  const { widget } = service;

  const { data: statusData, error: statusError } = useWidgetAPI(widget, "status_page") as {
    data: UptimeKumaStatusPage | undefined;
    error: unknown;
  };
  const { data: heartbeatData, error: heartbeatError } = useWidgetAPI(widget, "heartbeat") as {
    data: UptimeKumaHeartbeat | undefined;
    error: unknown;
  };

  if (statusError || heartbeatError) {
    return <Container service={service} error={statusError ?? heartbeatError} />;
  }

  if (!statusData || !heartbeatData) {
    return (
      <Container service={service}>
        <Block label="uptimekuma.up" />
        <Block label="uptimekuma.down" />
        <Block label="uptimekuma.uptime" />
        <Block label="uptimekuma.incidents" />
      </Container>
    );
  }

  let sitesUp = 0;
  let sitesDown = 0;
  Object.values(heartbeatData.heartbeatList).forEach((siteList) => {
    const lastHeartbeat = siteList[siteList.length - 1];
    if (lastHeartbeat?.status === 1) {
      sitesUp += 1;
    } else {
      sitesDown += 1;
    }
  });

  const uptimeList = Object.values(heartbeatData.uptimeList);
  const percent = uptimeList.reduce((a, b) => a + b, 0) / uptimeList.length || 0;
  const uptime = (percent * 100).toFixed(1);
  const incidentTime = statusData.incident
    ? Math.abs(new Date(statusData.incident.createdDate).getTime() - Date.now()) / 1000 / (60 * 60)
    : null;

  return (
    <Container service={service}>
      <Block label="uptimekuma.up" value={t("common.number", { value: sitesUp })} />
      <Block label="uptimekuma.down" value={t("common.number", { value: sitesDown })} />
      <Block label="uptimekuma.uptime" value={t("common.percent", { value: uptime })} highlightValue={Number(uptime)} />
      {incidentTime && (
        <Block
          label="uptimekuma.incident"
          value={t("common.number", { value: Math.round(incidentTime) }) + t("uptimekuma.m")}
        />
      )}
    </Container>
  );
}
