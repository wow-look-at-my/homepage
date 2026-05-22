import ErrorBoundary from "components/errorboundry";
import ExternalWidget from "components/services/external-widget";
import { useTranslation } from "next-i18next";
import useSWR from "swr";

import components from "widgets/components";

export default function Widget({ widget, service }) {
  const { t } = useTranslation("common");

  const { data: externalPlugins } = useSWR("/api/plugins/list");

  const ServiceWidget = components[widget.type];

  const fullService = { ...service, widget };
  if (ServiceWidget) {
    return (
      <ErrorBoundary>
        <ServiceWidget service={fullService} />
      </ErrorBoundary>
    );
  }

  if (externalPlugins && externalPlugins.includes(widget.type)) {
    return (
      <ErrorBoundary>
        <ExternalWidget type={widget.type} service={fullService} />
      </ErrorBoundary>
    );
  }

  return (
    <div className="bg-theme-200/50 dark:bg-theme-900/20 rounded-sm m-1 flex-1 flex flex-col items-center justify-center p-1 service-missing">
      <div className="font-thin text-sm">{t("widget.missing_type", { type: widget.type })}</div>
    </div>
  );
}
