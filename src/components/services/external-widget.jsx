import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

import useWidgetAPI from "utils/proxy/use-widget-api";

let sharedModulesReady = false;

function ensureSharedModules() {
  if (sharedModulesReady) return;
  if (typeof window === "undefined") return;

  const React = require("react");

  window.__HOMEPAGE_SHARED__ = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react/jsx-dev-runtime": React,
    "react-dom": require("react-dom"),
    "next-i18next": { useTranslation },
    "components/services/widget/block": { default: Block, __esModule: true },
    "components/services/widget/container": { default: Container, __esModule: true },
    "utils/proxy/use-widget-api": { default: useWidgetAPI, __esModule: true },
    swr: { default: useSWR, __esModule: true },
  };
  window.__HOMEPAGE_PLUGINS__ = window.__HOMEPAGE_PLUGINS__ || {};
  sharedModulesReady = true;
}

function useExternalPlugin(type) {
  const [component, setComponent] = useState(null);
  const [error, setError] = useState(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    ensureSharedModules();

    if (window.__HOMEPAGE_PLUGINS__[type]) {
      setComponent(() => window.__HOMEPAGE_PLUGINS__[type]);
      return;
    }

    const script = document.createElement("script");
    script.src = `/api/plugins/${encodeURIComponent(type)}`;
    script.async = true;
    script.onload = () => {
      const loaded = window.__HOMEPAGE_PLUGINS__[type];
      if (loaded) {
        setComponent(() => loaded);
      } else {
        setError(`Plugin "${type}" loaded but did not register a component`);
      }
    };
    script.onerror = () => {
      setError(`Failed to load plugin "${type}"`);
    };
    document.head.appendChild(script);
  }, [type]);

  return { component, error };
}

export default function ExternalWidget({ type, service }) {
  const { t } = useTranslation("common");
  const { component: PluginComponent, error } = useExternalPlugin(type);

  if (error) {
    return (
      <Container service={service} error={{ message: error }} />
    );
  }

  if (!PluginComponent) {
    return (
      <Container service={service}>
        <Block label={t("widget.loading")} />
      </Container>
    );
  }

  return <PluginComponent service={service} />;
}
