import type { ComponentType, ReactNode } from "react";

interface ContainerProps {
  service: { widget: Record<string, unknown>; [key: string]: unknown };
  error?: unknown;
  children?: ReactNode;
}

declare const Container: ComponentType<ContainerProps>;
export default Container;
