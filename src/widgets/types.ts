import type { NextApiRequest, NextApiResponse } from "next";
import type { ComponentType } from "react";

export type MapFn = ((data: unknown) => unknown) | Record<string, unknown>;

export type ProxyHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  map?: MapFn,
) => Promise<void | NextApiResponse>;

export interface EndpointMapping<TResponse = unknown> {
  endpoint: string;
  validate?: string[];
  params?: string[];
  optionalParams?: string[];
  map?: (data: Buffer | TResponse) => unknown;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  segments?: string[];
  headers?: Record<string, string>;
  body?: unknown;
  proxyHandler?: ProxyHandler;
}

export interface WidgetDefinition {
  api?: string;
  proxyHandler?: ProxyHandler;
  mappings?: Record<string, EndpointMapping>;
  headers?: Record<string, string>;
  allowedEndpoints?: RegExp;
  [key: string]: unknown;
}

export interface Widget {
  id: string;
  name: string;
  description?: string;
  definition: WidgetDefinition;
  component: ComponentType<{ service: WidgetServiceProps }>;
  aliases?: string[];
}

export interface WidgetServiceProps {
  widget: WidgetConfig;
  [key: string]: unknown;
}

export interface WidgetConfig<T extends Record<string, unknown> = Record<string, unknown>> {
  type: string;
  fields?: string[];
  hide_errors?: boolean;
  service_name: string;
  service_group: string;
  index: number;
  [key: string]: unknown;
}

export interface WidgetData<T> {
  data: T | undefined;
  error: { message: string; url?: string; data?: unknown } | undefined;
  mutate: () => void;
}

export type WidgetRegistry = Record<string, WidgetDefinition>;
export type ComponentRegistry = Record<string, ComponentType<{ service: WidgetServiceProps }>>;
