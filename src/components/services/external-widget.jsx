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

function loadPluginScript(type, version) {
  return new Promise((resolve, reject) => {
    ensureSharedModules();

    // Remove any previously loaded script for this plugin
    const existing = document.querySelector(`script[data-plugin="${type}"]`);
    if (existing) existing.remove();

    // Clear the old component so the new bundle can re-register
    delete window.__HOMEPAGE_PLUGINS__[type];

    const script = document.createElement("script");
    script.src = `/api/plugins/${encodeURIComponent(type)}?v=${version}`;
    script.async = true;
    script.setAttribute("data-plugin", type);
    script.onload = () => {
      const loaded = window.__HOMEPAGE_PLUGINS__[type];
      if (loaded) {
        resolve(loaded);
      } else {
        reject(new Error(`Plugin "${type}" loaded but did not register a component`));
      }
    };
    script.onerror = () => reject(new Error(`Failed to load plugin "${type}"`));
    document.head.appendChild(script);
  });
}

export default function ExternalWidget({ type, version, service }) {
  const { t } = useTranslation("common");
  const [PluginComponent, setPluginComponent] = useState(null);
  const [error, setError] = useState(null);
  const loadedVersionRef = useRef(null);

  useEffect(() => {
    if (loadedVersionRef.current === version && PluginComponent) return;

    loadedVersionRef.current = version;
    setError(null);

    loadPluginScript(type, version)
      .then((component) => setPluginComponent(() => component))
      .catch((err) => setError(err.message));
  }, [type, version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return <Container service={service} error={{ message: error }} />;
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
