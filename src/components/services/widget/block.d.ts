import type { ComponentType } from "react";

interface BlockProps {
  label: string;
  value?: string;
  highlightValue?: number;
  field?: string;
}

declare const Block: ComponentType<BlockProps>;
export default Block;
